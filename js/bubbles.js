// js/bubbles.js — 漂浮留言墙
// DVD logo 风格，气泡在背景空间内反弹漂移
// 依赖 CONFIG.featuredBubbles 和 CONFIG.settings.showFeatured

const Bubbles = (() => {
  const SIZES = [
    { cls: 'bubble-sm', fontSize: '0.78rem', pad: '6px 12px' },
    { cls: 'bubble-md', fontSize: '0.9rem',  pad: '8px 14px' },
    { cls: 'bubble-lg', fontSize: '1rem',    pad: '10px 16px' },
  ];

  const SPEED_MIN = 0.3;  // px/frame
  const SPEED_MAX = 0.7;
  const SCALE_DURATION = 8000;  // 大小渐变周期 ms

  let container = null;
  let bubbles = [];
  let animFrame = null;
  let lastTime = null;

  function init() {
    if (!CONFIG.settings.showFeatured) return;
    const msgs = CONFIG.featuredBubbles;
    if (!msgs || !msgs.length) return;

    container = document.getElementById('bubble-layer');
    if (!container) return;
    container.style.display = 'block';

    // 创建气泡 DOM
    msgs.forEach((msg, i) => {
      const sizeIdx = i % SIZES.length;
      const size = SIZES[sizeIdx];

      const el = document.createElement('div');
      el.className = `bubble ${size.cls}`;
      el.textContent = msg.content;
      el.style.fontSize = size.fontSize;
      el.style.padding = size.pad;
      container.appendChild(el);

      // 随机初始位置
      const x = Math.random() * (window.innerWidth - 160);
      const y = Math.random() * (window.innerHeight - 60);

      // 随机速度方向
      const angle = Math.random() * Math.PI * 2;
      const speed = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN);

      // 大小呼吸：每个气泡错开相位
      const scalePhase = (i / msgs.length) * Math.PI * 2;

      bubbles.push({
        el,
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        scalePhase,
        paused: false,
        w: 0, h: 0, // 实际宽高在首帧测量
      });

      // 鼠标悬停暂停
      el.addEventListener('mouseenter', () => {
        const b = bubbles.find(b => b.el === el);
        if (b) b.paused = true;
        el.classList.add('bubble-hover');
      });
      el.addEventListener('mouseleave', () => {
        const b = bubbles.find(b => b.el === el);
        if (b) b.paused = false;
        el.classList.remove('bubble-hover');
      });
    });

    // 首帧测量实际尺寸
    requestAnimationFrame(() => {
      bubbles.forEach(b => {
        const rect = b.el.getBoundingClientRect();
        b.w = rect.width;
        b.h = rect.height;
        b.el.style.transform = `translate(${b.x}px, ${b.y}px)`;
      });
      lastTime = performance.now();
      animFrame = requestAnimationFrame(tick);
    });
  }

  function tick(now) {
    const dt = Math.min(now - lastTime, 32); // 最大32ms，防止切换标签后跳跃
    lastTime = now;

    const W = window.innerWidth;
    const H = window.innerHeight;
    const t = now;

    bubbles.forEach(b => {
      if (b.paused) return;

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // 边缘碰撞反弹
      if (b.x < 0) { b.x = 0; b.vx = Math.abs(b.vx); }
      if (b.y < 0) { b.y = 0; b.vy = Math.abs(b.vy); }
      if (b.x + b.w > W) { b.x = W - b.w; b.vx = -Math.abs(b.vx); }
      if (b.y + b.h > H) { b.y = H - b.h; b.vy = -Math.abs(b.vy); }

      // 大小呼吸：0.85 ~ 1.1
      const scale = 0.85 + 0.25 * (0.5 + 0.5 * Math.sin((t / SCALE_DURATION * Math.PI * 2) + b.scalePhase));

      b.el.style.transform = `translate(${b.x}px, ${b.y}px) scale(${scale.toFixed(3)})`;
    });

    animFrame = requestAnimationFrame(tick);
  }

  function destroy() {
    if (animFrame) cancelAnimationFrame(animFrame);
    bubbles = [];
    if (container) container.innerHTML = '';
  }

  return { init, destroy };
})();