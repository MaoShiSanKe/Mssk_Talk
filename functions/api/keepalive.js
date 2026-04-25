// functions/api/keepalive.js
// 数据库保活端点
// 由 GitHub Actions schedule 每 5 天调用一次
// 需要在请求头携带 X-Keepalive-Secret（对应环境变量 KEEPALIVE_SECRET）

export async function onRequestGet(context) {
  const { env, request } = context;

  // 简单的 secret 验证，防止被随意调用
  const secret = request.headers.get('X-Keepalive-Secret');
  if (!secret || secret !== env.KEEPALIVE_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabaseUrl = env.SUPABASE_URL;
  const headers = {
    'apikey': env.SUPABASE_SECRET_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`,
  };

  try {
    // 读取一条 settings 记录，触发数据库活跃
    const res = await fetch(
      `${supabaseUrl}/rest/v1/settings?limit=1&select=key`,
      { headers }
    );
    const data = await res.json();

    return new Response(JSON.stringify({
      ok: true,
      timestamp: new Date().toISOString(),
      db: res.ok ? 'active' : 'error',
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}