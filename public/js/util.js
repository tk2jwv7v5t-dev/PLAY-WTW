/* أدوات مشتركة */

const svg = (p) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
export const I = {
  mic: svg('<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/>'),
  micOff: svg('<path d="m2 2 20 20"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><path d="M12 19v3"/>'),
  headphones: svg('<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>'),
  headphonesOff: svg('<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/><path d="m2 2 20 20"/>'),
  monitor: svg('<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>'),
  monitorOff: svg('<path d="M17 17H4a2 2 0 0 1-2-2V5c0-1.5 1-2 1-2"/><path d="M22 15V5a2 2 0 0 0-2-2H9"/><path d="M8 21h8"/><path d="M12 17v4"/><path d="m2 2 20 20"/>'),
  sliders: svg('<path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M2 14h4"/><path d="M10 8h4"/><path d="M18 16h4"/>'),
  cog: svg('<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>'),
  phoneOff: svg('<path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><path d="M22 2 2 22"/>'),
  send: svg('<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>'),
  x: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  plus: svg('<path d="M12 5v14"/><path d="M5 12h14"/>'),
  hash: svg('<path d="M4 9h16"/><path d="M4 15h16"/><path d="M10 3 8 21"/><path d="M16 3l-2 18"/>'),
  volume: svg('<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>'),
  volumeOff: svg('<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/>'),
  chevron: svg('<path d="m6 9 6 6 6-6"/>'),
  userPlus: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/>'),
  users: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
  edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  trash: svg('<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
  logOut: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>'),
  menu: svg('<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>'),
  eye: svg('<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: svg('<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="m2 2 20 20"/>'),
  minimize: svg('<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>'),
  help: svg('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>'),
  camera: svg('<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>'),
  pip: svg('<rect width="20" height="14" x="2" y="4" rx="2"/><rect width="9" height="6" x="11" y="10" rx="1"/>'),
  maximize: svg('<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>'),
  focus: svg('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/>'),
  activity: svg('<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>'),
  crown: svg('<path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7z"/><path d="M5 20h14"/>'),
};

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const clean = (s, max = 32) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function fillIcons(root = document) {
  for (const el of $$('[data-icon]', root)) el.innerHTML = I[el.dataset.icon] || '';
}

export function avatar(user, cls = '') {
  const name = user?.display || user?.username || '؟';
  return `<div class="avatar ${cls}" style="--h:${user?.hue ?? 250}">${esc([...name.trim()][0] || '؟')}</div>`;
}

export const linkify = (html) =>
  html.replace(/\bhttps?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);

export function timeLabel(ts) {
  const d = new Date(ts), now = new Date();
  const t = d.toLocaleTimeString('ar', { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `اليوم ${t}`;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `أمس ${t}`;
  return `${d.toLocaleDateString('ar', { day: 'numeric', month: 'short' })} ${t}`;
}

export const store = {
  get(k, d) { try { const v = localStorage.getItem('pw:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('pw:' + k, JSON.stringify(v)); } catch { /* تجاهل */ } },
};

export function toast(text, type = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = text;
  $('#toasts').append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 3800);
}

let fxCtx = null;
export function beep(kind, enabled = true) {
  if (!enabled) return;
  const seq = {
    join: [[620, 0], [930, 0.08]], leave: [[700, 0], [440, 0.09]], msg: [[980, 0]],
    on: [[540, 0], [810, 0.06]], off: [[620, 0], [400, 0.06]],
  }[kind];
  try {
    fxCtx ??= new AudioContext();
    if (fxCtx.state === 'suspended') fxCtx.resume();
    for (const [f, t] of seq) {
      const o = fxCtx.createOscillator(), g = fxCtx.createGain(), t0 = fxCtx.currentTime + t;
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.06, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15);
      o.connect(g).connect(fxCtx.destination);
      o.start(t0); o.stop(t0 + 0.17);
    }
  } catch { /* تجاهل */ }
}

export const ERRORS = {
  bad_username: 'اسم المستخدم لازم يكون 3–20 حرف إنجليزي صغير أو أرقام أو _ .',
  bad_password: 'كلمة المرور لازم تكون 8 أحرف أو أكثر',
  username_taken: 'اسم المستخدم محجوز، جرّب غيره',
  bad_credentials: 'اسم المستخدم أو كلمة المرور غلط',
  wrong_password: 'كلمة المرور غلط',
  bad_image: 'الملف مو صورة، أو نوعه ما ينقبل. جرّب PNG أو JPG',
  image_too_big: 'الصورة كبيرة، جرّب صورة ثانية',
  too_many_attempts: 'محاولات كثير — انتظر شوي وجرّب',
  bad_invite: 'كود الدعوة غلط أو القروب انحذف',
  bad_name: 'اكتب اسم',
  too_many_servers: 'وصلت الحد الأعلى للقروبات اللي تقدر تسويها',
  too_many_channels: 'القروب وصل الحد الأعلى للرومات',
  owner_cannot_leave: 'انت صاحب القروب — تقدر تحذفه بدل ما تطلع',
  forbidden: 'ما عندك صلاحية',
  slow_down: 'شوي شوي 😅 انتظر ثواني',
  server_error: 'صار خطأ في السيرفر، جرّب مرة ثانية',
  network: 'تأكد من اتصالك بالنت',
};
