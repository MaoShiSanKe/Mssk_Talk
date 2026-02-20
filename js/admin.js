// js/admin.js — 管理后台逻辑

(async () => {
  try {
    await CONFIG.init();
  } catch (e) {
    document.body.innerHTML = '<p style="text-align:center;padding:40px;color:#888">服务暂时不可用。</p>';
    return;
  }

  await I18n.load(CONFIG.defaultLang);

  // ── DOM 引用 ───────────────────────────────────────────────
  const loginScreen = document.getElementById('login-screen');
  const adminScreen = document.getElementById('admin-screen');
  const passwordInput = document.getElementById('password-input');
  const loginBtn = document.getElementById('login-btn');
  const loginError = document.getElementById('login-error');
  const logoutBtn = document.getElementById('logout-btn');
  const filterAll = document.getElementById('filter-all');
  const filterUnread = document.getElementById('filter-unread');
  const messageList = document.getElementById('message-list');
  const searchInput = document.getElementById('search-input');
  const paginationEl = document.getElementById('pagination');

  // ── 状态 ───────────────────────────────────────────────────
  let showUnreadOnly = false;
  let showBlocked = false;
  let searchKeyword = '';
  let currentPage = 1;
  const PAGE_SIZE = 10;
  let allMessages = [];

  // ── 登录 ───────────────────────────────────────────────────
  const authed = sessionStorage.getItem(CONFIG.storage.adminAuthed) === '1';
  if (authed) {
    enterAdmin();
  } else {
    loginScreen.style.display = 'flex';
  }

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
        sessionStorage.setItem(CONFIG.storage.adminAuthed, '1');
        sessionStorage.setItem('mssk_admin_pw', pw);
        loginScreen.style.display = 'none';
        enterAdmin();
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

  function enterAdmin() {
    loginScreen.style.display = 'none';
    adminScreen.style.display = 'block';
    setTimeout(() => {
      loadStats();
      fetchAndRender();
    }, 0);
  }

  // ── 过滤器 ─────────────────────────────────────────────────
  filterAll.addEventListener('click', () => {
    showUnreadOnly = false;
    filterAll.classList.add('active');
    filterUnread.classList.remove('active');
    currentPage = 1;
    fetchAndRender();
  });

  filterUnread.addEventListener('click', () => {
    showUnreadOnly = true;
    filterUnread.classList.add('active');
    filterAll.classList.remove('active');
    currentPage = 1;
    fetchAndRender();
  });

  document.getElementById('filter-blocked').addEventListener('click', () => {
    showBlocked = !showBlocked;
    const btn = document.getElementById('filter-blocked');
    btn.classList.toggle('active', showBlocked);
    btn.textContent = showBlocked ? '隐藏已屏蔽' : '显示已屏蔽';
    currentPage = 1;
    fetchAndRender();
  });

  // ── 搜索 ───────────────────────────────────────────────────
  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchKeyword = searchInput.value.trim().toLowerCase();
      currentPage = 1;
      renderMessages();
    }, 300);
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

  // ── 拉取消息 ───────────────────────────────────────────────
  async function fetchAndRender() {
    messageList.innerHTML = `<p class="loading">${I18n.t('admin.loading')}</p>`;
    paginationEl.innerHTML = '';
    try {
      allMessages = await DB.adminGetAllMessages({ unreadOnly: showUnreadOnly, showBlocked });
      renderMessages();
    } catch (e) {
      messageList.innerHTML = `<p class="empty">加载失败：${e.message}</p>`;
    }
  }

  // ── 渲染（搜索+分页在前端做）─────────────────────────────
  function renderMessages() {
    let filtered = allMessages;
    if (searchKeyword) {
      filtered = allMessages.filter(m =>
        m.content?.toLowerCase().includes(searchKeyword) ||
        m.contact?.toLowerCase().includes(searchKeyword) ||
        m.visitors?.note?.toLowerCase().includes(searchKeyword)
      );
    }

    if (!filtered.length) {
      messageList.innerHTML = `<p class="empty">${searchKeyword ? '没有匹配的消息' : I18n.t('admin.no_messages')}</p>`;
      paginationEl.innerHTML = '';
      return;
    }

    const grouped = {};
    for (const m of filtered) {
      const vid = m.visitor_id ?? 'unknown';
      if (!grouped[vid]) grouped[vid] = { messages: [], meta: m.visitors };
      grouped[vid].messages.push(m);
    }

    const groupEntries = Object.entries(grouped);
    const totalPages = Math.ceil(groupEntries.length / PAGE_SIZE);
    currentPage = Math.min(currentPage, Math.max(1, totalPages));

    const pageEntries = groupEntries.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    messageList.innerHTML = pageEntries
      .map(([vid, { messages, meta }]) => renderVisitorGroup(vid, messages, meta))
      .join('');

    renderPagination(totalPages);
    bindActions();
  }

  // ── 分页 ───────────────────────────────────────────────────
  function renderPagination(totalPages) {
    if (totalPages <= 1) { paginationEl.innerHTML = ''; return; }
    let html = '';
    for (let i = 1; i <= totalPages; i++) {
      html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    paginationEl.innerHTML = html;
    paginationEl.querySelectorAll('.page-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentPage = parseInt(btn.dataset.page);
        renderMessages();
        messageList.scrollIntoView({ behavior: 'smooth' });
      });
    });
  }

  // ── 渲染访客分组 ───────────────────────────────────────────
  function renderVisitorGroup(vid, messages, meta) {
    const isBlocked = meta?.is_blocked ?? false;
    const note = meta?.note ?? '';
    const shortId = vid === 'unknown' ? 'unknown' : vid.slice(0, 8);
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
          ${vid !== 'unknown' ? `
          <button class="btn-block" data-vid="${vid}" data-blocked="${isBlocked}">
            ${isBlocked ? I18n.t('admin.unblock_user') : I18n.t('admin.block_user')}
          </button>` : ''}
        </div>
      </div>
      ${vid !== 'unknown' ? `
      <div class="note-area">
        <input type="text" class="note-input" data-vid="${vid}" value="${escapeAttr(note)}"
          placeholder="${I18n.t('admin.note_placeholder')}">
        <button class="btn-note" data-vid="${vid}">${I18n.t('admin.save_note')}</button>
      </div>` : ''}
      <div class="message-thread">
        ${messages.map(m => renderMessage(m)).join('')}
      </div>
    </div>`;
  }

  function renderMessage(m) {
    return `
    <div class="message-item ${m.is_read ? '' : 'unread'} ${m.is_blocked ? 'msg-blocked' : ''}" data-msg-id="${m.id}">
      ${m.is_blocked ? '<span class="blocked-badge">已屏蔽</span>' : ''}
      <p class="msg-content">${escapeHtml(m.content)}</p>
      ${m.image_url ? `<a href="${escapeHtml(m.image_url)}" target="_blank" class="msg-img-link">🖼 查看图片</a>` : ''}
      ${m.contact ? `<p class="msg-contact">📬 ${I18n.t('admin.contact')}：${escapeHtml(m.contact)}</p>` : ''}
      <div class="msg-footer">
        <span class="msg-time">${formatTime(m.created_at)}</span>
        <div class="msg-actions">
          ${!m.is_read ? `<button class="btn-read" data-msg-id="${m.id}">${I18n.t('admin.mark_read')}</button>` : ''}
          <button class="btn-block-msg ${m.is_blocked ? 'unblock' : ''}" data-msg-id="${m.id}" data-blocked="${m.is_blocked}">
            ${m.is_blocked ? '解除屏蔽' : '屏蔽消息'}
          </button>
        </div>
      </div>
    </div>`;
  }

  function bindActions() {
    document.querySelectorAll('.btn-read').forEach(btn => {
      btn.addEventListener('click', async () => {
        await DB.adminMarkRead(btn.dataset.msgId);
        const msg = allMessages.find(m => m.id === btn.dataset.msgId);
        if (msg) msg.is_read = true;
        btn.closest('.message-item').classList.remove('unread');
        btn.remove();
        loadStats();
      });
    });

    document.querySelectorAll('.btn-block').forEach(btn => {
      btn.addEventListener('click', () => {
        const isBlocked = btn.dataset.blocked === 'true';
        if (!isBlocked) {
          // 屏蔽用户时弹出确认
          showBlockConfirm(btn.dataset.vid);
        } else {
          // 解除屏蔽直接执行
          DB.adminBlockVisitor(btn.dataset.vid, false, false).then(() => {
            fetchAndRender();
            loadStats();
          });
        }
      });
    });

    document.querySelectorAll('.btn-block-msg').forEach(btn => {
      btn.addEventListener('click', async () => {
        const isBlocked = btn.dataset.blocked === 'true';
        await DB.adminBlockMessage(btn.dataset.msgId, !isBlocked);
        const msg = allMessages.find(m => m.id === btn.dataset.msgId);
        if (msg) msg.is_blocked = !isBlocked;
        // 如果当前不显示已屏蔽，屏蔽后从列表移除
        if (!showBlocked && !isBlocked) {
          btn.closest('.message-item').remove();
        } else {
          renderMessages();
        }
        loadStats();
      });
    });

    document.querySelectorAll('.btn-note').forEach(btn => {
      btn.addEventListener('click', async () => {
        const note = btn.closest('.note-area').querySelector('.note-input').value;
        await DB.adminSaveNote(btn.dataset.vid, note);
        allMessages.forEach(m => {
          if (m.visitor_id === btn.dataset.vid && m.visitors) m.visitors.note = note;
        });
        btn.textContent = '✓ 已保存';
        setTimeout(() => btn.textContent = I18n.t('admin.save_note'), 2000);
      });
    });
  }

  // ── 屏蔽用户确认弹窗 ──────────────────────────────────────
  function showBlockConfirm(visitorId) {
    const existing = document.getElementById('block-confirm');
    if (existing) existing.remove();

    const dialog = document.createElement('div');
    dialog.id = 'block-confirm';
    dialog.className = 'confirm-dialog';
    dialog.innerHTML = `
      <div class="confirm-box">
        <p class="confirm-title">屏蔽此用户</p>
        <p class="confirm-desc">屏蔽后该用户无法再发送消息。</p>
        <label class="confirm-check">
          <input type="checkbox" id="block-msgs-check"> 同时屏蔽该用户所有历史消息
        </label>
        <div class="confirm-actions">
          <button id="confirm-cancel">取消</button>
          <button id="confirm-ok" class="danger">确认屏蔽</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);

    document.getElementById('confirm-cancel').addEventListener('click', () => dialog.remove());
    document.getElementById('confirm-ok').addEventListener('click', async () => {
      const blockMessages = document.getElementById('block-msgs-check').checked;
      dialog.remove();
      await DB.adminBlockVisitor(visitorId, true, blockMessages);
      await fetchAndRender();
      loadStats();
    });

    // 点击遮罩关闭
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.remove(); });
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