// ============================================================
// i18n.js — 多语言支持
// 扩展新语言：在 i18n/ 目录下新增 xx.json，然后在 LANGS 中注册
// ============================================================

const I18n = (() => {
  const LANGS = {
    zh: { url: './i18n/zh.json', label: '中文' },
    en: { url: './i18n/en.json', label: 'English' },
    kr: { url: './i18n/kr.json', label: '한국어' },
  };

  const LANG_KEYS = Object.keys(LANGS);

  let _strings = {};
  let _fallback = {}; // 中文基准包，用于回退
  let _lang = CONFIG.defaultLang;

  async function load(lang) {
    if (!LANGS[lang]) lang = CONFIG.defaultLang;
    _lang = lang;

    // 始终加载中文作为回退基准
    if (!Object.keys(_fallback).length || lang === CONFIG.defaultLang) {
      const fbRes = await fetch(LANGS[CONFIG.defaultLang].url);
      _fallback = await fbRes.json();
    }

    if (lang === CONFIG.defaultLang) {
      _strings = _fallback;
    } else {
      const res = await fetch(LANGS[lang].url);
      _strings = await res.json();
    }

    localStorage.setItem(CONFIG.storage.lang, lang);
    _applyToDOM();
  }

  // 获取翻译字符串，缺失时回退到中文
  function t(key) {
    const parts = key.split('.');
    let val = _strings;
    for (const p of parts) val = val?.[p];
    if (val !== undefined && val !== null) return val;
    // 回退到中文基准
    let fb = _fallback;
    for (const p of parts) fb = fb?.[p];
    return fb ?? key;
  }

  function _applyToDOM() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const attr = el.getAttribute('data-i18n-attr');
      if (attr) el.setAttribute(attr, t(key));
      else el.textContent = t(key);
    });
  }

  function nextLang() {
    const idx = LANG_KEYS.indexOf(_lang);
    return LANG_KEYS[(idx + 1) % LANG_KEYS.length];
  }

  function labelOf(lang) {
    return LANGS[lang]?.label ?? lang;
  }

  // 返回完整语言列表，供菜单渲染
  function langs() {
    return LANG_KEYS.map(key => ({ key, label: LANGS[key].label }));
  }

  function currentLang() { return _lang; }

  return { load, t, currentLang, nextLang, labelOf, langs };
})();