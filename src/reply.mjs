import fsp from 'node:fs/promises';
import path from 'node:path';

import { chunkForDiscord, DISCORD_LIMIT } from './chunk.mjs';
import {
  cleanupOutbound,
  loadOutboundFile,
  parseAttachRequests,
  shouldSendAsFile,
  validateOutboundFile,
  writeAnswerFile,
} from './outbound.mjs';

/**
 * Gui cau tra loi len Discord. Tach khoi bot.mjs de test duoc bang mock message
 * (import bot.mjs se kich hoat bootstrap + dang nhap Discord).
 */

/**
 * Gui cau tra loi thanh NHIEU TIN NHAN khi can (Discord gioi han 2000 ky tu/tin).
 * Co nhieu tin thi danh so `(1/4)` de nguoi doc biet con nua — bang small-text cua
 * Discord (`-# `) cho khoi chiem cho.
 */
export async function replyLong(message, text, files = []) {
  const chunks = chunkForDiscord(text);
  const many = chunks.length > 1;
  let first = true;

  for (let i = 0; i < chunks.length; i++) {
    let body = chunks[i];
    if (many) {
      const footer = `\n-# (${i + 1}/${chunks.length})`;
      body = (body.length + footer.length > DISCORD_LIMIT ? body.slice(0, DISCORD_LIMIT - footer.length - 3) + '...' : body) + footer;
    } else if (body.length > DISCORD_LIMIT) {
      body = body.slice(0, DISCORD_LIMIT - 3) + '...';
    }

    // File dinh kem vao tin CUOI: nguoi doc thay noi dung truoc, file sau
    const attach = i === chunks.length - 1 && files.length ? files : undefined;

    if (first) {
      await message.reply({ content: body, files: attach, allowedMentions: { repliedUser: true, parse: [] } });
      first = false;
    } else {
      await message.channel.send({ content: body, files: attach, allowedMentions: { parse: [] } });
    }
  }
  return chunks.length;
}

/**
 * @param {object} message - Discord message (hoac mock co .reply/.channel.send)
 * @param {string} rawText - cau tra loi tho tu claude (da qua redact)
 * @param {{question?:string, config:object}} opts
 * @returns {Promise<{sentAsFile:boolean, attached:Array, rejected:Array}>}
 */
export async function replyAnswer(message, rawText, { question, config }) {
  if (!config.outboundFilesEnabled) {
    const n = await replyLong(message, rawText);
    return { sentAsFile: false, attached: [], rejected: [], messagesSent: n };
  }

  const { text, paths } = parseAttachRequests(rawText);
  const files = [];
  const attached = [];
  const rejected = [];
  let outDir = null;

  try {
    // 1. File trong repo ma cau tra loi yeu cau dinh kem
    for (const p of paths) {
      if (files.length >= config.outboundMaxFiles) {
        rejected.push({ path: p, reason: 'vuot so file cho phep' });
        continue;
      }
      const verdict = await validateOutboundFile(p, {
        repoDir: config.repoDir,
        maxBytes: config.outboundMaxFileBytes,
      });
      if (!verdict.ok) {
        rejected.push({ path: p, reason: verdict.reason });
        continue;
      }
      const loaded = await loadOutboundFile(verdict);
      files.push({ attachment: loaded.buffer, name: loaded.name });
      attached.push({ name: loaded.name, bytes: verdict.bytes, redacted: loaded.redacted });
    }

    // 2. Nhieu tin nhan la binh thuong; chi dong goi file khi qua nhieu tin
    let body = text;
    let sentAsFile = false;
    const chunkCount = chunkForDiscord(text).length;

    if (shouldSendAsFile({ chunkCount, maxMessages: config.outboundMaxMessages })) {
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      const answerFile = await writeAnswerFile(text, { question, stamp });
      outDir = answerFile.dir;
      files.unshift({ attachment: await fsp.readFile(answerFile.path), name: answerFile.name });

      // Van gui vai tin dau de doc ngay trong chat, phan con lai o file
      const keep = Math.max(1, config.outboundMaxMessages - 1);
      body =
        chunkForDiscord(text).slice(0, keep).join('\n') +
        `\n\n📄 *Câu trả lời rất dài (${text.length} ký tự, ~${chunkCount} tin) — mình gửi kèm đầy đủ trong \`${answerFile.name}\`.*`;
      sentAsFile = true;
    }

    if (rejected.length) {
      body +=
        '\n\n' + rejected.map((r) => `⚠️ *Không gửi được \`${path.basename(r.path)}\`: ${r.reason}.*`).join('\n');
    }

    const messagesSent = await replyLong(message, body, files);

    return { sentAsFile, attached, rejected, messagesSent };
  } finally {
    await cleanupOutbound(outDir);
  }
}
