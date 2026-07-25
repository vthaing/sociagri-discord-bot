import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { redact } from './redact.mjs';

/**
 * Chieu RA: bot gui file len Discord.
 *
 * Hai viec:
 *  1. Cau tra loi DAI -> dinh kem file .md thay vi cat vun thanh 5-6 tin nhan.
 *  2. Cau tra loi co the yeu cau dinh kem file trong repo bang cu phap
 *     `[[attach: /duong/dan/tuyet/doi]]` — bot doc, KIEM DUYET, roi gui.
 *
 * Kiem duyet la phan quan trong nhat: neu khong, mot cau hoi kheo co the khien bot
 * gui thang `.env` prod len Discord. Nen:
 *  - file PHAI nam trong repo (so sanh sau khi realpath -> chan symlink tro ra ngoai)
 *  - chan theo ten: .env*, key/cert, keystore, credentials, id_rsa, .git/, node_modules/
 *  - gioi han so luong + dung luong
 *  - file van ban: quet redact TRUOC khi gui (secret vo tinh nam trong code van bi an)
 */

const ATTACH_RE = /^[ \t]*\[\[attach:\s*([^\]]+?)\s*\]\][ \t]*$/gim;

/** Ten file KHONG BAO GIO duoc gui, du nam trong repo */
const DENIED_NAME = [
  /^\.env(\..*)?$/i,
  /(^|[.-])credentials?([.-]|$)/i,
  /\.(p8|p12|pfx|pem|key|keystore|jks|mobileprovision|cer|crt)$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)/i,
  /\.(sqlite|db)$/i,
];

/** Thu muc KHONG duoc lay file tu do */
const DENIED_DIR = ['.git', 'node_modules', '.next', 'storage', 'mongo-data', '.claude'];

/** Duoi file coi la van ban -> quet redact truoc khi gui */
const TEXT_EXT = new Set([
  'md', 'txt', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'json', 'yml', 'yaml', 'sh', 'bash', 'zsh',
  'css', 'scss', 'html', 'xml', 'sql', 'log', 'csv', 'plist', 'swift', 'kt', 'java', 'rb', 'py', 'go',
]);

export const OutboundSkip = {
  OUTSIDE_REPO: 'file nam ngoai repo',
  DENIED_NAME: 'file thuoc loai khong duoc gui (secret/key/credentials)',
  DENIED_DIR: 'file nam trong thu muc khong duoc gui',
  NOT_FOUND: 'khong tim thay file',
  NOT_A_FILE: 'khong phai file thuong',
  TOO_BIG: 'file qua lon',
  TOO_MANY: 'vuot so file cho phep',
};

/**
 * Tach cac yeu cau `[[attach: path]]` khoi cau tra loi.
 * @returns {{text:string, paths:string[]}}
 */
export function parseAttachRequests(answer) {
  const paths = [];
  const text = String(answer ?? '')
    .replace(ATTACH_RE, (_m, p) => {
      const cleaned = String(p).trim().replace(/^['"`]|['"`]$/g, '');
      if (cleaned) paths.push(cleaned);
      return '';
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { text, paths };
}

/**
 * Kiem duyet 1 file truoc khi gui. KHONG doc noi dung o day.
 * @returns {Promise<{ok:boolean, reason?:string, abs?:string, name?:string, bytes?:number, isText?:boolean}>}
 */
export async function validateOutboundFile(candidate, { repoDir, maxBytes }) {
  if (!candidate || typeof candidate !== 'string') return { ok: false, reason: OutboundSkip.NOT_FOUND };

  const repoReal = await fs.realpath(repoDir).catch(() => path.resolve(repoDir));
  const abs = path.isAbsolute(candidate) ? candidate : path.resolve(repoReal, candidate);

  // Chan theo TEN truoc khi cham filesystem:
  //  - khong tiet lo file secret nao co ton tai (loi "khong tim thay" cung la thong tin)
  //  - khong co ke ho neu file duoc tao ra giua luc kiem tra va luc doc
  // (sau realpath se kiem tra LAI, vi symlink co the doi ten that)
  if (DENIED_NAME.some((re) => re.test(path.basename(abs)))) return { ok: false, reason: OutboundSkip.DENIED_NAME };
  if (
    abs
      .split(path.sep)
      .some((s) => DENIED_DIR.includes(s))
  )
    return { ok: false, reason: OutboundSkip.DENIED_DIR };

  let real;
  let stat;
  try {
    // realpath: symlink tro ra ngoai repo se bi lo ra o day
    real = await fs.realpath(abs);
    stat = await fs.lstat(real);
  } catch {
    return { ok: false, reason: OutboundSkip.NOT_FOUND };
  }

  if (!stat.isFile()) return { ok: false, reason: OutboundSkip.NOT_A_FILE };

  const rel = path.relative(repoReal, real);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return { ok: false, reason: OutboundSkip.OUTSIDE_REPO };

  const segments = rel.split(path.sep);
  if (segments.some((s) => DENIED_DIR.includes(s))) return { ok: false, reason: OutboundSkip.DENIED_DIR };

  const name = path.basename(real);
  if (DENIED_NAME.some((re) => re.test(name))) return { ok: false, reason: OutboundSkip.DENIED_NAME };

  if (stat.size > maxBytes) return { ok: false, reason: OutboundSkip.TOO_BIG };

  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  return { ok: true, abs: real, name, bytes: stat.size, isText: TEXT_EXT.has(ext) };
}

/**
 * Doc file da duoc kiem duyet, quet redact neu la van ban.
 * @returns {Promise<{name:string, buffer:Buffer, redacted:string[]}>}
 */
export async function loadOutboundFile(file) {
  const buf = await fs.readFile(file.abs);
  if (!file.isText) return { name: file.name, buffer: buf, redacted: [] };

  const { text, hits } = redact(buf.toString('utf8'));
  return { name: file.name, buffer: Buffer.from(text, 'utf8'), redacted: hits };
}

/**
 * Cau tra loi co nen gui thanh FILE thay vi cat vun nhieu tin nhan?
 */
export function shouldSendAsFile(text, { maxInlineChars }) {
  return String(text ?? '').length > maxInlineChars;
}

/**
 * Ghi cau tra loi dai thanh file .md trong thu muc tam.
 * @returns {Promise<{dir:string, path:string, name:string}>}
 */
export async function writeAnswerFile(text, { question, stamp }) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sociagri-bot-out-'));
  const name = `tra-loi-${stamp}.md`;
  const dest = path.join(dir, name);

  const header = question ? `> **Câu hỏi:** ${String(question).slice(0, 300)}\n\n---\n\n` : '';
  await fs.writeFile(dest, header + text, { mode: 0o600 });
  return { dir, path: dest, name };
}

export async function cleanupOutbound(dir) {
  if (!dir) return;
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    /* khong quan trong */
  }
}
