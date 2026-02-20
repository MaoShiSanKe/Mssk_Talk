// functions/api/config.js
// 将环境变量中的配置安全地暴露给前端
// 在 CF Pages 控制台设置以下环境变量：
//   SUPABASE_URL
//   SUPABASE_PUBLISHABLE_KEY
//
// 注意：SUPABASE_SECRET_KEY 和 ADMIN_PASSWORD 不在这里暴露

export async function onRequestGet(context) {
  const { env } = context;

  const config = {
    supabaseUrl: env.SUPABASE_URL ?? '',
    supabasePublishableKey: env.SUPABASE_PUBLISHABLE_KEY ?? '',
    defaultLang: 'zh',
  };

  return new Response(JSON.stringify(config), {
    headers: {
      'Content-Type': 'application/json',
      // 缓存 5 分钟，减少 Function 调用次数
      'Cache-Control': 'public, max-age=300',
    },
  });
}
