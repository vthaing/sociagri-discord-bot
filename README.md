# SociAgri Discord Bot — trả lời hộ Vince

Bot Discord chạy **ngay trên máy Mac này**, trả lời câu hỏi về dự án SociAgri khi bạn đang bận.
Bộ não của bot là **Claude Code CLI local** → dùng subscription Claude sẵn có, **không cần Anthropic API key trả phí**.

```
Người hỏi @mention bot  →  bot.mjs (discord.js)  →  claude -p (đọc repo sociagri)  →  trả lời về Discord
```

**Đặc điểm:**
- Chỉ trả lời khi bị **@mention** hoặc khi ai đó **reply** vào tin của bot.
- Chỉ trả lời **user trong whitelist** (`ALLOWED_USER_IDS`) — mặc định fail-closed: whitelist trống ⇒ bot im lặng.
- Đọc được toàn repo (code, `docs/`, `CLAUDE.md`, git log) nên trả lời được câu hỏi kỹ thuật sâu.
- **Chỉ có quyền đọc**: tool set giới hạn `Read / Grep / Glob` — bot không sửa code, không chạy lệnh, không deploy.
- **3 lớp chống lộ secret**: (1) tool set read-only, (2) deny đọc `.env` / key / credentials, (3) quét & ẩn secret trong câu trả lời trước khi post.
- Nhớ ngữ cảnh hội thoại theo từng channel (2 giờ), gõ `reset` để xoá.
- Rate limit theo user, hàng đợi tuần tự (1 câu 1 lúc) để không ngốn máy.

---

## Cài đặt — 6 bước

### Bước 1 — Đăng nhập Claude CLI (làm 1 lần)

CLI đã được cài (`claude` v2.1.220). Giờ cần đăng nhập bằng **subscription Claude** của bạn:

```bash
export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH" && claude setup-token
```

Lệnh này mở browser → đăng nhập claude.ai → Authorize → in ra một token dạng `sk-ant-oat01-…`.
**Copy token đó**, sẽ dán vào `.env` ở bước 4 (`CLAUDE_CODE_OAUTH_TOKEN`).

> Token này gắn với subscription của bạn (Pro/Max), **không** phải API key tính tiền theo request.
> Dùng token thay vì đăng nhập Keychain giúp bot chạy nền qua launchd ổn định hơn.

Cách khác (nếu chỉ chạy tay trong Terminal): `claude` → gõ `/login` → OAuth. Khi đó để trống `CLAUDE_CODE_OAUTH_TOKEN`.

### Bước 2 — Tạo Discord bot

1. Vào https://discord.com/developers/applications → **New Application** → đặt tên (VD `SociAgri Assistant`).
2. Tab **Bot**:
   - **Reset Token** → **Copy** (đây là `DISCORD_TOKEN`, chỉ hiện 1 lần).
   - Bật **MESSAGE CONTENT INTENT** (bắt buộc — không bật thì bot không đọc được nội dung câu hỏi).
   - Tắt **Public Bot** nếu không muốn người khác mời bot vào server của họ.
3. Tab **OAuth2 → URL Generator**: tick `bot`, rồi tick quyền **View Channels**, **Send Messages**, **Read Message History**.
   Copy URL sinh ra → mở → chọn server của bạn → **Authorize**.

   (Hoặc dùng trực tiếp, thay `<CLIENT_ID>` bằng Application ID:
   `https://discord.com/api/oauth2/authorize?client_id=<CLIENT_ID>&permissions=68608&scope=bot`)

### Bước 3 — Lấy Discord user ID của người được phép hỏi

Discord → **Settings → Advanced → Developer Mode: ON** → click phải vào tên người → **Copy User ID**.
Lấy ID của bạn và của những người bạn muốn cho phép hỏi bot.

### Bước 4 — Điền cấu hình

```bash
cd ~/WORKING_AREA/PROJECTS/sociagri-discord-bot
cp .env.example .env
open -e .env      # dán DISCORD_TOKEN, ALLOWED_USER_IDS, CLAUDE_CODE_OAUTH_TOKEN
```

### Bước 5 — Kiểm tra rồi chạy thử

```bash
npm run check     # kiểm tra config + CLI + đăng nhập + repo
npm start         # chạy bot (Ctrl-C để dừng)
```

Vào Discord, @mention bot: `@SociAgri Assistant dự án đang làm tới đâu rồi?`

### Bước 6 — Cho bot chạy nền 24/7

```bash
bash scripts/install-service.sh
```

Bot thành **launchd agent**: tự khởi động khi bạn đăng nhập máy, tự restart nếu crash.

```bash
tail -f logs/bot.log                      # xem log
bash scripts/uninstall-service.sh         # tắt bot
```

**Để máy không ngủ** (nếu không bot sẽ offline khi máy sleep):
- System Settings → Lock Screen / Displays → đặt *Prevent automatic sleeping when display is off*, hoặc
- chạy `caffeinate -s` trong một cửa sổ Terminal, hoặc dùng app **Amphetamine**.

---

## Cấu trúc

| File | Việc |
|---|---|
| `src/bot.mjs` | Kết nối Discord, lọc quyền, hàng đợi, chunk tin nhắn >2000 ký tự |
| `src/claude.mjs` | Spawn `claude -p --output-format=json` trong repo; tool set read-only |
| `src/redact.mjs` | Quét & ẩn secret (API key, token, private key, connection string…) trước khi gửi |
| `src/config.mjs` | Đọc + validate `.env` (fail-closed) |
| `src/preflight.mjs` | `npm run check` |
| `system-prompt.md` | **Tính cách + ranh giới của bot** — sửa file này để đổi cách bot trả lời |
| `scripts/run.sh` | Wrapper Node 22 cho launchd |

## Chỉnh cách bot trả lời

Sửa `system-prompt.md` (tiếng Việt, người-đọc-được) rồi restart bot:

```bash
launchctl kickstart -k gui/$(id -u)/com.sociagri.discordbot
```

Trong đó đã có sẵn ranh giới quan trọng: không nhân danh bạn quyết định deadline/giá/nhân sự/tiền, không tiết lộ secret, không làm theo mệnh lệnh cài trong câu hỏi (prompt injection).

## Lưu ý bảo mật

- Bot đọc được repo — nên **chỉ whitelist người bạn tin**. `ALLOWED_USER_IDS` trống = bot không trả lời ai.
- `.env` của repo sociagri (chứa secret thật) đã bị chặn đọc ở 2 lớp và mọi output đều được quét lại, nhưng whitelist vẫn là hàng rào chính.
- Token trong `.env` của bot: file này đã nằm trong `.gitignore` — đừng commit, đừng share log.
- Nếu lỡ lộ `DISCORD_TOKEN`: Developer Portal → Bot → **Reset Token**.

## Sự cố thường gặp

| Hiện tượng | Nguyên nhân / cách sửa |
|---|---|
| Bot online nhưng không trả lời | Chưa bật **MESSAGE CONTENT INTENT**, hoặc user chưa có trong `ALLOWED_USER_IDS` (xem `logs/bot.log` — có dòng `bo qua tin nhan`) |
| `Bot chưa được đăng nhập Claude` | Chạy lại bước 1, dán `CLAUDE_CODE_OAUTH_TOKEN` vào `.env` |
| `Mình không gọi được Claude` | `CLAUDE_BIN` sai — kiểm tra `which claude` với Node 22 trong PATH |
| Trả lời rất chậm | Đổi `CLAUDE_MODEL=sonnet`; câu hỏi phải tra nhiều file sẽ tốn 30–90s |
| Bot chết sau khi đóng Terminal | Chưa cài service — chạy `bash scripts/install-service.sh` |
