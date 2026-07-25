import fs from 'node:fs';
import path from 'node:path';

let stream = null;
let logPath = null;
let bytesWritten = 0;

const MAX_BYTES = 10 * 1024 * 1024; // 10MB roi xoay vong
const KEEP = 3; // giu bot.log.1 .. .3

function openStream() {
  try {
    stream = fs.createWriteStream(logPath, { flags: 'a' });
    // Log KHONG duoc lam chet bot: het dia / mat quyen -> bo qua file, van log ra stdout
    // (khong co listener 'error' thi loi nay thanh uncaughtException -> launchd restart lien tuc)
    stream.on('error', (err) => {
      console.error(`[logger] mat file log (${err.code || err.message}) — chi log ra stdout tu day`);
      stream = null;
    });
    bytesWritten = fs.existsSync(logPath) ? fs.statSync(logPath).size : 0;
  } catch (err) {
    console.error(`[logger] khong mo duoc log file: ${err.message}`);
    stream = null;
  }
}

function rotateIfNeeded(nextLen) {
  if (!stream || bytesWritten + nextLen < MAX_BYTES) return;
  try {
    stream.end();
    for (let i = KEEP - 1; i >= 1; i--) {
      const from = `${logPath}.${i}`;
      if (fs.existsSync(from)) fs.renameSync(from, `${logPath}.${i + 1}`);
    }
    fs.renameSync(logPath, `${logPath}.1`);
  } catch (err) {
    console.error(`[logger] xoay vong log that bai: ${err.message}`);
  }
  openStream();
}

export function initLogger(logFile) {
  logPath = path.resolve(logFile);
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
  } catch (err) {
    console.error(`[logger] khong tao duoc thu muc log: ${err.message}`);
  }
  openStream();
}

function write(level, msg, ctx) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...(ctx || {}) }) + '\n';
  const pretty = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${msg}${
    ctx && Object.keys(ctx).length ? ' ' + JSON.stringify(ctx) : ''
  }`;

  if (level === 'error' || level === 'warn') console.error(pretty);
  else console.log(pretty);

  if (stream) {
    rotateIfNeeded(line.length);
    if (stream) {
      stream.write(line);
      bytesWritten += line.length;
    }
  }
}

export const log = {
  info: (msg, ctx) => write('info', msg, ctx),
  warn: (msg, ctx) => write('warn', msg, ctx),
  error: (msg, ctx) => write('error', msg, ctx),
};
