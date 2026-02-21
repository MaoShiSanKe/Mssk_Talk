// js/theme.js — 日/夜模式切换
// 在需要的页面引入此文件即可

const Theme = (() => {
  const KEY = 'mssk_theme';

  function current() {
    return localStorage.getItem(KEY) || 'light';
  }

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : '');
    localStorage.setItem(KEY, theme);
    // 更新所有切换按钮图标
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      btn.textContent = theme === 'dark' ? '☀️' : '🌙';
      btn.title = theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式';
    });
  }

  function toggle() {
    apply(current() === 'dark' ? 'light' : 'dark');
  }

  // 页面加载时立即应用，避免闪烁
  function init() {
    apply(current());
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      btn.addEventListener('click', toggle);
    });
  }

  return { init, toggle, current };
})();

// 尽早执行避免主题闪烁
Theme.init();