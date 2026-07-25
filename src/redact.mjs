/**
 * Lop chan cuoi cung: quet cau tra loi truoc khi post len Discord.
 * Ly do: bot doc duoc repo (Read/Grep) => neu ai do lua duoc no doc secret,
 * hoac secret vo tinh nam trong doan code duoc trich, thi chan tai day.
 */

const PATTERNS = [
  // Anthropic / OpenAI style keys
  [/sk-ant-[A-Za-z0-9_\-]{16,}/g, 'ANTHROPIC_KEY'],
  [/\bsk-[A-Za-z0-9]{24,}\b/g, 'API_KEY'],
  // Google
  [/\bAIza[0-9A-Za-z_\-]{30,}\b/g, 'GOOGLE_KEY'],
  // GitHub
  [/\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g, 'GITHUB_TOKEN'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, 'GITHUB_PAT'],
  // Slack / Discord webhook
  [/https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\S+/g, 'DISCORD_WEBHOOK'],
  [/https:\/\/hooks\.slack\.com\/\S+/g, 'SLACK_WEBHOOK'],
  // Discord bot token
  [/\b[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6,7}\.[A-Za-z0-9_-]{27,}\b/g, 'DISCORD_TOKEN'],
  // JWT
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, 'JWT'],
  // Private key block
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, 'PRIVATE_KEY'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, 'PRIVATE_KEY'],
  // Connection string co mat khau
  [/\b(mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|amqp):\/\/[^\s:@/]+:[^\s@]+@\S+/gi, 'DB_URI_WITH_PASSWORD'],
  // AWS / R2
  [/\bAKIA[0-9A-Z]{16}\b/g, 'AWS_ACCESS_KEY'],
  // Dong kieu KEY=VALUE trong file env
  [
    /^[ \t]*(?:export[ \t]+)?([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|APIKEY|PRIVATE_KEY|CLIENT_SECRET|WEBHOOK)[A-Z0-9_]*)[ \t]*=[ \t]*(?!\s*$)(["']?)([^\n"']{6,})\2/gim,
    'ENV_SECRET',
  ],
];

/**
 * @param {string} text
 * @returns {{ text: string, hits: string[] }}
 */
export function redact(text) {
  if (!text) return { text: text ?? '', hits: [] };
  let out = text;
  const hits = [];

  for (const [re, label] of PATTERNS) {
    out = out.replace(re, (match, ...rest) => {
      hits.push(label);
      if (label === 'ENV_SECRET') {
        const key = rest[0];
        return `${key}=[đã ẩn: ${label}]`;
      }
      return `[đã ẩn: ${label}]`;
    });
  }

  return { text: out, hits: [...new Set(hits)] };
}
