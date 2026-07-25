/**
 * Hoi Discord API: bot nay la ai, MESSAGE CONTENT INTENT bat chua, dang o server nao.
 * Dung boi ca `npm run check` va `scripts/discord-info.mjs`. KHONG bao gio in token.
 */

const API = 'https://discord.com/api/v10';

// Quyen toi thieu bot can (View Channels + Send Messages + Read Message History + Send Messages in Threads)
export const PERM_BITS = ((1n << 10n) | (1n << 11n) | (1n << 16n) | (1n << 38n)).toString();

const FLAG_MSG_CONTENT = 1 << 18;
const FLAG_MSG_CONTENT_LIMITED = 1 << 19;

export function buildInviteUrl(applicationId) {
  return `https://discord.com/api/oauth2/authorize?client_id=${applicationId}&permissions=${PERM_BITS}&scope=bot`;
}

async function api(pathname, token) {
  const res = await fetch(`${API}${pathname}`, {
    headers: { Authorization: `Bot ${token}`, 'User-Agent': 'SociAgriBot (local, 1.0)' },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.text();
  if (!res.ok) {
    const err = new Error(`GET ${pathname} → HTTP ${res.status}: ${body.slice(0, 160)}`);
    err.status = res.status;
    throw err;
  }
  return JSON.parse(body);
}

/**
 * Doi user ID -> ten that, de xac nhan whitelist dung nguoi (de dan nham ID).
 * @returns {Promise<Array<{id:string, tag:string|null, error:string|null}>>}
 */
export async function resolveUsers(ids, token) {
  const out = [];
  for (const id of ids) {
    try {
      const u = await api(`/users/${id}`, token);
      out.push({
        id,
        tag: `${u.username}${u.discriminator && u.discriminator !== '0' ? '#' + u.discriminator : ''}`,
        error: null,
      });
    } catch (err) {
      out.push({ id, tag: null, error: err.status === 404 ? 'khong ton tai' : String(err.message).slice(0, 60) });
    }
  }
  return out;
}

/**
 * @returns {Promise<{bot:{id:string,tag:string}, app:{id:string,name:string,publicBot:boolean,messageContentIntent:boolean}, guilds:Array<{id:string,name:string}>, inviteUrl:string}>}
 */
export async function fetchDiscordInfo(token) {
  const me = await api('/users/@me', token);
  const app = await api('/oauth2/applications/@me', token);
  const guilds = await api('/users/@me/guilds', token);
  const flags = app.flags || 0;

  return {
    bot: {
      id: me.id,
      tag: `${me.username}${me.discriminator && me.discriminator !== '0' ? '#' + me.discriminator : ''}`,
    },
    app: {
      id: app.id,
      name: app.name,
      publicBot: Boolean(app.bot_public),
      messageContentIntent: Boolean(flags & (FLAG_MSG_CONTENT | FLAG_MSG_CONTENT_LIMITED)),
    },
    guilds: guilds.map((g) => ({ id: g.id, name: g.name })),
    inviteUrl: buildInviteUrl(app.id),
  };
}
