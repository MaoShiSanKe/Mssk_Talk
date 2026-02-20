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
  const PAGE_SIZE = 10;       // 用户分组分页
  const MSG_PAGE_SIZE = 5;    // 每个用户组内消息分页
  let allMessages = [];
  // 记录每个用户组当前展开状态和消息页码
  const groupState = {}; // { [vid]: { open: bool, page: number } }

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
    setTimeout(() => { loadStats(); fetchAndRender(); }, 0);
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

  // ── 渲染消息列表 ───────────────────────────────────────────
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

    // 分组
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

  // ── 用户分组外层分页 ───────────────────────────────────────
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

  // ── 渲染单个用户分组（折叠/展开 + 组内分页）──────────────
  function renderVisitorGroup(vid, messages, meta) {
    const isBlocked = meta?.is_blocked ?? false;
    const note = meta?.note ?? '';
    const shortId = vid === 'unknown' ? 'unknown' : vid.slice(0, 8);
    const unreadCount = messages.filter(m => !m.is_read).length;
    const totalCount = messages.length;

    // 初始化该组状态
    if (!groupState[vid]) groupState[vid] = { open: false, page: 1 };
    const state = groupState[vid];

    // 最新一条消息作为预览（messages 已按 created_at desc 排序）
    const preview = messages[0];
    const previewText = preview?.content?.slice(0, 60) + (preview?.content?.length > 60 ? '…' : '');

    // 组内分页
    const totalMsgPages = Math.ceil(totalCount / MSG_PAGE_SIZE);
    state.page = Math.min(state.page, Math.max(1, totalMsgPages));
    const pageMsgs = messages.slice((state.page - 1) * MSG_PAGE_SIZE, state.page * MSG_PAGE_SIZE);

    return `
    <div class="visitor-group ${isBlocked ? 'blocked' : ''}" data-visitor-id="${vid}">

      <!-- 标题栏（可点击折叠/展开） -->
      <div class="visitor-header group-toggle" data-vid="${vid}" style="cursor:pointer">
        <div class="visitor-info">
          <span class="toggle-arrow">${state.open ? '▾' : '▸'}</span>
          <span class="visitor-id">${I18n.t('admin.visitor_id')} #${shortId}</span>
          ${isBlocked ? `<span class="badge blocked">${I18n.t('admin.blocked_badge')}</span>` : ''}
          ${unreadCount > 0 ? `<span class="badge unread">${I18n.t('admin.unread_badge')} ${unreadCount}</span>` : ''}
          <span class="msg-count">${totalCount} 条</span>
        </div>
        <div class="visitor-actions" onclick="event.stopPropagation()">
          ${vid !== 'unknown' ? `
          <button class="btn-block" data-vid="${vid}" data-blocked="${isBlocked}">
            ${isBlocked ? I18n.t('admin.unblock_user') : I18n.t('admin.block_user')}
          </button>` : ''}
        </div>
      </div>

      <!-- 折叠时显示预览 -->
      ${!state.open ? `
      <div class="group-preview" data-vid="${vid}" style="cursor:pointer">
        <span class="preview-text">${escapeHtml(previewText)}</span>
        <span class="preview-time">${formatTime(preview?.created_at)}</span>
      </div>` : ''}

      <!-- 展开时显示详情 -->
      ${state.open ? `
      <div class="group-detail">
        ${vid !== 'unknown' ? `
        <div class="note-area">
          <input type="text" class="note-input" data-vid="${vid}" value="${escapeAttr(note)}"
            placeholder="${I18n.t('admin.note_placeholder')}">
          <button class="btn-note" data-vid="${vid}">${I18n.t('admin.save_note')}</button>
        </div>` : ''}

        <div class="message-thread">
          ${pageMsgs.map(m => renderMessage(m)).join('')}
        </div>

        ${totalMsgPages > 1 ? `
        <div class="msg-pagination">
          ${Array.from({length: totalMsgPages}, (_, i) => i + 1).map(i => `
            <button class="page-btn ${i === state.page ? 'active' : ''} msg-page-btn"
              data-vid="${vid}" data-page="${i}">${i}</button>
          `).join('')}
        </div>` : ''}
      </div>` : ''}

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

  // ── 事件绑定 ───────────────────────────────────────────────
  function bindActions() {
    // 折叠/展开
    document.querySelectorAll('.group-toggle, .group-preview').forEach(el => {
      el.addEventListener('click', () => {
        const vid = el.dataset.vid;
        if (!groupState[vid]) groupState[vid] = { open: false, page: 1 };
        groupState[vid].open = !groupState[vid].open;
        renderMessages();
      });
    });

    // 组内消息翻页
    document.querySelectorAll('.msg-page-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const vid = btn.dataset.vid;
        groupState[vid].page = parseInt(btn.dataset.page);
        renderMessages();
      });
    });

    // 标为已读
    document.querySelectorAll('.btn-read').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        await DB.adminMarkRead(btn.dataset.msgId);
        const msg = allMessages.find(m => m.id === btn.dataset.msgId);
        if (msg) msg.is_read = true;
        btn.closest('.message-item').classList.remove('unread');
        btn.remove();
        loadStats();
      });
    });

    // 屏蔽/解除屏蔽用户
    document.querySelectorAll('.btn-block').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const isBlocked = btn.dataset.blocked === 'true';
        if (!isBlocked) {
          showBlockConfirm(btn.dataset.vid);
        } else {
          DB.adminBlockVisitor(btn.dataset.vid, false, false).then(() => {
            fetchAndRender(); loadStats();
          });
        }
      });
    });

    // 屏蔽/解除屏蔽消息
    document.querySelectorAll('.btn-block-msg').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const isBlocked = btn.dataset.blocked === 'true';
        await DB.adminBlockMessage(btn.dataset.msgId, !isBlocked);
        const msg = allMessages.find(m => m.id === btn.dataset.msgId);
        if (msg) msg.is_blocked = !isBlocked;
        if (!showBlocked && !isBlocked) {
          btn.closest('.message-item').remove();
        } else {
          renderMessages();
        }
        loadStats();
      });
    });

    // 保存备注
    document.querySelectorAll('.btn-note').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
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