-- schema.sql
-- 在 Supabase SQL Editor 中执行此文件

-- 用户表
CREATE TABLE IF NOT EXISTS visitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_blocked BOOLEAN DEFAULT FALSE,
  note TEXT
);

-- 消息表
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id UUID REFERENCES visitors(id) ON DELETE CASCADE,
  content TEXT,
  image_url TEXT,
  contact TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_read BOOLEAN DEFAULT FALSE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_messages_visitor_id ON messages(visitor_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);

-- RLS
ALTER TABLE visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "visitors_insert" ON visitors
  FOR INSERT WITH CHECK (true);

CREATE POLICY "visitors_select_own" ON visitors
  FOR SELECT USING (id = current_setting('app.visitor_id', true)::UUID);

CREATE POLICY "messages_insert" ON messages
  FOR INSERT WITH CHECK (true);

CREATE POLICY "messages_select_own" ON messages
  FOR SELECT USING (
    visitor_id = current_setting('app.visitor_id', true)::UUID
  );
