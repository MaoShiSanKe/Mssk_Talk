// functions/api/message.js
// 发送消息接口，包含：
//   1. Honeypot 检测（机器人防护）
//   2. IP 频率限制（每IP每分钟最多10条）
//   3. 服务端设置检查
//   4. 服务端屏蔽检查
//   5. 每日限制检查
//   6. 屏蔽词检测
//   7. 新消息通知（TG Bot / Resend 邮件 / Webhook，可选）
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
//   webhook_url          在管理后台设置，留空禁用

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
  const cleanContent = typeof content === 'string' ? content.trim() : '';
  const cleanContact = typeof contact === 'string' ? contact.trim() : '';
  const cleanImageUrl = typeof imageUrl === 'string' ? imageUrl.trim() : '';

  // ── 1. Honeypot ─────────────────────────────────────────────
  if (_hp) return json({ ok: true });

  // ── 2. 基本校验 ─────────────────────────────────────────────
  if (!visitorId || !cleanContent) {
    return json({ error: '内容不能为空' }, 400);
  }
  if (!isUuid(visitorId)) {
    return json({ error: '访客身份无效' }, 400);
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

  // ── 4. 服务端设置检查 ───────────────────────────────────────
  let messageSettings;
  try {
    messageSettings = await loadMessageSettings(supabaseUrl, headers);
  } catch {
    return json({ error: '服务暂时不可用，请稍后再试' }, 500);
  }

  if (!messageSettings.allowMessages) {
    return json({ error: '留言暂时关闭' }, 403);
  }

  if (messageSettings.requireContact && !cleanContact) {
    return json({ error: '请填写联系方式' }, 400);
  }

  if (cleanContent.length > messageSettings.maxMessageLength) {
    return json({ error: `内容不能超过 ${messageSettings.maxMessageLength} 字` }, 400);
  }

  // ── 5. 服务端屏蔽检查 ───────────────────────────────────────
  try {
    const vRes = await fetch(
      `${supabaseUrl}/rest/v1/visitors?id=eq.${visitorId}&select=is_blocked`,
      { headers }
    );
    const vData = await vRes.json();
    if (vData[0]?.is_blocked) return json({ error: '无法发送消息' }, 403);
  } catch { }

  // ── 6. 每日限制检查 ─────────────────────────────────────────
  try {
    const dailyLimit = messageSettings.dailyLimit;
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

  // ── 7. 屏蔽词检测 ───────────────────────────────────────────
  let isWordBlocked = false;
  try {
    const wordsRes = await fetch(
      `${supabaseUrl}/rest/v1/blocked_words?select=word`,
      { headers }
    );
    const wordsData = await wordsRes.json();
    if (Array.isArray(wordsData) && wordsData.length > 0) {
      const lowerContent = cleanContent.toLowerCase();
      isWordBlocked = wordsData.some(({ word }) =>
        lowerContent.includes(word.toLowerCase())
      );
    }
  } catch { /* 查询失败则继续，不因屏蔽词服务出错影响正常用户 */ }

  // ── 8. 写入消息 ─────────────────────────────────────────────
  try {
    const msgRes = await fetch(`${supabaseUrl}/rest/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        visitor_id: visitorId,
        content: cleanContent,
        image_url: cleanImageUrl || null,
        contact: cleanContact || null,
        is_word_blocked: isWordBlocked,
      }),
    });

    if (!msgRes.ok) throw new Error(await msgRes.text());

    record.count += 1;
    record.lastSubmit = now;
    ipStore.set(ip, record);

    // ── 9. 发送通知（仅正常消息通知，屏蔽词消息不通知）────────
    if (!isWordBlocked) {
      // 读取 webhook_url 设置（和屏蔽词查询复用同一个 headers）
      let webhookUrl = '';
      try {
        const whRes = await fetch(
          `${supabaseUrl}/rest/v1/settings?key=eq.webhook_url&select=value`,
          { headers }
        );
        const whData = await whRes.json();
        webhookUrl = whData[0]?.value?.trim() || '';
      } catch { /* 读取失败不影响消息发送 */ }

      context.waitUntil(sendNotifications(env, {
        content: cleanContent,
        contact: cleanContact || null,
        imageUrl: cleanImageUrl || null,
        visitorId,
      }, webhookUrl));
    }

    return json({ ok: true });
  } catch (e) {
    return json({ error: '发送失败，请重试' }, 500);
  }
}

async function loadMessageSettings(supabaseUrl, headers) {
  const keys = 'allow_messages,require_contact,max_message_length,daily_limit';
  const res = await fetch(
    `${supabaseUrl}/rest/v1/settings?key=in.(${keys})&select=key,value`,
    { headers }
  );
  if (!res.ok) throw new Error('settings fetch failed');

  const rows = await res.json();
  const values = {};
  if (Array.isArray(rows)) {
    for (const row of rows) values[row.key] = row.value;
  }

  return {
    allowMessages: values.allow_messages !== 'false',
    requireContact: values.require_contact === 'true',
    maxMessageLength: parsePositiveInt(values.max_message_length, 2000),
    dailyLimit: parseNonNegativeInt(values.daily_limit, 0),
  };
}

function parsePositiveInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function isUuid(value) {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

// ── 通知调度 ────────────────────────────────────────────────────
async function sendNotifications(env, msg, webhookUrl = '') {
  const tasks = [];
  if (env.NOTIFY_TG_TOKEN && env.NOTIFY_TG_CHAT_ID) {
    tasks.push(notifyTelegram(env, msg));
  }
  if (env.NOTIFY_RESEND_KEY && env.NOTIFY_EMAIL_TO && env.NOTIFY_EMAIL_FROM) {
    tasks.push(notifyEmail(env, msg));
  }
  if (webhookUrl) {
    tasks.push(notifyWebhook(webhookUrl, msg));
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

// ── Webhook 通知 ─────────────────────────────────────────────────
// POST to operator-configured URL with a standard JSON payload.
// Failures are silently ignored — the message submission is not affected.
async function notifyWebhook(url, { content, contact, imageUrl, visitorId }) {
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'new_message',
      timestamp: new Date().toISOString(),
      visitor_id: visitorId.slice(0, 8), // short ID only, preserves anonymity
      content,
      contact: contact || null,
      image_url: imageUrl || null,
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
