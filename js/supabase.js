// js/supabase.js
// 数据库操作封装
// 用户操作：直接调用 Supabase REST API（publishable key）
// 管理员操作：通过 /api/admin 代理（secret key 在服务端）

const DB = (() => {

  function _headers() {
    return {
      'Content-Type': 'application/json',
      'apikey': CONFIG.supabase.publishableKey,
      'Authorization': `Bearer ${CONFIG.supabase.publishableKey}`,
    };
  }

  async function _get(path, params = {}) {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${CONFIG.supabase.url}/rest/v1/${path}${qs ? '?' + qs : ''}`, {
      headers: _headers(),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function _post(path, body) {
    const res = await fetch(`${CONFIG.supabase.url}/rest/v1/${path}`, {
      method: 'POST',
      headers: { ..._headers(), 'Prefer': 'return=representation' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function _patch(path, params, body) {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${CONFIG.supabase.url}/rest/v1/${path}?${qs}`, {
      method: 'PATCH',
      headers: { ..._headers(), 'Prefer': 'return=representation' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  // ── 访客相关 ──────────────────────────────────────────────

  async function createVisitor() {
    const data = await _post('visitors', {});
    return data[0];
  }

  async function getVisitor(id) {
    const data = await _get('visitors', { id: `eq.${id}`, select: '*' });
    return data[0] ?? null;
  }

  async function isBlocked(visitorId) {
    const data = await _get('visitors', {
      id: `eq.${visitorId}`,
      select: 'is_blocked',
    });
    return data[0]?.is_blocked ?? false;
  }

  // ── 消息相关 ──────────────────────────────────────────────

  async function sendMessage({ visitorId, content, imageUrl, contact }) {
    return _post('messages', {
      visitor_id: visitorId,
      content,
      image_url: imageUrl || null,
      contact: contact || null,
    });
  }

  async function getMyMessages(visitorId) {
    return _get('messages', {
      visitor_id: `eq.${visitorId}`,
      select: '*',
      order: 'created_at.asc',
    });
  }

  // ── 管理员操作（通过 /api/admin 代理，不需要 secret key）──

  async function _adminCall(action, payload = {}) {
    const password = sessionStorage.getItem('mssk_admin_pw');
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, action, payload }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error ?? 'admin call failed');
    return data.data;
  }

  async function adminGetAllMessages({ unreadOnly = false, showBlocked = false } = {}) {
    return _adminCall('getMessages', { unreadOnly, showBlocked });
  }

  async function adminGetStats() {
    return _adminCall('getStats');
  }

  async function adminMarkRead(messageId) {
    return _adminCall('markRead', { messageId });
  }

  async function adminBlockVisitor(visitorId, block = true, blockMessages = false) {
    return _adminCall('blockVisitor', { visitorId, block, blockMessages });
  }

  async function adminBlockMessage(messageId, block = true) {
    return _adminCall('blockMessage', { messageId, block });
  }

  async function adminSaveNote(visitorId, note) {
    return _adminCall('saveNote', { visitorId, note });
  }

  return {
    createVisitor, getVisitor, isBlocked,
    sendMessage, getMyMessages,
    adminGetAllMessages, adminGetStats,
    adminMarkRead, adminBlockVisitor, adminBlockMessage, adminSaveNote,
  };
})();