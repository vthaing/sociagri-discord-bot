import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

/**
 * Ngu canh hoi thoai SONG QUA NHIEU PHIEN.
 *
 * Truoc day map nay nam trong RAM -> restart bot (deploy, sua code, may ngu day)
 * la quen sach, nguoi dung phai ke lai tu dau. Nay ghi xuong dia.
 *
 * Key = `${channelId}:owner` | `${channelId}:public` — PHAI tach theo quyen,
 * neu khong ngu canh owner (thong tin noi bo) ro sang nguoi thuong qua `--resume`.
 */

let store = new Map();
let filePath = null;
let saveTimer = null;

function serialize() {
  return JSON.stringify(
    { version: 1, savedAt: new Date().toISOString(), sessions: Object.fromEntries(store) },
    null,
    2
  );
}

/** Ghi tre 1s de nhieu cau hoi lien tiep khong ghi dia lien tuc */
function scheduleSave() {
  if (!filePath || saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    try {
      const tmp = `${filePath}.tmp`;
      await fsp.writeFile(tmp, serialize(), { mode: 0o600 });
      await fsp.rename(tmp, filePath); // ghi nguyen tu: khong bao gio doc phai file dang viet do
    } catch (err) {
      console.error(`[sessions] khong luu duoc: ${err.message}`);
    }
  }, 1000);
}

/**
 * @returns {{loaded:number, dropped:number}} so phien khoi phuc / bo vi qua han
 */
export function initSessionStore(file, ttlMs) {
  filePath = path.resolve(file);
  store = new Map();
  let loaded = 0;
  let dropped = 0;

  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const now = Date.now();
      for (const [key, entry] of Object.entries(data.sessions || {})) {
        if (!entry?.sessionId || typeof entry.ts !== 'number') continue;
        if (now - entry.ts > ttlMs) {
          dropped++;
          continue;
        }
        store.set(key, entry);
        loaded++;
      }
    }
  } catch (err) {
    console.error(`[sessions] file hong, bat dau lai tu dau: ${err.message}`);
    store = new Map();
  }
  return { loaded, dropped };
}

export function getSession(key, ttlMs) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > ttlMs) {
    store.delete(key);
    scheduleSave();
    return null;
  }
  return entry.sessionId;
}

export function setSession(key, sessionId) {
  if (!sessionId) return;
  store.set(key, { sessionId, ts: Date.now() });
  scheduleSave();
}

export function deleteSession(key) {
  if (store.delete(key)) scheduleSave();
}

export function clearChannel(channelId) {
  let n = 0;
  for (const suffix of ['owner', 'public']) {
    if (store.delete(`${channelId}:${suffix}`)) n++;
  }
  if (n) scheduleSave();
  return n;
}

export function sessionCount() {
  return store.size;
}

/** Ghi ngay (dung luc shutdown de khong mat phien vua tao) */
export async function flushSessions() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (!filePath) return;
  try {
    const tmp = `${filePath}.tmp`;
    await fsp.writeFile(tmp, serialize(), { mode: 0o600 });
    await fsp.rename(tmp, filePath);
  } catch (err) {
    console.error(`[sessions] flush that bai: ${err.message}`);
  }
}
