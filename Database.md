# Database

All tables live in a single Supabase (PostgreSQL) project. Row Level Security (RLS) is enabled on every table.

Run [`schema.sql`](../schema.sql) to initialize a fresh database. The script is idempotent — safe to run multiple times.

---

## Tables

### `visitors`

One row per unique visitor. Identified by UUID stored in the visitor's `localStorage`.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | Primary key — same UUID stored in visitor's browser |
| `created_at` | TIMESTAMPTZ | `NOW()` | First visit timestamp |
| `is_blocked` | BOOLEAN | `false` | Blocked visitors cannot send messages |
| `note` | TEXT | null | Admin-only label for this visitor |
| `nickname` | TEXT | null | Visitor's self-set display name |
| `avatar_url` | TEXT | null | Visitor's self-set avatar URL |
| `bio` | TEXT | null | Visitor's self-set one-line bio |

**RLS policies:** anon can INSERT and SELECT. No anon UPDATE or DELETE.

---

### `messages`

One row per submitted message.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | Primary key |
| `visitor_id` | UUID | — | FK → `visitors.id` (CASCADE DELETE) |
| `content` | TEXT | — | Message body, required |
| `image_url` | TEXT | null | Optional image link provided by visitor |
| `contact` | TEXT | null | Optional contact info provided by visitor |
| `created_at` | TIMESTAMPTZ | `NOW()` | Submission timestamp |
| `is_read` | BOOLEAN | `false` | Admin has seen this message |
| `is_blocked` | BOOLEAN | `false` | Manually blocked by admin |
| `is_featured` | BOOLEAN | `false` | Included in floating message wall |
| `is_pinned` | BOOLEAN | `false` | Shown in pinned messages section |
| `is_word_blocked` | BOOLEAN | `false` | Intercepted by blocked word filter |
| `is_public` | BOOLEAN | `false` | Visible on the public message board |

**Status flag logic:**
- `is_blocked` and `is_word_blocked` are independent. A message can be both, or either.
- `is_word_blocked` messages are hidden from normal views; admin sees them via "Word Filtered" filter and can release (clear flag) or delete.
- `is_featured` and `is_pinned` can coexist on the same message.
- `is_public` messages appear in the public board on the user page. Blocked or word-blocked messages are never shown publicly regardless of this flag — the query in `config.js` enforces this.

**RLS policies:** anon can INSERT and SELECT. No anon UPDATE or DELETE.

**Indexes:**
- `visitor_id` — for grouping messages by visitor
- `created_at DESC` — for chronological listing
- `is_read` — for unread filter
- `is_word_blocked` — for word-blocked filter

---

### `replies`

Admin replies to messages. One message can have multiple replies.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | Primary key |
| `message_id` | UUID | — | FK → `messages.id` (CASCADE DELETE) |
| `content` | TEXT | — | Reply body |
| `created_at` | TIMESTAMPTZ | `NOW()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | null | Set when reply is edited; null means never edited |

**RLS policies:** anon can SELECT (needed for user-facing history). No anon INSERT/UPDATE/DELETE — all write operations go through Functions with `service_role` key.

**Indexes:**
- `message_id` — for fetching all replies of a message

---

### `settings`

Key-value store for runtime configuration. All values are stored as TEXT and parsed by the application.

| Column | Type | Description |
|--------|------|-------------|
| `key` | TEXT | Primary key |
| `value` | TEXT | Setting value as string |
| `description` | TEXT | Human-readable description (used as fallback label) |

**Default rows** (inserted by `schema.sql`):

| Key | Default | Type | Description |
|-----|---------|------|-------------|
| `site_title` | `留言给我` | text | Page title shown to visitors |
| `site_description` | `你的消息会以匿名方式送达…` | text | Subtitle below title |
| `show_history` | `false` | bool | Show message history section |
| `allow_messages` | `true` | bool | Accept new messages |
| `require_contact` | `false` | bool | Make contact field mandatory |
| `max_message_length` | `2000` | number | Character limit per message |
| `daily_limit` | `0` | number | Max messages per visitor per day (0 = unlimited) |
| `show_replies` | `true` | bool | Show admin replies in user history |
| `show_pinned` | `true` | bool | Show pinned messages section |
| `show_featured` | `false` | bool | Enable floating message wall |
| `featured_count` | `10` | number | Max bubbles in floating wall |
| `featured_auto` | `true` | bool | Auto-fill bubbles from recent messages |

**RLS policies:** anon can SELECT. All writes go through Functions with `service_role` key.

---

### `blocked_words`

List of words that trigger automatic message interception.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | Primary key |
| `word` | TEXT | — | The blocked word or phrase (UNIQUE) |
| `created_at` | TIMESTAMPTZ | `NOW()` | When it was added |

**Matching logic:** case-insensitive substring match against message content. A message containing any blocked word anywhere in its content is intercepted.

**RLS policies:** no anon policy — not accessible via anon key at all. Only readable by `service_role` key inside Functions. This prevents visitors from discovering which words are blocked.

---

## Adding a Column

When adding a new column to an existing table:

1. Add `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` to `schema.sql` (for new deployments)
2. Run the same statement manually in Supabase SQL Editor (for existing deployments)
3. Update the relevant Function to read/write the new column
4. Update this document

Example — adding `is_pinned` to `messages`:
```sql
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;
```

---

## Cascade Behavior

- Deleting a `visitor` cascades to all their `messages`
- Deleting a `message` cascades to all its `replies`

Visitors are never deleted through the application UI — only messages can be deleted. This is intentional to preserve the visitor's history context.