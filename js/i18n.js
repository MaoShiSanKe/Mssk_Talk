// ============================================================
// i18n.js — 多语言支持
// 扩展新语言：在 i18n/ 目录下新增 xx.json，然后在 LANGS 中注册
// ============================================================

const I18n = (() => {
  const LANGS = {
    zh: './i18n/zh.json',
    en: './i18n/en.json',
  };

  let _strings = {};
  let _lang = CONFIG.defaultLang;

  async function load(lang) {
    if (!LANGS[lang]) lang = CONFIG.defaultLang;
    _lang = lang;
    const res = await fetch(LANGS[lang]);
    _strings = await res.json();
    localStorage.setItem(CONFIG.storage.lang, lang);
    _applyToDOM();
  }

  // 获取翻译字符串，支持点路径如 "form.submit"
  function t(key) {
    const parts = key.split('.');
    let val = _strings;
    for (const p of parts) {
      val = val?.[p];
    }
    return val ?? key;
  }

  // 自动将带 data-i18n 属性的元素替换文案
  function _applyToDOM() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const attr = el.getAttribute('data-i18n-attr');
      if (attr) {
        el.setAttribute(attr, t(key));
      } else {
        el.textContent = t(key);
      }
    });
  }

  function currentLang() { return _lang; }

  return { load, t, currentLang };
})();