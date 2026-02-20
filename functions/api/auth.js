// functions/api/auth.js
// 管理员登录验证
// 在 CF Pages 控制台设置环境变量：ADMIN_PASSWORD

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid request' }, 400);
  }

  const { password } = body;
  const correct = env.ADMIN_PASSWORD;

  if (!correct) {
    return json({ error: 'server misconfigured' }, 500);
  }

  if (password === correct) {
    return json({ ok: true });
  } else {
    // 故意不区分"密码错误"和"用户不存在"，防止信息泄露
    return json({ ok: false }, 401);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
