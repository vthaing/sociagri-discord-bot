/**
 * Smoke test khong can Discord/Claude:  node test/smoke.mjs
 * Kiem tra 2 thu de sai va hau qua nang: an secret + cat tin nhan.
 */
import assert from 'node:assert/strict';

import { redact } from '../src/redact.mjs';
import { chunkForDiscord, DISCORD_LIMIT } from '../src/chunk.mjs';
import { OwnerMode, isOwnerUnlocked, ownerCanDm, resolveOwnerMode } from '../src/owner.mjs';
import { buildAttachmentPromptBlock, classifyAttachment, SkipReason } from '../src/attachments.mjs';

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

console.log(`\n${process.exitCode ? '🚫 CO TEST FAIL' : `🎉 ${pass}/${pass} test PASS`}\n`);
