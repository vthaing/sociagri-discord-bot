import { existsSync } from 'node:fs';
import path from 'node:path';

const bool = (v, d = false) => (v == null || v === '' ? d : /^(1|true|yes|on)$/i.test(String(v).trim()));
const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const list = (v) =>
  String(v || '')
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

export const config = {
  discordToken: process.env.DISCORD_TOKEN || '',

  // Fail-closed: khong co whitelist => bot khong tra loi ai
  allowedUserIds: list(process.env.ALLOWED_USER_IDS),
  allowedChannelIds: list(process.env.ALLOWED_CHANNEL_IDS), // rong = moi channel (van phai qua whitelist user)
  allowedGuildIds: list(process.env.ALLOWED_GUILD_IDS), // rong = moi server
  allowDm: bool(process.env.ALLOW_DM, false),

  repoDir: process.env.REPO_DIR || '/Users/vthaing/WORKING_AREA/PROJECTS/sociagri',
  claudeBin: process.env.CLAUDE_BIN || 'claude',
  // Token subscription tu `claude setup-token` (KHONG phai Anthropic API key tra phi).
  // De trong = dung dang nhap Keychain cua may (chi on khi chay tay trong Terminal).
  claudeOauthToken: process.env.CLAUDE_CODE_OAUTH_TOKEN || '',
  model: process.env.CLAUDE_MODEL || 'sonnet',
  timeoutMs: num(process.env.CLAUDE_TIMEOUT_MS, 180_000),

  // Giu ngu canh hoi thoai theo tung channel
  sessionTtlMs: num(process.env.SESSION_TTL_MS, 2 * 60 * 60 * 1000),

  // Chong ngop may (moi cau hoi = 1 process claude)
  maxQueued: num(process.env.MAX_QUEUED, 5),
  userCooldownMs: num(process.env.USER_COOLDOWN_MS, 10_000),
  userHourlyLimit: num(process.env.USER_HOURLY_LIMIT, 30),

  systemPromptFile: process.env.SYSTEM_PROMPT_FILE || 'system-prompt.md',
  logFile: process.env.LOG_FILE || 'logs/bot.log',
  presence: process.env.PRESENCE_TEXT || 'tra loi ho Vince ve SociAgri',
};

export function validateConfig() {
  const errors = [];
  const warnings = [];

  if (!config.discordToken) {
    errors.push('DISCORD_TOKEN trong — tao bot token o Discord Developer Portal roi dan vao .env');
  } else if (!/^[\w-]{20,}\.[\w-]{5,}\.[\w-]{20,}$/.test(config.discordToken)) {
    // Bot token = 3 phan cach nhau 2 dau '.', tong ~70 ky tu.
    // Nham lan pho bien: Client Secret (32 ky tu), Public Key (64 hex), Application ID (19 so).
    const n = config.discordToken.length;
    const dots = (config.discordToken.match(/\./g) || []).length;
    let hint = '';
    if (n === 32 && dots === 0) hint = ' → day la CLIENT SECRET (tab OAuth2), KHONG phai bot token.';
    else if (n === 64 && dots === 0) hint = ' → day la PUBLIC KEY (tab General Information), KHONG phai bot token.';
    else if (/^\d{17,20}$/.test(config.discordToken)) hint = ' → day la APPLICATION ID, KHONG phai bot token.';
    errors.push(
      `DISCORD_TOKEN sai dinh dang (${n} ky tu, ${dots} dau '.'). Bot token co 2 dau '.' va dai ~70 ky tu.${hint}` +
        ' Lay o: Developer Portal → app → tab Bot → Reset Token.'
    );
  }

  if (config.allowedUserIds.length === 0) {
    errors.push('ALLOWED_USER_IDS trong — bot fail-closed (khong tra loi ai). Dien Discord user ID duoc phep hoi.');
  } else {
    const badIds = config.allowedUserIds.filter((id) => !/^\d{15,25}$/.test(id));
    if (badIds.length)
      errors.push(
        `ALLOWED_USER_IDS co gia tri khong phai user ID: ${badIds.join(', ')}` +
          ' — user ID la day 15-25 chu so (bat Developer Mode → click phai vao nguoi → Copy User ID), KHONG phai username.'
      );
  }

  if (config.claudeOauthToken && !config.claudeOauthToken.startsWith('sk-ant-oat01-'))
    errors.push(
      `CLAUDE_CODE_OAUTH_TOKEN sai dinh dang (${config.claudeOauthToken.length} ky tu) — phai bat dau bang 'sk-ant-oat01-'.` +
        ' Lay bang: claude setup-token. Hoac de TRONG de dung dang nhap Keychain.'
    );
  if (!existsSync(config.repoDir)) errors.push(`REPO_DIR khong ton tai: ${config.repoDir}`);

  const sysPath = path.resolve(config.systemPromptFile);
  if (!existsSync(sysPath)) warnings.push(`Khong thay ${config.systemPromptFile} — bot chay voi system prompt rong`);
  if (!config.claudeOauthToken)
    warnings.push(
      'CLAUDE_CODE_OAUTH_TOKEN trong — bot se dua vao dang nhap Keychain. Khi chay nen (launchd) nen dung token tu `claude setup-token`.'
    );
  if (config.allowedChannelIds.length === 0)
    warnings.push('ALLOWED_CHANNEL_IDS trong — bot tra loi o moi channel no thay (van chi cho user trong whitelist)');

  return { errors, warnings };
}
