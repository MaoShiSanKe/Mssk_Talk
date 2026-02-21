// functions/api/config.js
// 将配置下发给前端，包括从 Supabase settings 表读取的动态配置
// 敏感信息（SUPABASE_SECRET_KEY、ADMIN_PASSWORD）不在这里暴露

export async function onRequestGet(context) {
  const { env } = context;

  const supabaseUrl = env.SUPABASE_URL ?? '';
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY ?? '';

  const dbHeaders = {
    'apikey': publishableKey,
    'Authorization': `Bearer ${publishableKey}`,
  };

  // 并行读取 settings 和精选留言
  let settings = {};
  let featuredMessages = [];

  try {
    const [settingsRes, featuredRes] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/settings?select=key,value`, { headers: dbHeaders }),
      fetch(`${supabaseUrl}/rest/v1/messages?is_featured=eq.true&is_blocked=eq.false&select=id,content&order=created_at.desc`, { headers: dbHeaders }),
    ]);

    const rows = await settingsRes.json();
    if (Array.isArray(rows)) {
      for (const row of rows) settings[row.key] = row.value;
    }

    const featured = await featuredRes.json();
    if (Array.isArray(featured)) featuredMessages = featured;
  } catch { }

  const showFeatured = settings.show_featured === 'true';
  const featuredAuto = settings.featured_auto !== 'false';
  const featuredCount = parseInt(settings.featured_count ?? '10');

  // 如果开启自动补齐且手动勾选数量不足，随机补齐
  let bubbles = featuredMessages;
  if (showFeatured && featuredAuto && bubbles.length < featuredCount) {
    try {
      const need = featuredCount - bubbles.length;
      const featuredIds = new Set(bubbles.map(m => m.id));
      const poolRes = await fetch(
        `${supabaseUrl}/rest/v1/messages?is_blocked=eq.false&select=id,content&order=created_at.desc&limit=200`,
        { headers: dbHeaders }
      );
      const pool = await poolRes.json();
      const candidates = pool.filter(m => !featuredIds.has(m.id));
      // 随机取 need 条
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }
      bubbles = [...bubbles, ...candidates.slice(0, need)];
    } catch { }
  }

  const config = {
    supabaseUrl,
    supabasePublishableKey: publishableKey,
    defaultLang: 'zh',
    settings: {
      showHistory: settings.show_history === 'true',
      allowMessages: settings.allow_messages !== 'false',
      requireContact: settings.require_contact === 'true',
      maxMessageLength: parseInt(settings.max_message_length ?? '2000'),
      dailyLimit: parseInt(settings.daily_limit ?? '0'),
      showFeatured,
      featuredCount,
      featuredAuto,
      showReplies: settings.show_replies !== 'false',
      showPinned: settings.show_pinned !== 'false',
    },
    // 精选留言气泡数据（仅内容，无隐私信息）
    featuredBubbles: showFeatured ? bubbles.map(m => ({
      id: m.id,
      content: m.content.slice(0, 20) + (m.content.length > 20 ? '…' : ''),
    })) : [],
  };

  return new Response(JSON.stringify(config), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
  });
}