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
- **Floating message wall** — featured messages drift as bubbles in the page background, fully configurable
- **Zero infrastructure** — Cloudflare Pages Functions handles all server logic; Supabase is the only external service

---

## Quick Start

**1. Set up Supabase**

Create a new project and run [`schema.sql`](./SQL/schema.sql) in the SQL Editor. Note your Project URL, `anon` key, and `service_role` key.

**2. Deploy to Cloudflare Pages**

Fork this repo, connect it to Cloudflare Pages, then add these environment variables:

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase Project URL |
| `SUPABASE_PUBLISHABLE_KEY` | `anon` public key |
| `SUPABASE_SECRET_KEY` | `service_role` secret key |
| `ADMIN_PASSWORD` | Admin login password |
| `NOTIFY_TG_TOKEN` | *(Optional)* Telegram Bot Token |
| `NOTIFY_TG_CHAT_ID` | *(Optional)* Telegram Chat ID |
| `NOTIFY_RESEND_KEY` | *(Optional)* Resend API Key |
| `NOTIFY_EMAIL_FROM` | *(Optional)* Sender email (domain must be verified in Resend) |
| `NOTIFY_EMAIL_TO` | *(Optional)* Recipient email |

Build settings: framework preset `None`, build command empty, output directory `/`.

**3. Done**

Visit your Pages URL to use the message board. Go to `/admin` to log in with your password.

> Notifications are optional. Telegram and email work independently — configure either or both.
> Email notifications use [Resend](https://resend.com) (free tier: 3,000/month), sender domain verification required.

---

## Features

<details>
<summary><strong>User-facing</strong></summary>

- Send anonymous messages with optional image URL and contact info
- Card profile — set a nickname, avatar, and bio (saved locally, synced to database)
- View message history and admin replies
- Pinned messages section (shown when enabled by admin)
- Floating message wall background (bubble animation, enabled by admin)
- Chinese / English language toggle
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
- Feature messages for the floating wall; manage featured list from a dedicated panel
- Pin messages
- Export CSV — choose scope and whether to include blocked/word-filtered messages
- System settings: site title, description, toggles, numeric limits — all live
- Blocked word management — add/remove words, release intercepted messages
- Visitor stats — total count, today's new visitors, 7-day message volume chart
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
│   ├── zh.json             # Chinese strings
│   └── en.json             # English strings
└── functions/
    └── api/
        ├── config.js       # Delivers settings, featured and pinned data
        ├── message.js      # Receives messages (anti-spam, word check)
        ├── visitor.js      # Visitor card updates
        └── admin.js        # Admin operation proxy
```

---

## Database

Five tables, all with RLS enabled. Run [`schema.sql`](./SQL/schema.sql) to initialize.

| Table | Description |
|-------|-------------|
| `visitors` | UUID, block status, note, card profile |
| `messages` | Content, image, contact, status flags |
| `replies` | Admin replies with edit history |
| `settings` | Key-value system configuration |
| `blocked_words` | Blocked word list |

---

## Contributing

Issues and pull requests are welcome. If you find a bug or have a feature idea, feel free to open an issue.

---

## License

[MIT](./LICENSE)