/**
 * Kiem tra moi thu truoc khi chay bot: config, claude CLI, dang nhap, quyen doc repo.
 *   npm run check
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';

import { config, validateConfig } from './config.mjs';
import { askClaude } from './claude.mjs';
import { fetchDiscordInfo, resolveUsers } from './discordInfo.mjs';

const exec = promisify(execFile);
const ok = (m) => console.log(`  ✅ ${m}`);
const bad = (m) => console.log(`  ❌ ${m}`);
const warn = (m) => console.log(`  ⚠️  ${m}`);

let fatal = 0;

console.log('\n=== 1. Cau hinh (.env) ===');
const { errors, warnings } = validateConfig();
for (const e of errors) {
  bad(e);
  fatal++;
}
for (const w of warnings) warn(w);
if (!errors.length) {
  ok(`DISCORD_TOKEN co (${config.discordToken.length} ky tu)`);
  ok(`ALLOWED_USER_IDS: ${config.allowedUserIds.join(', ')}`);
  ok(`REPO_DIR: ${config.repoDir}`);
}

console.log('\n=== 2. Claude Code CLI ===');
try {
  const { stdout } = await exec(config.claudeBin, ['--version']);
  ok(`claude: ${stdout.trim()} (${config.claudeBin})`);
} catch (err) {
  bad(`Khong chay duoc "${config.claudeBin}": ${err.message}`);
  bad('Cai: npm install -g @anthropic-ai/claude-code — roi set CLAUDE_BIN bang duong dan tuyet doi');
  fatal++;
}

console.log('\n=== 3. Dang nhap Claude (subscription, khong can API key) ===');
try {
  const res = await askClaude({
    prompt: 'Chi tra loi dung mot tu: PONG. Khong dung tool nao.',
    cwd: existsSync(config.repoDir) ? config.repoDir : process.cwd(),
    claudeBin: config.claudeBin,
    model: config.model,
    oauthToken: config.claudeOauthToken,
    timeoutMs: 120_000,
  });
  ok(`Claude tra loi duoc: "${res.text.slice(0, 40)}" (${res.durationMs}ms)`);
} catch (err) {
  const msg = String(err?.message || '');
  if (err?.code === 'NOT_LOGGED_IN') {
    bad('Claude CLI CHUA DANG NHAP → chay: claude setup-token  (hoac: claude  roi go /login)');
    fatal++;
  } else if (err?.code === 'AUTH_FAILED' || /\b401\b|invalid|expired/i.test(msg)) {
    // 401 la loi CUNG, khong phai canh bao: bot se khong tra loi duoc cau nao.
    bad(`Claude TU CHOI xac thuc: ${msg.slice(0, 140)}`);
    bad('   → token het han/bi thu hoi/copy thieu. Chay lai `claude setup-token` roi dan lai,');
    bad('     hoac xoa CLAUDE_CODE_OAUTH_TOKEN trong .env va dang nhap bang: claude → /login');
    fatal++;
  } else {
    warn(`Chua xac nhan duoc: [${err?.code || 'ERR'}] ${msg.slice(0, 160)}`);
    if (err?.stderr) warn(`stderr: ${err.stderr.slice(0, 200)}`);
  }
}

console.log('\n=== 4. Repo SociAgri ===');
if (existsSync(config.repoDir)) {
  ok(`Thu muc ton tai: ${config.repoDir}`);
  for (const f of ['CLAUDE.md', 'AGENTS.md', 'docs/README.md']) {
    if (existsSync(`${config.repoDir}/${f}`)) ok(`co ${f}`);
    else warn(`thieu ${f}`);
  }
} else {
  bad(`REPO_DIR khong ton tai: ${config.repoDir}`);
  fatal++;
}

console.log('\n=== 5. discord.js ===');
try {
  const { version } = await import('discord.js');
  ok(`discord.js ${version}`);
} catch {
  bad('Chua cai dependency — chay: npm install');
  fatal++;
}

console.log('\n=== 6. Discord API (bot co that khong, intent, server) ===');
if (!config.discordToken || errors.some((e) => e.startsWith('DISCORD_TOKEN'))) {
  warn('Bo qua — DISCORD_TOKEN chua hop le (xem muc 1)');
} else {
  try {
    const info = await fetchDiscordInfo(config.discordToken);
    ok(`bot: ${info.bot.tag} (id ${info.bot.id})`);
    ok(`app: ${info.app.name} (application id ${info.app.id})`);

    if (info.app.messageContentIntent) {
      ok('MESSAGE CONTENT INTENT da bat');
    } else {
      bad('MESSAGE CONTENT INTENT CHUA BAT — bot se online nhung khong doc duoc cau hoi');
      bad('   → Developer Portal → app → Bot → Privileged Gateway Intents → bat → Save Changes');
      fatal++;
    }

    if (info.guilds.length) {
      ok(`da o ${info.guilds.length} server: ${info.guilds.map((g) => g.name).join(', ')}`);
    } else {
      warn('Bot CHUA o server nao — mo link nay de moi bot vao server:');
      console.log(`\n     ${info.inviteUrl}\n`);
    }

    // Whitelist tro thanh ten that — de phat hien dan sai ID
    const users = await resolveUsers(config.allowedUserIds, config.discordToken);
    for (const u of users) {
      if (u.tag) ok(`whitelist: ${u.id} = ${u.tag}`);
      else {
        bad(`whitelist: ${u.id} — ${u.error} (bot se khong bao gio tra loi ID nay)`);
        fatal++;
      }
    }
  } catch (err) {
    if (err.status === 401) {
      bad('Discord tu choi token (401) — DISCORD_TOKEN sai hoac da bi reset');
      bad('   → Developer Portal → app → tab Bot → Reset Token (KHONG phai Client Secret o tab OAuth2)');
    } else {
      bad(`Khong goi duoc Discord API: ${String(err.message).slice(0, 160)}`);
    }
    fatal++;
  }
}

console.log('\n=== 7. Ket noi Gateway thuc te (dung intent that) ===');
if (!config.discordToken || errors.some((e) => e.startsWith('DISCORD_TOKEN'))) {
  warn('Bo qua — DISCORD_TOKEN chua hop le');
} else {
  try {
    const { Client, GatewayIntentBits, Events } = await import('discord.js');
    const probe = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    });

    const ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('het 25s ma khong ClientReady')), 25_000);
      probe.once(Events.ClientReady, (c) => {
        clearTimeout(timer);
        resolve(c);
      });
      probe.once(Events.Error, (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });

    await probe.login(config.discordToken);
    const c = await ready;
    ok(`Gateway OK — dang nhap duoc voi MessageContent intent: ${c.user.tag}`);
    await probe.destroy();
  } catch (err) {
    const msg = String(err?.message || err);
    if (/disallowed intents/i.test(msg)) {
      bad('Gateway TU CHOI intent — MESSAGE CONTENT INTENT chua duoc bat/luu that su');
      bad('   → Developer Portal → Bot → Privileged Gateway Intents → bat → Save Changes');
    } else {
      bad(`Khong ket noi duoc Gateway: ${msg.slice(0, 160)}`);
    }
    fatal++;
  }
}

console.log(
  fatal === 0
    ? '\n🎉 Tat ca OK. Chay bot: npm start\n'
    : `\n🚫 Con ${fatal} van de phai sua truoc khi chay bot.\n`
);
process.exit(fatal === 0 ? 0 : 1);
