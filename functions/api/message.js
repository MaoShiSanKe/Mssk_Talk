// functions/api/message.js
// 发送消息接口，包含：
//   1. Honeypot 检测（机器人防护）
//   2. IP 频率限制（每IP每分钟最多10条）
//   3. 服务端屏蔽检查
//   4. 每日限制检查
//   5. 新消息通知（TG Bot / Resend 邮件，可选）
//
// 必填环境变量：
//   SUPABASE_URL、SUPABASE_SECRET_KEY
//
// 通知相关（可选，不填则不通知）：
//   NOTIFY_TG_TOKEN      Telegram Bot Token
//   NOTIFY_TG_CHAT_ID    接收通知的 Chat ID（你的用户 ID 或频道 ID）
//   NOTIFY_RESEND_KEY    Resend API Key（https://resend.com）
//   NOTIFY_EMAIL_TO      收件地址
//   NOTIFY_EMAIL_FROM    发件地址（需在 Resend 后台验证域名，如 notify@yourdomain.com）

const RATE_LIMIT = 10;
const RATE_WINDOW = 60_000;
const MIN_INTERVAL = 2000;

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

  // ── 1. Honeypot ─────────────────────────────────────────────
  if (_hp) return json({ ok: true });

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

  if (now - record.lastSubmit < MIN_INTERVAL) {
    return json({ error: '提交太频繁，请稍等片刻' }, 429);
  }
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
    if (vData[0]?.is_blocked) return json({ error: '无法发送消息' }, 403);
  } catch { }

  // ── 5. 每日限制检查 ─────────────────────────────────────────
  try {
    const settingsRes = await fetch(
      `${supabaseUrl}/rest/v1/settings?key=eq.daily_limit&select=value`,
      { headers }
    );
    const settingsData = await settingsRes.json();
    const dailyLimit = parseInt(settingsData[0]?.value ?? '0');
    if (dailyLimit > 0) {
      const today = new Date().toISOString().slice(0, 10);
      const countRes = await fetch(
        `${supabaseUrl}/rest/v1/messages?visitor_id=eq.${visitorId}&created_at=gte.${today}T00:00:00Z&select=id`,
        { headers }
      );
      const countData = await countRes.json();
      if (countData.length >= dailyLimit) {
        return json({ error: `今日留言已达上限（${dailyLimit} 条）` }, 429);
      }
    }
  } catch { }

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

    if (!msgRes.ok) throw new Error(await msgRes.text());

    record.count += 1;
    record.lastSubmit = now;
    ipStore.set(ip, record);

    // ── 7. 发送通知（不阻塞，失败不影响用户）──────────────────
    // waitUntil 让通知在响应返回后继续执行
    context.waitUntil(sendNotifications(env, {
      content: content.trim(),
      contact: contact || null,
      imageUrl: imageUrl || null,
      visitorId,
    }));

    return json({ ok: true });
  } catch (e) {
    return json({ error: '发送失败，请重试' }, 500);
  }
}

// ── 通知调度 ────────────────────────────────────────────────────
async function sendNotifications(env, msg) {
  const tasks = [];
  if (env.NOTIFY_TG_TOKEN && env.NOTIFY_TG_CHAT_ID) {
    tasks.push(notifyTelegram(env, msg));
  }
  if (env.NOTIFY_RESEND_KEY && env.NOTIFY_EMAIL_TO && env.NOTIFY_EMAIL_FROM) {
    tasks.push(notifyEmail(env, msg));
  }
  // 并行发送，互不影响
  await Promise.allSettled(tasks);
}

// ── Telegram 通知 ────────────────────────────────────────────────
async function notifyTelegram(env, { content, contact, imageUrl, visitorId }) {
  const shortId = visitorId.slice(0, 8);
  const lines = [
    '📬 *新留言*',
    '',
    `*内容：*`,
    escapeMarkdown(content),
  ];
  if (contact) lines.push('', `*联系方式：* ${escapeMarkdown(contact)}`);
  if (imageUrl) lines.push('', `*图片：* [查看图片](${imageUrl})`);
  lines.push('', `*用户：* \`#${shortId}\``);

  await fetch(
    `https://api.telegram.org/bot${env.NOTIFY_TG_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.NOTIFY_TG_CHAT_ID,
        text: lines.join('\n'),
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    }
  );
}

// ── Resend 邮件通知 ──────────────────────────────────────────────
async function notifyEmail(env, { content, contact, imageUrl, visitorId }) {
  const shortId = visitorId.slice(0, 8);
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="color:#5c4a3a;margin-bottom:16px;">📬 新留言</h2>
      <div style="background:#f7f5f0;border-radius:8px;padding:16px;margin-bottom:16px;">
        <p style="white-space:pre-wrap;margin:0;">${escapeHtml(content)}</p>
      </div>
      ${contact ? `<p><strong>联系方式：</strong>${escapeHtml(contact)}</p>` : ''}
      ${imageUrl ? `<p><strong>图片：</strong><a href="${imageUrl}">查看图片</a></p>` : ''}
      <p style="color:#8a8078;font-size:0.85em;margin-top:24px;">用户 #${shortId}</p>
    </div>
  `;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.NOTIFY_RESEND_KEY}`,
    },
    body: JSON.stringify({
      from: env.NOTIFY_EMAIL_FROM,
      to: env.NOTIFY_EMAIL_TO,
      subject: '📬 你有新留言',
      html,
    }),
  });
}

// ── 工具函数 ────────────────────────────────────────────────────
function escapeMarkdown(str = '') {
  return str.replace(/[_*[\]()~`>#+=|{}.!\\-]/g, '\\$&');
}

function escapeHtml(str = '') {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}