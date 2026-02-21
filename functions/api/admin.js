// functions/api/admin.js
// 管理员操作代理：验证 session 后，用 secret key 操作 Supabase
// 在 CF Pages 控制台设置环境变量：
//   SUPABASE_URL
//   SUPABASE_SECRET_KEY
//   ADMIN_PASSWORD

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid request' }, 400);
  }

  // 每次管理员请求都携带密码做验证（简单方案，无需 session token）
  if (body.password !== env.ADMIN_PASSWORD) {
    return json({ error: 'unauthorized' }, 401);
  }

  const { action, payload } = body;
  const supabaseUrl = env.SUPABASE_URL;
  const secretKey = env.SUPABASE_SECRET_KEY;

  const headers = {
    'Content-Type': 'application/json',
    'apikey': secretKey,
    'Authorization': `Bearer ${secretKey}`,
    'Prefer': 'return=representation',
  };

  try {
    let result;

    switch (action) {
      case 'getSettings': {
        const res = await fetch(`${supabaseUrl}/rest/v1/settings?select=key,value,description&order=key`, { headers });
        result = await res.json();
        break;
      }

      case 'saveSetting': {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/settings?key=eq.${encodeURIComponent(payload.key)}`,
          { method: 'PATCH', headers, body: JSON.stringify({ value: payload.value }) }
        );
        result = await res.json();
        break;
      }

      case 'getMessages': {
        // showBlocked=true 时显示所有消息，false 时隐藏已屏蔽消息
        const params = new URLSearchParams({
          select: '*, visitors(is_blocked, note)',
          order: 'created_at.desc',
          ...(payload?.unreadOnly ? { is_read: 'eq.false' } : {}),
          ...(payload?.showBlocked ? {} : { is_blocked: 'eq.false' }),
        });
        const res = await fetch(`${supabaseUrl}/rest/v1/messages?${params}`, { headers });
        result = await res.json();
        break;
      }

      case 'getStats': {
        const [msgs, visitors] = await Promise.all([
          fetch(`${supabaseUrl}/rest/v1/messages?select=id,is_read,is_blocked`, { headers }).then(r => r.json()),
          fetch(`${supabaseUrl}/rest/v1/visitors?select=id`, { headers }).then(r => r.json()),
        ]);
        result = {
          total: msgs.filter(m => !m.is_blocked).length,
          unread: msgs.filter(m => !m.is_read && !m.is_blocked).length,
          visitors: visitors.length,
          blocked_messages: msgs.filter(m => m.is_blocked).length,
        };
        break;
      }

      case 'markRead': {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/messages?id=eq.${payload.messageId}`,
          { method: 'PATCH', headers, body: JSON.stringify({ is_read: true }) }
        );
        result = await res.json();
        break;
      }

      case 'blockVisitor': {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/visitors?id=eq.${payload.visitorId}`,
          { method: 'PATCH', headers, body: JSON.stringify({ is_blocked: payload.block }) }
        );
        result = await res.json();
        // 屏蔽或解除时，如果选择同步操作消息
        if (payload.blockMessages !== undefined) {
          await fetch(
            `${supabaseUrl}/rest/v1/messages?visitor_id=eq.${payload.visitorId}`,
            { method: 'PATCH', headers, body: JSON.stringify({ is_blocked: payload.block }) }
          );
        }
        break;
      }

      case 'blockMessage': {
        // 单独屏蔽/解除屏蔽某条消息
        const res = await fetch(
          `${supabaseUrl}/rest/v1/messages?id=eq.${payload.messageId}`,
          { method: 'PATCH', headers, body: JSON.stringify({ is_blocked: payload.block }) }
        );
        result = await res.json();
        break;
      }

      case 'saveNote': {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/visitors?id=eq.${payload.visitorId}`,
          { method: 'PATCH', headers, body: JSON.stringify({ note: payload.note }) }
        );
        result = await res.json();
        break;
      }

      default:
        return json({ error: 'unknown action' }, 400);
    }

    return json({ ok: true, data: result });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}