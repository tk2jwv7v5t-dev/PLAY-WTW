/* =====================================================
   الشاشة الافتتاحية
   "PLAY WTW" تنفك حروفها وتصير "PLAY WITH ME AND TALK WITH ME"
   مع خلفية نقاط متصلة تتفاعل مع الماوس.
   ===================================================== */
import { $, $$ } from './util.js';

export function startIntro({ onGo }) {
  const intro = $('#intro');
  const logo = $('#logoAnim');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const timers = [];

  $$('.k', logo).forEach((k, i) => k.style.setProperty('--i', i));
  $$('.x', logo).forEach((x, i) => x.style.setProperty('--d', i));

  function play() {
    timers.splice(0).forEach(clearTimeout);
    logo.classList.remove('ready', 'open');
    intro.classList.remove('show-cta');
    void logo.offsetWidth;
    logo.classList.add('ready');
    timers.push(setTimeout(() => logo.classList.add('open'), reduce ? 0 : 1300));
    timers.push(setTimeout(() => intro.classList.add('show-cta'), reduce ? 0 : 2500));
  }
  play();
  logo.addEventListener('click', play);

  // الشعار يميل مع الماوس، والإضاءة تلحقه
  const onMove = (e) => {
    const x = e.clientX / innerWidth - 0.5, y = e.clientY / innerHeight - 0.5;
    if (!reduce) logo.style.transform = `perspective(900px) rotateX(${(-y * 10).toFixed(2)}deg) rotateY(${(x * 14).toFixed(2)}deg)`;
    intro.style.setProperty('--mx', `${e.clientX}px`);
    intro.style.setProperty('--my', `${e.clientY}px`);
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true;
  };
  intro.addEventListener('pointermove', onMove);
  intro.addEventListener('pointerleave', () => { mouse.active = false; logo.style.transform = ''; });

  // ---- النقاط ----
  const canvas = $('#introFx');
  const g = canvas.getContext('2d');
  const mouse = { x: 0, y: 0, active: false };
  let pts = [], w = 0, h = 0, dpr = 1, raf = 0;

  function resize() {
    dpr = Math.min(2, devicePixelRatio || 1);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.min(120, Math.round((w * h) / 14000));
    pts = Array.from({ length: n }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
      r: Math.random() * 1.6 + 0.6,
    }));
  }

  function burst(x, y) {
    for (const p of pts) {
      const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy) || 1;
      if (d < 260) { p.vx += (dx / d) * (3 - d / 100); p.vy += (dy / d) * (3 - d / 100); }
    }
  }
  intro.addEventListener('pointerdown', (e) => { if (!e.target.closest('button')) burst(e.clientX, e.clientY); });

  function frame() {
    g.clearRect(0, 0, w, h);
    const link = 130;
    for (const p of pts) {
      if (mouse.active) {
        const dx = mouse.x - p.x, dy = mouse.y - p.y, d = Math.hypot(dx, dy);
        if (d < 200 && d > 1) { p.vx += (dx / d) * 0.012; p.vy += (dy / d) * 0.012; }
      }
      p.vx *= 0.985; p.vy *= 0.985;
      const sp = Math.hypot(p.vx, p.vy);
      if (sp < 0.12) { p.vx += (Math.random() - 0.5) * 0.04; p.vy += (Math.random() - 0.5) * 0.04; }
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      p.x = Math.max(0, Math.min(w, p.x)); p.y = Math.max(0, Math.min(h, p.y));
    }
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      for (let j = i + 1; j < pts.length; j++) {
        const b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < link) {
          g.strokeStyle = `rgba(170, 150, 255, ${(1 - d / link) * 0.2})`;
          g.lineWidth = 1;
          g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
        }
      }
      if (mouse.active) {
        const d = Math.hypot(a.x - mouse.x, a.y - mouse.y);
        if (d < 180) {
          g.strokeStyle = `rgba(255, 181, 71, ${(1 - d / 180) * 0.4})`;
          g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(mouse.x, mouse.y); g.stroke();
        }
      }
      g.fillStyle = 'rgba(240, 232, 255, .8)';
      g.beginPath(); g.arc(a.x, a.y, a.r, 0, Math.PI * 2); g.fill();
    }
    raf = requestAnimationFrame(frame);
  }

  resize();
  addEventListener('resize', resize);
  if (!reduce) raf = requestAnimationFrame(frame);
  else frame(), cancelAnimationFrame(raf);

  const go = () => onGo();
  $('#introGo').addEventListener('click', go);
  const onKey = (e) => { if (e.key === 'Enter' && !intro.classList.contains('hidden')) go(); };
  addEventListener('keydown', onKey);

  return {
    stop() {
      cancelAnimationFrame(raf);
      removeEventListener('resize', resize);
      removeEventListener('keydown', onKey);
      timers.forEach(clearTimeout);
    },
  };
}
