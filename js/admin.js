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

  // ── 设置面板折叠 ───────────────────────────────────────────
  let settingsLoaded = false;
  document.getElementById('settings-toggle').addEventListener('click', () => {
    const panel = document.getElementById('settings-panel');
    const arrow = document.getElementById('settings-arrow');
    const isHidden = panel.style.display === 'none';
    panel.style.display = isHidden ? 'block' : 'none';
    arrow.textContent = isHidden ? '▾' : '▸';
    if (isHidden && !settingsLoaded) {
      settingsLoaded = true;
      loadSettings();
    }
  });

  // ── 设置面板 ───────────────────────────────────────────────
  const SETTING_META = {
    show_history:       { type: 'bool',   label: '显示历史记录',      desc: '用户端是否显示"查看历史记录"入口' },
    allow_messages:     { type: 'bool',   label: '允许留言',          desc: '关闭后用户无法发送新消息' },
    require_contact:    { type: 'bool',   label: '强制填写联系方式',  desc: '开启后联系方式变为必填项' },
    max_message_length: { type: 'number', label: '最大字数',          desc: '单条消息最大字符数' },
    daily_limit:        { type: 'number', label: '每日留言上限',      desc: '同一用户每日最多发送条数，0 为不限制' },
  };

  async function loadSettings() {
    const settingsPanel = document.getElementById('settings-panel');
    if (!settingsPanel) return;
    settingsPanel.innerHTML = '<p class="loading">加载中…</p>';
    try {
      const rows = await DB.adminGetSettings();
      settingsPanel.innerHTML = rows.map(row => renderSettingRow(row)).join('');
      bindSettingActions();
    } catch (e) {
      settingsPanel.innerHTML = `<p class="empty">加载失败：${e.message}</p>`;
    }
  }

  function renderSettingRow(row) {
    const meta = SETTING_META[row.key] ?? { type: 'text', label: row.key, desc: row.description ?? '' };
    const isBool = meta.type === 'bool';
    const isTrue = row.value === 'true';

    return `
    <div class="setting-row" data-key="${row.key}">
      <div class="setting-info">
        <span class="setting-label">${meta.label}</span>
        <span class="setting-desc">${meta.desc}</span>
      </div>
      <div class="setting-control">
        ${isBool ? `
          <button class="toggle-btn ${isTrue ? 'on' : 'off'}" data-key="${row.key}" data-value="${row.value}">
            ${isTrue ? '开启' : '关闭'}
          </button>
        ` : `
          <div class="number-control">
            <input type="number" class="setting-number" data-key="${row.key}" value="${row.value}" min="0">
            <button class="btn-save-num" data-key="${row.key}">保存</button>
          </div>
        `}
      </div>
    </div>`;
  }

  function bindSettingActions() {
    document.querySelectorAll('.toggle-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const isOn = btn.dataset.value === 'true';
        const newVal = isOn ? 'false' : 'true';
        btn.disabled = true;
        await DB.adminSaveSetting(btn.dataset.key, newVal);
        btn.dataset.value = newVal;
        btn.textContent = newVal === 'true' ? '开启' : '关闭';
        btn.className = `toggle-btn ${newVal === 'true' ? 'on' : 'off'}`;
        btn.disabled = false;
      });
    });

    document.querySelectorAll('.btn-save-num').forEach(btn => {
      btn.addEventListener('click', async () => {
        const input = btn.closest('.number-control').querySelector('.setting-number');
        const val = input.value;
        btn.disabled = true;
        await DB.adminSaveSetting(btn.dataset.key, val);
        btn.textContent = '✓ 已保存';
        setTimeout(() => { btn.textContent = '保存'; btn.disabled = false; }, 2000);
      });
    });
  }

  // ── 数据导出 ───────────────────────────────────────────────
  document.getElementById('export-btn').addEventListener('click', async () => {
    const btn = document.getElementById('export-btn');
    btn.disabled = true;
    btn.textContent = '导出中…';
    try {
      // 拉取全部消息（含已屏蔽）
      const messages = await DB.adminGetAllMessages({ unreadOnly: false, showBlocked: true });
      if (!messages.length) {
        btn.textContent = '暂无数据';
        setTimeout(() => { btn.textContent = '导出 CSV'; btn.disabled = false; }, 2000);
        return;
      }
      const csv = messagesToCsv(messages);
      downloadCsv(csv, `mssk_messages_${dateStr()}.csv`);
    } catch (e) {
      alert('导出失败：' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '导出 CSV';
    }
  });

  function messagesToCsv(messages) {
    const cols = ['ID', '用户ID', '用户备注', '内容', '图片链接', '联系方式', '发送时间', '已读', '已屏蔽'];
    const escape = v => {
      if (v == null) return '';
      const s = String(v).replace(/"/g, '""');
      return /[,"\n\r]/.test(s) ? `"${s}"` : s;
    };
    const rows = messages.map(m => [
      m.id,
      m.visitor_id,
      m.visitors?.note ?? '',
      m.content,
      m.image_url ?? '',
      m.contact ?? '',
      new Date(m.created_at).toLocaleString('zh-CN'),
      m.is_read ? '是' : '否',
      m.is_blocked ? '是' : '否',
    ].map(escape).join(','));
    return '\uFEFF' + [cols.join(','), ...rows].join('\r\n'); // BOM 确保 Excel 正确显示中文
  }

  function downloadCsv(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function dateStr() {
    return new Date().toISOString().slice(0, 10);
  }

  // ── 统计 ───────────────────────────────────────────────────
  async function loadStats() {
    try {
      const stats = await DB.adminGetStats();
      document.getElementById('stat-total').textContent = stats.total;
      document.getElementById('stat-unread').textContent = stats.unread;
      document.getElementById('stat-visitors').textContent = stats.visitors;
      // 未读角标
      document.title = stats.unread > 0 ? `(${stats.unread}) 管理后台` : '管理后台';
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
    buildPageButtons(paginationEl, totalPages, currentPage, (page) => {
      currentPage = page;
      renderMessages();
      messageList.scrollIntoView({ behavior: 'smooth' });
    });
  }

  // 通用分页按钮生成，直接填充到目标容器
  function buildPageButtons(container, totalPages, cur, onClick) {
    container.innerHTML = '';

    const showPages = new Set([1, totalPages]);
    for (let i = Math.max(1, cur - 1); i <= Math.min(totalPages, cur + 1); i++) showPages.add(i);
    const sorted = [...showPages].sort((a, b) => a - b);

    const items = [];
    let prev = 0;
    for (const p of sorted) {
      if (p - prev > 1) items.push('...');
      items.push(p);
      prev = p;
    }

    const prevBtn = document.createElement('button');
    prevBtn.className = 'page-btn page-arrow';
    prevBtn.textContent = '‹';
    prevBtn.disabled = cur === 1;
    prevBtn.addEventListener('click', () => onClick(cur - 1));
    container.appendChild(prevBtn);

    for (const item of items) {
      if (item === '...') {
        const dots = document.createElement('span');
        dots.className = 'page-dots';
        dots.textContent = '…';
        container.appendChild(dots);
      } else {
        const btn = document.createElement('button');
        btn.className = `page-btn${item === cur ? ' active' : ''}`;
        btn.textContent = item;
        btn.addEventListener('click', () => onClick(item));
        container.appendChild(btn);
      }
    }

    const nextBtn = document.createElement('button');
    nextBtn.className = 'page-btn page-arrow';
    nextBtn.textContent = '›';
    nextBtn.disabled = cur === totalPages;
    nextBtn.addEventListener('click', () => onClick(cur + 1));
    container.appendChild(nextBtn);
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

    const displayName = note
      ? `<span class="visitor-name">${escapeHtml(note)}</span><span class="visitor-id" title="${vid}">#${shortId}</span>`
      : `<span class="visitor-id" title="${vid}">#${shortId}</span>`;
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
          ${displayName}
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

      <!-- 最新一条消息作为预览（messages 已按 created_at desc 排序） -->
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

        ${totalMsgPages > 1 ? `<div class="msg-pagination" data-vid="${vid}" data-cur="${state.page}" data-total="${totalMsgPages}"></div>` : ''}
      </div>` : ''}

    </div>`;
  }

  function renderMessage(m) {
    const hasReplies = m.replies && m.replies.length > 0;
    return `
    <div class="message-item ${m.is_read ? '' : 'unread'} ${m.is_blocked ? 'msg-blocked' : ''}" data-msg-id="${m.id}">
      ${m.is_blocked ? '<span class="blocked-badge">已屏蔽</span>' : ''}
      <p class="msg-content">${escapeHtml(m.content)}</p>
      ${m.image_url ? `<a href="${escapeHtml(m.image_url)}" target="_blank" class="msg-img-link">🖼 查看图片</a>` : ''}
      ${m.contact ? `<p class="msg-contact">📬 ${I18n.t('admin.contact')}：${escapeHtml(m.contact)}</p>` : ''}
      <div class="msg-footer">
        <span class="msg-time">${formatTime(m.created_at)}</span>
        <div class="msg-actions">
          ${hasReplies ? `<span class="badge replied">💬 已回复</span>` : ''}
          ${!m.is_read ? `<button class="btn-read" data-msg-id="${m.id}">${I18n.t('admin.mark_read')}</button>` : ''}
          <button class="btn-block-msg ${m.is_blocked ? 'unblock' : ''}" data-msg-id="${m.id}" data-blocked="${m.is_blocked}">
            ${m.is_blocked ? '解除屏蔽' : '屏蔽消息'}
          </button>
          <button class="btn-reply-toggle" data-msg-id="${m.id}">💬 ${hasReplies ? '查看回复' : '回复'}</button>
        </div>
      </div>

      <!-- 回复区域（懒加载） -->
      <div class="reply-area" id="reply-area-${m.id}" style="display:none">
        <div class="reply-list" id="reply-list-${m.id}"></div>
        <div class="reply-input-row">
          <textarea class="reply-input" id="reply-input-${m.id}"
            placeholder="输入回复内容…" rows="2"></textarea>
          <div class="reply-send-col">
            ${m.contact?.includes('@') ? `
            <label class="reply-email-check">
              <input type="checkbox" id="reply-email-${m.id}"> 发送邮件通知用户
            </label>` : ''}
            <button class="btn-send-reply" data-msg-id="${m.id}"
              data-contact="${escapeAttr(m.contact ?? '')}"
              data-original="${escapeAttr(m.content)}">发送回复</button>
          </div>
        </div>
      </div>
    </div>`;
  }

  function renderReplyList(msgId, replies) {
    const el = document.getElementById(`reply-list-${msgId}`);
    if (!el) return;
    if (!replies.length) {
      el.innerHTML = '<p class="empty" style="font-size:0.8rem;padding:4px 0;">暂无回复，发送第一条回复</p>';
      return;
    }
    el.innerHTML = replies.map(r => `
      <div class="reply-item" data-reply-id="${r.id}">
        <div class="reply-body">
          <p class="reply-content" id="reply-content-${r.id}">${escapeHtml(r.content)}</p>
          <textarea class="reply-edit-input" id="reply-edit-${r.id}" style="display:none" rows="2">${escapeHtml(r.content)}</textarea>
        </div>
        <div class="reply-footer">
          <span class="reply-time">${formatTime(r.created_at)}${r.updated_at ? ' (已编辑)' : ''}</span>
          <div class="reply-actions">
            <button class="btn-edit-reply" data-reply-id="${r.id}" data-msg-id="${msgId}">编辑</button>
            <button class="btn-save-reply" data-reply-id="${r.id}" data-msg-id="${msgId}" style="display:none">保存</button>
            <button class="btn-cancel-reply" data-reply-id="${r.id}" style="display:none">取消</button>
            <button class="btn-delete-reply" data-reply-id="${r.id}" data-msg-id="${msgId}">删除</button>
          </div>
        </div>
      </div>
    `).join('');

    // 绑定编辑/保存/取消/删除
    el.querySelectorAll('.btn-edit-reply').forEach(btn => {
      btn.addEventListener('click', () => {
        const rid = btn.dataset.replyId;
        document.getElementById(`reply-content-${rid}`).style.display = 'none';
        document.getElementById(`reply-edit-${rid}`).style.display = 'block';
        btn.style.display = 'none';
        el.querySelector(`.btn-save-reply[data-reply-id="${rid}"]`).style.display = '';
        el.querySelector(`.btn-cancel-reply[data-reply-id="${rid}"]`).style.display = '';
      });
    });

    el.querySelectorAll('.btn-cancel-reply').forEach(btn => {
      btn.addEventListener('click', () => {
        const rid = btn.dataset.replyId;
        document.getElementById(`reply-content-${rid}`).style.display = '';
        document.getElementById(`reply-edit-${rid}`).style.display = 'none';
        btn.style.display = 'none';
        el.querySelector(`.btn-save-reply[data-reply-id="${rid}"]`).style.display = 'none';
        el.querySelector(`.btn-edit-reply[data-reply-id="${rid}"]`).style.display = '';
      });
    });

    el.querySelectorAll('.btn-save-reply').forEach(btn => {
      btn.addEventListener('click', async () => {
        const rid = btn.dataset.replyId;
        const newContent = document.getElementById(`reply-edit-${rid}`).value.trim();
        if (!newContent) return;
        btn.disabled = true;
        await DB.adminEditReply(rid, newContent);
        await loadReplies(btn.dataset.msgId);
      });
    });

    el.querySelectorAll('.btn-delete-reply').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('确定删除这条回复？')) return;
        await DB.adminDeleteReply(btn.dataset.replyId);
        await loadReplies(btn.dataset.msgId);
      });
    });
  }

  async function loadReplies(msgId) {
    const el = document.getElementById(`reply-list-${msgId}`);
    if (el) el.innerHTML = '<p class="loading" style="font-size:0.8rem;">加载中…</p>';
    const replies = await DB.adminGetReplies(msgId);
    renderReplyList(msgId, replies);
  }

  // ── 事件绑定 ───────────────────────────────────────────────
  function bindActions() {
    // 填充组内分页
    document.querySelectorAll('.msg-pagination').forEach(el => {
      const vid = el.dataset.vid;
      const cur = parseInt(el.dataset.cur);
      const total = parseInt(el.dataset.total);
      buildPageButtons(el, total, cur, (page) => {
        groupState[vid].page = page;
        renderMessages();
      });
    });
    // 折叠/展开
    document.querySelectorAll('.group-toggle, .group-preview').forEach(el => {
      el.addEventListener('click', () => {
        const vid = el.dataset.vid;
        if (!groupState[vid]) groupState[vid] = { open: false, page: 1 };
        groupState[vid].open = !groupState[vid].open;
        renderMessages();
      });
    });

    // 回复切换
    document.querySelectorAll('.btn-reply-toggle').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const msgId = btn.dataset.msgId;
        const area = document.getElementById(`reply-area-${msgId}`);
        const isHidden = area.style.display === 'none';
        area.style.display = isHidden ? 'block' : 'none';
        btn.textContent = isHidden ? '💬 收起' : '💬 回复';
        if (isHidden) loadReplies(msgId);
      });
    });

    // 发送回复
    document.querySelectorAll('.btn-send-reply').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const msgId = btn.dataset.msgId;
        const input = document.getElementById(`reply-input-${msgId}`);
        const content = input.value.trim();
        if (!content) return;
        const sendEmail = document.getElementById(`reply-email-${msgId}`)?.checked ?? false;
        btn.disabled = true;
        btn.textContent = '发送中…';
        await DB.adminAddReply(msgId, content, btn.dataset.contact, btn.dataset.original, sendEmail);
        input.value = '';
        if (document.getElementById(`reply-email-${msgId}`)) {
          document.getElementById(`reply-email-${msgId}`).checked = false;
        }
        btn.disabled = false;
        btn.textContent = '发送回复';
        const msg = allMessages.find(m => m.id === msgId);
        if (msg) { msg.is_read = true; if (!msg.replies) msg.replies = [{}]; }
        await loadReplies(msgId);
        loadStats();
      });
    });
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
        showBlockConfirm(btn.dataset.vid, isBlocked);
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
  function showBlockConfirm(visitorId, isCurrentlyBlocked) {
    const existing = document.getElementById('block-confirm');
    if (existing) existing.remove();

    const dialog = document.createElement('div');
    dialog.id = 'block-confirm';
    dialog.className = 'confirm-dialog';

    if (isCurrentlyBlocked) {
      dialog.innerHTML = `
        <div class="confirm-box">
          <p class="confirm-title">解除屏蔽</p>
          <p class="confirm-desc">解除后该用户可以重新发送消息。</p>
          <label class="confirm-check">
            <input type="checkbox" id="block-msgs-check" checked> 同时解除该用户所有消息屏蔽
          </label>
          <div class="confirm-actions">
            <button id="confirm-cancel">取消</button>
            <button id="confirm-ok">确认解除</button>
          </div>
        </div>`;
    } else {
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
        </div>`;
    }

    document.body.appendChild(dialog);
    document.getElementById('confirm-cancel').addEventListener('click', () => dialog.remove());
    document.getElementById('confirm-ok').addEventListener('click', async () => {
      const syncMessages = document.getElementById('block-msgs-check').checked;
      dialog.remove();
      await DB.adminBlockVisitor(visitorId, !isCurrentlyBlocked, syncMessages);
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