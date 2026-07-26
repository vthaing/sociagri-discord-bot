/**
 * Smoke test khong can Discord/Claude:  node test/smoke.mjs
 * Kiem tra 2 thu de sai va hau qua nang: an secret + cat tin nhan.
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { redact } from '../src/redact.mjs';
import { chunkForDiscord, DISCORD_LIMIT } from '../src/chunk.mjs';
import { OwnerMode, isOwnerUnlocked, ownerCanDm, resolveOwnerMode } from '../src/owner.mjs';
import { buildAttachmentPromptBlock, classifyAttachment, SkipReason } from '../src/attachments.mjs';
import { OutboundSkip, parseAttachRequests, shouldSendAsFile, validateOutboundFile } from '../src/outbound.mjs';

let pass = 0;
const t = (name, fn) => {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    pass++;
  } catch (err) {
    console.error(`  ❌ ${name}\n     ${err.message}`);
    process.exitCode = 1;
  }
};

console.log('\n=== redact: an secret truoc khi post len Discord ===');

t('an Anthropic API key', () => {
  const { text, hits } = redact('key la sk-ant-api03-AbCdEf0123456789ZzYyXxWw nhe');
  assert.ok(!text.includes('sk-ant-api03'), text);
  assert.ok(hits.length > 0);
});

t('an Google API key', () => {
  const { text } = redact('AIzaSyD-1234567890abcdefghijklmnopqrstuv');
  assert.ok(!text.includes('AIzaSy'), text);
});

t('an Discord webhook URL', () => {
  const { text } = redact('gui vao https://discord.com/api/webhooks/123456789/aBcDeFgHiJkLmNoP-token_x');
  assert.ok(!text.includes('webhooks/123456789'), text);
});

t('an mongodb URI co mat khau', () => {
  const { text } = redact('MONGODB_URI=mongodb+srv://admin:SuperSecret123@cluster0.abc.mongodb.net/db');
  assert.ok(!text.includes('SuperSecret123'), text);
});

t('an dong KEY=VALUE trong .env', () => {
  const { text } = redact('NEXTAUTH_SECRET=8f2b9c1d4e6a7b3c5d9e0f1a2b3c4d5e\nPORT=3010');
  assert.ok(!text.includes('8f2b9c1d4e6a7b3c5d9e0f1a2b3c4d5e'), text);
  assert.ok(text.includes('NEXTAUTH_SECRET='), 'van giu ten bien de nguoi doc hieu');
  assert.ok(text.includes('PORT=3010'), 'khong an bien vo hai');
});

t('an private key block', () => {
  const { text } = redact('-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\n-----END PRIVATE KEY-----');
  assert.ok(!text.includes('MIIEvQIBADANBg'), text);
});

t('khong pha van ban thuong', () => {
  const src = 'Dự án SociAgri gồm web `src/` và mobile `mobile/`. Xem `docs/README.md:12`.';
  const { text, hits } = redact(src);
  assert.equal(text, src);
  assert.equal(hits.length, 0);
});

console.log('\n=== chunk: cat tin nhan cho Discord (gioi han 2000) ===');

t('van ban ngan -> 1 doan', () => {
  const out = chunkForDiscord('Chào bạn, dự án đang chạy tốt.');
  assert.equal(out.length, 1);
});

t('van ban dai -> nhieu doan, moi doan < 2000', () => {
  const long = Array.from({ length: 400 }, (_, i) => `Dòng số ${i} nói về marketplace và ví tiền.`).join('\n');
  const out = chunkForDiscord(long);
  assert.ok(out.length > 1, `phai cat thanh nhieu doan, got ${out.length}`);
  for (const c of out) assert.ok(c.length <= DISCORD_LIMIT, `doan dai ${c.length}`);
});

t('code fence bi cat thi duoc dong/mo lai', () => {
  const code = Array.from({ length: 200 }, (_, i) => `  const line${i} = doSomething(${i});`).join('\n');
  const out = chunkForDiscord(`Đây là code:\n\`\`\`js\n${code}\n\`\`\`\nHết.`);
  assert.ok(out.length > 1);
  for (const c of out) {
    const fences = (c.match(/```/g) || []).length;
    assert.equal(fences % 2, 0, `doan co so fence le:\n${c.slice(0, 120)}…`);
  }
});

t('dong sieu dai khong co newline van bi cat', () => {
  const out = chunkForDiscord('x'.repeat(5000));
  assert.ok(out.length >= 3);
  for (const c of out) assert.ok(c.length <= DISCORD_LIMIT);
});

t('rong -> khong crash', () => {
  assert.equal(chunkForDiscord('').length, 1);
  assert.equal(chunkForDiscord(null).length, 1);
});

console.log('\n=== owner mode: ai duoc hoi thong tin noi bo ===');

const OWNERS = ['1220196738133000213'];

t('nguoi thuong -> khong bao gio mo khoa', () => {
  assert.equal(resolveOwnerMode({ authorId: '999', isDm: false, ownerUserIds: OWNERS }), OwnerMode.NONE);
  assert.equal(resolveOwnerMode({ authorId: '999', isDm: true, ownerUserIds: OWNERS }), OwnerMode.NONE);
  assert.equal(isOwnerUnlocked(OwnerMode.NONE), false);
});

t('owner trong DM -> mo khoa', () => {
  const m = resolveOwnerMode({ authorId: OWNERS[0], isDm: true, ownerUserIds: OWNERS });
  assert.equal(m, OwnerMode.OWNER_DM);
  assert.ok(isOwnerUnlocked(m));
});

t('owner trong channel -> mo khoa khi internalInChannels=true', () => {
  const m = resolveOwnerMode({ authorId: OWNERS[0], isDm: false, ownerUserIds: OWNERS, internalInChannels: true });
  assert.equal(m, OwnerMode.OWNER_CHANNEL);
  assert.ok(isOwnerUnlocked(m));
});

t('owner trong channel -> KHONG mo khoa khi internalInChannels=false', () => {
  const m = resolveOwnerMode({ authorId: OWNERS[0], isDm: false, ownerUserIds: OWNERS, internalInChannels: false });
  assert.equal(m, OwnerMode.NONE);
  assert.equal(isOwnerUnlocked(m), false);
});

t('khong cau hinh owner -> khong ai mo khoa duoc', () => {
  assert.equal(resolveOwnerMode({ authorId: OWNERS[0], isDm: true, ownerUserIds: [] }), OwnerMode.NONE);
  assert.equal(resolveOwnerMode({ authorId: OWNERS[0], isDm: true, ownerUserIds: undefined }), OwnerMode.NONE);
});

t('authorId rong/thieu -> khong mo khoa', () => {
  assert.equal(resolveOwnerMode({ authorId: '', isDm: true, ownerUserIds: OWNERS }), OwnerMode.NONE);
  assert.equal(resolveOwnerMode({ authorId: undefined, isDm: true, ownerUserIds: OWNERS }), OwnerMode.NONE);
});

t('owner duoc DM du ALLOW_DM=false; nguoi khac thi khong', () => {
  assert.equal(ownerCanDm(OWNERS[0], OWNERS), true);
  assert.equal(ownerCanDm('999', OWNERS), false);
  assert.equal(ownerCanDm(OWNERS[0], []), false);
});

t('ID gan giong khong duoc coi la owner (so sanh chuoi chinh xac)', () => {
  assert.equal(resolveOwnerMode({ authorId: '122019673813300021', isDm: true, ownerUserIds: OWNERS }), OwnerMode.NONE);
  assert.equal(resolveOwnerMode({ authorId: '12201967381330002130', isDm: true, ownerUserIds: OWNERS }), OwnerMode.NONE);
});

console.log('\n=== anh dinh kem: chi nhan anh, chi tu CDN Discord ===');

const MAX = 10 * 1024 * 1024;
const cdn = (name) => `https://cdn.discordapp.com/attachments/1/2/${name}`;

t('anh png tu CDN Discord -> nhan', () => {
  const v = classifyAttachment({ name: 'bug.png', url: cdn('bug.png'), contentType: 'image/png', size: 1234 }, MAX);
  assert.equal(v.ok, true);
  assert.equal(v.ext, 'png');
});

t('jpeg duoc chuan hoa thanh jpg', () => {
  const v = classifyAttachment({ name: 'a.JPEG', url: cdn('a.JPEG'), contentType: 'image/jpeg', size: 10 }, MAX);
  assert.equal(v.ok, true);
  assert.equal(v.ext, 'jpg');
});

t('file khong phai anh -> tu choi', () => {
  for (const name of ['tai-lieu.pdf', 'script.sh', 'archive.zip', 'malware.exe', 'noext']) {
    const v = classifyAttachment({ name, url: cdn(name), size: 10 }, MAX);
    assert.equal(v.ok, false, name);
    assert.equal(v.reason, SkipReason.NOT_IMAGE, name);
  }
});

t('duoi .png nhung Content-Type khong phai anh -> tu choi', () => {
  const v = classifyAttachment(
    { name: 'fake.png', url: cdn('fake.png'), contentType: 'application/octet-stream', size: 10 },
    MAX
  );
  assert.equal(v.ok, false);
  assert.equal(v.reason, SkipReason.NOT_IMAGE);
});

t('URL ngoai CDN Discord -> tu choi (chong SSRF)', () => {
  for (const url of [
    'https://evil.example.com/x.png',
    'http://cdn.discordapp.com/x.png', // http, khong phai https
    'https://cdn.discordapp.com.evil.com/x.png',
    'https://127.0.0.1/x.png',
    'https://169.254.169.254/latest/meta-data/x.png',
    'file:///etc/passwd.png',
    'khong-phai-url',
  ]) {
    const v = classifyAttachment({ name: 'x.png', url, contentType: 'image/png', size: 10 }, MAX);
    assert.equal(v.ok, false, url);
    assert.equal(v.reason, SkipReason.BAD_HOST, url);
  }
});

t('anh qua lon -> tu choi', () => {
  const v = classifyAttachment({ name: 'big.png', url: cdn('big.png'), contentType: 'image/png', size: MAX + 1 }, MAX);
  assert.equal(v.ok, false);
  assert.equal(v.reason, SkipReason.TOO_BIG);
});

t('media.discordapp.net cung duoc nhan', () => {
  const v = classifyAttachment(
    { name: 'x.webp', url: 'https://media.discordapp.net/attachments/1/2/x.webp', contentType: 'image/webp', size: 5 },
    MAX
  );
  assert.equal(v.ok, true);
});

t('prompt block co duong dan + canh bao coi noi dung anh la du lieu', () => {
  const block = buildAttachmentPromptBlock({
    files: [{ path: '/tmp/sociagri-bot-att-x/anh-1.png', name: 'screenshot loi.png', bytes: 100 }],
    skipped: [{ name: 'tai-lieu.pdf', reason: SkipReason.NOT_IMAGE }],
  });
  assert.ok(block.includes('/tmp/sociagri-bot-att-x/anh-1.png'));
  assert.ok(block.includes('Read'));
  assert.ok(/DỮ LIỆU/.test(block), 'phai nhac noi dung anh la du lieu');
  assert.ok(block.includes('tai-lieu.pdf'), 'phai noi file nao bi bo qua');
});

t('khong co file nao -> block rong (khong lam ban prompt)', () => {
  assert.equal(buildAttachmentPromptBlock({ files: [], skipped: [] }), '');
});

console.log('\n=== gui file len Discord: kiem duyet truoc khi gui ===');

// Dung CHINH repo bot lam repoDir de test tren file that
const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const LIMITS = { repoDir: REPO, maxBytes: 8 * 1024 * 1024 };

/** nhu t() nhung await duoc fn async */
const ta = async (name, fn) => {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    pass++;
  } catch (err) {
    console.error(`  ❌ ${name}\n     ${err.message}`);
    process.exitCode = 1;
  }
};

await ta('tach cu phap [[attach: ...]] khoi cau tra loi', () => {
  const { text, paths } = parseAttachRequests(
    'Đây là file bạn cần:\n[[attach: /tmp/a.md]]\nCòn cái nữa:\n  [[attach: docs/b.png]]  \nHết.'
  );
  assert.deepEqual(paths, ['/tmp/a.md', 'docs/b.png']);
  assert.ok(!text.includes('[[attach'), text);
  assert.ok(text.includes('Đây là file bạn cần'));
  assert.ok(text.includes('Hết.'));
});

await ta('khong co cu phap -> giu nguyen van ban', () => {
  const src = 'Bình thường thôi, không đính kèm gì.';
  const { text, paths } = parseAttachRequests(src);
  assert.equal(text, src);
  assert.equal(paths.length, 0);
});

await ta('[[attach]] giua dong KHONG duoc coi la yeu cau (tranh an oan trong code block)', () => {
  const { paths } = parseAttachRequests('cú pháp là [[attach: path]] nhé, viết trên dòng riêng');
  assert.equal(paths.length, 0);
});

await ta('file .env trong repo -> TU CHOI (day la test quan trong nhat)', async () => {
  const v = await validateOutboundFile('.env', LIMITS);
  assert.equal(v.ok, false);
  assert.equal(v.reason, OutboundSkip.DENIED_NAME);
});

await ta('cac loai secret khac -> TU CHOI theo ten', async () => {
  for (const name of ['.env.local', 'AuthKey_ABC.p8', 'release.keystore', 'server.pem', 'credentials.json', 'id_rsa']) {
    const v = await validateOutboundFile(name, LIMITS);
    assert.equal(v.ok, false, name);
    assert.equal(v.reason, OutboundSkip.DENIED_NAME, `${name} -> ${v.reason}`);
  }
});

await ta('file nguon binh thuong -> cho gui, danh dau la van ban', async () => {
  const v = await validateOutboundFile('src/bot.mjs', LIMITS);
  assert.equal(v.ok, true, v.reason);
  assert.equal(v.isText, true);
  assert.equal(v.name, 'bot.mjs');
  assert.ok(v.bytes > 0);
});

await ta('file ngoai repo -> TU CHOI', async () => {
  for (const p of ['/etc/passwd', '/etc/hosts', '../../../etc/passwd']) {
    const v = await validateOutboundFile(p, LIMITS);
    assert.equal(v.ok, false, p);
    assert.ok([OutboundSkip.OUTSIDE_REPO, OutboundSkip.NOT_FOUND].includes(v.reason), `${p} -> ${v.reason}`);
  }
});

await ta('file trong node_modules / .git -> TU CHOI', async () => {
  const v = await validateOutboundFile('node_modules/discord.js/package.json', LIMITS);
  assert.equal(v.ok, false);
  assert.equal(v.reason, OutboundSkip.DENIED_DIR);
});

await ta('file khong ton tai -> TU CHOI', async () => {
  const v = await validateOutboundFile('khong-he-co-file-nay.md', LIMITS);
  assert.equal(v.ok, false);
  assert.equal(v.reason, OutboundSkip.NOT_FOUND);
});

await ta('thu muc -> TU CHOI (khong phai file)', async () => {
  const v = await validateOutboundFile('src', LIMITS);
  assert.equal(v.ok, false);
  assert.equal(v.reason, OutboundSkip.NOT_A_FILE);
});

await ta('file vuot dung luong -> TU CHOI', async () => {
  const v = await validateOutboundFile('src/bot.mjs', { repoDir: REPO, maxBytes: 10 });
  assert.equal(v.ok, false);
  assert.equal(v.reason, OutboundSkip.TOO_BIG);
});

await await ta('nguong file dua theo SO TIN, khong theo so ky tu', () => {
  assert.equal(shouldSendAsFile({ chunkCount: 7, maxMessages: 6 }), true);
  assert.equal(shouldSendAsFile({ chunkCount: 6, maxMessages: 6 }), false);
  assert.equal(shouldSendAsFile({ chunkCount: 1, maxMessages: 6 }), false);
});

console.log('\n=== replyAnswer: wiring that (mock message, khong can Discord) ===');

const { replyAnswer } = await import('../src/reply.mjs');

const OUT_CONFIG = {
  outboundFilesEnabled: true,
  outboundMaxMessages: 6,
  outboundMaxFileBytes: 8 * 1024 * 1024,
  outboundMaxFiles: 3,
  repoDir: REPO,
};

function mockMessage() {
  const sent = [];
  return {
    sent,
    reply: async (payload) => sent.push({ kind: 'reply', ...payload }),
    channel: { send: async (payload) => sent.push({ kind: 'send', ...payload }) },
  };
}

await ta('cau tra loi ngan -> 1 tin, khong file', async () => {
  const m = mockMessage();
  const r = await replyAnswer(m, 'Ngắn gọn thôi.', { question: 'hỏi gì đó', config: OUT_CONFIG });
  assert.equal(r.sentAsFile, false);
  assert.equal(m.sent.length, 1);
  assert.equal(m.sent[0].files, undefined);
  assert.equal(m.sent[0].content, 'Ngắn gọn thôi.');
});

await ta('cau tra loi DAI vua -> NHIEU TIN NHAN (khong day sang file)', async () => {
  const m = mockMessage();
  // ~5000 ky tu => ~3 tin, duoi nguong 6 tin
  const long = Array.from({ length: 120 }, (_, i) => `Dòng ${i} nói về ví tiền và marketplace nông sản.`).join('\n');
  const r = await replyAnswer(m, long, { question: 'giải thích ví tiền', config: OUT_CONFIG });

  assert.equal(r.sentAsFile, false, 'khong duoc day sang file khi chi vai tin');
  assert.ok(m.sent.length > 1, `phai chia nhieu tin, got ${m.sent.length}`);
  assert.ok(m.sent.length <= 6, `khong duoc vuot 6 tin, got ${m.sent.length}`);
  for (const s of m.sent) assert.ok(s.content.length <= 2000, `tin ${s.content.length} ky tu > 2000`);

  // Phai co danh so va giu du dau/cuoi
  const all = m.sent.map((s) => s.content).join('\n');
  assert.ok(all.includes('(1/'), 'thieu danh so tin nhan');
  assert.ok(all.includes('Dòng 0 '), 'thieu dau');
  assert.ok(all.includes('Dòng 119 '), 'thieu cuoi');
  for (const s of m.sent) assert.equal(s.files, undefined, 'khong dinh kem file');
});

await ta('cau tra loi RAT dai -> gui vai tin + file .md day du', async () => {
  const m = mockMessage();
  const huge = Array.from({ length: 600 }, (_, i) => `Dòng ${i} mô tả chi tiết luồng marketplace và ví.`).join('\n');
  const r = await replyAnswer(m, huge, { question: 'giải thích toàn bộ', config: OUT_CONFIG });

  assert.equal(r.sentAsFile, true);
  assert.ok(m.sent.length <= 6, `khong duoc tran channel, got ${m.sent.length}`);
  const last = m.sent[m.sent.length - 1];
  assert.equal(last.files.length, 1);
  assert.ok(/^tra-loi-.*\.md$/.test(last.files[0].name), last.files[0].name);

  // File phai chua TOAN BO cau tra loi + cau hoi o header
  const body = last.files[0].attachment.toString('utf8');
  assert.ok(body.includes('Dòng 0 '), 'thieu dau');
  assert.ok(body.includes('Dòng 599 '), 'thieu cuoi');
  assert.ok(body.includes('giải thích toàn bộ'), 'thieu cau hoi o header');
});

await ta('[[attach: file nguon]] -> dinh kem file that', async () => {
  const m = mockMessage();
  const r = await replyAnswer(m, 'File bạn cần đây:\n[[attach: src/owner.mjs]]', {
    question: 'gửi file owner',
    config: OUT_CONFIG,
  });
  assert.equal(r.rejected.length, 0);
  assert.equal(r.attached.length, 1);
  assert.equal(r.attached[0].name, 'owner.mjs');
  const last = m.sent[m.sent.length - 1];
  assert.equal(last.files.length, 1);
  assert.ok(last.files[0].attachment.toString('utf8').includes('resolveOwnerMode'));
  assert.ok(!last.content.includes('[[attach'), 'cu phap phai bi tach khoi tin nhan');
});

await ta('[[attach: .env]] -> TU CHOI + noi ly do cho nguoi hoi', async () => {
  const m = mockMessage();
  const r = await replyAnswer(m, 'Đây file config:\n[[attach: .env]]', { question: 'gửi .env', config: OUT_CONFIG });
  assert.equal(r.attached.length, 0);
  assert.equal(r.rejected.length, 1);
  const all = m.sent.map((s) => s.content).join('\n');
  assert.ok(/Không gửi được/.test(all), all);
  assert.ok(/secret|key|credentials/i.test(all), all);
  for (const s of m.sent) assert.ok(!s.files, 'KHONG duoc dinh kem file nao');
});

await ta('vuot so file cho phep -> chi gui du so, bao phan bi bo', async () => {
  const m = mockMessage();
  const r = await replyAnswer(
    m,
    ['[[attach: src/owner.mjs]]', '[[attach: src/chunk.mjs]]', '[[attach: src/redact.mjs]]', '[[attach: src/logger.mjs]]'].join(
      '\nvà\n'
    ),
    { question: 'gửi 4 file', config: { ...OUT_CONFIG, outboundMaxFiles: 2 } }
  );
  assert.equal(r.attached.length, 2);
  assert.equal(r.rejected.length, 2);
});

await ta('tat OUTBOUND_FILES_ENABLED -> ve hanh vi cu (chi text)', async () => {
  const m = mockMessage();
  const long = 'x'.repeat(5000);
  const r = await replyAnswer(m, long, { question: 'q', config: { ...OUT_CONFIG, outboundFilesEnabled: false } });
  assert.equal(r.sentAsFile, false);
  assert.ok(m.sent.length > 1, 'phai cat vun nhu truoc');
  for (const s of m.sent) assert.equal(s.files, undefined);
});

console.log(`\n${process.exitCode ? '🚫 CO TEST FAIL' : `🎉 ${pass}/${pass} test PASS`}\n`);
