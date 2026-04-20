// js/main.js — 用户前端逻辑

(async () => {
  // 先加载服务端配置（含 settings）
  try {
    await CONFIG.init();
  } catch (e) {
    document.body.innerHTML = '<p style="text-align:center;padding:40px;color:#888">服务暂时不可用，请稍后再试。</p>';
    return;
  }

  const S = CONFIG.settings;

  // 设置自定义标题（优先于 i18n，不受语言切换影响）
  function applySiteTitle() {
    const titleEl = document.getElementById('site-title');
    const descEl  = document.getElementById('site-description');
    if (titleEl) titleEl.textContent = S.siteTitle;
    if (descEl)  descEl.textContent  = S.siteDescription;
    document.title = S.siteTitle;
  }
  applySiteTitle();

  // 初始化语言
  const savedLang = localStorage.getItem(CONFIG.storage.lang) || CONFIG.defaultLang;
  await I18n.load(savedLang);

  // ── 公开留言板 ─────────────────────────────────────────────
  if (S.showPublicBoard && CONFIG.publicMessages?.length) {
    const board     = document.getElementById('public-board');
    const titleEl   = document.getElementById('public-board-title');
    const countEl   = document.getElementById('public-board-count');
    const listEl    = document.getElementById('public-board-list');
    if (board && titleEl && listEl) {
      board.style.display = 'block';
      titleEl.textContent = S.publicBoardTitle;
      countEl.textContent = `${CONFIG.publicMessages.length}`;
      listEl.innerHTML = CONFIG.publicMessages.map(m => {
        const hasNickname = m.nickname;
        const avatarHtml = m.avatar_url
          ? `<img class="public-msg-avatar" src="${escapeHtml(m.avatar_url)}" alt="" onerror="this.style.display='none'">`
          : '';
        const nameHtml = hasNickname
          ? `<span class="public-msg-nickname">${escapeHtml(m.nickname)}</span>`
          : `<span class="public-msg-anon">Anonymous</span>`;
        return `
          <div class="public-msg">
            <div class="public-msg-header">
              ${avatarHtml}
              ${nameHtml}
            </div>
            <p class="public-msg-content">${escapeHtml(m.content)}</p>
            <span class="public-msg-time">${formatTime(m.created_at)}</span>
          </div>`;
      }).join('');
    }
  }

  // ── 置顶消息 ───────────────────────────────────────────────
  if (CONFIG.settings.showPinned && CONFIG.pinnedMessages?.length) {
    const pinnedSection = document.getElementById('pinned-section');
    const pinnedList = document.getElementById('pinned-list');
    const pinnedToggle = document.getElementById('pinned-toggle');
    if (pinnedSection && pinnedList && pinnedToggle) {
      pinnedSection.style.display = 'block';
      pinnedToggle.addEventListener('click', () => {
        const isHidden = pinnedList.style.display === 'none';
        pinnedList.style.display = isHidden ? 'block' : 'none';
        pinnedToggle.textContent = isHidden ? '收起 ▴' : '置顶消息 ▾';
      });
      pinnedList.innerHTML = CONFIG.pinnedMessages.map(m => `
        <div class="pinned-item">
          <p class="pinned-content">${escapeHtml(m.content)}</p>
          <span class="pinned-time">${formatTime(m.created_at)}</span>
        </div>
      `).join('');
    }
  }

  // 漂浮留言墙
  Bubbles.init();

  // 初始化访客身份
  let visitorId;
  try {
    visitorId = await Visitor.init();
  } catch (e) {
    console.error('init visitor failed', e);
  }

  // ── DOM 引用 ───────────────────────────────────────────────
  const form = document.getElementById('message-form');
  const textarea = document.getElementById('message-content');
  const imageInput = document.getElementById('image-url');
  const contactInput = document.getElementById('contact');
  const contactGroup = document.getElementById('contact-group');
  const contactLabel = document.getElementById('contact-label');
  const submitBtn = document.getElementById('submit-btn');
  const feedbackEl = document.getElementById('feedback');
  const historySection = document.getElementById('history-section');
  const historyToggle = document.getElementById('history-toggle');
  const historyList = document.getElementById('history-list');
  const charCount = document.getElementById('char-count');
  const honeypotInput = document.getElementById('_hp'); // 隐藏的防机器人字段

  // ── 语言切换 ───────────────────────────────────────────────
  // ── 语言菜单 ───────────────────────────────────────────────
  const langToggle = document.getElementById('lang-toggle');
  const langMenu   = document.getElementById('lang-menu');

  function renderLangMenu() {
    langMenu.innerHTML = I18n.langs().map(({ key, label }) => `
      <div class="lang-menu-item ${key === I18n.currentLang() ? 'active' : ''}" data-lang="${key}">
        <span>${label}</span>
        ${key === I18n.currentLang() ? '<span class="lang-menu-check">✓</span>' : ''}
      </div>
    `).join('');

    langMenu.querySelectorAll('.lang-menu-item').forEach(item => {
      item.addEventListener('click', async () => {
        const lang = item.dataset.lang;
        if (lang === I18n.currentLang()) { langMenu.style.display = 'none'; return; }
        await I18n.load(lang);
        applySiteTitle();
        charCount.textContent = `${textarea.value.length} / ${MAX_CHARS}`;
        langMenu.style.display = 'none';
      });
    });
  }

  if (langToggle && langMenu) {
    langToggle.addEventListener('click', e => {
      e.stopPropagation();
      const isHidden = langMenu.style.display === 'none';
      if (isHidden) {
        // 定位到按钮上方
        const rect = langToggle.getBoundingClientRect();
        langMenu.style.display = 'block';
        renderLangMenu();
        const menuH = langMenu.offsetHeight;
        langMenu.style.position = 'fixed';
        langMenu.style.left = `${rect.left}px`;
        langMenu.style.top  = `${rect.top - menuH - 6}px`;
      } else {
        langMenu.style.display = 'none';
      }
    });

    // 点击外部关闭
    document.addEventListener('click', () => { langMenu.style.display = 'none'; });
    langMenu.addEventListener('click', e => e.stopPropagation());
  }

  // ── 提交间隔限制 ───────────────────────────────────────────
  let lastSubmitTime = 0;
  const MIN_INTERVAL = 2000;

  // ── 应用设置 ───────────────────────────────────────────────

  // 暂停留言
  if (!S.allowMessages) {
    form.style.display = 'none';
    feedbackEl.className = 'feedback error';
    feedbackEl.innerHTML = '<strong>留言暂时关闭</strong><p>管理员暂停了留言功能，请稍后再试。</p>';
    feedbackEl.classList.remove('hidden');
  }

  // 强制联系方式
  if (S.requireContact) {
    contactInput.required = true;
    contactLabel.textContent = '联系方式（必填）';
  }

  // 历史记录开关：开启时才显示，默认隐藏在HTML里
  if (S.showHistory) {
    historySection.style.display = 'block';
  }

  // 字数限制
  const MAX_CHARS = S.maxMessageLength || 2000;
  charCount.textContent = `0 / ${MAX_CHARS}`;

  // ── 字数统计 ───────────────────────────────────────────────
  textarea.addEventListener('input', () => {
    const len = textarea.value.length;
    charCount.textContent = `${len} / ${MAX_CHARS}`;
    charCount.classList.toggle('over', len > MAX_CHARS);
  });

  // ── 提交表单 ───────────────────────────────────────────────
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!S.allowMessages) return;

    const content = textarea.value.trim();
    if (!content) {
      showFeedback('error', I18n.t('feedback.message_required'));
      return;
    }
    if (content.length > MAX_CHARS) return;

    if (S.requireContact && !contactInput.value.trim()) {
      showFeedback('error', '请填写联系方式');
      return;
    }

    // 前端提交间隔限制
    const now = Date.now();
    if (now - lastSubmitTime < MIN_INTERVAL) {
      showFeedback('error', '提交太频繁，请稍等片刻');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = I18n.t('form.submitting');

    try {
      const sentContent = content;
      const sentImageUrl = imageInput.value.trim();
      await DB.sendMessage({
        visitorId,
        content: sentContent,
        imageUrl: sentImageUrl,
        contact: contactInput.value.trim(),
        honeypot: honeypotInput?.value ?? '',
      });
      lastSubmitTime = Date.now();
      showSentConfirm(sentContent, sentImageUrl);
      form.reset();
      charCount.textContent = `0 / ${MAX_CHARS}`;
      if (S.showHistory && historyList.style.display !== 'none') loadHistory();
    } catch (err) {
      console.error(err);
      showFeedback('error', err.message || I18n.t('feedback.error_body'));
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = I18n.t('form.submit');
    }
  });

  // ── 发送确认（替代成功提示）──────────────────────────────
  function showSentConfirm(content, imageUrl) {
    feedbackEl.className = 'feedback success';
    feedbackEl.innerHTML = `
      <strong>${I18n.t('feedback.success_title')}</strong>
      <div class="sent-preview">
        <p class="sent-content">${escapeHtml(content)}</p>
        ${imageUrl ? `<a href="${escapeHtml(imageUrl)}" target="_blank" class="sent-img-link">🖼 附带图片</a>` : ''}
      </div>
      <button class="send-another-btn" id="send-another">${I18n.t('feedback.send_another')}</button>
    `;
    feedbackEl.classList.remove('hidden');
    document.getElementById('send-another').addEventListener('click', () => {
      feedbackEl.className = 'feedback hidden';
    });
  }

  // ── 错误反馈 ───────────────────────────────────────────────
  function showFeedback(type, msg) {
    feedbackEl.className = `feedback ${type}`;
    feedbackEl.innerHTML = `<strong>${type === 'error' ? I18n.t('feedback.error_title') : ''}</strong><p>${msg}</p>`;
    feedbackEl.classList.remove('hidden');
    if (type === 'error') {
      setTimeout(() => { feedbackEl.className = 'feedback hidden'; }, 4000);
    }
  }

  // ── 历史记录 ───────────────────────────────────────────────
  if (S.showHistory) {
    historyToggle.addEventListener('click', () => {
      const isHidden = !historyList.style.display || historyList.style.display === 'none';
      historyList.style.display = isHidden ? 'block' : 'none';
      historyToggle.textContent = isHidden ? I18n.t('history.toggle_hide') : I18n.t('history.toggle_show');
      if (isHidden) loadHistory();
    });
  }

  async function loadHistory() {
    historyList.innerHTML = `<p class="loading">${I18n.t('admin.loading')}</p>`;
    try {
      const messages = await DB.getMyMessages(visitorId);
      if (!messages.length) {
        historyList.innerHTML = `<p class="empty">${I18n.t('history.empty')}</p>`;
        return;
      }
      historyList.innerHTML = messages.map(m => `
        <div class="history-item">
          <p class="history-content">${escapeHtml(m.content)}</p>
          ${m.image_url ? `<a href="${escapeHtml(m.image_url)}" target="_blank" class="history-img-link">查看图片</a>` : ''}
          <span class="history-time">${formatTime(m.created_at)}</span>
          <div class="history-replies" id="history-replies-${m.id}">
            <p class="loading" style="font-size:0.78rem;">加载回复…</p>
          </div>
        </div>
      `).join('');
      // 并行加载每条消息的回复
      messages.forEach(async m => {
        try {
          const replies = await DB.getReplies(m.id);
          const el = document.getElementById(`history-replies-${m.id}`);
          if (!el) return;
          if (!replies.length) { el.innerHTML = ''; return; }
          el.innerHTML = replies.map(r => `
            <div class="history-reply">
              <span class="history-reply-label">回复</span>
              <p class="history-reply-content">${escapeHtml(r.content)}</p>
              <span class="history-reply-time">${formatTime(r.created_at)}</span>
            </div>
          `).join('');
        } catch { document.getElementById(`history-replies-${m.id}`)?.remove(); }
      });
    } catch {
      historyList.innerHTML = `<p class="empty">${I18n.t('feedback.error_body')}</p>`;
    }
  }

  // ── 名片 ───────────────────────────────────────────────────
  const CARD_STORAGE = 'mssk_card';

  function loadCardFromStorage() {
    try { return JSON.parse(localStorage.getItem(CARD_STORAGE) || 'null'); } catch { return null; }
  }

  function saveCardToStorage(card) {
    localStorage.setItem(CARD_STORAGE, JSON.stringify(card));
  }

  function updateCardPreview(nickname, avatarUrl, bio) {
    const preview  = document.getElementById('card-preview');
    const avatarEl = document.getElementById('card-avatar-preview');
    const nickEl   = document.getElementById('card-nickname-preview');
    const bioEl    = document.getElementById('card-bio-preview');
    const hasAny   = nickname || avatarUrl || bio;
    preview.style.display = hasAny ? 'flex' : 'none';
    if (avatarUrl) { avatarEl.src = avatarUrl; avatarEl.style.display = 'block'; }
    else avatarEl.style.display = 'none';
    nickEl.textContent = nickname || '';
    bioEl.textContent  = bio ? `签名：${bio}` : '';
  }

  const cardToggle  = document.getElementById('card-toggle');
  const cardForm    = document.getElementById('card-form');
  const cardNickEl  = document.getElementById('card-nickname');
  const cardAvatarEl = document.getElementById('card-avatar');
  const cardBioEl   = document.getElementById('card-bio');
  const cardSaveBtn = document.getElementById('card-save-btn');

  // 从本地读取并填入表单
  const savedCard = loadCardFromStorage();
  if (savedCard) {
    cardNickEl.value   = savedCard.nickname  || '';
    cardAvatarEl.value = savedCard.avatarUrl || '';
    cardBioEl.value    = savedCard.bio       || '';
    updateCardPreview(savedCard.nickname, savedCard.avatarUrl, savedCard.bio);
  }

  // 头像 URL 实时预览
  cardAvatarEl.addEventListener('input', () => {
    updateCardPreview(cardNickEl.value, cardAvatarEl.value, cardBioEl.value);
  });
  cardNickEl.addEventListener('input', () => {
    updateCardPreview(cardNickEl.value, cardAvatarEl.value, cardBioEl.value);
  });
  cardBioEl.addEventListener('input', () => {
    updateCardPreview(cardNickEl.value, cardAvatarEl.value, cardBioEl.value);
  });

  cardToggle.addEventListener('click', () => {
    const isHidden = cardForm.style.display === 'none';
    cardForm.style.display = isHidden ? 'block' : 'none';
    cardToggle.textContent = isHidden ? '名片 ▴' : '名片 ▾';
  });

  cardSaveBtn.addEventListener('click', async () => {
    if (!visitorId) return;
    cardSaveBtn.disabled = true;
    cardSaveBtn.textContent = '保存中…';
    const card = {
      nickname:  cardNickEl.value.trim(),
      avatarUrl: cardAvatarEl.value.trim(),
      bio:       cardBioEl.value.trim(),
    };
    try {
      await DB.updateCard(visitorId, card);
      saveCardToStorage(card);
      updateCardPreview(card.nickname, card.avatarUrl, card.bio);
      cardSaveBtn.textContent = '✓ 已保存';
      setTimeout(() => { cardSaveBtn.textContent = '保存名片'; cardSaveBtn.disabled = false; }, 2000);
    } catch {
      cardSaveBtn.textContent = '保存失败，重试';
      cardSaveBtn.disabled = false;
    }
  });

  function escapeHtml(str = '') {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function formatTime(iso) {
    return new Date(iso).toLocaleString('zh-CN');
  }
})();