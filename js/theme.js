// js/theme.js — 日/夜模式 + 后台配色方案切换

const Theme = (() => {
  const THEME_KEY  = 'mssk_theme';   // light | dark
  const SCHEME_KEY = 'mssk_scheme';  // warm | cool（仅后台用）

  // ── 日/夜模式 ──────────────────────────────────────────────
  function currentTheme() {
    return localStorage.getItem(THEME_KEY) || 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : '');
    localStorage.setItem(THEME_KEY, theme);
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      btn.textContent = theme === 'dark' ? '☀️' : '🌙';
      btn.title = theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式';
    });
  }

  function toggleTheme() {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
  }

  // ── 后台配色方案（暖色/冷色）─────────────────────────────
  function currentScheme() {
    return localStorage.getItem(SCHEME_KEY) || 'warm';
  }

  function applyScheme(scheme) {
    document.documentElement.setAttribute('data-scheme', scheme);
    localStorage.setItem(SCHEME_KEY, scheme);
    document.querySelectorAll('.scheme-toggle').forEach(btn => {
      btn.textContent = scheme === 'cool' ? '🟤 暖色' : '🔵 冷色';
      btn.title = scheme === 'cool' ? '切换到暖色方案' : '切换到冷色方案';
    });
  }

  function toggleScheme() {
    applyScheme(currentScheme() === 'warm' ? 'cool' : 'warm');
  }

  // ── 初始化 ─────────────────────────────────────────────────
  function init() {
    applyTheme(currentTheme());
    // 仅后台页面有 scheme-toggle，前台忽略
    if (document.querySelector('.scheme-toggle') !== null ||
        document.getElementById('admin-screen') !== null) {
      applyScheme(currentScheme());
    }
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      btn.addEventListener('click', toggleTheme);
    });
    document.querySelectorAll('.scheme-toggle').forEach(btn => {
      btn.addEventListener('click', toggleScheme);
    });
  }

  return { init, toggleTheme, toggleScheme, currentTheme, currentScheme };
})();

Theme.init();