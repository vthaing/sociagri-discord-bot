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

export async function replyLong(message, text, files = []) {
  const chunks = chunkForDiscord(text);
  let first = true;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const body = chunk.length > DISCORD_LIMIT ? chunk.slice(0, DISCORD_LIMIT - 3) + '...' : chunk;
    // File dinh kem vao tin CUOI: nguoi doc thay noi dung truoc, file sau
    const attach = i === chunks.length - 1 && files.length ? files : undefined;

    if (first) {
      await message.reply({ content: body, files: attach, allowedMentions: { repliedUser: true, parse: [] } });
      first = false;
    } else {
      await message.channel.send({ content: body, files: attach, allowedMentions: { parse: [] } });
    }
  }
}

/**
 * @param {object} message - Discord message (hoac mock co .reply/.channel.send)
 * @param {string} rawText - cau tra loi tho tu claude (da qua redact)
 * @param {{question?:string, config:object}} opts
 * @returns {Promise<{sentAsFile:boolean, attached:Array, rejected:Array}>}
 */
export async function replyAnswer(message, rawText, { question, config }) {
  if (!config.outboundFilesEnabled) {
    await replyLong(message, rawText);
    return { sentAsFile: false, attached: [], rejected: [] };
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

    // 2. Cau tra loi qua dai -> dong goi thanh file .md thay vi cat vun
    let body = text;
    let sentAsFile = false;

    if (shouldSendAsFile(text, { maxInlineChars: config.outboundMaxInlineChars })) {
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      const answerFile = await writeAnswerFile(text, { question, stamp });
      outDir = answerFile.dir;
      files.unshift({ attachment: await fsp.readFile(answerFile.path), name: answerFile.name });

      const preview = chunkForDiscord(text)[0];
      body =
        `${preview.length > 1200 ? preview.slice(0, 1200).trimEnd() + '…' : preview}\n\n` +
        `📄 *Câu trả lời dài (${text.length} ký tự) nên mình gửi kèm đầy đủ trong file \`${answerFile.name}\`.*`;
      sentAsFile = true;
    }

    if (rejected.length) {
      body +=
        '\n\n' + rejected.map((r) => `⚠️ *Không gửi được \`${path.basename(r.path)}\`: ${r.reason}.*`).join('\n');
    }

    if (sentAsFile) {
      await message.reply({
        content: body.length > DISCORD_LIMIT ? body.slice(0, DISCORD_LIMIT - 3) + '...' : body,
        files,
        allowedMentions: { repliedUser: true, parse: [] },
      });
    } else {
      await replyLong(message, body, files);
    }

    return { sentAsFile, attached, rejected };
  } finally {
    await cleanupOutbound(outDir);
  }
}
