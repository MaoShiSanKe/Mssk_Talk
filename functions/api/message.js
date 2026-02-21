// functions/api/message.js
// 发送消息接口，包含：
//   1. Honeypot 检测（机器人防护）
//   2. IP 频率限制（每IP每分钟最多10条）
//   3. 服务端屏蔽检查
//   4. 每日限制检查
// 环境变量：SUPABASE_URL、SUPABASE_SECRET_KEY、SUPABASE_PUBLISHABLE_KEY

const RATE_LIMIT = 10;       // 每IP每分钟最多提交次数
const RATE_WINDOW = 60_000;  // 1分钟窗口（毫秒）
const MIN_INTERVAL = 2000;   // 两次提交最小间隔（毫秒）

// 内存存储频率数据（CF Workers 每个实例独立，重启清空，够用）
const ipStore = new Map();

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求格式错误' }, 400);
  }

  const { visitorId, content, imageUrl, contact, _hp } = body;

  // ── 1. Honeypot 检测 ────────────────────────────────────────
  // _hp 字段在前端是隐藏的，正常用户不会填，机器人会填
  if (_hp) {
    // 假装成功，不让机器人知道被拦截
    return json({ ok: true });
  }

  // ── 2. 基本校验 ─────────────────────────────────────────────
  if (!visitorId || !content?.trim()) {
    return json({ error: '内容不能为空' }, 400);
  }

  // ── 3. IP 频率限制 ──────────────────────────────────────────
  const ip = request.headers.get('CF-Connecting-IP') ||
             request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
             'unknown';

  const now = Date.now();
  const record = ipStore.get(ip) ?? { count: 0, windowStart: now, lastSubmit: 0 };

  // 最小提交间隔
  if (now - record.lastSubmit < MIN_INTERVAL) {
    return json({ error: '提交太频繁，请稍等片刻' }, 429);
  }

  // 窗口重置
  if (now - record.windowStart > RATE_WINDOW) {
    record.count = 0;
    record.windowStart = now;
  }

  if (record.count >= RATE_LIMIT) {
    return json({ error: `每分钟最多发送 ${RATE_LIMIT} 条消息，请稍后再试` }, 429);
  }

  const supabaseUrl = env.SUPABASE_URL;
  const secretKey = env.SUPABASE_SECRET_KEY;
  const headers = {
    'Content-Type': 'application/json',
    'apikey': secretKey,
    'Authorization': `Bearer ${secretKey}`,
    'Prefer': 'return=representation',
  };

  // ── 4. 服务端屏蔽检查 ───────────────────────────────────────
  try {
    const vRes = await fetch(
      `${supabaseUrl}/rest/v1/visitors?id=eq.${visitorId}&select=is_blocked`,
      { headers }
    );
    const vData = await vRes.json();
    if (vData[0]?.is_blocked) {
      return json({ error: '无法发送消息' }, 403);
    }
  } catch { /* 查询失败则继续，避免因网络问题阻断正常用户 */ }

  // ── 5. 每日限制检查 ─────────────────────────────────────────
  try {
    const settingsRes = await fetch(
      `${supabaseUrl}/rest/v1/settings?key=eq.daily_limit&select=value`,
      { headers }
    );
    const settingsData = await settingsRes.json();
    const dailyLimit = parseInt(settingsData[0]?.value ?? '0');

    if (dailyLimit > 0) {
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const countRes = await fetch(
        `${supabaseUrl}/rest/v1/messages?visitor_id=eq.${visitorId}&created_at=gte.${today}T00:00:00Z&select=id`,
        { headers }
      );
      const countData = await countRes.json();
      if (countData.length >= dailyLimit) {
        return json({ error: `今日留言已达上限（${dailyLimit} 条）` }, 429);
      }
    }
  } catch { /* 查询失败则继续 */ }

  // ── 6. 写入消息 ─────────────────────────────────────────────
  try {
    const msgRes = await fetch(`${supabaseUrl}/rest/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        visitor_id: visitorId,
        content: content.trim(),
        image_url: imageUrl || null,
        contact: contact || null,
      }),
    });

    if (!msgRes.ok) {
      const err = await msgRes.text();
      throw new Error(err);
    }

    // 更新频率记录
    record.count += 1;
    record.lastSubmit = now;
    ipStore.set(ip, record);

    return json({ ok: true });
  } catch (e) {
    return json({ error: '发送失败，请重试' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}