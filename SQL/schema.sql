-- schema.sql
-- Mssk_Talk 完整数据库脚本
-- 在 Supabase SQL Editor 中执行
-- 支持重复执行（IF NOT EXISTS / ON CONFLICT DO NOTHING）

-- ── 1. 访客表 ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS visitors (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_blocked BOOLEAN DEFAULT FALSE,
  note       TEXT
);

-- ── 2. 消息表 ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id UUID REFERENCES visitors(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  image_url  TEXT,
  contact    TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_read    BOOLEAN DEFAULT FALSE,
  is_blocked BOOLEAN DEFAULT FALSE
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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 索引 ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_messages_visitor_id  ON messages(visitor_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at  ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_is_read     ON messages(is_read);
CREATE INDEX IF NOT EXISTS idx_replies_message_id   ON replies(message_id);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE replies  ENABLE ROW LEVEL SECURITY;

-- visitors：匿名用户可插入和读取
CREATE POLICY "visitors_insert" ON visitors
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "visitors_select" ON visitors
  FOR SELECT USING (true);

-- messages：匿名用户可插入和读取
CREATE POLICY "messages_insert" ON messages
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "messages_select" ON messages
  FOR SELECT USING (true);

-- settings：任何人可读（前端需要读取配置）
CREATE POLICY "settings_select" ON settings
  FOR SELECT USING (true);

-- replies：任何人可读（用户端展示回复）
CREATE POLICY "replies_select" ON replies
  FOR SELECT USING (true);

-- ── 默认配置数据 ─────────────────────────────────────────────
INSERT INTO settings (key, value, description) VALUES
  ('show_history',        'false', '是否在用户端显示历史记录'),
  ('allow_messages',      'true',  '是否允许用户发送消息'),
  ('require_contact',     'false', '是否强制填写联系方式'),
  ('max_message_length',  '2000',  '消息最大字数'),
  ('daily_limit',         '0',     '每用户每日最大发送条数，0表示不限制'),
  ('show_replies',        'true',  '是否在用户端显示管理员回复'),
  ('show_pinned',         'true',  '是否在用户端显示置顶消息'),
  ('show_featured',       'false', '是否开启漂浮留言墙')
ON CONFLICT (key) DO NOTHING;