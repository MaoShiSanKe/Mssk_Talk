-- ============================================================
-- Mssk_Talk 完整数据库初始化脚本
-- 在 Supabase SQL Editor 中执行
-- 支持重复执行（IF NOT EXISTS / ON CONFLICT DO NOTHING）
-- ============================================================

-- ── 1. 访客表 ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS visitors (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_blocked BOOLEAN DEFAULT FALSE,
  note       TEXT
);

-- ── 2. 消息表 ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id       UUID REFERENCES visitors(id) ON DELETE CASCADE,
  content          TEXT NOT NULL,
  image_url        TEXT,
  contact          TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  is_read          BOOLEAN DEFAULT FALSE,
  is_blocked       BOOLEAN DEFAULT FALSE,
  is_featured      BOOLEAN DEFAULT FALSE,
  is_pinned        BOOLEAN DEFAULT FALSE,
  is_word_blocked  BOOLEAN DEFAULT FALSE
);

-- ── 3. 系统配置表 ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  description TEXT
);

-- ── 4. 回复表 ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS replies (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- ── 5. 屏蔽词表 ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blocked_words (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 索引 ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_messages_visitor_id      ON messages(visitor_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at      ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_is_read         ON messages(is_read);
CREATE INDEX IF NOT EXISTS idx_messages_is_word_blocked ON messages(is_word_blocked);
CREATE INDEX IF NOT EXISTS idx_replies_message_id       ON replies(message_id);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE visitors      ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE replies        ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_words ENABLE ROW LEVEL SECURITY;

CREATE POLICY "visitors_insert" ON visitors
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "visitors_select" ON visitors
  FOR SELECT USING (true);

CREATE POLICY "messages_insert" ON messages
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "messages_select" ON messages
  FOR SELECT USING (true);

CREATE POLICY "settings_select" ON settings
  FOR SELECT USING (true);

CREATE POLICY "replies_select" ON replies
  FOR SELECT USING (true);

-- blocked_words 不对外公开，message.js 用 secret key 读取，无需 anon policy

-- ── 默认配置 ─────────────────────────────────────────────────
INSERT INTO settings (key, value, description) VALUES
  ('show_history',       'false', '是否在用户端显示历史记录入口'),
  ('allow_messages',     'true',  '是否允许用户发送消息'),
  ('require_contact',    'false', '是否强制填写联系方式'),
  ('max_message_length', '2000',  '单条消息最大字符数'),
  ('daily_limit',        '0',     '每用户每日最大发送条数，0 表示不限制'),
  ('show_replies',       'true',  '是否在用户端历史记录中显示管理员回复'),
  ('show_pinned',        'true',  '是否在用户端显示置顶消息入口'),
  ('show_featured',      'false', '是否开启漂浮留言墙'),
  ('featured_count',     '10',    '漂浮留言墙最大气泡数量，推荐 8-12'),
  ('featured_auto',      'true',  '手动精选数量不足时，是否自动从留言中随机补齐')
ON CONFLICT (key) DO NOTHING;