// js/admin.js — 管理后台逻辑

(async () => {
  try {
    await CONFIG.init();
  } catch (e) {
    document.body.innerHTML = '<p style="text-align:center;padding:40px;color:#888">Service unavailable.</p>';
    return;
  }

  // 读取已保存的语言，和用户端保持一致
  const savedLang = localStorage.getItem(CONFIG.storage.lang) || CONFIG.defaultLang;
  await I18n.load(savedLang);

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
  let showWordBlocked = false;
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
    loginBtn.textContent = I18n.t('admin.login_verifying');
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
      loginError.textContent = I18n.t('admin.network_error');
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

  // ── 语言菜单（管理端）─────────────────────────────────────
  const langToggleAdmin = document.getElementById('lang-toggle-admin');
  const langMenuAdmin   = document.getElementById('lang-menu-admin');

  function renderLangMenuAdmin() {
    langMenuAdmin.innerHTML = I18n.langs().map(({ key, label }) => `
      <div class="lang-menu-item ${key === I18n.currentLang() ? 'active' : ''}" data-lang="${key}">
        <span>${label}</span>
        ${key === I18n.currentLang() ? '<span class="lang-menu-check">✓</span>' : ''}
      </div>
    `).join('');
    langMenuAdmin.querySelectorAll('.lang-menu-item').forEach(item => {
      item.addEventListener('click', async () => {
        if (item.dataset.lang === I18n.currentLang()) { langMenuAdmin.style.display = 'none'; return; }
        await I18n.load(item.dataset.lang);
        langMenuAdmin.style.display = 'none';
        // 重新渲染当前页以更新动态文字
        renderMessages();
      });
    });
  }

  if (langToggleAdmin && langMenuAdmin) {
    langToggleAdmin.addEventListener('click', e => {
      e.stopPropagation();
      const isHidden = langMenuAdmin.style.display === 'none';
      if (isHidden) {
        const rect = langToggleAdmin.getBoundingClientRect();
        langMenuAdmin.style.display = 'block';
        renderLangMenuAdmin();
        const menuH = langMenuAdmin.offsetHeight;
        langMenuAdmin.style.position = 'fixed';
        langMenuAdmin.style.right = '16px';
        langMenuAdmin.style.top = `${rect.bottom + 4}px`;
        langMenuAdmin.style.left = 'auto';
      } else {
        langMenuAdmin.style.display = 'none';
      }
    });
    document.addEventListener('click', () => { langMenuAdmin.style.display = 'none'; });
    langMenuAdmin.addEventListener('click', e => e.stopPropagation());
  }
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
    if (showBlocked) showWordBlocked = false; // 互斥
    const btn = document.getElementById('filter-blocked');
    btn.classList.toggle('active', showBlocked);
    btn.textContent = showBlocked ? I18n.t('admin.filter_blocked_hide') : I18n.t('admin.filter_blocked');
    document.getElementById('filter-word-blocked').classList.remove('active');
    document.getElementById('filter-word-blocked').textContent = I18n.t('admin.filter_word_blocked');
    currentPage = 1;
    fetchAndRender();
  });

  document.getElementById('filter-word-blocked').addEventListener('click', () => {
    showWordBlocked = !showWordBlocked;
    if (showWordBlocked) showBlocked = false; // 互斥
    const btn = document.getElementById('filter-word-blocked');
    btn.classList.toggle('active', showWordBlocked);
    btn.textContent = showWordBlocked ? I18n.t('admin.filter_word_blocked_hide') : I18n.t('admin.filter_word_blocked');
    document.getElementById('filter-blocked').classList.remove('active');
    document.getElementById('filter-blocked').textContent = I18n.t('admin.filter_blocked');
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

  // ── 精选管理面板 ───────────────────────────────────────────
  let featuredMgrLoaded = false;
  document.getElementById('featured-mgr-toggle').addEventListener('click', () => {
    const panel = document.getElementById('featured-mgr-panel');
    const arrow = document.getElementById('featured-mgr-arrow');
    const isHidden = panel.style.display === 'none';
    panel.style.display = isHidden ? 'block' : 'none';
    arrow.textContent = isHidden ? '▾' : '▸';
    if (isHidden) loadFeaturedMgr(); // 每次展开刷新，保持最新状态
  });

  async function loadFeaturedMgr() {
    const list = document.getElementById('featured-mgr-list');
    list.innerHTML = `<p class="loading">${I18n.t('admin.loading')}</p>`;
    try {
      const messages = await DB.adminGetFeaturedMessages();
      if (!messages.length) {
        list.innerHTML = `<p class="empty" style="font-size:0.85rem;">${I18n.t('admin.featured_empty')}</p>`;
        return;
      }
      list.innerHTML = messages.map(m => `
        <div class="featured-mgr-item" data-msg-id="${m.id}">
          <div class="featured-mgr-body">
            <p class="featured-mgr-content">${escapeHtml(m.content)}</p>
          </div>
          <button class="btn-unfeature" data-msg-id="${m.id}">${I18n.t('admin.featured_unfeature')}</button>
        </div>
      `).join('');
      list.querySelectorAll('.btn-unfeature').forEach(btn => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          btn.textContent = I18n.t('admin.featured_unfeaturing');
          await DB.adminSetFeatured(btn.dataset.msgId, false);
          // 同步更新 allMessages 中的状态
          const msg = allMessages.find(m => m.id === btn.dataset.msgId);
          if (msg) msg.is_featured = false;
          await loadFeaturedMgr();
          renderMessages(); // 刷新消息列表中的按钮状态
        });
      });
    } catch {
      list.innerHTML = `<p class="empty">${I18n.t('admin.load_fail')}</p>`;
    }
  }

  // ── 屏蔽词管理面板 ─────────────────────────────────────────
  let bwordsLoaded = false;
  document.getElementById('bwords-toggle').addEventListener('click', () => {
    const panel = document.getElementById('bwords-panel');
    const arrow = document.getElementById('bwords-arrow');
    const isHidden = panel.style.display === 'none';
    panel.style.display = isHidden ? 'block' : 'none';
    arrow.textContent = isHidden ? '▾' : '▸';
    if (isHidden && !bwordsLoaded) {
      bwordsLoaded = true;
      loadBlockedWords();
    }
  });

  async function loadBlockedWords() {
    const list = document.getElementById('bwords-list');
    try {
      const words = await DB.adminGetBlockedWords();
      renderBlockedWords(words);
    } catch {
      list.innerHTML = `<p class="empty">${I18n.t('admin.load_fail')}</p>`;
    }
  }

  function renderBlockedWords(words) {
    const list = document.getElementById('bwords-list');
    if (!words.length) {
      list.innerHTML = `<p class="empty" style="font-size:0.82rem;">${I18n.t('admin.bword_empty')}</p>`;
      return;
    }
    list.innerHTML = words.map(w => `
      <span class="bword-tag">
        ${escapeHtml(w.word)}
        <button class="bword-del" data-word-id="${w.id}" title="×">×</button>
      </span>
    `).join('');
    list.querySelectorAll('.bword-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        await DB.adminDeleteBlockedWord(btn.dataset.wordId);
        await loadBlockedWords();
      });
    });
  }

  const bwordInput = document.getElementById('bword-input');
  const bwordAddBtn = document.getElementById('bword-add-btn');

  async function addBlockedWord() {
    const word = bwordInput.value.trim();
    if (!word) return;
    bwordAddBtn.disabled = true;
    await DB.adminAddBlockedWord(word);
    bwordInput.value = '';
    bwordAddBtn.disabled = false;
    await loadBlockedWords();
  }

  bwordAddBtn.addEventListener('click', addBlockedWord);
  bwordInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addBlockedWord(); }
  });

  // ── 访客统计面板 ───────────────────────────────────────────
  let vstatsLoaded = false;
  document.getElementById('vstats-toggle').addEventListener('click', () => {
    const panel = document.getElementById('vstats-panel');
    const arrow = document.getElementById('vstats-arrow');
    const isHidden = panel.style.display === 'none';
    panel.style.display = isHidden ? 'block' : 'none';
    arrow.textContent = isHidden ? '▾' : '▸';
    if (isHidden && !vstatsLoaded) {
      vstatsLoaded = true;
      loadVisitorStats();
    }
  });

  async function loadVisitorStats() {
    const panel = document.getElementById('vstats-panel');
    try {
      const stats = await DB.adminGetVisitorStats();
      const max = Math.max(...stats.dailyMessages.map(d => d.count), 1);

      panel.innerHTML = `
        <div class="vstats-cards">
          <div class="vstats-card">
            <div class="vstats-number">${stats.totalVisitors}</div>
            <div class="vstats-label">${I18n.t('admin.vstats_total')}</div>
          </div>
          <div class="vstats-card">
            <div class="vstats-number">${stats.todayNewVisitors}</div>
            <div class="vstats-label">${I18n.t('admin.vstats_today')}</div>
          </div>
        </div>
        <div class="vstats-chart-title">${I18n.t('admin.vstats_chart_title')}</div>
        <div class="vstats-chart">
          ${stats.dailyMessages.map(d => {
            const pct = Math.round((d.count / max) * 100);
            const label = d.date.slice(5); // MM-DD
            return `
              <div class="vstats-bar-col">
                <div class="vstats-bar-count">${d.count || ''}</div>
                <div class="vstats-bar" style="height:${Math.max(pct, 2)}%"></div>
                <div class="vstats-bar-label">${label}</div>
              </div>`;
          }).join('')}
        </div>
      `;
    } catch (e) {
      panel.innerHTML = `<p class="empty">${I18n.t('admin.load_fail')}: ${e.message}</p>`;
    }
  }

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
  function getSettingMeta() {
    return {
      site_title:          { type: 'text',   label: I18n.t('admin.setting_site_title'),         desc: I18n.t('admin.setting_site_title_desc') },
      site_description:    { type: 'text',   label: I18n.t('admin.setting_site_desc'),          desc: I18n.t('admin.setting_site_desc_desc') },
      webhook_url:         { type: 'text',   label: I18n.t('admin.setting_webhook_url'),        desc: I18n.t('admin.setting_webhook_url_desc') },
      show_history:        { type: 'bool',   label: I18n.t('admin.setting_show_history'),       desc: I18n.t('admin.setting_show_history_desc') },
      allow_messages:      { type: 'bool',   label: I18n.t('admin.setting_allow_messages'),     desc: I18n.t('admin.setting_allow_messages_desc') },
      require_contact:     { type: 'bool',   label: I18n.t('admin.setting_require_contact'),    desc: I18n.t('admin.setting_require_contact_desc') },
      max_message_length:  { type: 'number', label: I18n.t('admin.setting_max_length'),         desc: I18n.t('admin.setting_max_length_desc') },
      daily_limit:         { type: 'number', label: I18n.t('admin.setting_daily_limit'),        desc: I18n.t('admin.setting_daily_limit_desc') },
      show_replies:        { type: 'bool',   label: I18n.t('admin.setting_show_replies'),       desc: I18n.t('admin.setting_show_replies_desc') },
      show_pinned:         { type: 'bool',   label: I18n.t('admin.setting_show_pinned'),        desc: I18n.t('admin.setting_show_pinned_desc') },
      show_featured:       { type: 'bool',   label: I18n.t('admin.setting_show_featured'),      desc: I18n.t('admin.setting_show_featured_desc') },
      featured_count:      { type: 'number', label: I18n.t('admin.setting_featured_count'),     desc: I18n.t('admin.setting_featured_count_desc') },
      featured_auto:       { type: 'bool',   label: I18n.t('admin.setting_featured_auto'),      desc: I18n.t('admin.setting_featured_auto_desc') },
      show_public_board:   { type: 'bool',   label: I18n.t('admin.setting_show_public_board'),  desc: I18n.t('admin.setting_show_public_board_desc') },
      public_board_title:  { type: 'text',   label: I18n.t('admin.setting_public_board_title'), desc: I18n.t('admin.setting_public_board_title_desc') },
    };
  }

  async function loadSettings() {
    const settingsPanel = document.getElementById('settings-panel');
    if (!settingsPanel) return;
    settingsPanel.innerHTML = `<p class="loading">${I18n.t('admin.loading')}</p>`;
    try {
      const rows = await DB.adminGetSettings();
      settingsPanel.innerHTML = `<div class="settings-grid">${rows.map(row => renderSettingRow(row)).join('')}</div>`;
      bindSettingActions();
    } catch (e) {
      settingsPanel.innerHTML = `<p class="empty">${I18n.t('admin.load_fail')}: ${e.message}</p>`;
    }
  }

  function renderSettingRow(row) {
    const meta = getSettingMeta()[row.key] ?? { type: 'text', label: row.key, desc: row.description ?? '' };
    const isBool   = meta.type === 'bool';
    const isText   = meta.type === 'text';
    const isTrue   = row.value === 'true';

    return `
    <div class="setting-row${isText ? ' full-width' : ''}" data-key="${row.key}">
      <div class="setting-info">
        <span class="setting-label">${meta.label}</span>
        <span class="setting-desc">${meta.desc}</span>
      </div>
      <div class="setting-control">
        ${isBool ? `
          <button class="toggle-btn ${isTrue ? 'on' : 'off'}" data-key="${row.key}" data-value="${row.value}">
            ${isTrue ? I18n.t('admin.toggle_on') : I18n.t('admin.toggle_off')}
          </button>
        ` : isText ? `
          <div class="text-control">
            <input type="text" class="setting-text" data-key="${row.key}" value="${escapeAttr(row.value)}">
            <button class="btn-save-text" data-key="${row.key}">${I18n.t('admin.setting_save')}</button>
          </div>
        ` : `
          <div class="number-control">
            <input type="number" class="setting-number" data-key="${row.key}" value="${row.value}" min="0">
            <button class="btn-save-num" data-key="${row.key}">${I18n.t('admin.setting_save')}</button>
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
        btn.textContent = newVal === 'true' ? I18n.t('admin.toggle_on') : I18n.t('admin.toggle_off');
        btn.className = `toggle-btn ${newVal === 'true' ? 'on' : 'off'}`;
        btn.disabled = false;
      });
    });

    document.querySelectorAll('.btn-save-num').forEach(btn => {
      btn.addEventListener('click', async () => {
        const input = btn.closest('.number-control').querySelector('.setting-number');
        btn.disabled = true;
        await DB.adminSaveSetting(btn.dataset.key, input.value);
        btn.textContent = I18n.t('admin.setting_saved');
        setTimeout(() => { btn.textContent = I18n.t('admin.setting_save'); btn.disabled = false; }, 2000);
      });
    });

    document.querySelectorAll('.btn-save-text').forEach(btn => {
      btn.addEventListener('click', async () => {
        const input = btn.closest('.text-control').querySelector('.setting-text');
        btn.disabled = true;
        await DB.adminSaveSetting(btn.dataset.key, input.value.trim());
        btn.textContent = I18n.t('admin.setting_saved');
        setTimeout(() => { btn.textContent = I18n.t('admin.setting_save'); btn.disabled = false; }, 2000);
      });
    });
  }

  // ── 数据导出 ───────────────────────────────────────────────
  const exportBtn = document.getElementById('export-btn');
  const exportPanel = document.getElementById('export-panel');

  // 切换导出面板
  exportBtn.addEventListener('click', () => {
    const isHidden = exportPanel.style.display === 'none';
    exportPanel.style.display = isHidden ? 'block' : 'none';
  });

  // 点击面板外关闭
  document.addEventListener('click', e => {
    if (!exportPanel.contains(e.target) && e.target !== exportBtn) {
      exportPanel.style.display = 'none';
    }
  });

  document.getElementById('export-confirm-btn').addEventListener('click', async () => {
    const scope = document.querySelector('input[name="export-scope"]:checked')?.value ?? 'all';
    const includeBlocked = document.getElementById('export-include-blocked').checked;
    const includeWordBlocked = document.getElementById('export-include-word-blocked').checked;

    const confirmBtn = document.getElementById('export-confirm-btn');
    confirmBtn.disabled = true;
    confirmBtn.textContent = I18n.t('admin.export_exporting');

    try {
      let messages = [];

      if (scope === 'current') {
        // 当前视图：使用已加载的 allMessages，再按条件过滤
        messages = allMessages.filter(m => {
          if (!includeBlocked && m.is_blocked) return false;
          if (!includeWordBlocked && m.is_word_blocked) return false;
          return true;
        });
      } else {
        // 全部消息
        const all = await DB.adminGetAllMessages({ showBlocked: true, showWordBlocked: false });
        const wordBlocked = includeWordBlocked
          ? await DB.adminGetAllMessages({ showBlocked: false, showWordBlocked: true })
          : [];
        messages = [
          ...all.filter(m => includeBlocked || !m.is_blocked),
          ...wordBlocked,
        ];
      }

      if (!messages.length) {
        alert(I18n.t('admin.export_empty'));
        return;
      }

      const suffix = scope === 'current' && searchKeyword ? `_搜索_${searchKeyword}` : '';
      const csv = messagesToCsv(messages);
      downloadCsv(csv, `mssk_messages_${dateStr()}${suffix}.csv`);
      exportPanel.style.display = 'none';
    } catch (e) {
      alert(I18n.t('admin.load_fail') + ': ' + e.message);
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = I18n.t('admin.export_confirm');
    }
  });

  function messagesToCsv(messages) {
    const cols = ["ID", I18n.t('admin.csv_visitor_id'), I18n.t('admin.csv_note'), I18n.t('admin.csv_content'), I18n.t('admin.csv_image'), I18n.t('admin.csv_contact'), I18n.t('admin.csv_time'), I18n.t('admin.csv_read'), I18n.t('admin.csv_blocked'), I18n.t('admin.csv_word_blocked')];
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
      m.is_read ? I18n.t('admin.csv_yes') : I18n.t('admin.csv_no'),
      m.is_blocked ? I18n.t('admin.csv_yes') : I18n.t('admin.csv_no'),
      m.is_word_blocked ? I18n.t('admin.csv_yes') : I18n.t('admin.csv_no'),
    ].map(escape).join(','));
    return '\uFEFF' + [cols.join(','), ...rows].join('\r\n');
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
      document.title = stats.unread > 0 ? `(${stats.unread}) ${I18n.t('admin.title')}` : I18n.t('admin.title');
    } catch (e) { console.error(e); }
  }

  // ── 拉取消息 ───────────────────────────────────────────────
  async function fetchAndRender() {
    messageList.innerHTML = `<p class="loading">${I18n.t('admin.loading')}</p>`;
    paginationEl.innerHTML = '';
    try {
      allMessages = await DB.adminGetAllMessages({ unreadOnly: showUnreadOnly, showBlocked, showWordBlocked });
      renderMessages();
    } catch (e) {
      messageList.innerHTML = `<p class="empty">${I18n.t('admin.load_fail')}: ${e.message}</p>`;
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
      messageList.innerHTML = `<p class="empty">${I18n.t('admin.no_messages')}</p>`;
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

    // 页码跳转（超过 3 页才显示）
    if (totalPages > 3) {
      const jumpWrap = document.createElement('span');
      jumpWrap.className = 'page-jump';

      const jumpInput = document.createElement('input');
      jumpInput.type = 'number';
      jumpInput.min = 1;
      jumpInput.max = totalPages;
      jumpInput.placeholder = cur;
      jumpInput.className = 'page-jump-input';

      const jumpBtn = document.createElement('button');
      jumpBtn.className = 'page-jump-btn';
      jumpBtn.textContent = I18n.t('admin.jump_btn');

      const doJump = () => {
        const val = parseInt(jumpInput.value);
        if (!isNaN(val) && val >= 1 && val <= totalPages) {
          onClick(val);
        } else {
          jumpInput.value = '';
          jumpInput.focus();
        }
      };

      jumpBtn.addEventListener('click', doJump);
      jumpInput.addEventListener('keydown', e => { if (e.key === 'Enter') doJump(); });

      jumpWrap.appendChild(jumpInput);
      jumpWrap.appendChild(jumpBtn);
      container.appendChild(jumpWrap);
    }
  }

  // ── 渲染单个用户分组（折叠/展开 + 组内分页）──────────────
  function renderVisitorGroup(vid, messages, meta) {
    const isBlocked = meta?.is_blocked ?? false;
    const note      = meta?.note ?? '';
    const nickname  = meta?.nickname ?? '';
    const avatarUrl = meta?.avatar_url ?? '';
    const bio       = meta?.bio ?? '';
    const shortId   = vid === 'unknown' ? 'unknown' : vid.slice(0, 8);
    const unreadCount = messages.filter(m => !m.is_read).length;
    const totalCount  = messages.length;

    if (!groupState[vid]) groupState[vid] = { open: false, page: 1 };
    const state = groupState[vid];

    // 显示名称：管理员备注 > 访客昵称 > ID
    const displayName = note
      ? `<span class="visitor-name">${highlightText(note, searchKeyword)}</span><span class="visitor-id" title="${vid}">#${shortId}</span>`
      : nickname
      ? `<span class="visitor-name visitor-nickname">${highlightText(nickname, searchKeyword)}</span><span class="visitor-id" title="${vid}">#${shortId}</span>`
      : `<span class="visitor-id" title="${vid}">#${shortId}</span>`;

    // 头像（有头像时显示小圆形）
    const avatarHtml = avatarUrl
      ? `<img class="visitor-avatar" src="${escapeAttr(avatarUrl)}" alt="" onerror="this.style.display='none'">`
      : '';

    const preview     = messages[0];
    const previewText = preview?.content?.slice(0, 60) + (preview?.content?.length > 60 ? '…' : '');

    const totalMsgPages = Math.ceil(totalCount / MSG_PAGE_SIZE);
    state.page = Math.min(state.page, Math.max(1, totalMsgPages));
    const pageMsgs = messages.slice((state.page - 1) * MSG_PAGE_SIZE, state.page * MSG_PAGE_SIZE);

    return `
    <div class="visitor-group ${isBlocked ? 'blocked' : ''}" data-visitor-id="${vid}">

      <div class="visitor-header group-toggle" data-vid="${vid}" style="cursor:pointer">
        <div class="visitor-info">
          ${avatarHtml}
          <span class="toggle-arrow">${state.open ? '▾' : '▸'}</span>
          ${displayName}
          ${isBlocked ? `<span class="badge blocked">${I18n.t('admin.blocked_badge')}</span>` : ''}
          ${unreadCount > 0 ? `<span class="badge unread">${I18n.t('admin.unread_badge')} ${unreadCount}</span>` : ''}
          <span class="msg-count">${totalCount} ${I18n.t('admin.msg_count_unit')}</span>
        </div>
        <div class="visitor-actions" onclick="event.stopPropagation()">
          ${nickname ? `<span class="visitor-actions-nickname" title="${I18n.t('admin.visitor_nickname_label')}">${escapeHtml(nickname)}</span>` : ''}
          ${vid !== 'unknown' ? `
          <button class="btn-block" data-vid="${vid}" data-blocked="${isBlocked}">
            ${isBlocked ? I18n.t('admin.unblock_user') : I18n.t('admin.block_user')}
          </button>` : ''}
        </div>
      </div>

      ${!state.open ? `
      <div class="group-preview" data-vid="${vid}" style="cursor:pointer">
        <span class="preview-text">${highlightText(previewText, searchKeyword)}</span>
        <span class="preview-time">${formatTime(preview?.created_at)}</span>
      </div>` : ''}

      ${state.open ? `
      <div class="group-detail">
        ${bio ? `<p class="visitor-bio">${I18n.t('admin.visitor_bio_prefix')}${escapeHtml(bio)}</p>` : ''}
        ${vid !== 'unknown' ? `
        <div class="note-area">
          <input type="text" class="note-input" data-vid="${vid}" value="${escapeAttr(note)}"
            placeholder="${I18n.t('admin.note_placeholder')}">
          <button class="btn-note" data-vid="${vid}">${I18n.t('admin.save_note')}</button>
        </div>` : ''}

        <div class="message-thread">
          ${pageMsgs.map(m => renderMessage(m, searchKeyword)).join('')}
        </div>

        ${totalMsgPages > 1 ? `<div class="msg-pagination" data-vid="${vid}" data-cur="${state.page}" data-total="${totalMsgPages}"></div>` : ''}
      </div>` : ''}

    </div>`;
  }

  function renderMessage(m) {
    const hasReplies = m.replies && m.replies.length > 0;
    const isWordBlocked = m.is_word_blocked;
    return `
    <div class="message-item ${m.is_read ? '' : 'unread'} ${m.is_blocked ? 'msg-blocked' : ''} ${isWordBlocked ? 'msg-word-blocked' : ''}" data-msg-id="${m.id}">
      ${m.is_blocked ? `<span class="blocked-badge">${I18n.t('admin.badge_blocked')}</span>` : ''}
      ${isWordBlocked ? `<span class="word-blocked-badge">${I18n.t('admin.badge_word_blocked')}</span>` : ''}
      <p class="msg-content">${highlightText(m.content, searchKeyword)}</p>
      ${m.image_url ? `<a href="${escapeHtml(m.image_url)}" target="_blank" class="msg-img-link">🖼 ${I18n.t('admin.image')}</a>` : ''}
      ${m.contact ? `<p class="msg-contact">📬 ${I18n.t('admin.contact')}：${highlightText(m.contact, searchKeyword)}</p>` : ''}
      <div class="msg-footer">
        <span class="msg-time">${formatTime(m.created_at)}</span>
        <div class="msg-actions">
          ${hasReplies ? `<span class="badge replied">${I18n.t('admin.replied_badge')}</span>` : ''}
          ${!m.is_read ? `<button class="btn-read" data-msg-id="${m.id}">${I18n.t('admin.mark_read')}</button>` : ''}
          ${isWordBlocked
            ? `<button class="btn-release" data-msg-id="${m.id}">${I18n.t('admin.release_word_blocked')}</button>`
            : `
          <button class="btn-block-msg ${m.is_blocked ? 'unblock' : ''}" data-msg-id="${m.id}" data-blocked="${m.is_blocked}">
            ${m.is_blocked ? I18n.t('admin.unblock_msg') : I18n.t('admin.block_msg')}
          </button>
          <button class="btn-featured ${m.is_featured ? 'on' : ''}" data-msg-id="${m.id}" data-featured="${!!m.is_featured}" title="${I18n.t('admin.feature_btn')}">
            ${m.is_featured ? I18n.t('admin.unfeature_btn') : I18n.t('admin.feature_btn')}
          </button>
          <button class="btn-pinned ${m.is_pinned ? 'on' : ''}" data-msg-id="${m.id}" data-pinned="${!!m.is_pinned}" title="${I18n.t('admin.pin_btn')}">
            ${m.is_pinned ? I18n.t('admin.unpin_btn') : I18n.t('admin.pin_btn')}
          </button>
          <button class="btn-public ${m.is_public ? 'on' : ''}" data-msg-id="${m.id}" data-public="${!!m.is_public}" title="${I18n.t('admin.public_btn')}">
            ${m.is_public ? I18n.t('admin.unpublic_btn') : I18n.t('admin.public_btn')}
          </button>`
          }
          <button class="btn-reply-toggle" data-msg-id="${m.id}">💬 ${hasReplies ? I18n.t('admin.reply_view_btn').replace('💬 ','') : I18n.t('admin.reply_btn').replace('💬 ','')}</button>
        </div>
      </div>

      <div class="reply-area" id="reply-area-${m.id}" style="display:none">
        <div class="reply-list" id="reply-list-${m.id}"></div>
        <div class="reply-input-row">
          <textarea class="reply-input" id="reply-input-${m.id}"
            placeholder=I18n.t('admin.reply_placeholder') rows="2"></textarea>
          <div class="reply-send-col">
            ${m.contact?.includes('@') ? `
            <label class="reply-email-check">
              <input type="checkbox" id="reply-email-${m.id}"> ${I18n.t('admin.reply_email_notify')}
            </label>` : ''}
            <button class="btn-send-reply" data-msg-id="${m.id}"
              data-contact="${escapeAttr(m.contact ?? '')}"
              data-original="${escapeAttr(m.content)}">${I18n.t('admin.reply_send')}</button>
          </div>
        </div>
      </div>
    </div>`;
  }

  function renderReplyList(msgId, replies) {
    const el = document.getElementById(`reply-list-${msgId}`);
    if (!el) return;
    if (!replies.length) {
      el.innerHTML = `<p class="empty" style="font-size:0.8rem;padding:4px 0;">${I18n.t('admin.reply_empty')}</p>`;
      return;
    }
    el.innerHTML = replies.map(r => `
      <div class="reply-item" data-reply-id="${r.id}">
        <div class="reply-body">
          <p class="reply-content" id="reply-content-${r.id}">${escapeHtml(r.content)}</p>
          <textarea class="reply-edit-input" id="reply-edit-${r.id}" style="display:none" rows="2">${escapeHtml(r.content)}</textarea>
        </div>
        <div class="reply-footer">
          <span class="reply-time">${formatTime(r.created_at)}${r.updated_at ? ` ${I18n.t('admin.reply_edited_badge')}` : ''}</span>
          <div class="reply-actions">
            <button class="btn-edit-reply" data-reply-id="${r.id}" data-msg-id="${msgId}">${I18n.t('admin.reply_edit')}</button>
            <button class="btn-save-reply" data-reply-id="${r.id}" data-msg-id="${msgId}" style="display:none">${I18n.t('admin.reply_save')}</button>
            <button class="btn-cancel-reply" data-reply-id="${r.id}" style="display:none">${I18n.t('admin.reply_cancel')}</button>
            <button class="btn-delete-reply" data-reply-id="${r.id}" data-msg-id="${msgId}">${I18n.t('admin.reply_delete')}</button>
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
        if (!confirm(I18n.t('admin.reply_delete_confirm'))) return;
        await DB.adminDeleteReply(btn.dataset.replyId);
        await loadReplies(btn.dataset.msgId);
      });
    });
  }

  async function loadReplies(msgId) {
    const el = document.getElementById(`reply-list-${msgId}`);
    if (el) el.innerHTML = `<p class="loading" style="font-size:0.8rem;">${I18n.t('admin.loading')}</p>`;
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

    // 放行屏蔽词消息
    document.querySelectorAll('.btn-release').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        btn.disabled = true;
        btn.textContent = I18n.t('admin.releasing');
        await DB.adminReleaseWordBlocked(btn.dataset.msgId);
        await fetchAndRender();
      });
    });

    // 置顶/取消置顶
    document.querySelectorAll('.btn-pinned').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const isPinned = btn.dataset.pinned === 'true';
        btn.disabled = true;
        await DB.adminSetPinned(btn.dataset.msgId, !isPinned);
        const msg = allMessages.find(m => m.id === btn.dataset.msgId);
        if (msg) msg.is_pinned = !isPinned;
        btn.dataset.pinned = String(!isPinned);
        btn.textContent = !isPinned ? I18n.t('admin.unpin_btn') : I18n.t('admin.pin_btn');
        btn.classList.toggle('on', !isPinned);
        btn.disabled = false;
      });
    });

    // 精选/取消精选
    document.querySelectorAll('.btn-featured').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const isFeatured = btn.dataset.featured === 'true';
        btn.disabled = true;
        await DB.adminSetFeatured(btn.dataset.msgId, !isFeatured);
        const msg = allMessages.find(m => m.id === btn.dataset.msgId);
        if (msg) msg.is_featured = !isFeatured;
        btn.dataset.featured = String(!isFeatured);
        btn.textContent = !isFeatured ? I18n.t('admin.unfeature_btn') : I18n.t('admin.feature_btn');
        btn.classList.toggle('on', !isFeatured);
        btn.disabled = false;
      });
    });

    // 公开/取消公开
    document.querySelectorAll('.btn-public').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const isPublic = btn.dataset.public === 'true';
        btn.disabled = true;
        await DB.adminSetPublic(btn.dataset.msgId, !isPublic);
        const msg = allMessages.find(m => m.id === btn.dataset.msgId);
        if (msg) msg.is_public = !isPublic;
        btn.dataset.public = String(!isPublic);
        btn.textContent = !isPublic ? I18n.t('admin.unpublic_btn') : I18n.t('admin.public_btn');
        btn.classList.toggle('on', !isPublic);
        btn.disabled = false;
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
        btn.textContent = isHidden ? I18n.t('admin.reply_view_btn') : I18n.t('admin.reply_btn');
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
        btn.textContent = I18n.t('admin.reply_sending');
        await DB.adminAddReply(msgId, content, btn.dataset.contact, btn.dataset.original, sendEmail);
        input.value = '';
        if (document.getElementById(`reply-email-${msgId}`)) {
          document.getElementById(`reply-email-${msgId}`).checked = false;
        }
        btn.disabled = false;
        btn.textContent = I18n.t('admin.reply_send');
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
        btn.textContent = I18n.t('admin.note_saved');
        setTimeout(() => btn.textContent = I18n.t('admin.note_save'), 2000);
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
          <p class="confirm-title">${I18n.t('admin.unblock_user')}</p>
          <p class="confirm-desc">${I18n.t('admin.unblock_user_desc')}</p>
          <label class="confirm-check">
            <input type="checkbox" id="block-msgs-check" checked> ${I18n.t('admin.unblock_msgs_also')}
          </label>
          <div class="confirm-actions">
            <button id="confirm-cancel">${I18n.t('admin.reply_cancel')}</button>
            <button id="confirm-ok">${I18n.t('admin.unblock_confirm')}</button>
          </div>
        </div>`;
    } else {
      dialog.innerHTML = `
        <div class="confirm-box">
          <p class="confirm-title">${I18n.t('admin.block_user')}</p>
          <p class="confirm-desc">${I18n.t('admin.block_user_desc')}</p>
          <label class="confirm-check">
            <input type="checkbox" id="block-msgs-check"> ${I18n.t('admin.block_msgs_also')}
          </label>
          <div class="confirm-actions">
            <button id="confirm-cancel">${I18n.t('admin.reply_cancel')}</button>
            <button id="confirm-ok" class="danger">${I18n.t('admin.block_confirm')}</button>
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

  // 搜索关键词高亮：先转义再包裹匹配词
  function highlightText(str = '', keyword = '') {
    const escaped = escapeHtml(str);
    if (!keyword) return escaped;
    const escapedKw = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escaped.replace(
      new RegExp(escapedKw.replace(/&amp;|&lt;|&gt;/g, m => escapeHtml(m)), 'gi'),
      match => `<mark class="search-highlight">${match}</mark>`
    );
  }

  function formatTime(iso) {
    return new Date(iso).toLocaleString('zh-CN');
  }
})();