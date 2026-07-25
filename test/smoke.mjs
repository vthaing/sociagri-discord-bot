/**
 * Smoke test khong can Discord/Claude:  node test/smoke.mjs
 * Kiem tra 2 thu de sai va hau qua nang: an secret + cat tin nhan.
 */
import assert from 'node:assert/strict';

import { redact } from '../src/redact.mjs';
import { chunkForDiscord, DISCORD_LIMIT } from '../src/chunk.mjs';
import { OwnerMode, isOwnerUnlocked, ownerCanDm, resolveOwnerMode } from '../src/owner.mjs';

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

console.log(`\n${process.exitCode ? '🚫 CO TEST FAIL' : `🎉 ${pass}/${pass} test PASS`}\n`);
