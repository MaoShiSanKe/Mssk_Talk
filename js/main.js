// js/main.js — 用户前端逻辑

(async () => {
  // 先加载服务端配置（含 settings）
  try {
    await CONFIG.init();
  } catch (e) {
    document.body.innerHTML = '<p style="text-align:center;padding:40px;color:#888">服务暂时不可用，请稍后再试。</p>';
    return;
  }

  const S = CONFIG.settings; // 简写

  // 初始化语言
  const savedLang = localStorage.getItem(CONFIG.storage.lang) || CONFIG.defaultLang;
  await I18n.load(savedLang);

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

  // 历史记录开关
  if (!S.showHistory) {
    historySection.style.display = 'none';
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

  // ── 每日限制检查 ───────────────────────────────────────────
  function checkDailyLimit() {
    if (!S.dailyLimit) return false; // 0 = 不限制
    const key = `mssk_daily_${visitorId}_${new Date().toDateString()}`;
    const count = parseInt(localStorage.getItem(key) ?? '0');
    return count >= S.dailyLimit;
  }

  function incrementDailyCount() {
    if (!S.dailyLimit) return;
    const key = `mssk_daily_${visitorId}_${new Date().toDateString()}`;
    const count = parseInt(localStorage.getItem(key) ?? '0');
    localStorage.setItem(key, count + 1);
  }

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

    if (checkDailyLimit()) {
      showFeedback('error', `今日留言已达上限（${S.dailyLimit} 条），请明天再试。`);
      return;
    }

    try {
      const blocked = await DB.isBlocked(visitorId);
      if (blocked) {
        showFeedback('error', I18n.t('feedback.blocked'));
        return;
      }
    } catch { /* 网络问题则继续 */ }

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
      });
      incrementDailyCount();
      showSentConfirm(sentContent, sentImageUrl);
      form.reset();
      charCount.textContent = `0 / ${MAX_CHARS}`;
      if (S.showHistory && historyList.style.display !== 'none') loadHistory();
    } catch (err) {
      console.error(err);
      showFeedback('error', I18n.t('feedback.error_body'));
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
        </div>
      `).join('');
    } catch {
      historyList.innerHTML = `<p class="empty">${I18n.t('feedback.error_body')}</p>`;
    }
  }

  function escapeHtml(str = '') {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function formatTime(iso) {
    return new Date(iso).toLocaleString('zh-CN');
  }
})();