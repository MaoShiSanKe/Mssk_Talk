# Changelog

All notable changes to this project will be documented here.

---

## [Unreleased]

---

## 2025-04

### Added
- **Public message board** — admin can mark individual messages as public (🌐 button); public messages appear in a dedicated board section on the user page, showing content, timestamp, and visitor card info (nickname/avatar if set); contact info and image URLs are never exposed
- **Webhook notifications** — configurable HTTP endpoint in admin settings; receives a POST request for every new non-filtered message; payload includes event type, timestamp, short visitor ID, content, contact, and image URL; failures are silently ignored
- **Database keepalive** — `/api/keepalive` endpoint + GitHub Actions workflow (`keepalive.yml`) that pings the database every 5 days to prevent Supabase free-tier suspension; protected by `KEEPALIVE_SECRET` header
- **GitHub Actions lint workflow** (`lint.yml`) — JS syntax check, JSON validation, i18n key coverage report, and HTML `data-i18n` key verification; runs on push and PR to `main`
- **GitHub Issue templates** — structured forms for bug reports and feature requests; blank issues disabled; general questions redirected to Discussions
- **Internal documentation** (`docs/`) — architecture overview, API reference, database schema reference, roadmap and design decisions

### Changed
- `functions/api/config.js` now delivers `publicMessages` alongside featured and pinned data
- `schema.sql` updated with `is_public` column on `messages` and new settings rows (`show_public_board`, `public_board_title`, `webhook_url`)
- `.env.example` updated with `KEEPALIVE_SECRET` and webhook documentation

---

## 2025-03

### Added
- Full internationalization (i18n) for both user-facing and admin panels
- Language switcher menu — replaces single toggle button; supports arbitrary number of languages without code changes
- Built-in Korean language pack (`kr.json`) contributed by community PR
- Fallback system: missing translation keys automatically fall back to Chinese base language
- Admin panel now reads saved language preference on load (shared with user-facing page)
- `CONTRIBUTING.md` — contribution guidelines with focus on adding new languages
- `CHANGELOG.md` — project history
- `.env.example` — environment variable reference with inline documentation

### Changed
- `i18n.js` refactored: `LANGS` entries now include `label` field; added `langs()`, `nextLang()`, `labelOf()` APIs
- `SETTING_META` in `admin.js` converted to `getSettingMeta()` function so labels update on language switch
- README restructured: badge row, highlights section, collapsible feature details, project structure tree, database table overview

### Fixed
- Admin panel `text`-type settings (site title, description, webhook URL) now render as `<input type="text">` instead of incorrectly using number input

---

## 2025-02

### Added
- Visitor card profile: optional nickname, avatar URL, bio — saved locally and synced to database
- Admin panel displays visitor card info (avatar in group header, bio on expand, nickname in actions bar)
- Site title and description configurable from admin settings panel (previously hardcoded)
- Page-jump input on pagination — available when total pages > 3
- Blocked word management panel with add/delete; intercepted messages reviewable and releasable by admin
- Featured message management panel — view and unfeature all featured messages in one place
- Message pinning — admin can pin messages; pinned section shown on user page when enabled
- Floating message wall — featured messages displayed as animated bubbles in page background
- Admin reply system with edit/delete and optional email notification to visitor
- Visitor statistics panel: total visitors, today's new, 7-day message volume bar chart
- CSV export with scope selection and filter options (include/exclude blocked, word-filtered)
- Search result keyword highlighting
- Admin panel color scheme toggle (warm / cool)
- Dark mode support

### Changed
- CSS extracted to separate files: `css/main.css`, `css/admin.css`
- Settings panel layout changed to two-column grid to reduce whitespace

### Fixed
- Site title no longer overwritten by i18n `_applyToDOM()` after language switch
- Image hosting tip text now follows language toggle
- Bubble animation speed reduced; uses `clientWidth/clientHeight` to avoid triggering scrollbar

---

## 2025-01

### Added
- Initial release
- Anonymous message board on Cloudflare Pages + Supabase
- Admin panel with message grouping, filtering, search, block/unblock
- Telegram and email (Resend) notification support
- Honeypot, IP rate limiting, daily message limit
- Light/dark theme toggle
- Chinese/English bilingual support