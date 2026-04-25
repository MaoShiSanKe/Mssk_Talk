# Mssk_Talk

> An anonymous message board with a full-featured admin panel. Built on Cloudflare Pages + Supabase — no dedicated backend, zero-maintenance deployment.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Cloudflare Pages](https://img.shields.io/badge/Deployed%20on-Cloudflare%20Pages-orange?logo=cloudflare)](https://pages.cloudflare.com)
[![Supabase](https://img.shields.io/badge/Database-Supabase-3ECF8E?logo=supabase)](https://supabase.com)

**Demo:** https://mssk.cc.cd &nbsp;|&nbsp; [中文](./README.zh.md)

<table style="width: 100%; border-collapse: collapse;">
  <tr>
    <td width="50%" align="center">
      <img src="https://github.com/user-attachments/assets/7f511a07-f190-45ef-8d89-370401169ea0" width="100%">
    </td>
    <td width="50%" align="center">
      <img src="https://github.com/user-attachments/assets/2fa15c05-6e75-4677-b43b-69d36be77372" width="100%">
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="https://github.com/user-attachments/assets/7c6039c3-cbec-4eab-bc72-dbe12f94218f" width="100%">
    </td>
    <td width="50%" align="center">
      <img src="https://github.com/user-attachments/assets/22a16c34-e130-4379-a912-960739037860" width="100%">
    </td>
  </tr>
</table>

---

## Highlights

- **Truly anonymous** — visitors are identified by a UUID stored in `localStorage`, no account required
- **Silent moderation** — blocked words intercept messages without alerting the sender; admin reviews and decides
- **Public board mode** — admin can selectively publish messages to a public board visible to all visitors
- **Floating message wall** — featured messages drift as bubbles in the page background, fully configurable
- **Multilingual** — built-in Chinese, English, Korean; adding a new language takes one JSON file
- **Zero infrastructure** — Cloudflare Pages Functions handles all server logic; Supabase is the only external service

---

## Quick Start

**1. Set up Supabase**

Create a new project and run [`schema.sql`](./schema.sql) in the SQL Editor. Note your Project URL, `anon` key, and `service_role` key.

**2. Deploy to Cloudflare Pages**

Fork this repo, connect it to Cloudflare Pages, then add these environment variables (copy [`.env.example`](./.env.example) as reference):

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase Project URL |
| `SUPABASE_PUBLISHABLE_KEY` | `anon` public key |
| `SUPABASE_SECRET_KEY` | `service_role` secret key |
| `ADMIN_PASSWORD` | Admin login password |
| `KEEPALIVE_SECRET` | *(Optional)* Secret for the database keepalive endpoint |
| `NOTIFY_TG_TOKEN` | *(Optional)* Telegram Bot Token |
| `NOTIFY_TG_CHAT_ID` | *(Optional)* Telegram Chat ID |
| `NOTIFY_RESEND_KEY` | *(Optional)* Resend API Key |
| `NOTIFY_EMAIL_FROM` | *(Optional)* Sender email (domain must be verified in Resend) |
| `NOTIFY_EMAIL_TO` | *(Optional)* Recipient email |

Build settings: framework preset `None`, build command empty, output directory `/`.

**3. Done**

Visit your Pages URL to use the message board. Go to `/admin` to log in with your password.

> **Notifications** are optional. Telegram, email, and webhook work independently — configure any or all.
> Email uses [Resend](https://resend.com) (free tier: 3,000/month), sender domain verification required.

> **Database keepalive** — Supabase pauses inactive projects after 7 days. Enable the keepalive workflow to ping the database every 5 days automatically. See [Database Keepalive](#database-keepalive) below.

---

## Features

<details>
<summary><strong>User-facing</strong></summary>

- Send anonymous messages with optional image URL and contact info
- Card profile — set a nickname, avatar, and bio (saved locally, synced to database)
- View message history and admin replies
- Pinned messages section (shown when enabled by admin)
- Public message board — publicly visible messages curated by admin
- Floating message wall background (bubble animation, enabled by admin)
- Language switcher menu — Chinese, English, Korean built-in
- Light / dark theme toggle

</details>

<details>
<summary><strong>Admin panel</strong> (<code>/admin</code>)</summary>

- Messages grouped by visitor, collapsible, paginated with page-jump
- Keyword search with highlight
- Filter: All / Unread / Blocked / Word-filtered
- Mark read, block/unblock messages and visitors, add visitor notes
- View visitor card (nickname, avatar, bio)
- Reply to messages — edit, delete, optional email notification to visitor
- Make messages public (appears on public board) / private
- Feature messages for the floating wall; manage featured list from a dedicated panel
- Pin messages
- Export CSV — choose scope and whether to include blocked/word-filtered messages
- System settings: site title, description, toggles, numeric limits — all live
- Webhook URL — POST new message events to any HTTP endpoint
- Blocked word management — add/remove words, release intercepted messages
- Visitor stats — total count, today's new visitors, 7-day message volume chart
- Language switcher — admin panel is fully internationalized
- Warm / cool color scheme toggle

</details>

<details>
<summary><strong>Anti-spam</strong></summary>

- Honeypot hidden field
- IP rate limiting (max 3 per minute)
- Minimum send interval (10 seconds)
- Daily message limit per visitor (configurable, 0 = unlimited)
- Blocked word interception — silent, visitor unaware; admin can review and release

</details>

---

## Project Structure

```
├── index.html              # User-facing page
├── admin.html              # Admin panel
├── schema.sql              # Database initialization script
├── .env.example            # Environment variable reference
├── css/
│   ├── main.css            # User-facing styles
│   └── admin.css           # Admin panel styles
├── js/
│   ├── config.js           # Config loader
│   ├── i18n.js             # Internationalization
│   ├── supabase.js         # Database operation wrappers
│   ├── visitor.js          # Visitor UUID management
│   ├── bubbles.js          # Floating message wall animation
│   ├── theme.js            # Theme / color scheme toggle
│   ├── main.js             # User-facing logic
│   └── admin.js            # Admin panel logic
├── i18n/
│   ├── zh.json             # Chinese (base language)
│   ├── en.json             # English
│   └── kr.json             # Korean
├── functions/
│   └── api/
│       ├── config.js       # Delivers settings, featured, pinned, and public messages
│       ├── message.js      # Receives messages (anti-spam, word check, notifications)
│       ├── visitor.js      # Visitor card updates
│       ├── admin.js        # Admin operation proxy
│       └── keepalive.js    # Database keepalive endpoint
├── docs/
│   ├── architecture.md     # System architecture and data flow
│   ├── api.md              # API reference
│   ├── database.md         # Database schema reference
│   └── roadmap.md          # Roadmap and design decisions
└── .github/
    ├── workflows/
    │   ├── lint.yml        # JS syntax, JSON validation, i18n coverage
    │   └── keepalive.yml   # Database keepalive schedule
    └── ISSUE_TEMPLATE/
        ├── bug_report.yml
        └── feature_request.yml
```

---

## Database

Five tables, all with RLS enabled. Run [`schema.sql`](./schema.sql) to initialize.

| Table | Description |
|-------|-------------|
| `visitors` | UUID, block status, note, card profile |
| `messages` | Content, image, contact, status flags (blocked, featured, pinned, public, word-blocked) |
| `replies` | Admin replies with edit history |
| `settings` | Key-value system configuration |
| `blocked_words` | Blocked word list |

---

## Database Keepalive

Supabase pauses free-tier projects after 7 days of inactivity. Mssk_Talk includes a built-in keepalive system that pings the database every 5 days via GitHub Actions.

**Setup:**

1. Generate a random secret:
   ```bash
   openssl rand -hex 32
   ```

2. Add to **Cloudflare Pages** environment variables:
   - `KEEPALIVE_SECRET` → the secret you generated

3. Add to **GitHub repository** secrets (Settings → Secrets → Actions):
   - `KEEPALIVE_SECRET` → same secret
   - `SITE_URL` → your Pages URL, e.g. `https://your-site.pages.dev`

4. The `.github/workflows/keepalive.yml` workflow runs automatically every 5 days. You can also trigger it manually from the Actions tab to verify the setup.

---

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

If you find a bug or have a feature idea, please [open an issue](https://github.com/MaoShiSanKe/Mssk_Talk/issues).

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

---

## License

[MIT](./LICENSE)