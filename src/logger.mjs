import fs from 'node:fs';
import path from 'node:path';

let stream = null;

export function initLogger(logFile) {
  try {
    const abs = path.resolve(logFile);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    stream = fs.createWriteStream(abs, { flags: 'a' });
  } catch (err) {
    console.error(`[logger] khong mo duoc log file: ${err.message}`);
  }
}

function write(level, msg, ctx) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...(ctx || {}) });
  const pretty = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${msg}${
    ctx && Object.keys(ctx).length ? ' ' + JSON.stringify(ctx) : ''
  }`;
  if (level === 'error' || level === 'warn') console.error(pretty);
  else console.log(pretty);
  stream?.write(line + '\n');
}

export const log = {
  info: (msg, ctx) => write('info', msg, ctx),
  warn: (msg, ctx) => write('warn', msg, ctx),
  error: (msg, ctx) => write('error', msg, ctx),
};
