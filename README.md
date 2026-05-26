# kiro-auto

Bulk register [Kiro IDE](https://kiro.dev) accounts + generate OpenRouter API keys. GSuite → Google OAuth register → OpenRouter key generation.

Stealth browser via Camoufox (Firefox) atau Chromium + playwright-extra stealth.

## Fitur

- **Register** akun Kiro bulk via Google OAuth di `app.kiro.dev/signin`
- **Generate OpenRouter API keys** otomatis: login Google → handle Turnstile → create API key
- Auth mode `hydrate_or_login` — pakai cookies dulu, fallback ke fresh Google login kalau expired
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
--headed --no-humanize --no-geoip
```

## File layout

```
accounts/
├── gsuite.txt              # email:password per line (gitignored)
└── gsuite.state.json       # per-account register state

show/
├── sessions/               # captured Kiro sessions per account
├── results.json            # register + openrouter records
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

- `google_button_not_found` — DOM berubah, update selector
- `challenge_required` — Google 2FA / device verify
- `captcha_required` — butuh residential IP
- `bot_detection` — fingerprint/IP flagged
- `turnstile_timeout` — Cloudflare Turnstile challenge failed
- `new_key_button_failed` — OpenRouter UI berubah
- `extract_key_failed` — API key tidak ditemukan di modal

## Troubleshooting

Register fail silent? Check `show/diagnostics/<email>.<reason>.<ts>.{png,html,buttons.json}` — screenshot + full HTML + visible button inventory saat fail.

Reset state: delete `accounts/*.state.json`.

OpenRouter API key tidak tergenerate? Cek:
- Turnstile challenge berhasil? (check logs untuk `Turnstile challenge completed`)
- OpenRouter UI berubah? (update selectors di `lib/openrouter.ts`)
- Google login berhasil? (check untuk `Google login completed`)

## Disclaimer

For personal automation of accounts you own. Patuhi Google Workspace TOS, Kiro TOS, dan hukum lokal.

## License

MIT
