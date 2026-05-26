# kiro-auto

Bulk register [Kiro IDE](https://kiro.dev) accounts + generate OpenRouter API keys. Support Google OAuth atau GitHub login.

Stealth browser via Camoufox (Firefox) atau Chromium + playwright-extra stealth.

## Fitur

- **Register** akun Kiro bulk via Google OAuth atau GitHub login
- **Generate OpenRouter API keys** otomatis (Google auth): login Google → handle Turnstile → create API key
- **GitHub login** untuk Kiro registration (alternative ke Google OAuth)
- Auth mode `hydrate_or_login` — pakai cookies dulu, fallback ke fresh login kalau expired
- Anti-bot: camoufox fingerprint patches, humanize mouse, geoip resolve, stealth plugin

## Requirements

- Node.js 20+
- Akun GSuite (`email:password` per line)
- Camoufox auto-download di first run (~170MB)

## Quick start

```powershell
git clone <repo> kiro-auto
cd kiro-auto
npm install
npm run install-browser

# 1. Isi accounts
cp accounts/gsuite.example.txt accounts/gsuite.txt
# edit → email:password per line

# 2. Register + Generate OpenRouter keys
npm run register -- --count 5 -y
```

## Commands

| Command | Fungsi |
|---------|--------|
| `npm run register` | Bulk register akun Kiro + generate OpenRouter API keys via Google OAuth |
| `npm run bin` | BIN search / finder / generator (multi-source) |
| `npm run switch` | Legacy aor* token switcher |
| `npm run typecheck` | TypeScript check |

Tanpa flag → interactive menu. Dengan flag + `-y` → non-interactive.

### Register flags

```
--count 5 --concurrency 2 --proxy http://user:***@host:port
--engine camoufox|chromium-stealth|chromium-vanilla
--auth-method google|github
--headed --no-humanize --no-geoip
```

## File layout

```
accounts/
├── gsuite.txt              # email:password per line (Google auth)
├── gsuite.state.json       # per-account register state
├── github.txt              # email:password per line (GitHub auth)
└── github.state.json       # per-account GitHub login state

show/
├── sessions/               # captured Kiro sessions per account
├── results.json            # register + openrouter + github records
├── openrouter-keys.json    # generated OpenRouter API keys
└── diagnostics/            # failure dumps (screenshot + HTML + buttons)
```

## Auth modes

| Mode | Behavior |
|------|----------|
| `hydrate` | Pakai session JSON only. Fastest, fragile. |
| `google_login` | Fresh OAuth every run. Robust, slower. |
| `hydrate_or_login` (default) | Hydrate first, fallback ke Google login kalau expired. |

## Failure modes

Per-akun di `show/results.json`:

**Google OAuth (default):**
- `google_button_not_found` — DOM berubah, update selector
- `challenge_required` — Google 2FA / device verify
- `captcha_required` — butuh residential IP
- `bot_detection` — fingerprint/IP flagged
- `turnstile_timeout` — Cloudflare Turnstile challenge failed
- `new_key_button_failed` — OpenRouter UI berubah
- `extract_key_failed` — API key tidak ditemukan di modal

**GitHub login:**
- `email_fill_failed` — email/username input tidak ditemukan
- `password_fill_failed` — password input tidak ditemukan
- `signin_button_failed` — sign in button tidak ditemukan
- `2fa_failed` — 2FA prompt muncul, user tidak input code
- `username_extract_failed` — username tidak bisa di-extract
- `fatal` — error umum saat login

## Troubleshooting

Register fail silent? Check `show/diagnostics/<email>.<reason>.<ts>.{png,html,buttons.json}` — screenshot + full HTML + visible button inventory saat fail.

Reset state: delete `accounts/*.state.json`.

**Google OAuth:**
- OpenRouter API key tidak tergenerate? Cek:
  - Turnstile challenge berhasil? (check logs untuk `Turnstile challenge completed`)
  - OpenRouter UI berubah? (update selectors di `lib/openrouter.ts`)
  - Google login berhasil? (check untuk `Google login completed`)

**GitHub login:**
- 2FA muncul? Manual input required — tool akan wait 2 menit untuk user input code
- Email tidak ter-extract? GitHub profile page mungkin berubah — update selectors di `lib/github-login.ts`
- Username tidak ditemukan? Check URL atau page content — update extraction logic

## Disclaimer

For personal automation of accounts you own. Patuhi Google Workspace TOS, Kiro TOS, dan hukum lokal.

## License

MIT
