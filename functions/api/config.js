// functions/api/config.js
// 将配置下发给前端，包括从 Supabase settings 表读取的动态配置
// 敏感信息（SUPABASE_SECRET_KEY、ADMIN_PASSWORD）不在这里暴露

export async function onRequestGet(context) {
  const { env } = context;

  const supabaseUrl = env.SUPABASE_URL ?? '';
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY ?? '';

  // 从 settings 表读取动态配置
  let settings = {};
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/settings?select=key,value`, {
      headers: {
        'apikey': publishableKey,
        'Authorization': `Bearer ${publishableKey}`,
      },
    });
    const rows = await res.json();
    if (Array.isArray(rows)) {
      for (const row of rows) settings[row.key] = row.value;
    }
  } catch { /* 读取失败时使用默认值 */ }

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
    },
  };

  return new Response(JSON.stringify(config), {
    headers: {
      'Content-Type': 'application/json',
      // 不缓存，确保设置变更即时生效
      'Cache-Control': 'no-cache',
    },
  });
}