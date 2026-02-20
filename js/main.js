// js/main.js — 用户前端逻辑

(async () => {
  // 先加载服务端配置
  try {
    await CONFIG.init();
  } catch (e) {
    document.body.innerHTML = '<p style="text-align:center;padding:40px;color:#888">服务暂时不可用，请稍后再试。</p>';
    return;
  }

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
  const submitBtn = document.getElementById('submit-btn');
  const feedbackEl = document.getElementById('feedback');
  const historyToggle = document.getElementById('history-toggle');
  const historyList = document.getElementById('history-list');
  const charCount = document.getElementById('char-count');

  // ── 字数统计 ───────────────────────────────────────────────
  const MAX_CHARS = 2000;
  textarea.addEventListener('input', () => {
    const len = textarea.value.length;
    charCount.textContent = `${len} / ${MAX_CHARS}`;
    charCount.classList.toggle('over', len > MAX_CHARS);
  });

  // ── 提交表单 ───────────────────────────────────────────────
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const content = textarea.value.trim();
    if (!content) {
      showFeedback('error', I18n.t('feedback.message_required'));
      return;
    }
    if (content.length > MAX_CHARS) return;

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
      await DB.sendMessage({
        visitorId,
        content,
        imageUrl: imageInput.value.trim(),
        contact: contactInput.value.trim(),
      });
      showFeedback('success');
      form.reset();
      charCount.textContent = `0 / ${MAX_CHARS}`;
      if (historyList.style.display !== 'none') loadHistory();
    } catch (err) {
      console.error(err);
      showFeedback('error', I18n.t('feedback.error_body'));
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = I18n.t('form.submit');
    }
  });

  // ── 反馈显示 ───────────────────────────────────────────────
  function showFeedback(type, msg) {
    feedbackEl.className = `feedback ${type}`;
    if (type === 'success') {
      feedbackEl.innerHTML = `
        <strong>${I18n.t('feedback.success_title')}</strong>
        <p>${I18n.t('feedback.success_body')}</p>
        <button onclick="document.getElementById('feedback').className='feedback hidden'">${I18n.t('feedback.send_another')}</button>
      `;
    } else {
      feedbackEl.innerHTML = `<strong>${I18n.t('feedback.error_title')}</strong><p>${msg}</p>`;
      setTimeout(() => { feedbackEl.className = 'feedback hidden'; }, 4000);
    }
    feedbackEl.classList.remove('hidden');
  }

  // ── 历史记录 ───────────────────────────────────────────────
  historyToggle.addEventListener('click', () => {
    const isHidden = !historyList.style.display || historyList.style.display === 'none';
    historyList.style.display = isHidden ? 'block' : 'none';
    historyToggle.textContent = isHidden ? I18n.t('history.toggle_hide') : I18n.t('history.toggle_show');
    if (isHidden) loadHistory();
  });

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
