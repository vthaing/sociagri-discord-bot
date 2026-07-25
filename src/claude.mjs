import { spawn } from 'node:child_process';

/**
 * Goi Claude Code CLI o che do headless (-p) trong thu muc repo.
 * KHONG dung Anthropic API key: CLI dung dang nhap subscription san co tren may.
 *
 * Bao mat 2 lop:
 *  1. --tools=Read,Grep,Glob  -> tool set chi doc, khong ton tai Bash/Edit/Write.
 *  2. --settings deny(...)    -> chan doc cac file bi mat (.env, key, credentials...).
 * Lop 3 (redact.mjs) quet output truoc khi post len Discord.
 */

const READ_ONLY_TOOLS = ['Read', 'Grep', 'Glob'];

const SENSITIVE_DENY = [
  'Bash',
  'Edit',
  'Write',
  'NotebookEdit',
  'WebFetch',
  'WebSearch',
  'Task',
  'Read(**/.env*)',
  'Read(./**/.env*)',
  'Read(.env)',
  'Read(**/credentials*)',
  'Read(**/*.p8)',
  'Read(**/*.p12)',
  'Read(**/*.pem)',
  'Read(**/*.keystore)',
  'Read(**/*.jks)',
  'Read(**/*.mobileprovision)',
  'Read(**/id_rsa*)',
  'Read(~/.ssh/**)',
  'Read(~/.aws/**)',
  'Read(~/.claude/**)',
];

const SETTINGS = JSON.stringify({
  permissions: {
    allow: READ_ONLY_TOOLS,
    deny: SENSITIVE_DENY,
  },
  includeCoAuthoredBy: false,
});

export class ClaudeError extends Error {
  constructor(message, { code = 'CLAUDE_FAILED', stderr = '' } = {}) {
    super(message);
    this.code = code;
    this.stderr = stderr;
  }
}

/** Cac process claude dang chay — de kill sach khi bot shutdown (khong de lai process mo coi) */
const liveChildren = new Set();

export function killLiveChildren() {
  let n = 0;
  for (const child of liveChildren) {
    try {
      child.kill('SIGTERM');
      n++;
    } catch {
      /* da chet */
    }
  }
  return n;
}

/**
 * @param {object} opts
 * @param {string} opts.prompt        Cau hoi (da boc trong <discord_question>)
 * @param {string} opts.cwd           Thu muc repo
 * @param {string} opts.claudeBin
 * @param {string} opts.model
 * @param {string} [opts.systemPrompt]
 * @param {string} [opts.sessionId]   Neu co -> --resume de giu ngu canh
 * @param {number} opts.timeoutMs
 * @returns {Promise<{ text: string, sessionId: string|null, durationMs: number, costUsd: number|null }>}
 */
export async function askClaude({
  prompt,
  cwd,
  claudeBin,
  model,
  systemPrompt,
  sessionId,
  timeoutMs,
  oauthToken,
  addDirs = [],
}) {
  const args = [
    '-p',
    '--output-format=json',
    `--model=${model}`,
    `--tools=${READ_ONLY_TOOLS.join(',')}`,
    `--allowedTools=${READ_ONLY_TOOLS.join(',')}`,
    `--settings=${SETTINGS}`,
    '--setting-sources=user',
    '--disable-slash-commands',
  ];

  // Thu muc tam chua anh dinh kem: `claude` chi doc duoc file ngoai cwd khi duoc --add-dir
  for (const dir of addDirs) if (dir) args.push(`--add-dir=${dir}`);
  if (systemPrompt) args.push(`--append-system-prompt=${systemPrompt}`);
  if (sessionId) args.push(`--resume=${sessionId}`);

  const started = Date.now();

  return new Promise((resolve, reject) => {
    const child = spawn(claudeBin, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // Tranh mau/animation lam ban JSON
        CI: '1',
        NO_COLOR: '1',
        TERM: 'dumb',
        ...(oauthToken ? { CLAUDE_CODE_OAUTH_TOKEN: oauthToken } : {}),
      },
    });

    liveChildren.add(child);

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      clearTimeout(hardKillTimer);
      liveChildren.delete(child);
      fn(arg);
    };

    let hardKillTimer = null;
    const killTimer = setTimeout(() => {
      child.kill('SIGTERM');
      // SIGKILL neu no khong chet — giu handle de clearTimeout, khong fire-and-forget
      hardKillTimer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* da chet */
        }
      }, 5_000);
      finish(reject, new ClaudeError(`Claude qua thoi gian ${timeoutMs}ms`, { code: 'TIMEOUT' }));
    }, timeoutMs);

    // setEncoding: Node ghep cac byte UTF-8 bi cat giua chunk.
    // Neu dung d.toString() tren tung chunk thi ky tu tieng Viet nam vat ranh gioi
    // chunk se thanh ký tự lỗi (câu trả lời tiếng Việt rất dễ gặp).
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (d) => {
      stdout += d;
    });
    child.stderr.on('data', (d) => {
      stderr += d;
    });

    child.on('error', (err) => {
      finish(
        reject,
        new ClaudeError(`Khong chay duoc "${claudeBin}": ${err.message}`, { code: 'SPAWN_FAILED', stderr })
      );
    });

    child.on('close', (code) => {
      const durationMs = Date.now() - started;
      const raw = stdout.trim();

      const notLoggedIn = () =>
        new ClaudeError('Claude CLI chua dang nhap — chay `claude setup-token` tren may nay', {
          code: 'NOT_LOGGED_IN',
          stderr,
        });

      // CHU Y: chi coi la "chua dang nhap" khi CLI bao loi.
      // Khong do chuoi tren toan bo stdout — cau tra loi hop le cung co the
      // chua chu "not logged in" (vd nguoi ta hoi ve bug dang nhap).
      if (/not logged in/i.test(stderr)) return finish(reject, notLoggedIn());

      if (code !== 0 && !raw) {
        return finish(
          reject,
          new ClaudeError(`Claude thoat voi code ${code}`, { code: 'NONZERO_EXIT', stderr: stderr.trim() })
        );
      }

      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        // Fallback: khong parse duoc JSON -> coi ca stdout la text.
        // O day raw KHONG phai cau tra loi cua model, nen do chuoi la an toan.
        if (!raw) {
          return finish(reject, new ClaudeError('Claude tra ve rong', { code: 'EMPTY', stderr: stderr.trim() }));
        }
        if (/not logged in/i.test(raw)) return finish(reject, notLoggedIn());
        return finish(resolve, { text: raw, sessionId: null, durationMs, costUsd: null });
      }

      if (parsed?.is_error) {
        const msg = String(parsed.result || parsed.error || 'Claude bao loi');
        if (/not logged in|please run \/login/i.test(msg)) return finish(reject, notLoggedIn());
        return finish(
          reject,
          new ClaudeError(msg, {
            code: /invalid api key|authentication/i.test(msg)
              ? 'AUTH_FAILED'
              : parsed.subtype && parsed.subtype !== 'success'
                ? String(parsed.subtype).toUpperCase()
                : 'RESULT_ERROR',
            stderr: stderr.trim(),
          })
        );
      }

      const text = String(parsed?.result ?? '').trim();
      if (!text) {
        return finish(reject, new ClaudeError('Claude tra ve rong', { code: 'EMPTY', stderr: stderr.trim() }));
      }

      finish(resolve, {
        text,
        sessionId: parsed?.session_id ?? null,
        durationMs,
        costUsd: typeof parsed?.total_cost_usd === 'number' ? parsed.total_cost_usd : null,
      });
    });

    child.stdin.end(prompt);
  });
}
