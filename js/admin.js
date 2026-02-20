// js/admin.js — 管理后台逻辑

(async () => {
  // 加载服务端配置（admin 也需要 supabase url 等）
  try {
    await CONFIG.init();
  } catch (e) {
    document.body.innerHTML = '<p style="text-align:center;padding:40px;color:#888">服务暂时不可用。</p>';
    return;
  }

  await I18n.load(CONFIG.defaultLang);

  // ── 登录状态 ───────────────────────────────────────────────
  const loginScreen = document.getElementById('login-screen');
  const adminScreen = document.getElementById('admin-screen');
  const passwordInput = document.getElementById('password-input');
  const loginBtn = document.getElementById('login-btn');
  const loginError = document.getElementById('login-error');
  const logoutBtn = document.getElementById('logout-btn');

  // session 内记住已验证状态（刷新需重新登录）
  const authed = sessionStorage.getItem(CONFIG.storage.adminAuthed) === '1';
  if (authed) showAdmin();

  loginBtn.addEventListener('click', async () => {
    loginBtn.disabled = true;
    loginBtn.textContent = '验证中…';
    loginError.style.display = 'none';

    const pw = passwordInput.value;
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      const data = await res.json();
      if (data.ok) {
        // 密码存在 sessionStorage 供后续 admin API 调用使用
        sessionStorage.setItem(CONFIG.storage.adminAuthed, '1');
        sessionStorage.setItem('mssk_admin_pw', pw);
        showAdmin();
      } else {
        loginError.textContent = I18n.t('admin.login_error');
        loginError.style.display = 'block';
        passwordInput.value = '';
      }
    } catch {
      loginError.textContent = '网络错误，请重试';
      loginError.style.display = 'block';
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = I18n.t('admin.login_btn');
    }
  });

  passwordInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') loginBtn.click();
  });

  logoutBtn.addEventListener('click', () => {
    sessionStorage.clear();
    location.reload();
  });

  function showAdmin() {
    loginScreen.style.display = 'none';
    adminScreen.style.display = 'block';
    loadStats();
    loadMessages();
  }

  // ── 过滤器 ─────────────────────────────────────────────────
  const filterAll = document.getElementById('filter-all');
  const filterUnread = document.getElementById('filter-unread');
  let showUnreadOnly = false;

  filterAll.addEventListener('click', () => {
    showUnreadOnly = false;
    filterAll.classList.add('active');
    filterUnread.classList.remove('active');
    loadMessages();
  });

  filterUnread.addEventListener('click', () => {
    showUnreadOnly = true;
    filterUnread.classList.add('active');
    filterAll.classList.remove('active');
    loadMessages();
  });

  // ── 统计 ───────────────────────────────────────────────────
  async function loadStats() {
    try {
      const stats = await DB.adminGetStats();
      document.getElementById('stat-total').textContent = stats.total;
      document.getElementById('stat-unread').textContent = stats.unread;
      document.getElementById('stat-visitors').textContent = stats.visitors;
    } catch (e) { console.error(e); }
  }

  // ── 消息列表 ───────────────────────────────────────────────
  const messageList = document.getElementById('message-list');

  async function loadMessages() {
    messageList.innerHTML = `<p class="loading">${I18n.t('admin.loading')}</p>`;
    try {
      const messages = await DB.adminGetAllMessages({ unreadOnly: showUnreadOnly });
      if (!messages.length) {
        messageList.innerHTML = `<p class="empty">${I18n.t('admin.no_messages')}</p>`;
        return;
      }

      // 按 visitor 分组
      const grouped = {};
      for (const m of messages) {
        if (!grouped[m.visitor_id]) {
          grouped[m.visitor_id] = { messages: [], meta: m.visitors };
        }
        grouped[m.visitor_id].messages.push(m);
      }

      messageList.innerHTML = Object.entries(grouped)
        .map(([vid, { messages, meta }]) => renderVisitorGroup(vid, messages, meta))
        .join('');

      bindActions();
    } catch (e) {
      messageList.innerHTML = `<p class="empty">加载失败：${e.message}</p>`;
    }
  }

  function renderVisitorGroup(vid, messages, meta) {
    const isBlocked = meta?.is_blocked ?? false;
    const note = meta?.note ?? '';
    const shortId = vid.slice(0, 8);
    const unreadCount = messages.filter(m => !m.is_read).length;

    return `
    <div class="visitor-group ${isBlocked ? 'blocked' : ''}" data-visitor-id="${vid}">
      <div class="visitor-header">
        <div class="visitor-info">
          <span class="visitor-id">${I18n.t('admin.visitor_id')} #${shortId}</span>
          ${isBlocked ? `<span class="badge blocked">${I18n.t('admin.blocked_badge')}</span>` : ''}
          ${unreadCount > 0 ? `<span class="badge unread">${I18n.t('admin.unread_badge')} ${unreadCount}</span>` : ''}
        </div>
        <div class="visitor-actions">
          <button class="btn-block" data-vid="${vid}" data-blocked="${isBlocked}">
            ${isBlocked ? I18n.t('admin.unblock_user') : I18n.t('admin.block_user')}
          </button>
        </div>
      </div>

      <div class="note-area">
        <input type="text" class="note-input" data-vid="${vid}" value="${escapeAttr(note)}"
          placeholder="${I18n.t('admin.note_placeholder')}">
        <button class="btn-note" data-vid="${vid}">${I18n.t('admin.save_note')}</button>
      </div>

      <div class="message-thread">
        ${messages.map(m => renderMessage(m)).join('')}
      </div>
    </div>`;
  }

  function renderMessage(m) {
    return `
    <div class="message-item ${m.is_read ? '' : 'unread'}" data-msg-id="${m.id}">
      <p class="msg-content">${escapeHtml(m.content)}</p>
      ${m.image_url ? `<a href="${escapeHtml(m.image_url)}" target="_blank" class="msg-img-link">🖼 查看图片</a>` : ''}
      ${m.contact ? `<p class="msg-contact">📬 ${I18n.t('admin.contact')}：${escapeHtml(m.contact)}</p>` : ''}
      <div class="msg-footer">
        <span class="msg-time">${formatTime(m.created_at)}</span>
        ${!m.is_read ? `<button class="btn-read" data-msg-id="${m.id}">${I18n.t('admin.mark_read')}</button>` : ''}
      </div>
    </div>`;
  }

  function bindActions() {
    document.querySelectorAll('.btn-read').forEach(btn => {
      btn.addEventListener('click', async () => {
        await DB.adminMarkRead(btn.dataset.msgId);
        btn.closest('.message-item').classList.remove('unread');
        btn.remove();
        loadStats();
      });
    });

    document.querySelectorAll('.btn-block').forEach(btn => {
      btn.addEventListener('click', async () => {
        const isBlocked = btn.dataset.blocked === 'true';
        await DB.adminBlockVisitor(btn.dataset.vid, !isBlocked);
        loadMessages();
        loadStats();
      });
    });

    document.querySelectorAll('.btn-note').forEach(btn => {
      btn.addEventListener('click', async () => {
        const note = btn.closest('.note-area').querySelector('.note-input').value;
        await DB.adminSaveNote(btn.dataset.vid, note);
        btn.textContent = '✓ 已保存';
        setTimeout(() => btn.textContent = I18n.t('admin.save_note'), 2000);
      });
    });
  }

  function escapeHtml(str = '') {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escapeAttr(str = '') {
    return str.replace(/"/g, '&quot;');
  }
  function formatTime(iso) {
    return new Date(iso).toLocaleString('zh-CN');
  }
})();
