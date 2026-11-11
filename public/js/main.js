/* =====================================================
   PLAY WTW — الواجهة
   ===================================================== */
import { I, $, $$, esc, clean, fillIcons, autoLabel, busy, avatar, linkify, timeLabel, timeAgo, store, toast, beep, ERRORS } from './util.js';
import { startIntro } from './intro.js';
import { MicPipeline, LevelWatcher } from './audio.js';
import { VoiceSession } from './voice.js';
import { SUPPORT } from './config.js';
import { pushSupported, isIOS, isStandalone, inApp, registerWorker, currentSubscription, enablePush, disablePush, testPush } from './push.js';

const RES = { 720: [1280, 720], 1080: [1920, 1080], 1440: [2560, 1440], 2160: [3840, 2160] };
const PRESETS = [
  { label: 'موفّر', res: '720', fps: 30, mode: 'balanced' },
  { label: 'FHD', res: '1080', fps: 60, mode: 'balanced' },
  { label: '2K', res: '1440', fps: 60, mode: 'balanced' },
  { label: '4K', res: '2160', fps: 30, mode: 'detail' },
  { label: '4K 60', res: '2160', fps: 60, mode: 'balanced' },
  { label: 'قيمرز', res: '1080', fps: 144, mode: 'motion' },
];
const NS_LABEL = { gtcrn: 'ذكاء اصطناعي قوي', rnnoise: 'ذكاء اصطناعي خفيف', browser: 'المتصفح', off: 'مقفل' };

const settings = Object.assign({
  inDevice: '', outDevice: '', ns: 'rnnoise', gateAuto: true, gateDb: -50,
  inVol: 100, outVol: 100, ec: true, agc: true, sounds: true, userVol: {}, userMute: {},
  notify: false, notifyAll: false, theme: 'light', fontScale: 'md', reduceMotion: false, ptt: false, pttKey: 'KeyV',
}, store.get('settings', {}));
const shareCfg = Object.assign({ res: '1080', fps: 60, mode: 'balanced', brAuto: true, br: 12, audio: true }, store.get('share', {}));
const saveSettings = () => store.set('settings', settings);

/* ---------- الحالة ---------- */
const S = {
  me: null, sid: null, ws: null, wsOpen: false, retry: 0, loggingOut: false,
  servers: new Map(),   // id -> { id, name, icon, owner, invite, channels: [], members: Map }
  users: new Map(),     // uid -> user
  online: new Set(),
  voice: new Map(),     // sid -> { sid, uid, channel, mic, deaf, sharing }
  cur: { server: null, channel: null },
  lastChannel: store.get('lastChannel', {}),
  msgs: new Map(),      // channelId -> { list, loaded, more, loading }
  unread: new Set(),
  typing: new Map(),    // channelId -> Map(uid -> ts)
  pending: new Map(),   // req -> { resolve, reject }
  reqSeq: 0,
  micOn: store.get('micOn', true), deaf: false, hasMic: true,
  myVoice: null, rejoinVoice: null,
  vs: null, screen: null, focus: null,
  audios: new Map(),    // sid -> <audio>
  tiles: new Map(),     // sid -> عنصر البث
  lastTypingSent: 0,
  invite: new URLSearchParams(location.search).get('invite'),
  viewPref: new Map(),  // sid -> الجودة اللي اخترتها لبثه
  prefs: {},            // serverId -> مستوى الإشعارات (all / mentions / none)
  dms: new Map(),       // id -> { id, other, last } المحادثات الخاصة
  blocks: new Set(),    // اللي حظرتهم
  reportCounts: {},     // serverId -> عدد البلاغات المفتوحة (لصاحب القروب)
  attach: null,         // الصورة اللي بترسلها { data, w, h }
  notifs: [],           // قائمة الجرس
  mentions: new Map(),  // channelId -> عدد المنشنات اللي ما شفتها
  pushOn: false,        // إشعارات الجهاز مفعّلة على هذا الجهاز
  openTarget: (() => { const q = new URLSearchParams(location.search); return { channel: q.get('channel'), server: q.get('server'), dm: q.get('dm'), admin: q.get('admin') }; })(),
  popAnchor: null,
};
const mic = new MicPipeline();
const levels = new LevelWatcher((id, sp) => {
  for (const el of $$(`[data-speak="${id}"]`)) el.classList.toggle('speaking', sp);
});
mic.onChange = () => {
  for (const el of $$('[data-speak="me"]')) el.classList.toggle('speaking', mic.speaking && !!S.myVoice);
};
mic.onTrack = (track) => S.vs?.replaceMic(track);
mic.onEnded = () => {
  toast('المايك انفصل — نحاول نرجعه', 'err');
  if (S.myVoice) mic.start(settings).catch(() => {});
};

/* =====================================================
   البداية
   ===================================================== */
fillIcons();
autoLabel();
let introCtl = null;
const meReq = fetch('/api/me', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
meReq.then((d) => {
  if (!d?.user) return;
  $('#introGoText').textContent = `ادخل يا ${d.user.display}`;
  // داخل التطبيق: لو مسجّل دخول ندخله على طول بدون الشاشة الافتتاحية
  if (inApp()) $('#introGo').click();
});
introCtl = startIntro({
  onGo: async () => {
    const d = await meReq;
    introCtl?.stop();
    $('#intro').classList.add('leaving');
    setTimeout(() => $('#intro').classList.add('hidden'), 450);
    if (d?.user) enterApp(d.user); else showAuth();
  },
});

/* =====================================================
   تسجيل الدخول
   ===================================================== */
let authMode = 'login';
function showAuth() {
  $('#app').classList.add('hidden');
  $('#auth').classList.remove('hidden');
  setAuthMode(S.invite ? 'register' : 'login');
  if (S.invite) $('#authSub').textContent = 'عندك دعوة لقروب 🎉 سوّ حساب أو سجّل دخولك عشان تدخل.';
  setTimeout(() => $('#authUser').focus(), 50);
}
function setAuthMode(mode) {
  authMode = mode;
  for (const t of $$('.auth-tab')) t.classList.toggle('active', t.dataset.mode === mode);
  for (const el of $$('.reg-only')) el.classList.toggle('hidden', mode !== 'register');
  $('#authTitle').textContent = mode === 'login' ? 'هلا بعودتك 👋' : 'حياك معنا ✨';
  $('#authSub').textContent = mode === 'login' ? 'سجّل دخولك وكمّل سوالفك.' : 'سوّ حسابك بثواني.';
  $('#authSubmit').textContent = mode === 'login' ? 'دخول' : 'سوّ الحساب';
  $('#authPass').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  $('#authError').textContent = '';
}
$$('.auth-tab').forEach((t) => t.addEventListener('click', () => setAuthMode(t.dataset.mode)));
$('#pwToggle').addEventListener('click', () => {
  const inp = $('#authPass'), show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  $('#pwToggle').innerHTML = show ? I.eyeOff : I.eye;
});
$('#authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = $('#authUser').value.trim().toLowerCase();
  const password = $('#authPass').value;
  const err = $('#authError');
  if (authMode === 'register') {
    if (!/^[a-z0-9_.]{3,20}$/.test(username)) { err.textContent = ERRORS.bad_username; return; }
    if (password.length < 8) { err.textContent = ERRORS.bad_password; return; }
  } else if (!username || !password) { err.textContent = 'اكتب اسم المستخدم وكلمة المرور'; return; }
  const btn = $('#authSubmit');
  btn.disabled = true; err.textContent = '';
  btn.classList.add('is-busy');
  btn.textContent = authMode === 'login' ? 'جاري الدخول…' : 'جاري إنشاء الحساب…';
  try {
    const r = await fetch(`/api/${authMode}`, {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password, display: $('#authDisplay').value }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { err.textContent = ERRORS[d.error] || ERRORS.server_error; return; }
    $('#authPass').value = '';
    enterApp(d.user);
  } catch {
    err.textContent = ERRORS.network;
  } finally {
    btn.disabled = false;
    btn.classList.remove('is-busy');
    btn.textContent = authMode === 'login' ? 'دخول' : 'سوّ الحساب';
  }
});

/* =====================================================
   الاتصال المباشر
   ===================================================== */
function enterApp(user) {
  S.me = user;
  S.users.set(user.id, user);
  $('#auth').classList.add('hidden');
  $('#app').classList.remove('hidden');
  renderAll();
  connect();
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/api/ws`);
  S.ws = ws;
  let opened = false;
  ws.onopen = () => { opened = true; S.wsOpen = true; S.retry = 0; setConn(true); };
  ws.onmessage = (e) => { if (e.data !== 'pong') handle(JSON.parse(e.data)); };
  ws.onclose = async (e) => {
    if (S.ws !== ws) return;
    S.wsOpen = false;
    if (S.loggingOut) return;
    if (e.code === 4001) {
      // انطلع من حسابه (تسجيل خروج من جهاز ثاني، أو تغيير كلمة المرور)
      if (S.myVoice) teardownVoice();
      S.ws = null;
      setConn(true);
      toast('انطلعت من حسابك في هذا الجهاز. سجّل دخولك من جديد', 'err');
      showAuth();
      return;
    }
    setConn(false);
    if (S.myVoice) { S.rejoinVoice = S.myVoice; teardownVoice(); }
    for (const p of S.pending.values()) p.reject(new Error('network'));
    S.pending.clear();
    if (!opened) {
      const d = await fetch('/api/me', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => undefined);
      if (d === null) { S.ws = null; showAuth(); return; } // الجلسة انتهت
    }
    const wait = Math.min(15000, 800 * 2 ** S.retry++);
    setTimeout(() => { if (S.ws === ws) connect(); }, wait);
  };
}
setInterval(() => { if (S.wsOpen) S.ws.send('ping'); }, 25000);

function send(msg) {
  if (S.wsOpen) S.ws.send(JSON.stringify(msg));
}
function request(msg) {
  return new Promise((resolve, reject) => {
    if (!S.wsOpen) { reject(new Error('network')); return; }
    const req = String(++S.reqSeq);
    S.pending.set(req, { resolve, reject });
    setTimeout(() => { if (S.pending.delete(req)) reject(new Error('timeout')); }, 10000);
    send({ ...msg, req });
  });
}
function settle(req, value, error) {
  const p = req && S.pending.get(req);
  if (!p) return false;
  S.pending.delete(req);
  error ? p.reject(new Error(error)) : p.resolve(value);
  return true;
}

function setConn(ok) {
  $('#app').classList.toggle('offline', !ok);
}

function addUsers(list) {
  for (const u of list || []) S.users.set(u.id, u);
}
function addServer(s) {
  const members = new Map(s.members.map((u) => [u.id, u]));
  addUsers(s.members);
  S.servers.set(s.id, { ...s, members });
}

function handle(m) {
  switch (m.t) {
    case 'ready': {
      S.me = m.me; S.sid = m.sid;
      S.users.set(m.me.id, m.me);
      S.servers.clear();
      m.servers.forEach(addServer);
      S.online = new Set(m.online);
      S.voice = new Map(m.voice.map((v) => [v.sid, v]));
      if (!S.servers.has(S.cur.server)) S.cur.server = store.get('lastServer', null);
      if (!S.servers.has(S.cur.server)) S.cur.server = S.servers.keys().next().value || null;
      S.prefs = m.prefs || {};
      S.dms = new Map((m.dms || []).filter((d) => d.other).map((d) => [d.id, d]));
      for (const d of S.dms.values()) S.users.set(d.other.id, d.other);
      S.blocks = new Set(m.blocks || []);
      S.staff = m.staff || [];
      for (const u of S.staff) S.users.set(u.id, u);
      S.reportCounts = m.reports || {};
      S.adminCount = m.adminCount || 0;
      renderAdmin();
      S.notifs = m.notifs || [];
      selectServer(S.cur.server, true);
      // الجوال يفتح على قائمة الرسايل، إلا الحساب الجديد يشوف صفحة الترحيب وخطوات البداية
      if (!S.readyOnce && isMobile() && (S.servers.size || S.dms.size)) mobileTab('home');
      S.readyOnce = true;
      renderBell();
      sendFocus();
      // جاي من إشعار؟ نفتح الروم أو القروب المطلوب
      if (S.openTarget.channel || S.openTarget.server || S.openTarget.dm || S.openTarget.admin) {
        openTarget(S.openTarget);
        S.openTarget = {};
        history.replaceState(null, '', location.pathname + (S.invite ? `?invite=${encodeURIComponent(S.invite)}` : ''));
      }
      if (S.rejoinVoice && findChannel(S.rejoinVoice)) joinVoice(S.rejoinVoice);
      S.rejoinVoice = null;
      if (S.invite) { const code = S.invite; S.invite = null; history.replaceState(null, '', location.pathname); joinServer(code); }
      break;
    }
    case 'server.add': {
      addServer(m.server);
      for (const uid of m.online || []) S.online.add(uid);
      for (const v of m.voice || []) S.voice.set(v.sid, v);
      if (!settle(m.req, m.server)) renderAll();
      break;
    }
    case 'server.remove': {
      const s = S.servers.get(m.serverId);
      if (!s) break;
      if (m.banned) toast(`انطردت من قروب ${s.name}`, 'err');
      if (S.myVoice && s.channels.some((c) => c.id === S.myVoice)) leaveVoice();
      S.servers.delete(m.serverId);
      if (S.cur.server === m.serverId) {
        if (s.owner !== S.me.id) toast(`ما عدت في قروب ${s.name}`);
        selectServer(S.servers.keys().next().value || null);
      } else renderAll();
      break;
    }
    case 'server.update': {
      const s = S.servers.get(m.serverId);
      if (s) { s.name = m.name; renderAll(); }
      break;
    }
    case 'server.icon': {
      const s = S.servers.get(m.serverId);
      if (s) { s.iconUrl = m.iconUrl; renderRail(); }
      break;
    }
    case 'member.add': {
      const s = S.servers.get(m.serverId);
      if (!s) break;
      s.members.set(m.user.id, m.user);
      S.users.set(m.user.id, m.user);
      S.online.add(m.user.id);
      renderAll();
      break;
    }
    case 'member.remove': {
      S.servers.get(m.serverId)?.members.delete(m.uid);
      renderAll();
      break;
    }
    case 'channel.add': {
      const s = S.servers.get(m.serverId);
      if (!s) break;
      s.channels.push(m.channel);
      if (!settle(m.req, m.channel)) renderAll();
      break;
    }
    case 'channel.remove': {
      const s = S.servers.get(m.serverId);
      if (!s) break;
      s.channels = s.channels.filter((c) => c.id !== m.channelId);
      S.msgs.delete(m.channelId);
      if (S.myVoice === m.channelId) leaveVoice();
      if (S.cur.channel === m.channelId) selectChannel(defaultChannel(s));
      else renderAll();
      break;
    }
    case 'msg': onMessage(m.msg, m.nonce); break;
    case 'history': onHistory(m); break;
    case 'typing': {
      if (!S.typing.has(m.channelId)) S.typing.set(m.channelId, new Map());
      S.typing.get(m.channelId).set(m.uid, Date.now());
      renderTyping();
      break;
    }
    case 'voice': onVoiceState(m.state); break;
    case 'presence': {
      m.online ? S.online.add(m.uid) : S.online.delete(m.uid);
      renderMembers();
      if (!S.cur.server) renderSidebar();
      refreshHome();
      break;
    }
    case 'user.update': {
      const u = m.user;
      S.users.set(u.id, u);
      for (const s of S.servers.values()) if (s.members.has(u.id)) s.members.set(u.id, u);
      if (u.id === S.me.id) S.me = { ...S.me, ...u };
      renderAll();
      if (S.cur.channel && isChat(S.cur.channel)) renderMessages(true);
      break;
    }
    case 'rtc': S.vs?.onSignal(m.from, m.d); break;
    case 'notify.pref': S.prefs[m.serverId] = m.level; renderRail(); break;
    case 'dm.add': {
      if (!m.dm.other) break;
      S.users.set(m.dm.other.id, m.dm.other);
      S.dms.set(m.dm.id, { ...S.dms.get(m.dm.id), ...m.dm });
      if (!settle(m.req, m.dm)) { renderRail(); renderSidebar(); }
      break;
    }
    case 'blocks': S.blocks = new Set(m.list); settle(m.req, m.list); renderMain(); break;
    case 'reported': S.blocks = new Set(m.blocks || []); settle(m.req, true); renderMain(); break;
    case 'msg.remove': {
      const st = S.msgs.get(m.channel);
      if (!st) break;
      st.list = st.list.filter((x) => x.id !== m.id);
      if (S.cur.channel === m.channel) renderMessages(false);
      break;
    }
    case 'reports.count': S.reportCounts[m.serverId] = m.n; renderReportCount(); break;
    case 'admin.count': S.adminCount = m.n; renderAdmin(); break;
    case 'admin.data': settle(m.req, m); break;
    case 'reports': settle(m.req, m.list); if (!$('#reportsModal').classList.contains('hidden')) fillReports(m.serverId, m.list); break;
    case 'notif': {
      S.notifs.unshift(m.notif);
      S.notifs.length = Math.min(S.notifs.length, 50);
      renderBell();
      refreshHome();
      if (m.notif.kind !== 'mention') beep('msg', settings.sounds && levelOf(m.notif.serverId) === 'all');
      break;
    }
    case 'notif.read': {
      for (const n of S.notifs) if (!m.id || n.id === m.id) n.read = true;
      renderBell();
      refreshHome();
      break;
    }
    case 'error': {
      if (!settle(m.req, null, m.code)) toast(ERRORS[m.code] || ERRORS.server_error, 'err');
      break;
    }
  }
}

/* =====================================================
   التنقل
   ===================================================== */
const curServer = () => S.servers.get(S.cur.server) || null;
function findChannel(id) {
  for (const s of S.servers.values()) {
    const c = s.channels.find((x) => x.id === id);
    if (c) return { server: s, channel: c };
  }
  const dm = S.dms.get(id);
  if (dm) return { server: null, channel: { id, name: dm.other?.display || 'حساب محذوف', kind: 'dm', dm } };
  return null;
}
// روم فيه شات (كتابي في قروب، أو محادثة خاصة)
const isChat = (id) => ['text', 'dm'].includes(channelKind(id));
function openChannel(id) {
  const f = findChannel(id);
  if (!f) return false;
  S.cur.server = f.server?.id ?? null;
  selectChannel(id);
  return true;
}
const channelKind = (id) => findChannel(id)?.channel.kind;
const defaultChannel = (s) => s?.channels.find((c) => c.kind === 'text')?.id || s?.channels[0]?.id || null;
const isOwner = (s = curServer()) => s && s.owner === S.me?.id;
const userOf = (uid) => S.users.get(uid) || { id: uid, display: '…', username: '', hue: 0 };

function selectServer(id, fromReady = false) {
  S.cur.server = id;
  store.set('lastServer', id);
  const s = curServer();
  let ch = s ? S.lastChannel[s.id] : null;
  if (s && !s.channels.some((c) => c.id === ch)) ch = defaultChannel(s);
  if (fromReady && S.cur.channel && s?.channels.some((c) => c.id === S.cur.channel)) ch = S.cur.channel;
  selectChannel(ch);
}

function selectChannel(id) {
  S.cur.channel = id;
  const s = curServer();
  if (id && s) { S.lastChannel[s.id] = id; store.set('lastChannel', S.lastChannel); }
  S.unread.delete(id);
  S.mentions.delete(id);
  closeNav();
  renderAll();
  if (id && isChat(id)) {
    renderMessages(true);
    loadHistory(id);
    if (matchMedia('(pointer: fine)').matches) $('#msgInput').focus();
  }
}

/* =====================================================
   الرسم
   ===================================================== */
function renderAll() {
  renderRail();
  renderSidebar();
  renderMain();
  renderMembers();
  renderUserPanel();
}

function renderRail() {
  const list = $('#serverList');
  list.innerHTML = [...S.servers.values()].map((s) => {
    const unread = s.channels.some((c) => S.unread.has(c.id)) && levelOf(s.id) !== 'none';
    const voice = S.myVoice && s.channels.some((c) => c.id === S.myVoice);
    const pings = s.channels.reduce((n, c) => n + (S.mentions.get(c.id) || 0), 0);
    return `<button class="rail-btn server${s.id === S.cur.server ? ' active' : ''}${unread ? ' unread' : ''}" type="button" data-server="${s.id}" title="${esc(s.name)}">
      ${pings ? `<b class="rail-badge" aria-label="${pings} منشن">${pings > 99 ? '99+' : pings}</b>` : ''}
      ${s.iconUrl ? `<img src="${esc(s.iconUrl)}" alt="">` : `<span>${esc([...s.name][0] || '؟')}</span>`}
      ${voice ? `<i class="rail-voice">${I.volume}</i>` : ''}
    </button>`;
  }).join('');
  $('#homeBtn').classList.toggle('active', !S.cur.server);
  const dmUnread = [...S.dms.keys()].filter((id) => S.unread.has(id)).length;
  $('#homeBtn').querySelector('.rail-badge')?.remove();
  if (dmUnread) $('#homeBtn').insertAdjacentHTML('beforeend', `<b class="rail-badge" aria-label="${dmUnread} رسايل خاصة جديدة">${dmUnread}</b>`);
  const pings = dmUnread + [...S.mentions.values()].reduce((a, b) => a + b, 0);
  $('#tabHomeBadge').textContent = pings > 99 ? '99+' : pings;
  $('#tabHomeBadge').classList.toggle('hidden', !pings);
}

function renderSidebar() {
  const s = curServer();
  $('#serverName').textContent = s ? s.name : 'الرسائل';
  $('#serverHeadBtn').disabled = !s;
  $('#app').classList.toggle('is-owner', !!isOwner(s));
  renderReportCount();
  const list = $('#channelList');
  $('#msgsTop').classList.toggle('hidden', !!s);
  $('#app').classList.toggle('at-home', !s);
  if (!s) {
    list.innerHTML = homeLink() + activeNow() + dmRows();
    return;
  }
  const group = (kind, title) => {
    const chans = s.channels.filter((c) => c.kind === kind);
    return `<div class="ch-group">
      <div class="ch-group-head"><span>${title}</span>${isOwner(s) ? `<button class="mini-btn" type="button" data-new="${kind}" title="روم جديد">${I.plus}</button>` : ''}</div>
      ${chans.map((c) => channelRow(c)).join('')}
    </div>`;
  };
  list.innerHTML = group('text', 'الرومات الكتابية') + group('voice', 'الرومات الصوتية');
}

/* ---- قائمة الرسائل (مثل تطبيقات الشات) ---- */
const homeLink = () => `<div class="ch home-link${!S.cur.channel ? ' active' : ''}" role="button" tabindex="0" data-home>
  <span class="ch-icon">${I.home}</span><span class="ch-name">الرئيسية</span></div>`;

// كروت أفقية: مين في روم صوتي الحين (من قروباتك)
function activeNow() {
  const rooms = new Map();
  for (const v of S.voice.values()) {
    if (!rooms.has(v.channel)) rooms.set(v.channel, []);
    rooms.get(v.channel).push(v);
  }
  const cards = [...rooms].map(([cid, people]) => {
    const f = findChannel(cid);
    if (!f) return '';
    const live = people.some((v) => v.sharing);
    const shown = people.slice(0, 3).map((v) => avatar(userOf(v.uid), 'sm')).join('');
    const more = people.length > 3 ? `<i class="an-more">+${people.length - 3}</i>` : '';
    const names = people.map((v) => userOf(v.uid).display).join('، ');
    return `<button type="button" class="an-card${S.myVoice === cid ? ' joined' : ''}" data-ch="${cid}" title="${esc(names)}">
      <span class="an-faces">${shown}${more}</span>
      <b class="an-name">${esc(people.length === 1 ? userOf(people[0].uid).display : people.length === 2 ? `${userOf(people[0].uid).display} و${userOf(people[1].uid).display}` : `${userOf(people[0].uid).display} +${people.length - 1}`)}</b>
      <small class="an-room">${live ? '<i class="live-dot"></i>' : I.volume}<span>${esc(f.channel.name)}</span></small>
      <small class="an-server">${esc(f.server?.name || '')}</small>
    </button>`;
  }).join('');
  if (!cards) return '';
  return `<div class="an-wrap"><div class="ch-group-head"><span>في روم صوتي الحين</span></div><div class="an-row">${cards}</div></div>`;
}

function dmPreview(d) {
  const p = d.preview;
  if (!p) return '<span class="dm-sub muted">ابدأ السوالف</span>';
  const who = p.uid === S.me.id ? 'انت: ' : '';
  return `<span class="dm-sub">${esc(who + (p.text || ''))}</span>`;
}

// علامة التوثيق (حساب الإدارة)
const VB_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 1.5l2.6 1.9 3.2-.2 1 3.1 2.6 1.9-1 3.1 1 3.1-2.6 1.9-1 3.1-3.2-.2L12 22.5l-2.6-1.9-3.2.2-1-3.1-2.6-1.9 1-3.1-1-3.1 2.6-1.9 1-3.1 3.2.2z"/><path d="m8 12.2 2.7 2.7L16.2 9.4" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const vb = (u) => (u?.verified ? `<span class="vbadge" title="حساب موثّق — الدعم الفني لـ PLAY WTW" aria-label="موثّق">${VB_SVG}</span>` : '');

// صف ثابت فوق الرسايل: راسل الإدارة (يطلع لكل المستخدمين)
function staffRows() {
  return (S.staff || []).filter((u) => u.id !== S.me.id).map((u) => {
    const dm = [...S.dms.values()].find((d) => d.other?.id === u.id);
    if (dm?.preview) return '';
    return `<div class="dm-row staff-row" role="button" tabindex="0" data-dm-user="${esc(u.id)}">
      <span class="dm-ava">${avatar(u, 'md')}<i class="st${S.online.has(u.id) ? ' on' : ''}"></i></span>
      <span class="dm-main"><b class="dm-name">${esc(u.display)}${vb(u)}</b><span class="dm-sub">الدعم الفني · راسلنا لأي مشكلة أو اقتراح</span></span>
      <span class="dm-side"><span class="staff-tag">رسمي</span></span>
    </div>`;
  }).join('');
}

function dmRows() {
  const q = $('#dmSearch').value.trim().toLowerCase();
  const all = [...S.dms.values()].sort((a, b) => (b.other?.verified ? 1 : 0) - (a.other?.verified ? 1 : 0) || (b.last || 0) - (a.last || 0));
  const dms = q ? all.filter((d) => `${d.other.display} ${d.other.username}`.toLowerCase().includes(q)) : all;
  const rows = dms.map((d) => {
    const unread = S.unread.has(d.id);
    const ts = d.preview?.ts || d.last;
    return `<div class="dm-row${d.id === S.cur.channel ? ' active' : ''}${unread ? ' unread' : ''}" role="button" tabindex="0" data-ch="${d.id}">
      <span class="dm-ava">${avatar(d.other, 'md')}<i class="st${S.online.has(d.other.id) ? ' on' : ''}" title="${S.online.has(d.other.id) ? 'متصل' : 'غير متصل'}"></i></span>
      <span class="dm-main"><b class="dm-name">${esc(d.other.display)}${vb(d.other)}</b>${dmPreview(d)}</span>
      <span class="dm-side">${ts ? `<time>${timeAgo(ts)}</time>` : ''}${unread ? '<i class="dm-dot" aria-label="رسايل جديدة"></i>' : ''}</span>
    </div>`;
  }).join('');
  const empty = q ? `<div class="side-empty">ما لقينا أحد باسم "${esc(q)}".</div>`
    : `<div class="side-empty">ما عندك رسايل خاصة للحين.<br><button class="btn btn-soft btn-sm" type="button" data-new-dm>ابدأ محادثة</button></div>`;
  return `<div class="ch-group dm-list"><div class="ch-group-head"><span>الرسائل الخاصة</span></div>${q ? '' : staffRows()}${rows || empty}</div>`;
}

function channelRow(c) {
  const active = c.id === S.cur.channel;
  const people = c.kind === 'voice' ? [...S.voice.values()].filter((v) => v.channel === c.id) : [];
  const row = `<div class="ch${active ? ' active' : ''}${S.unread.has(c.id) ? ' unread' : ''}${S.myVoice === c.id ? ' joined' : ''}" role="button" tabindex="0" data-ch="${c.id}">
    <span class="ch-icon">${c.kind === 'voice' ? I.volume : I.hash}</span>
    <span class="ch-name">${esc(c.name)}</span>
    ${S.mentions.get(c.id) ? `<b class="ch-badge" aria-label="منشن">${S.mentions.get(c.id)}</b>` : ''}
    ${isOwner() ? `<button class="mini-btn ch-del" type="button" data-del="${c.id}" title="احذف الروم">${I.trash}</button>` : ''}
  </div>`;
  if (!people.length) return row;
  return row + `<div class="vc-users">${people.map((v) => {
    const u = userOf(v.uid);
    const me = v.sid === S.sid;
    const speaking = me ? mic.speaking : levels.speaking(v.sid);
    return `<div class="vc-user${speaking ? ' speaking' : ''}${me ? '' : ' clickable'}" data-speak="${me ? 'me' : v.sid}"${me ? '' : ` data-user="${v.uid}" data-pop`}>
      ${avatar(u, 'xs')}<span>${esc(u.display)}${vb(u)}</span>
      <span class="vc-icons">${v.sharing ? '<b class="live-tag">LIVE</b>' : ''}${settings.userMute[v.uid] ? `<i class="local-mute" title="مكتوم عندك">${I.volumeOff}</i>` : ''}${!v.mic ? I.micOff : ''}${v.deaf ? I.headphonesOff : ''}</span>
    </div>`;
  }).join('')}</div>`;
}

function renderMain() {
  const s = curServer();
  const found = S.cur.channel ? findChannel(S.cur.channel) : null;
  const c = found?.server === s ? found.channel : null;
  const home = !s && !c;
  $('#homeView').classList.toggle('hidden', !home);
  $('#emptyView').classList.toggle('hidden', !!c || home);
  $('#textView').classList.toggle('hidden', !['text', 'dm'].includes(c?.kind));
  $('#voiceView').classList.toggle('hidden', c?.kind !== 'voice');
  if (home) renderHome();
  // لما تتغير الصفحة أو الروم نعرضها بحركة خفيفة (مرة وحدة، مو مع كل تحديث)
  const viewKey = c ? c.id : home ? 'home' : `empty:${s?.id || ''}`;
  if (viewKey !== S.lastView) {
    S.lastView = viewKey;
    const v = $(c ? (c.kind === 'voice' ? '#voiceView' : '#textView') : home ? '#homeView' : '#emptyView');
    v.classList.remove('view-in'); void v.offsetWidth; v.classList.add('view-in');
    clearTimeout(S.viewTimer);
    S.viewTimer = setTimeout(() => v.classList.remove('view-in'), 900);
  }
  const dm = c?.kind === 'dm' ? c.dm : null;
  $('#chanIcon').innerHTML = c ? (c.kind === 'voice' ? I.volume : dm ? I.at : I.hash) : home ? I.home : '';
  $('#chanName').textContent = c ? c.name : s ? s.name : 'الرئيسية';
  $('#chanTopic').textContent = c?.kind === 'voice' ? 'روم صوتي' : dm ? `@${dm.other?.username || ''}` : c ? `في ${s.name}` : '';
  $('#msgInput').placeholder = dm ? `اكتب رسالة لـ ${c.name}` : c ? `اكتب رسالة في #${c.name}` : '';
  document.title = c ? `${dm ? '@' : c.kind === 'voice' ? '🔊' : '#'}${c.name}${s ? ` · ${s.name}` : ''} — PLAY WTW` : 'PLAY WTW';
  // حظرته: نقفل الكتابة ونعطيه زر فك الحظر
  const blocked = !!dm && S.blocks.has(dm.other?.id);
  $('#blockedBar').classList.toggle('hidden', !blocked);
  $('#composer').classList.toggle('hidden', blocked);
  $('#app').classList.toggle('in-dm', !s);
  if (c?.kind === 'voice') renderVoiceView(c);
  renderVoicePanel();
}

function renderMembers() {
  const s = curServer();
  const el = $('#membersList');
  if (!s) { el.innerHTML = ''; return; }
  const all = [...s.members.values()];
  const on = all.filter((u) => S.online.has(u.id)), off = all.filter((u) => !S.online.has(u.id));
  const row = (u) => `<div class="member${S.online.has(u.id) ? '' : ' off'}${u.id === S.me.id ? '' : ' clickable'}"${u.id === S.me.id ? '' : ` data-user="${u.id}" data-pop`}>
    <div class="avatar-wrap">${avatar(u, 'sm')}<i class="status${S.online.has(u.id) ? ' on' : ''}"></i></div>
    <div class="m-names"><b><span class="m-text">${esc(u.display)}${vb(u)}</span>${u.id === s.owner ? `<span class="crown" title="صاحب القروب">${I.crown}</span>` : ''}</b><small dir="ltr">@${esc(u.username)}</small></div>
  </div>`;
  el.innerHTML = `<div class="m-head">متصلين — ${on.length}</div>${on.map(row).join('')}
    ${off.length ? `<div class="m-head">غير متصلين — ${off.length}</div>${off.map(row).join('')}` : ''}`;
}

function renderUserPanel() {
  if (!S.me) return;
  $('#meAvatar').innerHTML = `${avatar(S.me, 'sm')}<i class="status on"></i>`;
  $('#meAvatar').dataset.speak = 'me';
  $('#meDisplay').textContent = S.me.display;
  $('#meUser').textContent = '@' + S.me.username;
  $('#tabYouAvatar').innerHTML = avatar(S.me, 'xs');
  $('#youCard').innerHTML = `<div class="you-hero">${avatar(S.me, 'lg')}<i class="st on"></i></div>
    <h2>${esc(S.me.display)}${vb(S.me)}</h2><p class="muted" dir="ltr">@${esc(S.me.username)}</p>
    <div class="you-actions">
      <button type="button" class="btn btn-soft btn-sm" data-you="mic">${S.micOn && S.hasMic && !S.deaf ? I.mic : I.micOff}<span>${S.micOn && S.hasMic && !S.deaf ? 'المايك شغال' : 'المايك مقفل'}</span></button>
      <button type="button" class="btn btn-soft btn-sm" data-you="deaf">${S.deaf ? I.headphonesOff : I.headphones}<span>${S.deaf ? 'الصوت مكتوم' : 'الصوت شغال'}</span></button>
    </div>`;
  const micOn = S.micOn && S.hasMic && !S.deaf;
  for (const b of [$('#micBtn'), $('#dMic')]) {
    b.innerHTML = micOn ? I.mic : I.micOff;
    b.classList.toggle('off', !micOn);
    b.setAttribute('aria-label', micOn ? 'اقفل المايك' : 'افتح المايك');
  }
  for (const b of [$('#deafBtn'), $('#dDeaf')]) {
    b.innerHTML = S.deaf ? I.headphonesOff : I.headphones;
    b.classList.toggle('off', S.deaf);
    b.setAttribute('aria-label', S.deaf ? 'رجّع الصوت' : 'اكتم الصوت');
  }
  const camOnly = !canScreen() && canCamera();
  for (const b of [$('#dShare'), $('#vpShare')]) {
    b.innerHTML = S.screen ? I.monitorOff : camOnly ? I.camera : I.monitor;
    b.classList.toggle('live', !!S.screen);
    b.title = S.screen ? 'وقف البث' : camOnly ? 'بث الكاميرا' : 'بث الشاشة أو الكاميرا';
    b.setAttribute('aria-label', b.title);
  }
  $('#dFlip').classList.toggle('hidden', S.shareKind !== 'camera');
  // جودة البث للشاشة بس، الكاميرا لها إعداد ثابت خفيف
  $('#dShareCfg').classList.toggle('hidden', S.shareKind === 'camera' || (!canScreen() && !S.screen));
}

function renderVoicePanel() {
  const vp = $('#voicePanel');
  const f = S.myVoice ? findChannel(S.myVoice) : null;
  vp.classList.toggle('hidden', !f);
  if (f) $('#vpChannel').textContent = `${f.channel.name} / ${f.server.name}`;
}

/* =====================================================
   الشات
   ===================================================== */
function chanStore(id) {
  if (!S.msgs.has(id)) S.msgs.set(id, { list: [], loaded: false, more: true, loading: false });
  return S.msgs.get(id);
}

function loadHistory(id, older = false) {
  const st = chanStore(id);
  if (st.loading || (!older && st.loaded) || (older && !st.more)) return;
  st.loading = true;
  send({ t: 'msg.history', channelId: id, before: older ? st.list[0]?.ts : undefined });
}

function onHistory(m) {
  const st = chanStore(m.channelId);
  addUsers(m.users);
  const known = new Set(st.list.map((x) => x.id));
  const fresh = m.msgs.filter((x) => !known.has(x.id));
  const older = st.loaded;
  st.list = older ? [...fresh, ...st.list] : [...fresh, ...st.list.filter((x) => !fresh.some((f) => f.id === x.id))];
  st.list.sort((a, b) => a.ts - b.ts);
  st.loaded = true; st.more = m.more; st.loading = false;
  if (S.cur.channel !== m.channelId) return;
  const box = $('#messages');
  const fromBottom = box.scrollHeight - box.scrollTop;
  renderMessages(!older);
  if (older) box.scrollTop = box.scrollHeight - fromBottom;
}

function onMessage(msg, nonce) {
  const dm = S.dms.get(msg.channel);
  if (dm) { dm.last = msg.ts; dm.preview = { uid: msg.uid, text: msg.text || (msg.file ? '📷 صورة' : ''), ts: msg.ts }; renderSidebar(); }
  const st = chanStore(msg.channel);
  if (nonce) st.list = st.list.filter((x) => x.nonce !== nonce);
  if (st.list.some((x) => x.id === msg.id)) return;
  st.list.push(msg);
  if (st.list.length > 500) st.list.splice(0, st.list.length - 500);
  S.typing.get(msg.channel)?.delete(msg.uid);
  renderTyping();
  const mine = msg.uid === S.me.id;
  const visible = S.cur.channel === msg.channel && !document.hidden;
  if (S.cur.channel === msg.channel) {
    const box = $('#messages');
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
    renderMessages(false);
    if (atBottom || mine) box.scrollTop = box.scrollHeight;
  }
  if (mine) return;
  const mentioned = mentionsMe(msg);
  const level = levelOf(findChannel(msg.channel)?.server?.id);
  const wanted = level === 'all' || (level === 'mentions' && mentioned);
  if (wanted) notifyMessage(msg, mentioned);
  if (!visible) {
    S.unread.add(msg.channel);
    if (mentioned) S.mentions.set(msg.channel, (S.mentions.get(msg.channel) || 0) + 1);
    renderRail(); renderSidebar();
    if (wanted) beep('msg', settings.sounds);
    refreshHome();
  }
}

/* ---- المنشن ---- */
const levelOf = (serverId) => S.prefs[serverId] || 'all';
const mentionsMe = (msg) => (msg.mentions ? msg.mentions.includes(S.me.id) : new RegExp(`(^|\\s)@${S.me.username.replace(/\./g, '\\.')}(?![a-z0-9_.])`).test(msg.text));
// @username يصير اسم ملوّن (لأعضاء القروب بس)
function mentionify(html, server) {
  if (!server) return html;
  const byName = new Map([...server.members.values()].map((u) => [u.username, u]));
  return html.replace(/(^|\s)@([a-z0-9_.]{3,20})(?![a-z0-9_.])/g, (all, pre, name) => {
    const u = byName.get(name);
    if (!u) return all;
    return `${pre}<span class="mention${u.id === S.me.id ? ' me' : ''}" title="@${esc(u.username)}">@${esc(u.display)}</span>`;
  });
}
const renderText = (text, server) => linkify(mentionify(esc(text), server));

function renderMessages(scrollToEnd) {
  const id = S.cur.channel;
  const box = $('#messages');
  const st = chanStore(id);
  const c = findChannel(id)?.channel;
  let html = '';
  if (st.loaded && !st.more) {
    html += c?.kind === 'dm'
      ? `<div class="chan-start">${avatar(c.dm.other, 'lg')}<h2>${esc(c.name)}</h2><p class="muted">هذي بداية محادثتك الخاصة مع ${esc(c.name)} <span dir="ltr">@${esc(c.dm.other?.username || '')}</span>. محد يشوفها غيركم.</p></div>`
      : `<div class="chan-start"><div class="cs-icon">${I.hash}</div><h2>هلا في #${esc(c?.name || '')}</h2><p class="muted">هذي بداية الروم. ابدأ السالفة!</p></div>`;
  } else if (st.more && st.loaded) {
    html += `<button class="load-more" type="button" id="loadMore">رسايل أقدم</button>`;
  } else if (!st.loaded) {
    html += `<div class="loading-msgs"><i></i><i></i><i></i></div>`;
  }
  let prev = null;
  for (const m of st.list) {
    const u = userOf(m.uid);
    const day = new Date(m.ts).toDateString();
    if (!prev || new Date(prev.ts).toDateString() !== day) {
      html += `<div class="day-sep"><span>${new Date(m.ts).toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long' })}</span></div>`;
      prev = null;
    }
    const cont = prev && prev.uid === m.uid && m.ts - prev.ts < 5 * 60000;
    html += `<div class="msg${cont ? ' cont' : ''}${m.pending ? ' pending' : ''}${m.uid !== S.me.id && mentionsMe(m) ? ' mentioned' : ''}" data-msg="${esc(m.id)}">
      ${m.pending ? '' : `<button class="msg-more" type="button" title="خيارات الرسالة" data-pop>${I.more}</button>`}
      ${cont ? `<span class="msg-time-h">${new Date(m.ts).toLocaleTimeString('ar', { hour: 'numeric', minute: '2-digit' })}</span>` : avatar(u)}
      <div class="msg-body">
        ${cont ? '' : `<div class="msg-meta"><b style="--h:${u.hue}">${esc(u.display)}${vb(u)}</b><time>${timeLabel(m.ts)}</time></div>`}
        ${m.text ? `<div class="msg-text">${renderText(m.text, findChannel(id)?.server)}</div>` : ''}
        ${m.file ? photoHtml(m.file, m.localSrc) : ''}
      </div>
    </div>`;
    prev = m;
  }
  box.innerHTML = html;
  if (scrollToEnd) box.scrollTop = box.scrollHeight;
}

$('#messages').addEventListener('click', (e) => {
  if (e.target.id === 'loadMore') loadHistory(S.cur.channel, true);
});
$('#messages').addEventListener('scroll', () => {
  const box = $('#messages');
  if (box.scrollTop < 60 && S.cur.channel) {
    const st = chanStore(S.cur.channel);
    if (st.loaded && st.more) loadHistory(S.cur.channel, true);
  }
});

async function sendMessage() {
  const input = $('#msgInput');
  const text = input.value.trim();
  const attach = S.attach;
  const channel = S.cur.channel;
  if ((!text && !attach) || !channel) return;
  if (!S.wsOpen) { toast(ERRORS.network, 'err'); return; }
  const nonce = Math.random().toString(36).slice(2);
  const pending = { id: 'p-' + nonce, nonce, channel, uid: S.me.id, text, ts: Date.now(), pending: true };
  if (attach) { pending.file = { id: null, w: attach.w, h: attach.h }; pending.localSrc = attach.data; }
  chanStore(channel).list.push(pending);
  renderMessages(true);
  input.value = '';
  autosize();
  clearAttach();
  let fileId;
  if (attach) {
    try {
      const r = await fetch('/api/upload', {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scope: channel, image: attach.data, w: attach.w, h: attach.h }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'server_error');
      fileId = d.id;
    } catch (err) {
      chanStore(channel).list = chanStore(channel).list.filter((x) => x.nonce !== nonce);
      if (S.cur.channel === channel) renderMessages(false);
      toast(`الصورة ما انرسلت: ${ERRORS[err.message] || ERRORS.network}`, 'err');
      return;
    }
  }
  send({ t: 'msg.send', channelId: channel, text, fileId, nonce });
}
function autosize() {
  const t = $('#msgInput');
  t.style.height = 'auto';
  t.style.height = Math.min(200, t.scrollHeight) + 'px';
}
$('#composer').addEventListener('submit', (e) => { e.preventDefault(); sendMessage(); });
$('#msgInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendMessage(); }
});
$('#msgInput').addEventListener('input', () => {
  autosize();
  if (Date.now() - S.lastTypingSent > 2500 && S.cur.channel) {
    S.lastTypingSent = Date.now();
    send({ t: 'typing', channelId: S.cur.channel });
  }
});

function renderTyping() {
  const map = S.typing.get(S.cur.channel);
  const now = Date.now();
  const names = map ? [...map].filter(([, t]) => now - t < 4000).map(([uid]) => userOf(uid).display) : [];
  $('#typing').innerHTML = names.length ? `<span class="dots"><i></i><i></i><i></i></span> <b>${esc(names.join('، '))}</b> ${names.length > 1 ? 'يكتبون' : 'يكتب'}…` : '';
}
setInterval(renderTyping, 1500);

/* =====================================================
   الصوت
   ===================================================== */
async function joinVoice(channelId) {
  if (S.myVoice === channelId) return;
  if (S.myVoice) leaveVoice(true);
  if (!S.wsOpen) { toast(ERRORS.network, 'err'); return; }
  S.myVoice = channelId;
  renderAll();
  try {
    await mic.start(settings);
    S.hasMic = true;
    if (mic.nsError && (settings.ns === 'rnnoise' || settings.ns === 'gtcrn')) toast('عزل الضوضاء بالذكاء الاصطناعي ما اشتغل على جهازك — جرّب نوع ثاني من الإعدادات', 'err');
  } catch (e) {
    S.hasMic = false;
    await mic.ensureContext();
    toast(e.name === 'NotAllowedError' ? 'المتصفح منع المايك — اسمح له من أيقونة القفل جنب الرابط' : 'ما قدرنا نشغل المايك — تقدر تسمع بس', 'err');
  }
  const iceServers = await getIceServers();
  if (S.myVoice !== channelId) return; // طلع قبل ما يخلص
  mic.setMuted(!micLive());
  S.vs = new VoiceSession({
    mySid: S.sid,
    iceServers,
    micTrack: mic.track,
    send: (to, d) => send({ t: 'rtc', to, d }),
    onAudio: attachAudio,
    onScreen: () => renderVoiceViewIfOpen(),
  });
  send({ t: 'voice.join', channelId, mic: S.micOn && S.hasMic && !S.deaf, deaf: S.deaf });
  for (const v of S.voice.values()) if (v.channel === channelId && v.sid !== S.sid) S.vs.connect(v.sid);
  beep('join', settings.sounds);
  renderAll();
}

// سيرفرات الاتصال (فيها TURN لو مفعّل). نحفظها ساعة عشان ما نطلبها كل مرة
let iceCache = null;
async function getIceServers() {
  if (iceCache && Date.now() - iceCache.t < 3600000) return iceCache.servers;
  try {
    const r = await fetch('/api/ice', { credentials: 'same-origin' });
    if (!r.ok) throw new Error(r.status);
    iceCache = { servers: (await r.json()).iceServers, t: Date.now() };
    return iceCache.servers;
  } catch {
    return null;
  }
}

function teardownVoice() {
  if (S.screen) stopShare(true);
  S.vs?.close();
  S.vs = null;
  for (const [sid, a] of S.audios) { a.srcObject = null; a.remove(); levels.unwatch(sid); dropBoost(sid); }
  S.audios.clear();
  for (const sid of [...S.tiles.keys()]) removeTile(sid);
  mic.stop();
  S.myVoice = null;
}

function leaveVoice(switching = false) {
  if (!S.myVoice) return;
  send({ t: 'voice.leave' });
  teardownVoice();
  if (!switching) beep('leave', settings.sounds);
  renderAll();
}

function onVoiceState(v) {
  const before = S.voice.get(v.sid);
  if (v.channel) S.voice.set(v.sid, v); else S.voice.delete(v.sid);
  if (v.sid !== S.sid && S.myVoice) {
    const was = before?.channel === S.myVoice, now = v.channel === S.myVoice;
    if (!was && now) { S.vs?.connect(v.sid); beep('join', settings.sounds); }
    if (was && !now) {
      S.vs?.removePeer(v.sid);
      const a = S.audios.get(v.sid);
      if (a) { a.srcObject = null; a.remove(); S.audios.delete(v.sid); }
      dropBoost(v.sid);
      levels.unwatch(v.sid);
      removeTile(v.sid);
      beep('leave', settings.sounds);
    }
  }
  renderSidebar();
  renderVoiceViewIfOpen();
  refreshHome();
}

function attachAudio(sid, stream) {
  let a = S.audios.get(sid);
  if (!a) {
    a = document.createElement('audio');
    a.autoplay = true;
    a.hidden = true;
    document.body.append(a);
    S.audios.set(sid, a);
  }
  a.srcObject = stream;
  applyVolumes();
  if (settings.outDevice && a.setSinkId) a.setSinkId(settings.outDevice).catch(() => {});
  a.play().catch(needGesture);
  levels.watch(sid, stream);
}

const userGain = (uid) => (settings.userMute[uid] ? 0 : (settings.userVol[uid] ?? 100) / 100);
const boosts = new Map(); // sid -> تكبير الصوت فوق 100%
function dropBoost(sid) {
  const b = boosts.get(sid);
  if (!b) return;
  try { b.src.disconnect(); b.gain.disconnect(); } catch { /* تجاهل */ }
  boosts.delete(sid);
}
function applyVolumes() {
  for (const [sid, a] of S.audios) {
    const v = (settings.outVol / 100) * userGain(S.voice.get(sid)?.uid);
    if (v > 1 && a.srcObject) {
      // عنصر الصوت ما يقبل فوق 100%، فنمرره على مكبّر
      let b = boosts.get(sid);
      if (!b || b.stream !== a.srcObject) {
        dropBoost(sid);
        const ctx = levels.ctx();
        if (settings.outDevice) ctx.setSinkId?.(settings.outDevice).catch(() => {});
        const src = ctx.createMediaStreamSource(a.srcObject);
        const gain = ctx.createGain();
        src.connect(gain).connect(ctx.destination);
        b = { src, gain, stream: a.srcObject };
        boosts.set(sid, b);
      }
      b.gain.gain.value = S.deaf ? 0 : v;
      a.muted = true;
    } else {
      dropBoost(sid);
      a.volume = Math.min(1, v);
      a.muted = S.deaf || v === 0;
    }
  }
  for (const [sid, t] of S.tiles) {
    if (sid === S.sid) continue;
    t.video.muted = S.deaf || t.muted;
    t.video.volume = Math.min(1, (settings.outVol / 100) * t.vol);
  }
}

let gestureWaiting = false;
function needGesture() {
  if (gestureWaiting) return;
  gestureWaiting = true;
  toast('اضغط في أي مكان عشان يشتغل الصوت 🔊');
  document.addEventListener('pointerdown', () => {
    gestureWaiting = false;
    mic.ctx?.resume();
    for (const a of S.audios.values()) a.play().catch(() => {});
    for (const t of S.tiles.values()) t.video.play().catch(() => {});
  }, { once: true });
}

function syncVoiceState() {
  if (!S.myVoice) return;
  send({ t: 'voice.update', mic: S.micOn && S.hasMic && !S.deaf, deaf: S.deaf, sharing: !!S.screen, screen: S.shareKind || 'screen' });
}

async function toggleMic() {
  if (S.deaf) { setDeaf(false); if (S.micOn) return; }
  if (!S.hasMic && S.myVoice) {
    try { await mic.start(settings); S.hasMic = true; S.micOn = true; }
    catch { toast('ما قدرنا نوصل للمايك — اسمح له من إعدادات المتصفح', 'err'); return; }
  } else {
    S.micOn = !S.micOn;
  }
  store.set('micOn', S.micOn);
  mic.setMuted(!micLive());
  beep(S.micOn ? 'on' : 'off', settings.sounds);
  syncVoiceState();
  renderUserPanel(); renderSidebar(); renderVoiceViewIfOpen();
}

function setDeaf(v) {
  S.deaf = v;
  mic.setMuted(!micLive());
  applyVolumes();
  beep(v ? 'off' : 'on', settings.sounds);
  syncVoiceState();
  renderUserPanel(); renderSidebar(); renderVoiceViewIfOpen();
}

/* ---- عرض الروم الصوتي ---- */
function renderVoiceViewIfOpen() {
  const c = S.cur.channel && findChannel(S.cur.channel)?.channel;
  if (c?.kind === 'voice') renderVoiceView(c);
}

function renderVoiceView(c) {
  const inThis = S.myVoice === c.id;
  const people = [...S.voice.values()].filter((v) => v.channel === c.id);
  $('#voiceJoin').classList.toggle('hidden', inThis);
  $('#dock').classList.toggle('hidden', !inThis);
  $('#stage').classList.toggle('hidden', !inThis && !people.length);
  if (!inThis) {
    $('#vjTitle').textContent = c.name;
    $('#vjSub').textContent = people.length ? `فيه ${people.length} ${people.length === 1 ? 'شخص' : 'أشخاص'} يسولفون الحين` : 'ما فيه أحد للحين — كن أول واحد';
    $('#vjBtn').textContent = S.myVoice ? 'انتقل لهذا الروم' : 'ادخل الروم الصوتي';
  }

  // البثوث
  const sharing = inThis ? people.filter((v) => v.sharing) : [];
  const want = new Set();
  for (const v of sharing) {
    if (v.sid === S.sid) {
      if (S.screen) { want.add(v.sid); ensureTile(v.sid, S.screen, true); }
    } else {
      const p = S.vs?.peers.get(v.sid);
      if (p?.remoteScreen) { want.add(v.sid); ensureTile(v.sid, p.remoteScreen, false); }
    }
  }
  for (const sid of [...S.tiles.keys()]) if (!want.has(sid)) removeTile(sid);
  for (const [sid, t] of S.tiles) {
    const v = S.voice.get(sid);
    const cam = (sid === S.sid ? S.shareKind : v?.screen) === 'camera';
    $('.tile-who', t.el).textContent = sid === S.sid ? (cam ? 'كاميرتك' : 'شاشتك') : `${userOf(v?.uid).display} ${cam ? 'يبث كاميرته' : 'يبث'}`;
    t.el.classList.toggle('focused', S.focus === sid);
  }
  $('#screens').classList.toggle('has-focus', !!S.focus && S.tiles.has(S.focus));
  $('#stage').classList.toggle('has-screens', S.tiles.size > 0);

  // الأشخاص
  $('#tiles').innerHTML = people.map((v) => {
    const u = userOf(v.uid);
    const me = v.sid === S.sid;
    const speaking = me ? mic.speaking : levels.speaking(v.sid);
    const vol = settings.userVol[v.uid] ?? 100;
    return `<div class="tile${speaking ? ' speaking' : ''}${me ? '' : ' clickable'}" data-speak="${me ? 'me' : v.sid}" style="--h:${u.hue}"${me ? '' : ` data-user="${v.uid}" data-pop role="button" tabindex="0" title="مستوى صوته عندك"`}>
      ${avatar(u, 'xl')}
      <div class="tile-name">${esc(u.display)}${vb(u)}${me ? ' <small>(أنت)</small>' : ''}</div>
      ${!me && vol !== 100 && !settings.userMute[v.uid] ? `<div class="tile-vol-tag" dir="ltr">${vol}%</div>` : ''}
      <div class="tile-icons">${settings.userMute[v.uid] ? `<i class="local-mute" title="مكتوم عندك">${I.volumeOff}</i>` : ''}${!v.mic ? I.micOff : ''}${v.deaf ? I.headphonesOff : ''}${v.sharing ? '<b class="live-tag">LIVE</b>' : ''}</div>
    </div>`;
  }).join('');
}

function ensureTile(sid, stream, mine) {
  let t = S.tiles.get(sid);
  if (!t) {
    const el = document.createElement('div');
    el.className = 'screen-tile loading';
    el.dataset.sid = sid;
    el.innerHTML = `
      <video autoplay playsinline></video>
      <div class="screen-top"><span class="chip live">LIVE</span><span class="chip tile-who"></span><span class="chip screen-stats"></span><button class="chip zoom-chip" type="button" data-act="unzoom" title="رجّع الحجم"></button></div>
      <div class="screen-actions">
        ${mine
          ? `<button class="tile-btn cam-only" data-act="flip" title="اقلب الكاميرا">${I.flip}</button>
             <button class="tile-btn screen-only" data-act="cfg" title="جودة البث">${I.sliders}</button>
             <button class="tile-btn danger" data-act="stop" title="وقف البث">${I.monitorOff}</button>`
          : `<button class="tile-btn" data-act="mute" title="صوت البث">${I.volume}</button>
             <input class="tile-vol" type="range" min="0" max="1" step="0.05" value="1" aria-label="مستوى صوت البث">
             <button class="tile-btn q-btn" data-act="quality" data-pop title="جودة البث عندك">${QUALITY_LABEL[S.viewPref.get(sid) ?? 'auto']}</button>
             ${pipSupported() ? `<button class="tile-btn" data-act="pip" title="صورة داخل صورة">${I.pip}</button>` : ''}`}
        <button class="tile-btn" data-act="stats" title="الإحصائيات">${I.activity}</button>
        <button class="tile-btn" data-act="focus" title="تكبير">${I.focus}</button>
        <button class="tile-btn" data-act="full" title="ملء الشاشة">${I.maximize}</button>
      </div>`;
    const video = $('video', el);
    video.muted = mine;
    video.addEventListener('playing', () => el.classList.remove('loading'));
    t = { el, video, stats: $('.screen-stats', el), muted: false, vol: 1, prev: null, mine };
    setupZoom(t);
    S.tiles.set(sid, t);
    // لو كان مختار جودة معينة لهذا الشخص من قبل، نطلبها من جديد
    const pref = S.viewPref.get(sid);
    if (!mine && pref !== undefined && pref !== 'auto') { S.vs?.requestQuality(sid, Number(pref)); el.classList.toggle('video-off', pref === '0'); }
    $('#screens').append(el);
    if (settings.outDevice && video.setSinkId && !mine) video.setSinkId(settings.outDevice).catch(() => {});
  }
  const kind = mine ? S.shareKind : S.voice.get(sid)?.screen;
  t.el.classList.toggle('is-camera', kind === 'camera');
  t.el.classList.toggle('mirror', mine && S.camFacing === 'user');
  if (t.video.srcObject !== stream) {
    t.video.srcObject = stream;
    applyVolumes();
    t.video.play().catch(() => { t.video.muted = true; t.video.play().catch(() => {}); });
  }
}

function removeTile(sid) {
  const t = S.tiles.get(sid);
  if (!t) return;
  if (t.el.classList.contains('pseudo-full') || fullscreenEl() === t.el) exitFullscreen();
  if (document.pictureInPictureElement === t.video) document.exitPictureInPicture().catch(() => {});
  if ($('#pop').contains(document.activeElement) || S.popAnchor && t.el.contains(S.popAnchor)) closePop();
  t.video.srcObject = null;
  t.el.remove();
  S.tiles.delete(sid);
  if (S.focus === sid) S.focus = null;
}

$('#screens').addEventListener('click', (e) => {
  const el = e.target.closest('.screen-tile');
  const btn = e.target.closest('[data-act]');
  if (!el || !btn) return;
  const sid = el.dataset.sid, t = S.tiles.get(sid);
  switch (btn.dataset.act) {
    case 'stop': stopShare(); break;
    case 'cfg': openShareModal(); break;
    case 'flip': flipCamera(); break;
    case 'stats': el.classList.toggle('show-stats'); btn.classList.toggle('active'); break;
    case 'focus': S.focus = S.focus === sid ? null : sid; renderVoiceViewIfOpen(); break;
    case 'full': fullscreen(el); break;
    case 'unzoom': setZoom(t, 1, 0, 0); break;
    case 'pip': togglePip(t.video); break;
    case 'quality': openQualityPop(btn, sid); break;
    case 'mute':
      t.muted = !t.muted;
      applyVolumes();
      if (!t.video.muted) t.video.play().catch(() => {});
      btn.innerHTML = t.muted ? I.volumeOff : I.volume;
      break;
  }
});
$('#screens').addEventListener('input', (e) => {
  if (!e.target.classList.contains('tile-vol')) return;
  const t = S.tiles.get(e.target.closest('.screen-tile').dataset.sid);
  if (t) { t.vol = Number(e.target.value); applyVolumes(); }
});
// دبل كلك بالماوس يفتح ملء الشاشة (في الجوال ما فيه حركة للضغطتين)
let lastPointer = 'mouse';
addEventListener('pointerdown', (e) => { lastPointer = e.pointerType; }, { capture: true, passive: true });
$('#screens').addEventListener('dblclick', (e) => {
  const el = e.target.closest('.screen-tile');
  if (el && e.target.tagName === 'VIDEO' && lastPointer === 'mouse') fullscreen(el);
});

/* ---- قائمة منبثقة (مستوى صوت شخص، جودة البث) ---- */
function openPop(anchor, html, bind) {
  const pop = $('#pop');
  if (!pop.classList.contains('hidden') && S.popAnchor === anchor) { closePop(); return; }
  // وقت ملء الشاشة ما يبان إلا اللي داخل العنصر، فنحط القائمة داخله
  const host = fullscreenEl()?.contains(anchor) ? fullscreenEl() : document.body;
  if (pop.parentElement !== host) host.append(pop);
  pop.innerHTML = html;
  pop.onclick = null;
  pop.classList.remove('hidden');
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  let top = r.bottom + 8;
  if (top + ph > innerHeight - 8) top = Math.max(8, r.top - ph - 8);
  const left = Math.max(8, Math.min(innerWidth - pw - 8, r.left + r.width / 2 - pw / 2));
  pop.style.top = `${top}px`;
  pop.style.left = `${left}px`;
  S.popAnchor = anchor;
  bind(pop);
  pop.querySelector('input, button')?.focus({ preventScroll: true });
}
function closePop() {
  $('#pop').classList.add('hidden');
  S.popAnchor = null;
}
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('#pop, [data-pop]')) closePop();
}, true);

// مستوى صوت شخص معين عندك (ما أحد يدري غيرك)
function openUserPop(anchor, uid) {
  const u = userOf(uid);
  const vol = settings.userVol[uid] ?? 100;
  openPop(anchor, `
    <div class="pop-user">${avatar(u, 'sm')}<div><b>${esc(u.display)}${vb(u)}</b><small dir="ltr">@${esc(u.username)}</small></div></div>
    <label class="field"><span class="label">مستوى صوته عندك <b id="puVal" dir="ltr">${vol}%</b></span>
      <input id="puVol" type="range" min="0" max="200" step="5" value="${vol}"></label>
    <label class="switch"><input type="checkbox" id="puMute"${settings.userMute[uid] ? ' checked' : ''}><i></i><span>اكتمه عندي</span></label>
    <p class="hint">التغيير عندك بس. فوق 100% يفضّل تستخدم سماعة.</p>
    <button id="puReset" class="btn btn-soft btn-sm" type="button">رجّع الافتراضي</button>`, (pop) => {
    const save = () => { saveSettings(); applyVolumes(); renderSidebar(); renderVoiceViewIfOpen(); };
    $('#puVol', pop).addEventListener('input', (e) => {
      settings.userVol[uid] = Number(e.target.value);
      $('#puVal', pop).textContent = `${e.target.value}%`;
      saveSettings(); applyVolumes();
    });
    $('#puVol', pop).addEventListener('change', save);
    $('#puMute', pop).addEventListener('change', (e) => {
      if (e.target.checked) settings.userMute[uid] = true; else delete settings.userMute[uid];
      save();
    });
    $('#puReset', pop).addEventListener('click', () => {
      delete settings.userVol[uid]; delete settings.userMute[uid];
      $('#puVol', pop).value = 100; $('#puVal', pop).textContent = '100%'; $('#puMute', pop).checked = false;
      save();
    });
  });
}

// جودة بث شخص معين عندك: كل مشاهد له اتصال لحاله، فاللي يبث يرسل لك الجودة اللي اخترتها
const QUALITY_LABEL = { auto: 'تلقائي', 1080: '1080p', 720: '720p', 480: '480p', 0: 'بدون صورة' };
function openQualityPop(anchor, sid) {
  const cur = S.viewPref.get(sid) ?? 'auto';
  const opts = [
    ['auto', 'تلقائي', 'المتصفح يضبطها حسب نتك'],
    ['1080', '1080p', ''],
    ['720', '720p', 'أخف على النت'],
    ['480', '480p', 'لبيانات الجوال'],
    ['0', 'بدون صورة', 'تسمع صوت البث بس'],
  ];
  openPop(anchor, `<div class="pop-title">جودة البث عندك</div>
    ${opts.map(([v, l, d]) => `<button type="button" class="pop-opt${String(cur) === v ? ' active' : ''}" data-q="${v}"><b>${l}</b>${d ? `<small>${d}</small>` : ''}</button>`).join('')}`, (pop) => {
    pop.onclick = (e) => {
      const b = e.target.closest('[data-q]');
      if (!b) return;
      const v = b.dataset.q;
      S.viewPref.set(sid, v);
      S.vs?.requestQuality(sid, v === 'auto' ? null : Number(v));
      const t = S.tiles.get(sid);
      if (t) {
        $('[data-act="quality"]', t.el).textContent = QUALITY_LABEL[v];
        t.el.classList.toggle('video-off', v === '0');
      }
      closePop();
    };
  });
}

/* ---- صورة داخل صورة: تتفرج على البث وانت في تطبيق أو تاب ثاني ---- */
const pipSupported = () => document.pictureInPictureEnabled || !!HTMLVideoElement.prototype.webkitSetPresentationMode;
async function togglePip(video) {
  try {
    if (document.pictureInPictureElement) { await document.exitPictureInPicture(); return; }
    if (video.requestPictureInPicture && document.pictureInPictureEnabled) await video.requestPictureInPicture();
    else if (video.webkitSetPresentationMode) {
      video.webkitSetPresentationMode(video.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture');
    }
  } catch {
    toast('ما قدرنا نفتح صورة داخل صورة — جرّب كروم أو إيدج أو سفاري', 'err');
  }
}

/* ---- ملء الشاشة ----
   الكمبيوتر والأندرويد: ملء شاشة عادي للبث مع أزراره.
   الآيفون: سفاري ما يسمح إلا للفيديو نفسه، فنفتحه بمشغل الآيفون.
   ولو ما ضبط ولا واحد منهم: نكبّر البث على كامل الصفحة. */
const fullscreenEl = () => document.fullscreenElement || document.webkitFullscreenElement || $('.screen-tile.pseudo-full');
async function fullscreen(el) {
  if (fullscreenEl()) { exitFullscreen(); return; }
  const video = $('video', el);
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (req) {
    try {
      await req.call(el, { navigationUI: 'hide' });
      lockLandscape(video);
      return;
    } catch { /* نجرب اللي بعده */ }
  }
  if (video.webkitEnterFullscreen && video.readyState >= 1) {
    try {
      video.webkitEnterFullscreen();
      video.addEventListener('webkitendfullscreen', () => video.play().catch(() => {}), { once: true });
      return;
    } catch { /* نجرب اللي بعده */ }
  }
  el.classList.add('pseudo-full');
  document.body.classList.add('has-pseudo-full');
  lockLandscape(video);
  updateFullIcons();
}
function exitFullscreen() {
  const pseudo = $('.screen-tile.pseudo-full');
  if (pseudo) {
    pseudo.classList.remove('pseudo-full');
    document.body.classList.remove('has-pseudo-full');
    screen.orientation?.unlock?.();
    updateFullIcons();
    return;
  }
  (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)?.catch?.(() => {});
}
// البث العريض يقلب الجوال بالعرض تلقائياً (إذا المتصفح يسمح)
function lockLandscape(video) {
  if (!matchMedia('(pointer: coarse)').matches) return;
  if (video.videoWidth && video.videoWidth < video.videoHeight) return;
  screen.orientation?.lock?.('landscape').catch(() => {});
}
function updateFullIcons() {
  const full = fullscreenEl();
  for (const t of S.tiles.values()) {
    const b = $('[data-act="full"]', t.el);
    const on = full === t.el;
    b.innerHTML = on ? I.minimize : I.maximize;
    b.title = on ? 'اطلع من ملء الشاشة' : 'ملء الشاشة';
  }
}
for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) {
  document.addEventListener(ev, () => {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) screen.orientation?.unlock?.();
    updateFullIcons();
  });
}

/* ---- تكبير البث (قرصة بإصبعين في الجوال، أو عجلة الماوس) ----
   مفيد لما تتفرج على بث 4K من الجوال وتبي تقرا خط صغير. */
function setZoom(t, s, x, y) {
  s = Math.min(6, Math.max(1, s));
  const r = t.el.getBoundingClientRect();
  const maxX = (r.width * (s - 1)) / 2, maxY = (r.height * (s - 1)) / 2;
  t.zoom = { s, x: s === 1 ? 0 : Math.max(-maxX, Math.min(maxX, x)), y: s === 1 ? 0 : Math.max(-maxY, Math.min(maxY, y)) };
  t.video.style.transform = s === 1 ? '' : `translate(${t.zoom.x}px, ${t.zoom.y}px) scale(${s})`;
  t.el.classList.toggle('zoomed', s > 1);
  $('.zoom-chip', t.el).textContent = `×${s.toFixed(1)} ✕`;
}
function setupZoom(t) {
  const v = t.video;
  const pts = new Map();
  let base = null, moved = false, lastTap = 0;
  t.zoom = { s: 1, x: 0, y: 0 };
  // نقطة على الشاشة نسبة لمنتصف البث
  const rel = (p) => { const r = t.el.getBoundingClientRect(); return { x: p.x - (r.left + r.width / 2), y: p.y - (r.top + r.height / 2) }; };
  const snap = () => { base = { z: { ...t.zoom }, pts: [...pts.values()].map((p) => ({ ...p })) }; };
  // نكبّر حول نقطة معينة بحيث تبقى تحت الإصبع/الماوس
  const zoomAround = (from, s1, q) => setZoom(t, s1, q.x - (q.x - from.x) * (s1 / from.s), q.y - (q.y - from.y) * (s1 / from.s));

  v.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { v.setPointerCapture(e.pointerId); } catch { /* تجاهل */ }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = false;
    snap();
  });
  v.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const cur = [...pts.values()];
    if (cur.length >= 2 && base.pts.length >= 2) {
      const d0 = Math.hypot(base.pts[0].x - base.pts[1].x, base.pts[0].y - base.pts[1].y) || 1;
      const d1 = Math.hypot(cur[0].x - cur[1].x, cur[0].y - cur[1].y);
      const m0 = rel({ x: (base.pts[0].x + base.pts[1].x) / 2, y: (base.pts[0].y + base.pts[1].y) / 2 });
      const m1 = rel({ x: (cur[0].x + cur[1].x) / 2, y: (cur[0].y + cur[1].y) / 2 });
      const s1 = Math.min(6, Math.max(1, base.z.s * (d1 / d0)));
      setZoom(t, s1, m1.x - (m0.x - base.z.x) * (s1 / base.z.s), m1.y - (m0.y - base.z.y) * (s1 / base.z.s));
      moved = true;
    } else if (cur.length === 1 && t.zoom.s > 1) {
      const dx = cur[0].x - base.pts[0].x, dy = cur[0].y - base.pts[0].y;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      setZoom(t, t.zoom.s, base.z.x + dx, base.z.y + dy);
    }
  });
  const up = (e) => {
    if (!pts.delete(e.pointerId)) return;
    snap();
  };
  v.addEventListener('pointerup', up);
  v.addEventListener('pointercancel', up);
  v.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAround(t.zoom, t.zoom.s * Math.exp(-e.deltaY * 0.0018), rel({ x: e.clientX, y: e.clientY }));
  }, { passive: false });
}

/* ---- بث الشاشة ---- */
function autoBitrate(cfg = shareCfg) {
  const [w, h] = RES[cfg.res] || [screen.width * devicePixelRatio, screen.height * devicePixelRatio];
  const factor = { detail: 0.065, balanced: 0.075, motion: 0.085 }[cfg.mode] || 0.075;
  return Math.round(Math.min(80, Math.max(1.5, (w * h * cfg.fps * factor) / 1e6)) * 10) / 10;
}
const bitrateFor = (cfg = shareCfg) => (cfg.brAuto ? autoBitrate(cfg) : cfg.br);
function videoConstraints(cfg) {
  const v = { frameRate: { ideal: cfg.fps, max: cfg.fps } };
  const r = RES[cfg.res];
  if (r) { v.width = { ideal: r[0], max: r[0] }; v.height = { ideal: r[1], max: r[1] }; }
  return v;
}
const viewers = () => [...S.voice.values()].filter((v) => v.channel === S.myVoice && v.sid !== S.sid).length;

/* ---- البث: الشاشة، أو كاميرا الجوال ----
   متصفحات الجوال (خصوصاً الآيفون) ما تسمح للمواقع تلتقط الشاشة،
   فنبث الشاشة لو المتصفح يدعمها، والكاميرا (أمامية أو خلفية) تشتغل على أي جوال. */
const canScreen = () => !!navigator.mediaDevices?.getDisplayMedia;
const canCamera = () => !!navigator.mediaDevices?.getUserMedia;
const touchDevice = () => matchMedia('(pointer: coarse)').matches;
// إعدادات خفيفة للكاميرا: الجوال يرفع على بيانات الجوال غالباً
const CAM_CFG = { res: '720', fps: 30, mode: 'motion', brAuto: false, br: 2.5, audio: false };

function shareClicked(anchor) {
  if (S.screen) { stopShare(); return; }
  if (!S.myVoice) { toast('ادخل روم صوتي أول عشان تبث'); return; }
  // الكمبيوتر: بث الشاشة مباشرة مثل قبل
  if (canScreen() && !touchDevice()) { startShare(); return; }
  const opts = [];
  if (canScreen()) opts.push(['screen', I.monitor, 'شاشة الجوال', 'كل اللي قدامك على الشاشة']);
  if (canCamera()) {
    opts.push(['back', I.camera, 'الكاميرا الخلفية', 'اللي قدامك، مثل التصوير']);
    opts.push(['front', I.camera, 'الكاميرا الأمامية', 'وجهك']);
  }
  if (!opts.length) { toast('متصفحك ما يدعم البث. جرّب كروم أو سفاري بآخر تحديث.', 'err'); return; }
  const note = canScreen() ? '' : '<p class="pop-note">متصفحات الآيفون وأغلب الجوالات ما تسمح للمواقع تبث الشاشة، فتقدر تبث الكاميرا بدالها.</p>';
  openPop(anchor, `<div class="pop-title">وش تبي تبث؟</div>${opts.map(([k, icon, label, sub]) =>
    `<button type="button" class="pop-opt row share-opt" data-share="${k}">${icon}<span><b>${label}</b><small>${sub}</small></span></button>`).join('')}${note}`, (pop) => {
    pop.onclick = (e) => {
      const b = e.target.closest('[data-share]');
      if (!b) return;
      closePop();
      if (b.dataset.share === 'screen') startShare();
      else startCamera(b.dataset.share === 'front' ? 'user' : 'environment');
    };
  });
}

function cameraStream(facing) {
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
    audio: false, // الصوت يروح من المايك أصلاً
  });
}

async function startCamera(facing) {
  if (!S.myVoice) { toast('ادخل روم صوتي أول عشان تبث'); return; }
  let st;
  try { st = await cameraStream(facing); } catch (e) {
    toast(e.name === 'NotAllowedError' ? 'لازم تسمح للموقع يستخدم الكاميرا من إعدادات المتصفح' : e.name === 'NotFoundError' ? 'ما لقينا كاميرا في جهازك' : 'ما قدرنا نفتح الكاميرا: ' + e.message, 'err');
    return;
  }
  beginShare(st, 'camera', facing);
}

async function flipCamera() {
  if (S.shareKind !== 'camera' || !S.screen) return;
  const next = S.camFacing === 'user' ? 'environment' : 'user';
  // بعض الجوالات ما تفتح كاميرتين مع بعض، فنقفل الحالية أول
  const old = S.screen;
  old.getTracks().forEach((t) => t.stop());
  let st;
  try { st = await cameraStream(next); } catch {
    try { st = await cameraStream(S.camFacing); } catch { stopShare(); toast('ما قدرنا نقلب الكاميرا', 'err'); return; }
    toast('جهازك فيه كاميرا وحدة بس', 'err');
    beginShare(st, 'camera', S.camFacing, true);
    return;
  }
  beginShare(st, 'camera', next, true);
}

function beginShare(st, kind, facing, swap = false) {
  if (!S.myVoice || !S.vs) { st.getTracks().forEach((t) => t.stop()); return; }
  if (S.screen && S.screen !== st) S.screen.getTracks().forEach((t) => t.stop());
  S.screen = st;
  S.shareKind = kind;
  S.camFacing = kind === 'camera' ? facing : null;
  const cfg = kind === 'camera' ? CAM_CFG : shareCfg;
  const vt = st.getVideoTracks()[0];
  vt.contentHint = cfg.mode === 'motion' ? 'motion' : 'detail';
  vt.addEventListener('ended', () => { if (S.screen === st) stopShare(); });
  S.vs.startScreen(st, { ...cfg, bitrate: bitrateFor(cfg) });
  if (swap) { renderAll(); return; }
  syncVoiceState();
  S.voice.set(S.sid, { ...S.voice.get(S.sid), sharing: true, screen: kind });
  if (S.cur.channel !== S.myVoice) { const f = findChannel(S.myVoice); S.cur.server = f.server.id; selectChannel(S.myVoice); }
  renderAll();
  toast(kind === 'camera' ? `بدأ بث ${facing === 'user' ? 'الكاميرا الأمامية' : 'الكاميرا الخلفية'}` : 'بدأ البث', 'ok');
}

async function startShare() {
  if (!S.myVoice) { toast('ادخل روم صوتي أول عشان تبث'); return; }
  if (!canScreen()) {
    if (canCamera()) { shareClicked($('#dShare')); return; }
    toast('جهازك أو متصفحك ما يدعم بث الشاشة — جرّب كروم أو إيدج على الكمبيوتر', 'err');
    return;
  }
  let st;
  const mobile = touchDevice();
  try {
    st = await navigator.mediaDevices.getDisplayMedia(mobile
      // الجوال: طلب بسيط، لأن بعض متصفحات الجوال ترفض الخيارات الزيادة
      ? { video: { frameRate: { ideal: 30, max: 30 } }, audio: shareCfg.audio }
      : {
        video: videoConstraints(shareCfg),
        audio: shareCfg.audio ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false,
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
        systemAudio: shareCfg.audio ? 'include' : 'exclude',
      });
  } catch (e) {
    if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') toast('ما قدرنا نبدأ البث: ' + e.message, 'err');
    return;
  }
  if (!S.myVoice || !S.vs) { st.getTracks().forEach((t) => t.stop()); return; }
  if (S.screen) S.screen.getTracks().forEach((t) => t.stop());
  S.screen = st;
  S.shareKind = 'screen';
  S.camFacing = null;
  const vt = st.getVideoTracks()[0];
  vt.contentHint = shareCfg.mode === 'motion' ? 'motion' : 'detail';
  vt.addEventListener('ended', () => { if (S.screen === st) stopShare(); });
  S.vs.startScreen(st, { ...shareCfg, bitrate: bitrateFor() });
  syncVoiceState();
  S.voice.set(S.sid, { ...S.voice.get(S.sid), sharing: true });
  // نفتح الروم الصوتي عشان يشوف بثه
  if (S.cur.channel !== S.myVoice) { const f = findChannel(S.myVoice); S.cur.server = f.server.id; selectChannel(S.myVoice); }
  renderAll();
  const set = vt.getSettings();
  toast(`بدأ البث: ${set.width || '?'}×${set.height || '?'} · ${Math.round(set.frameRate || shareCfg.fps)} فريم · ${bitrateFor()} Mbps`, 'ok');
}

function stopShare(silent) {
  if (!S.screen) return;
  S.screen.getTracks().forEach((t) => t.stop());
  S.screen = null;
  S.shareKind = null;
  S.camFacing = null;
  S.vs?.stopScreen();
  removeTile(S.sid);
  if (!silent) {
    syncVoiceState();
    const me = S.voice.get(S.sid);
    if (me) me.sharing = false;
    renderAll();
  }
}

async function applyLiveShare() {
  const vt = S.screen?.getVideoTracks()[0];
  if (!vt || S.shareKind === 'camera') return;
  vt.contentHint = shareCfg.mode === 'motion' ? 'motion' : 'detail';
  try { await vt.applyConstraints(videoConstraints(shareCfg)); } catch (e) { console.warn(e); }
  S.vs?.setConfig({ ...shareCfg, bitrate: bitrateFor() });
  const set = vt.getSettings();
  toast(`تحدثت الجودة: ${set.width}×${set.height} · ${Math.round(set.frameRate || shareCfg.fps)} فريم · ${bitrateFor()} Mbps`, 'ok');
}

// الإحصائيات الحقيقية لكل بث
setInterval(async () => {
  if (!S.vs) return;
  for (const [sid, t] of S.tiles) {
    if (!t.el.classList.contains('show-stats')) { t.prev = null; continue; }
    const pcs = t.mine ? [...S.vs.peers.values()].map((p) => p.pc) : [S.vs.peers.get(sid)?.pc].filter(Boolean);
    let w = 0, h = 0, fps = 0, bytes = 0, rtt = null, limit = '';
    for (const pc of pcs) {
      let report;
      try { report = await pc.getStats(); } catch { continue; }
      report.forEach((r) => {
        if (r.kind !== 'video') { if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded' && r.currentRoundTripTime != null) rtt = r.currentRoundTripTime; return; }
        if (t.mine && r.type === 'outbound-rtp') {
          w = r.frameWidth || w; h = r.frameHeight || h; fps = r.framesPerSecond || fps; bytes += r.bytesSent || 0;
          if (r.qualityLimitationReason && r.qualityLimitationReason !== 'none') limit = r.qualityLimitationReason;
        }
        if (!t.mine && r.type === 'inbound-rtp') { w = r.frameWidth || w; h = r.frameHeight || h; fps = r.framesPerSecond || fps; bytes += r.bytesReceived || 0; }
      });
    }
    const now = performance.now();
    const mbps = t.prev && bytes >= t.prev.bytes ? ((bytes - t.prev.bytes) * 8) / ((now - t.prev.t) / 1000) / 1e6 : 0;
    t.prev = { bytes, t: now };
    const parts = [];
    if (w) parts.push(`${w}×${h}`);
    if (fps) parts.push(`${Math.round(fps)}fps`);
    parts.push(`${t.mine ? '↑' : '↓'} ${mbps.toFixed(1)} Mbps`);
    if (t.mine) parts.push(`👁 ${pcs.length}`);
    if (rtt != null) parts.push(`${Math.round(rtt * 1000)}ms`);
    if (limit) parts.push(limit === 'bandwidth' ? '⚠ محدود بالنت' : limit === 'cpu' ? '⚠ محدود بالمعالج' : '⚠ ' + limit);
    t.stats.textContent = parts.join(' · ');
  }
}, 1000);

/* =====================================================
   النوافذ
   ===================================================== */
function openModal(id) {
  closeModals();
  const m = $(id);
  m.classList.remove('hidden');
  setTimeout(() => m.querySelector('input:not([type=radio]):not([type=range]):not([type=checkbox]), select, button:not([data-close])')?.focus(), 30);
}
function closeModals() {
  for (const m of $$('.modal')) m.classList.add('hidden');
  mic.setMonitor(false);
  $('#micTest').textContent = 'جرّب المايك';
  $('#micTest').classList.remove('active');
  if (!S.myVoice && mic.running) mic.stop();
}
for (const modal of $$('.modal')) {
  modal.addEventListener('mousedown', (e) => { if (e.target === modal) closeModals(); });
  modal.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeModals(); });
}
for (const tabs of $$('.seg-tabs')) {
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pane]');
    if (!b) return;
    const card = tabs.closest('.modal-card');
    for (const x of $$('[data-pane]', tabs)) x.classList.toggle('active', x === b);
    for (const p of $$('.pane', card)) p.classList.toggle('hidden', p.dataset.pane !== b.dataset.pane);
  });
}

// لو askPassword: يطلب كلمة المرور ويرجّعها بدل true
function confirmBox(title, text, okText = 'تأكيد', askPassword = false) {
  return new Promise((resolve) => {
    $('#confirmTitle').textContent = title;
    $('#confirmText').textContent = text;
    $('#confirmOk').textContent = okText;
    const input = $('#confirmInput');
    input.value = '';
    input.classList.toggle('hidden', !askPassword);
    openModal('#confirmModal');
    if (askPassword) setTimeout(() => input.focus(), 40);
    const ok = () => {
      if (askPassword && !input.value) { input.focus(); return; }
      cleanup(); closeModals(); resolve(askPassword ? input.value : true);
    };
    const obs = new MutationObserver(() => { if ($('#confirmModal').classList.contains('hidden')) { cleanup(); resolve(false); } });
    const cleanup = () => { $('#confirmOk').removeEventListener('click', ok); obs.disconnect(); };
    $('#confirmOk').addEventListener('click', ok);
    obs.observe($('#confirmModal'), { attributes: true, attributeFilter: ['class'] });
  });
}

/* ---- صورة القروب ----
   نقصّ الصورة مربعة ونصغّرها في المتصفح قبل الرفع، فتصير خفيفة وسريعة. */
const ICON_SIZE = 256;
async function shrinkImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('bad_image');
  if (file.size > 15 * 1024 * 1024) throw new Error('image_too_big');
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { throw new Error('bad_image'); }
  const side = Math.min(bmp.width, bmp.height);
  const c = document.createElement('canvas');
  c.width = c.height = ICON_SIZE;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, ICON_SIZE, ICON_SIZE);
  bmp.close?.();
  const webp = c.toDataURL('image/webp', 0.86);
  // سفاري القديم ما يدعم WebP، فيرجع PNG كبير: نستخدم JPG بداله
  return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/jpeg', 0.88);
}

// أداة اختيار الصورة: state = keep (بدون تغيير) / new (صورة جديدة) / remove (بدون صورة)
function setupUploader(root) {
  const input = $('input[type=file]', root), img = $('img', root);
  const u = { root, state: 'keep', data: null, url: null, name: '' };
  const paint = () => {
    const src = u.state === 'new' ? u.data : u.state === 'keep' ? u.url : null;
    img.hidden = !src;
    if (src) img.src = src;
    $('.iu-letter', root).textContent = [...(u.name.trim() || '؟')][0];
    $('[data-iu="remove"]', root).hidden = !src;
  };
  u.reset = (url, name) => { u.state = 'keep'; u.data = null; u.url = url; u.name = name || ''; input.value = ''; paint(); };
  u.setName = (name) => { u.name = name; paint(); };
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-iu]');
    if (!b) return;
    if (b.dataset.iu === 'pick') input.click();
    if (b.dataset.iu === 'remove') { u.state = 'remove'; u.data = null; input.value = ''; paint(); }
  });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      u.data = await shrinkImage(file);
      u.state = 'new';
      paint();
    } catch (err) { toast(ERRORS[err.message] || ERRORS.bad_image, 'err'); }
  });
  // تقدر تسحب الصورة وتفلتها على المربع
  root.addEventListener('dragover', (e) => { e.preventDefault(); root.classList.add('drop'); });
  root.addEventListener('dragleave', () => root.classList.remove('drop'));
  root.addEventListener('drop', (e) => {
    e.preventDefault();
    root.classList.remove('drop');
    const file = e.dataTransfer.files[0];
    if (file) { const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files; input.dispatchEvent(new Event('change')); }
  });
  return u;
}
const newIcon = setupUploader($('#newIcon'));
const editIcon = setupUploader($('#editIcon'));
$('#createServerForm').name.addEventListener('input', (e) => newIcon.setName(e.target.value));
$('#renameForm').name.addEventListener('input', (e) => editIcon.setName(e.target.value));

// نرفع التغيير (لو فيه) بعد ما ينحفظ القروب
async function saveIcon(serverId, u) {
  if (u.state === 'keep') return;
  const r = await fetch(`/api/icon/${serverId}`, {
    method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(u.state === 'new' ? { image: u.data } : { remove: true }),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.error || 'server_error');
  }
}

/* ---- قروب جديد / دخول ---- */
function openServerModal(pane = 'create') {
  $('#createServerForm').reset();
  $('#joinServerForm').reset();
  newIcon.reset(null, '');
  openModal('#serverModal');
  $(`#serverModal .seg-tabs [data-pane="${pane}"]`).click();
}
$('#createServerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, btn = $('button[type=submit]', f);
  btn.disabled = true;
  try {
    const s = await request({ t: 'server.create', name: f.name.value });
    try { await saveIcon(s.id, newIcon); } catch (err) { toast(`سوّينا القروب بس الصورة ما انرفعت: ${ERRORS[err.message] || ERRORS.network}`, 'err'); }
    closeModals();
    selectServer(s.id);
    toast(`سوّينا ${s.name} 🎉 ادعُ أصحابك من قائمة القروب`, 'ok');
  } catch (err) { toast(ERRORS[err.message] || ERRORS.network, 'err'); }
  finally { btn.disabled = false; }
});
$('#joinServerForm').addEventListener('submit', (e) => {
  e.preventDefault();
  busy($('button[type=submit]', e.target), 'جاري الدخول…', () => joinServer(e.target.invite.value));
});
async function joinServer(raw) {
  const code = String(raw).trim().split(/invite=|\//).pop();
  if (!code) { toast('اكتب كود الدعوة أو الصق الرابط', 'err'); return; }
  try {
    const s = await request({ t: 'server.join', invite: code });
    closeModals();
    selectServer(s.id);
    toast(`دخلت ${s.name} 👋`, 'ok');
  } catch (err) { toast(ERRORS[err.message] || ERRORS.network, 'err'); }
}

/* ---- قائمة القروب ---- */
$('#serverHeadBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  $('#serverMenu').classList.toggle('hidden');
});
document.addEventListener('click', (e) => { if (!e.target.closest('#serverMenu')) $('#serverMenu').classList.add('hidden'); });
$('#serverMenu').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  $('#serverMenu').classList.add('hidden');
  const s = curServer();
  if (!s) return;
  switch (b.dataset.act) {
    case 'invite': openInvite(s); break;
    case 'notify': openLevelPop(s); break;
    case 'reports': openReports(s.id); break;
    case 'newText': openChannelModal('text'); break;
    case 'newVoice': openChannelModal('voice'); break;
    case 'rename':
      $('#renameForm').name.value = s.name;
      editIcon.reset(s.iconUrl, s.name);
      openModal('#renameModal');
      break;
    case 'leave':
      if (await confirmBox(`تطلع من ${s.name}؟`, 'تقدر ترجع بعدين برابط دعوة.', 'اطلع')) send({ t: 'server.leave', serverId: s.id });
      break;
    case 'delete':
      if (await confirmBox(`تحذف ${s.name}؟`, 'كل الرومات والرسايل بتنحذف للأبد، وما تقدر ترجعها.', 'احذف')) send({ t: 'server.delete', serverId: s.id });
      break;
  }
});
$('#renameForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, btn = $('button[type=submit]', f);
  const s = curServer();
  if (!s) return;
  btn.disabled = true;
  try {
    if (f.name.value.trim() !== s.name) send({ t: 'server.update', serverId: s.id, name: f.name.value });
    await saveIcon(s.id, editIcon);
    closeModals();
    toast('انحفظ ✅', 'ok');
  } catch (err) { toast(ERRORS[err.message] || ERRORS.network, 'err'); }
  finally { btn.disabled = false; }
});
function openInvite(s) {
  $('#inviteLink').value = `${location.origin}/?invite=${s.invite}`;
  $('#inviteCode').textContent = s.invite;
  openModal('#inviteModal');
  $('#inviteLink').select();
}
$('#inviteCopy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#inviteLink').value); toast('انسخ الرابط ✅', 'ok'); }
  catch { $('#inviteLink').select(); document.execCommand('copy'); }
});

/* ---- روم جديد ---- */
function openChannelModal(kind) {
  const f = $('#channelForm');
  f.reset();
  f.kind.value = kind;
  openModal('#channelModal');
}
$('#channelForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  await busy($('button[type=submit]', f), 'جاري الإنشاء…', async () => {
    try {
      const c = await request({ t: 'channel.create', serverId: S.cur.server, name: f.name.value, kind: f.kind.value });
      closeModals();
      toast(`سوّينا ${c.kind === 'voice' ? 'الروم الصوتي' : 'الروم'} ${c.name}`, 'ok');
      if (c.kind === 'text') selectChannel(c.id); else renderAll();
    } catch (err) { toast(ERRORS[err.message] || ERRORS.network, 'err'); }
  });
});

/* ---- جودة البث ---- */
function openShareModal() {
  const f = $('#shareForm');
  f.res.value = shareCfg.res;
  f.fps.value = String(shareCfg.fps);
  f.mode.value = shareCfg.mode;
  $('#brAuto').checked = shareCfg.brAuto;
  $('#brRange').value = shareCfg.br;
  $('#shareAudio').checked = shareCfg.audio;
  $('#shareSubmit').textContent = S.screen ? 'طبّق على البث' : 'ابدأ البث';
  updateShareHint();
  openModal('#shareModal');
}
function readShareForm() {
  const f = $('#shareForm');
  return { res: f.res.value, fps: Number(f.fps.value), mode: f.mode.value, brAuto: $('#brAuto').checked, br: Number($('#brRange').value), audio: $('#shareAudio').checked };
}
function updateShareHint() {
  const cfg = readShareForm();
  const br = bitrateFor(cfg);
  if (cfg.brAuto) $('#brRange').value = Math.round(br);
  $('#brRange').disabled = cfg.brAuto;
  $('#brVal').textContent = `${br} Mbps`;
  const n = Math.max(1, viewers());
  const need = Math.round(br * n * 10) / 10;
  const hint = $('#brHint');
  hint.innerHTML = `تحتاج سرعة <b>رفع</b> تقريباً <b dir="ltr">${need} Mbps</b> (${br} لكل مشاهد × ${n}${viewers() ? '' : ' — للحين ما فيه أحد'}).`;
  hint.classList.toggle('warn', need > 40);
  for (const b of $$('.preset')) {
    const p = PRESETS[b.dataset.i];
    b.classList.toggle('active', p.res === cfg.res && p.fps === cfg.fps && p.mode === cfg.mode);
  }
}
$('#presets').innerHTML = PRESETS.map((p, i) => `<button type="button" class="preset" data-i="${i}"><b>${esc(p.label)}</b><small>${p.res === '2160' ? '4K' : p.res + 'p'} · ${p.fps}fps</small></button>`).join('');
$('#presets').addEventListener('click', (e) => {
  const b = e.target.closest('.preset');
  if (!b) return;
  const p = PRESETS[b.dataset.i], f = $('#shareForm');
  f.res.value = p.res; f.fps.value = String(p.fps); f.mode.value = p.mode;
  $('#brAuto').checked = true;
  updateShareHint();
});
$('#shareForm').addEventListener('input', updateShareHint);
$('#shareForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const prevAudio = shareCfg.audio;
  Object.assign(shareCfg, readShareForm());
  store.set('share', shareCfg);
  closeModals();
  if (S.screen) {
    applyLiveShare();
    if (prevAudio !== shareCfg.audio) toast('تغيير صوت الجهاز يتطبق لما تعيد البث');
  } else startShare();
});

/* ---- الإعدادات ---- */
async function openSettings() {
  const f = $('#settingsModal');
  $$('input[name=ns]', f).forEach((r) => { r.checked = r.value === settings.ns; });
  $('#gateAuto').checked = settings.gateAuto;
  $('#gateRange').value = settings.gateDb;
  $('#gateRange').disabled = settings.gateAuto;
  $('#inVol').value = settings.inVol;
  $('#outVol').value = settings.outVol;
  $('#optEc').checked = settings.ec;
  $('#optAgc').checked = settings.agc;
  $('#optSounds').checked = settings.sounds;
  refreshPushUI();
  $('#optNotify').checked = settings.notify && 'Notification' in window && Notification.permission === 'granted';
  $('#optNotifyAll').checked = settings.notifyAll;
  $('#optNotifyAll').disabled = !$('#optNotify').checked;
  $('#optNotify').disabled = !('Notification' in window);
  if (!('Notification' in window)) $('#notifyHint').textContent = 'متصفحك ما يدعم الإشعارات. في الآيفون: أضف الموقع للشاشة الرئيسية أول.';
  $$('#settingsModal input[name=fontScale]').forEach((r) => { r.checked = r.value === settings.fontScale; });
  $$('#settingsModal input[name=theme]').forEach((r) => { r.checked = r.value === settings.theme; });
  $('#optReduceMotion').checked = settings.reduceMotion;
  $('#optPtt').checked = settings.ptt;
  $('#pttKeyBtn').textContent = keyLabel(settings.pttKey);
  $('#passwordForm').reset();
  $('#passwordError').textContent = '';
  updateVolLabels();
  $('#profileDisplay').value = S.me.display;
  $('#profileHue').value = S.me.hue;
  renderProfilePreview();
  openModal('#settingsModal');
  // ما نشغّل المايك إلا لو انت في روم صوتي، أو ضغطت "جرّب المايك"
  updateNsHint();
  await fillDevices();
}
async function fillDevices() {
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    const opt = (list, cur, fallback) => [`<option value="">${fallback}</option>`,
      ...list.map((d, i) => `<option value="${esc(d.deviceId)}"${d.deviceId === cur ? ' selected' : ''}>${esc(d.label || `جهاز ${i + 1}`)}</option>`)].join('');
    $('#inDevice').innerHTML = opt(devs.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default'), settings.inDevice, 'الافتراضي');
    const outs = devs.filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default');
    $('#outDevice').innerHTML = opt(outs, settings.outDevice, 'الافتراضي');
    $('#outDevice').disabled = !('setSinkId' in HTMLMediaElement.prototype);
  } catch { /* تجاهل */ }
}
function updateNsHint() {
  const h = $('#nsHint');
  if (!mic.running) {
    h.classList.remove('warn');
    h.textContent = 'المايك مطفي الحين. اضغط "جرّب المايك" تحت عشان تسمع صوتك وتشوف مستواه.';
    return;
  }
  if (mic.nsError) { h.textContent = `"${NS_LABEL[settings.ns]}" ما اشتغل على جهازك، جرّب نوع ثاني.`; h.classList.add('warn'); return; }
  h.classList.remove('warn');
  h.textContent = {
    gtcrn: 'أقوى عزل: يشيل المكيف والكيبورد والأصوات اللي حولك. ياخذ معالج أكثر شوي.',
    rnnoise: 'عزل ممتاز وخفيف على الجهاز. أنسب خيار لأغلب الناس.',
    browser: 'العزل المدمج في المتصفح. أضعف من الذكاء الاصطناعي.',
    off: 'بدون عزل. استخدمه لو مايكك احترافي أو تبي تبث موسيقى.',
  }[settings.ns];
}
function updateVolLabels() {
  $('#inVolVal').textContent = `${settings.inVol}%`;
  $('#outVolVal').textContent = `${settings.outVol}%`;
}
async function applyMicSettings() {
  saveSettings();
  try { await mic.update(settings); } catch (e) { toast('ما قدرنا نشغل المايك بهذي الإعدادات', 'err'); }
  updateNsHint();
}
$('#settingsModal').addEventListener('change', async (e) => {
  const t = e.target;
  if (t.name === 'ns') { settings.ns = t.value; await applyMicSettings(); }
  else if (t.id === 'inDevice') { settings.inDevice = t.value; await applyMicSettings(); }
  else if (t.id === 'outDevice') {
    settings.outDevice = t.value; saveSettings();
    for (const el of [...S.audios.values(), ...[...S.tiles.values()].map((x) => x.video)]) el.setSinkId?.(t.value).catch(() => {});
    levels.ac?.setSinkId?.(t.value).catch(() => {});
  } else if (t.id === 'optEc') { settings.ec = t.checked; await applyMicSettings(); }
  else if (t.id === 'optAgc') { settings.agc = t.checked; await applyMicSettings(); }
  else if (t.id === 'optSounds') { settings.sounds = t.checked; saveSettings(); }
  else if (t.id === 'optNotify') {
    if (t.checked && Notification.permission !== 'granted') {
      const p = await Notification.requestPermission().catch(() => 'denied');
      if (p !== 'granted') {
        t.checked = false;
        $('#notifyHint').textContent = 'المتصفح منع الإشعارات. اسمح لها من أيقونة القفل جنب رابط الموقع.';
      }
    }
    settings.notify = t.checked;
    $('#optNotifyAll').disabled = !t.checked;
    saveSettings();
  } else if (t.id === 'optNotifyAll') { settings.notifyAll = t.checked; saveSettings(); }
  else if (t.name === 'theme') { settings.theme = t.value; saveSettings(); applyLook(); }
  else if (t.name === 'fontScale') { settings.fontScale = t.value; saveSettings(); applyLook(); }
  else if (t.id === 'optReduceMotion') { settings.reduceMotion = t.checked; saveSettings(); applyLook(); }
  else if (t.id === 'optPtt') {
    settings.ptt = t.checked; saveSettings();
    S.pttHeld = false;
    mic.setMuted(!micLive());
    if (t.checked) toast(`المايك يفتح بس وانت ضاغط ${keyLabel(settings.pttKey)}`);
  }
  else if (t.id === 'gateAuto') { settings.gateAuto = t.checked; $('#gateRange').disabled = t.checked; saveSettings(); mic.update(settings); }
});
$('#settingsModal').addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'gateRange') { settings.gateDb = Number(t.value); mic.update(settings); saveSettings(); }
  if (t.id === 'inVol') { settings.inVol = Number(t.value); mic.update(settings); saveSettings(); updateVolLabels(); }
  if (t.id === 'outVol') { settings.outVol = Number(t.value); applyVolumes(); saveSettings(); updateVolLabels(); }
  if (t.id === 'profileHue' || t.id === 'profileDisplay') renderProfilePreview();
});
$('#micTest').addEventListener('click', async () => {
  const on = !$('#micTest').classList.contains('active');
  if (on && !mic.running) {
    try { await mic.start(settings); S.hasMic = true; updateNsHint(); fillDevices(); }
    catch (e) { toast(e.name === 'NotAllowedError' ? 'المتصفح منع المايك. اسمح له من أيقونة القفل جنب رابط الموقع' : 'ما قدرنا نشغّل المايك', 'err'); return; }
  }
  $('#micTest').classList.toggle('active', on);
  if (on) store.set('micTested', true);
  $('#micTest').textContent = on ? 'وقف التجربة' : 'جرّب المايك';
  mic.setMonitor(on);
});
// شريط مستوى المايك وخط الحساسية
const dbToPct = (db) => Math.max(0, Math.min(100, ((db + 80) / 70) * 100));
setInterval(() => {
  if ($('#settingsModal').classList.contains('hidden')) return;
  $('#gateLevel').style.width = dbToPct(mic.level) + '%';
  $('#gateLevel').classList.toggle('open', mic.open);
  if (settings.gateAuto) $('#gateRange').value = Math.round(mic.threshold);
}, 50);

function renderProfilePreview() {
  const u = { ...S.me, display: clean($('#profileDisplay').value) || S.me.display, hue: Number($('#profileHue').value) };
  $('#profileAvatar').innerHTML = avatar(u, 'lg');
  $('#profileName').textContent = u.display;
  $('#profileUser').textContent = '@' + u.username;
}
$('#profileForm').addEventListener('submit', (e) => {
  e.preventDefault();
  send({ t: 'profile.update', display: $('#profileDisplay').value, hue: Number($('#profileHue').value) });
  toast('انحفظ ✅', 'ok');
});
// نختار زر "اضغط عشان تتكلم"
$('#pttKeyBtn').addEventListener('click', () => {
  const btn = $('#pttKeyBtn');
  S.capturingKey = true;
  btn.textContent = 'اضغط الزر…';
  btn.classList.add('active');
  const onKey = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key !== 'Escape' && !['Enter', 'Tab'].includes(e.code)) { settings.pttKey = e.code; saveSettings(); }
    btn.textContent = keyLabel(settings.pttKey);
    btn.classList.remove('active');
    S.capturingKey = false;
    removeEventListener('keydown', onKey, true);
  };
  addEventListener('keydown', onKey, true);
});

async function postJSON(url, body) {
  const r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'server_error');
  return d;
}

$('#passwordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, err = $('#passwordError');
  if (!f.current.value) { err.textContent = 'اكتب كلمة المرور الحالية'; f.current.focus(); return; }
  if (f.next.value.length < 8) { err.textContent = ERRORS.bad_password; f.next.focus(); return; }
  if (f.next.value === f.current.value) { err.textContent = 'كلمة المرور الجديدة نفس الحالية'; f.next.focus(); return; }
  err.textContent = '';
  await busy($('button[type=submit]', f), 'جاري الحفظ…', async () => {
    try {
      await postJSON('/api/password', { current: f.current.value, next: f.next.value });
      f.reset();
      toast('تغيّرت كلمة المرور. وطلّعناك من أي جهاز ثاني كان مسجّل', 'ok');
    } catch (ex) { err.textContent = ERRORS[ex.message] || ERRORS.network; }
  });
});

$('#deleteAccountBtn').addEventListener('click', async () => {
  const password = await confirmBox('تحذف حسابك؟',
    'بينحذف حسابك ورسايلك والقروبات اللي سويتها، وتطلع من باقي القروبات. ما تقدر ترجعه. اكتب كلمة المرور للتأكيد.',
    'احذف حسابي نهائياً', true);
  if (!password) return;
  try {
    await postJSON('/api/account/delete', { password });
    S.loggingOut = true;
    leaveVoice(true);
    S.ws?.close();
    location.replace('/');
  } catch (ex) {
    toast(ERRORS[ex.message] || ERRORS.network, 'err');
  }
});

$('#logoutBtn').addEventListener('click', async () => {
  await disablePush().catch(() => {});
  S.loggingOut = true;
  leaveVoice(true);
  closeModals();
  S.ws?.close();
  await fetch('/api/logout', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => {});
  location.replace('/');
});

/* =====================================================
   الأزرار
   ===================================================== */
$('#serverList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-server]');
  if (b) { selectServer(b.dataset.server); if (isMobile()) mobileTab('home'); }
});
$('#homeBtn').addEventListener('click', () => { selectServer(null); if (isMobile()) mobileTab('home'); });
$('#channelList').addEventListener('click', (e) => { if (e.target.closest('[data-home]')) selectServer(null); });
$('#addServerBtn').addEventListener('click', () => openServerModal());
$('#emptyCreate').addEventListener('click', () => openServerModal('create'));
$('#emptyJoin').addEventListener('click', () => openServerModal('join'));

$('#channelList').addEventListener('click', async (e) => {
  const nw = e.target.closest('[data-new]');
  if (nw) { openChannelModal(nw.dataset.new); return; }
  const usr = e.target.closest('[data-user]');
  if (usr) { openUserPop(usr, usr.dataset.user); return; }
  const del = e.target.closest('[data-del]');
  if (del) {
    e.stopPropagation();
    const c = findChannel(del.dataset.del)?.channel;
    if (c && await confirmBox(`تحذف ${c.name}؟`, c.kind === 'text' ? 'كل رسايل الروم بتنحذف.' : 'اللي فيه بيطلعون منه.', 'احذف')) send({ t: 'channel.delete', channelId: c.id });
    return;
  }
  const st = e.target.closest('[data-dm-user]');
  if (st) { startDm({ userId: st.dataset.dmUser }); return; }
  const row = e.target.closest('[data-ch]');
  if (!row) return;
  const id = row.dataset.ch;
  openChannel(id);
  // كروت "في روم صوتي الحين" تفتح الروم بس، والدخول من زر الروم نفسه
  if (channelKind(id) === 'voice' && !row.classList.contains('an-card')) joinVoice(id);
});
$('#dmSearch').addEventListener('input', () => renderSidebar());
$('#msgsTop').addEventListener('click', (e) => { if (e.target.closest('[data-new-dm]')) openDmModal(); });
$('#fabDm').addEventListener('click', () => openDmModal());
$('#channelList').addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-ch]')) { e.preventDefault(); e.target.click(); }
});

$('#vjBtn').addEventListener('click', () => joinVoice(S.cur.channel));
$('#vpChannel').addEventListener('click', () => {
  const f = findChannel(S.myVoice);
  if (f) { S.cur.server = f.server.id; selectChannel(f.channel.id); }
});
for (const id of ['#micBtn', '#dMic']) $(id).addEventListener('click', toggleMic);
for (const id of ['#deafBtn', '#dDeaf']) $(id).addEventListener('click', () => setDeaf(!S.deaf));
for (const id of ['#dShare', '#vpShare']) $(id).addEventListener('click', (e) => shareClicked(e.currentTarget));
$('#dFlip').addEventListener('click', flipCamera);
$('#dShareCfg').addEventListener('click', openShareModal);
for (const id of ['#dLeave', '#vpLeave']) $(id).addEventListener('click', () => leaveVoice());
$('#settingsBtn').addEventListener('click', openSettings);
$('#settingsBtnTop').addEventListener('click', openSettings);

$('#membersToggle').addEventListener('click', () => {
  const app = $('#app');
  if (matchMedia('(max-width: 900px)').matches) { app.classList.toggle('members-open'); app.classList.remove('nav-open'); }
  else app.classList.toggle('members-hidden');
});
$('#navToggle').addEventListener('click', () => mobileTab('home'));
$('#scrim').addEventListener('click', () => $('#app').classList.remove('nav-open', 'members-open'));
function closeNav() { $('#app').classList.remove('nav-open', 'members-open', 'm-notifs', 'm-you'); }

/* ---- الجوال: الشريط السفلي (الرئيسية / الإشعارات / أنت) ---- */
const isMobile = () => matchMedia('(max-width: 900px)').matches;
function mobileTab(tab) {
  const app = $('#app');
  app.classList.remove('members-open');
  app.classList.toggle('nav-open', tab === 'home');
  app.classList.toggle('m-notifs', tab === 'notifs');
  app.classList.toggle('m-you', tab === 'you');
  for (const b of $$('#tabbar [data-tab]')) b.classList.toggle('active', b.dataset.tab === tab);
  if (tab === 'notifs') fillNotifScreen();
  if (tab === 'you') renderUserPanel();
}
$('#tabbar').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (b) mobileTab(b.dataset.tab);
});
$('#youScreen').addEventListener('click', (e) => {
  const b = e.target.closest('[data-you]');
  if (!b) return;
  const act = b.dataset.you;
  if (act === 'mic') { toggleMic(); renderUserPanel(); }
  else if (act === 'deaf') { setDeaf(!S.deaf); renderUserPanel(); }
  else if (act === 'help') openHelp();
  else if (act === 'logout') $('#logoutBtn').click();
  else openSettings().then(() => $(`#settingsModal .seg-tabs [data-pane=${act}]`).click());
});
// لو كبّرت الشاشة من الجوال للكمبيوتر نرجع الشكل العادي
matchMedia('(max-width: 900px)').addEventListener('change', (e) => { if (!e.matches) closeNav(); });

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!$('#pop').classList.contains('hidden')) { closePop(); return; }
    if ($('.screen-tile.pseudo-full')) exitFullscreen();
    closeModals(); $('#serverMenu').classList.add('hidden'); closeNav();
    return;
  }
  if ($('#app').classList.contains('hidden') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest('input, textarea, select') || !$$('.modal').every((m) => m.classList.contains('hidden'))) return;
  if (settings.ptt && e.code === settings.pttKey) return;
  if (e.code === 'KeyM') toggleMic();
  if (e.code === 'KeyD') setDeaf(!S.deaf);
});

/* ---- اضغط عشان تتكلم ---- */
function micLive() {
  return S.micOn && S.hasMic && !S.deaf && (!settings.ptt || S.pttHeld);
}
function setPtt(held) {
  if (S.pttHeld === held) return;
  S.pttHeld = held;
  mic.setMuted(!micLive());
  $('#app').classList.toggle('ptt-on', held);
}
document.addEventListener('keydown', (e) => {
  if (!settings.ptt || e.code !== settings.pttKey || e.repeat || S.capturingKey) return;
  if (e.target.closest('input, textarea, select')) return;
  e.preventDefault();
  setPtt(true);
});
document.addEventListener('keyup', (e) => { if (e.code === settings.pttKey) setPtt(false); });
addEventListener('blur', () => setPtt(false));
const keyLabel = (code) => code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ') || code;

/* ---- الإشعارات ---- */
function notifyMessage(msg, mentioned) {
  if (!settings.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
  if (!document.hidden && !(settings.notifyAll && S.cur.channel !== msg.channel)) return;
  // إشعارات الجهاز شغالة: السيرفر بيرسلها لما الموقع مو قدامك، فما نكررها هنا
  if (S.pushOn && document.hidden) return;
  const f = findChannel(msg.channel);
  const u = userOf(msg.uid);
  try {
    const n = new Notification(f?.channel.kind === 'dm' ? u.display : `${u.display} ${mentioned ? 'منشنك' : ''} في #${f?.channel.name || ''}`, {
      body: msg.text.length > 140 ? msg.text.slice(0, 140) + '…' : msg.text,
      tag: msg.channel,
      icon: '/icon-192.png',
      lang: 'ar', dir: 'rtl',
    });
    n.onclick = () => { focus(); openChannel(msg.channel); n.close(); };
  } catch { /* بعض الجوالات ما تدعم الإشعار من الصفحة */ }
}

/* ---- المظهر ---- */
function applyLook() {
  const theme = settings.theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme === 'light' ? '#e8eaee' : '#0b0918');
  document.documentElement.style.zoom = { sm: 0.9, md: 1, lg: 1.12 }[settings.fontScale] || 1;
  document.body.classList.toggle('reduce-motion', !!settings.reduceMotion);
}
applyLook();

/* ---- الدعم الفني ---- */
function openHelp() {
  const links = [];
  if (SUPPORT.email) links.push(`<a class="btn btn-primary btn-sm" href="mailto:${esc(SUPPORT.email)}?subject=${encodeURIComponent('مشكلة في PLAY WTW')}">راسلنا على الإيميل</a>`);
  for (const l of SUPPORT.links || []) {
    if (!/^https:\/\//.test(l.url)) continue;
    const style = links.length || S.staff?.length ? 'btn-soft' : 'btn-primary'; // أول طريقة تواصل تكون الزر الرئيسي
    links.push(`<a class="btn ${style} btn-sm" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}</a>`);
  }
  const staff = (S.staff || []).find((u) => u.id !== S.me?.id);
  if (staff) links.unshift(`<button type="button" class="btn btn-primary btn-sm" data-dm-user="${esc(staff.id)}">راسل الدعم الفني هنا في الموقع</button>`);
  $('#contactLinks').innerHTML = links.join('');
  $('#contactBox').classList.toggle('hidden', !links.length);
  openModal('#helpModal');
}
$('#helpBtn').addEventListener('click', openHelp);
$('#authHelp').addEventListener('click', openHelp);
document.addEventListener('visibilitychange', () => {
  sendFocus();
  if (!document.hidden && S.cur.channel) { S.unread.delete(S.cur.channel); S.mentions.delete(S.cur.channel); renderRail(); renderSidebar(); }
});
navigator.mediaDevices?.addEventListener?.('devicechange', () => { if (!$('#settingsModal').classList.contains('hidden')) fillDevices(); });
addEventListener('beforeunload', () => { if (S.myVoice) send({ t: 'voice.leave' }); });

// الضغط على شخص في الروم الصوتي أو قائمة الأعضاء يفتح مستوى صوته
for (const id of ['#tiles', '#membersList']) {
  $(id).addEventListener('click', (e) => {
    const el = e.target.closest('[data-user]');
    if (el) openUserPop(el, el.dataset.user);
  });
  $(id).addEventListener('keydown', (e) => {
    const el = e.target.closest('[data-user]');
    if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openUserPop(el, el.dataset.user); }
  });
}

/* =====================================================
   الإشعارات
   ===================================================== */
// نقول للسيرفر هل الموقع قدامك، عشان ما يرسل لك إشعار للجهاز وانت شايف الرسالة
function sendFocus() { send({ t: 'focus', visible: !document.hidden, endpoint: S.pushEndpoint || null }); }
// لو تستخدم الموقع نبلغ السيرفر كل دقيقة بالكثير، عشان يعرف إنك قدامه
let lastActive = 0;
for (const ev of ['pointerdown', 'keydown']) {
  addEventListener(ev, () => { if (Date.now() - lastActive > 60000 && !document.hidden) { lastActive = Date.now(); sendFocus(); } }, { passive: true });
}

// نفتح روم أو قروب (من إشعار أو رابط)
function openTarget({ channel, server, dm, admin }) {
  if (admin && S.me?.admin) { openAdmin(); return; }
  if ((channel || dm) && openChannel(channel || dm)) return;
  if (server && S.servers.has(server)) selectServer(server);
}

/* ---- مستوى إشعارات القروب ---- */
const LEVELS = [
  ['all', 'كل الرسايل', 'إشعار لكل رسالة جديدة'],
  ['mentions', 'المنشن بس', 'بس لما أحد يكتب @اسمك'],
  ['none', 'بدون', 'ما يجيك ولا إشعار من هالقروب'],
];
function openLevelPop(s) {
  const cur = levelOf(s.id);
  openPop($('#serverHeadBtn'), `<div class="pop-title">إشعارات ${esc(s.name)}</div>
    ${LEVELS.map(([v, l, d]) => `<button type="button" class="pop-opt${cur === v ? ' active' : ''}" data-level="${v}"><b>${l}</b><small>${d}</small></button>`).join('')}`, (pop) => {
    pop.onclick = (e) => {
      const b = e.target.closest('[data-level]');
      if (!b) return;
      send({ t: 'notify.set', serverId: s.id, level: b.dataset.level });
      S.prefs[s.id] = b.dataset.level;
      closePop();
      toast(`إشعارات ${s.name}: ${LEVELS.find((x) => x[0] === b.dataset.level)[1]}`, 'ok');
      renderRail();
    };
  });
}

/* ---- الجرس ---- */
function openNotif(id) {
  const n = S.notifs.find((x) => x.id === id);
  if (!n) return;
  if (!n.read) send({ t: 'notif.read', id: n.id });
  if (n.kind === 'report' && S.me.admin) { openAdmin(); return; }
  if (n.kind === 'report' && S.servers.has(n.serverId)) { selectServer(n.serverId); openReports(n.serverId); return; }
  if (n.channelId && findChannel(n.channelId)) openTarget({ channel: n.channelId });
  else if (S.servers.has(n.serverId)) openTarget({ server: n.serverId });
  else toast('هالروم أو القروب انحذف', 'err');
}
function renderBell() {
  const n = S.notifs.filter((x) => !x.read).length;
  const b = $('#bellBadge');
  b.textContent = n > 99 ? '99+' : n;
  b.classList.toggle('hidden', !n);
  $('#bellBtn').setAttribute('aria-label', n ? `الإشعارات، ${n} جديدة` : 'الإشعارات');
  if (S.popAnchor === $('#bellBtn')) fillBell($('#pop'));
  $('#tabBellBadge').textContent = n > 99 ? '99+' : n;
  $('#tabBellBadge').classList.toggle('hidden', !n);
  if ($('#app').classList.contains('m-notifs')) fillNotifScreen();
}
function fillNotifScreen() {
  $('#notifReadAll').classList.toggle('hidden', !S.notifs.some((x) => !x.read));
  $('#notifScreenList').innerHTML = S.notifs.length ? S.notifs.map((n) => `
    <button type="button" class="bell-item${n.read ? '' : ' unread'}" data-notif="${esc(n.id)}">
      ${avatar(n.actor || { display: '؟', hue: 0 }, 'sm')}
      <span class="bell-text">${notifLine(n)}<time>${timeLabel(n.ts)}</time></span>
    </button>`).join('') : `<div class="m-empty">${I.bell}<b>ما عندك إشعارات للحين</b><p class="muted">المنشن ومين دخل قروبك ومين يبث، كلها تطلع هنا.</p></div>`;
}
$('#notifScreenList').addEventListener('click', (e) => {
  const item = e.target.closest('[data-notif]');
  if (item) openNotif(item.dataset.notif);
});
$('#notifReadAll').addEventListener('click', () => send({ t: 'notif.read', all: true }));
function notifLine(n) {
  const who = `<b>${esc(n.actor?.display || 'حساب محذوف')}</b>`;
  const f = n.channelId && findChannel(n.channelId);
  const server = S.servers.get(n.serverId);
  if (n.kind === 'mention') return `<span>${who} منشنك في <b>#${esc(f?.channel.name || '')}</b></span><q>${mentionify(esc(n.text), server)}</q>`;
  if (n.kind === 'join') return `<span>${who} دخل قروبك <b>${esc(server?.name || n.text)}</b></span>`;
  if (n.kind === 'live') return `<span>${who} بث شاشته في <b>${esc(f?.channel.name || n.text)}</b></span>`;
  if (n.kind === 'report') return `<span>${who} بلّغ عن رسالة ${n.serverId ? `في <b>#${esc(f?.channel.name || '')}</b>` : 'خاصة'}</span><q>${esc(n.text)}</q>`;
  return `<span>${esc(n.text)}</span>`;
}
function fillBell(pop) {
  const unread = S.notifs.some((x) => !x.read);
  pop.innerHTML = `<div class="bell-head"><b>الإشعارات</b>${unread ? '<button type="button" class="btn-link" data-read-all>تحديد الكل كمقروء</button>' : ''}</div>
    <div class="bell-list">${S.notifs.length ? S.notifs.map((n) => `
      <button type="button" class="bell-item${n.read ? '' : ' unread'}" data-notif="${esc(n.id)}">
        ${avatar(n.actor || { display: '؟', hue: 0 }, 'sm')}
        <span class="bell-text">${notifLine(n)}<time>${timeLabel(n.ts)}</time></span>
      </button>`).join('') : '<p class="bell-empty">ما عندك إشعارات للحين. المنشن ومين دخل قروبك ومين يبث، كلها تطلع هنا.</p>'}</div>`;
}
$('#bellBtn').addEventListener('click', () => {
  openPop($('#bellBtn'), '', (pop) => {
    pop.classList.add('bell-pop');
    fillBell(pop);
    pop.onclick = (e) => {
      if (e.target.closest('[data-read-all]')) { send({ t: 'notif.read', all: true }); return; }
      const item = e.target.closest('[data-notif]');
      if (!item) return;
      closePop();
      openNotif(item.dataset.notif);
    };
  });
});
// القائمة المنبثقة نفسها تنستخدم لأشياء ثانية، فنشيل شكل الجرس لما تنقفل
new MutationObserver(() => {
  const pop = $('#pop');
  // نتأكد قبل التعديل، وإلا التعديل نفسه يشغّل المراقب من جديد بلا نهاية
  if (pop.classList.contains('hidden') && pop.classList.contains('bell-pop')) pop.classList.remove('bell-pop');
})
  .observe($('#pop'), { attributes: true, attributeFilter: ['class'] });

/* ---- اقتراح الأسماء لما تكتب @ ---- */
const mention = { list: [], index: 0, start: -1 };
function mentionQuery() {
  const t = $('#msgInput');
  const before = t.value.slice(0, t.selectionStart);
  const m = before.match(/(^|\s)@([^\s@]{0,20})$/);
  return m ? { q: m[2].toLowerCase(), start: before.length - m[2].length - 1 } : null;
}
function updateMentionBox() {
  const box = $('#mentionBox');
  const s = curServer();
  const q = s && mentionQuery();
  if (!q) { box.classList.add('hidden'); mention.list = []; return; }
  mention.start = q.start;
  mention.list = [...s.members.values()]
    .filter((u) => u.id !== S.me.id && (u.username.startsWith(q.q) || u.display.toLowerCase().includes(q.q)))
    .sort((a, b) => Number(S.online.has(b.id)) - Number(S.online.has(a.id)))
    .slice(0, 8);
  mention.index = Math.min(mention.index, Math.max(0, mention.list.length - 1));
  if (!mention.list.length) { box.classList.add('hidden'); return; }
  box.innerHTML = `<div class="mb-title">أعضاء القروب</div>` + mention.list.map((u, i) => `
    <button type="button" class="mb-item${i === mention.index ? ' active' : ''}" role="option" aria-selected="${i === mention.index}" data-i="${i}">
      ${avatar(u, 'xs')}<b>${esc(u.display)}${vb(u)}</b><small dir="ltr">@${esc(u.username)}</small>
    </button>`).join('');
  box.classList.remove('hidden');
}
function pickMention(i) {
  const u = mention.list[i];
  if (!u) return;
  const t = $('#msgInput');
  const end = t.selectionStart;
  t.value = `${t.value.slice(0, mention.start)}@${u.username} ${t.value.slice(end)}`;
  const caret = mention.start + u.username.length + 2;
  t.setSelectionRange(caret, caret);
  t.focus();
  $('#mentionBox').classList.add('hidden');
  mention.list = [];
}
$('#msgInput').addEventListener('input', updateMentionBox);
$('#msgInput').addEventListener('click', updateMentionBox);
$('#msgInput').addEventListener('blur', () => setTimeout(() => $('#mentionBox').classList.add('hidden'), 150));
// الأسهم و Enter و Tab تختار من القائمة (قبل ما Enter يرسل الرسالة)
$('#msgInput').addEventListener('keydown', (e) => {
  if ($('#mentionBox').classList.contains('hidden') || !mention.list.length) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    mention.index = (mention.index + (e.key === 'ArrowDown' ? 1 : -1) + mention.list.length) % mention.list.length;
    updateMentionBox();
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault();
    e.stopImmediatePropagation();
    pickMention(mention.index);
  } else if (e.key === 'Escape') {
    e.stopPropagation();
    $('#mentionBox').classList.add('hidden');
  }
}, true);
$('#mentionBox').addEventListener('mousedown', (e) => e.preventDefault());
$('#mentionBox').addEventListener('click', (e) => {
  const b = e.target.closest('[data-i]');
  if (b) pickMention(Number(b.dataset.i));
});

/* ---- إشعارات الجهاز (والموقع مسكّر) ---- */
async function refreshPushUI() {
  const box = $('#optPush'), hint = $('#pushHint');
  const iosNeedsInstall = isIOS() && !isStandalone() && !inApp();
  $('#iosHelp').classList.toggle('hidden', !iosNeedsInstall);
  if (inApp() || iosNeedsInstall || !pushSupported()) {
    box.checked = false;
    box.disabled = true;
    if (inApp()) hint.textContent = 'إشعارات الجوال داخل التطبيق جاية في تحديث قادم. الرسايل توصلك وانت فاتح التطبيق.';
    else if (!iosNeedsInstall) hint.textContent = ERRORS.push_unsupported;
    $('#pushTest').hidden = true;
    return;
  }
  box.disabled = false;
  const sub = await currentSubscription().catch(() => null);
  S.pushOn = !!sub && Notification.permission === 'granted';
  box.checked = S.pushOn;
  $('#pushTest').hidden = !S.pushOn;
  if (Notification.permission === 'denied') hint.textContent = ERRORS.push_denied;
}
$('#optPush').addEventListener('change', async (e) => {
  const box = e.target;
  box.disabled = true;
  try {
    if (box.checked) {
      await enablePush();
      S.pushOn = true;
      await updatePushEndpoint();
      toast('تمام! بتوصلك الإشعارات على هذا الجهاز حتى لو الموقع مسكّر', 'ok');
    } else {
      await disablePush();
      S.pushOn = false;
      await updatePushEndpoint();
      toast('وقّفنا الإشعارات على هذا الجهاز');
    }
  } catch (err) {
    box.checked = false;
    S.pushOn = false;
    toast(ERRORS[err.message] || ERRORS.push_unsupported, 'err');
  } finally {
    box.disabled = false;
    $('#pushTest').hidden = !S.pushOn;
  }
});
$('#pushTest').addEventListener('click', (e) => busy(e.currentTarget, 'جاري الإرسال…', async () => {
  const hint = $('#pushHint');
  try {
    const r = await testPush();
    toast('خدمة الإشعارات استلمت الإشعار التجريبي، المفروض يطلع لك خلال ثواني', 'ok');
    hint.textContent = `آخر تجربة: وصلت لخدمة الإشعارات (${r.service}). إذا ما طلع لك شي، شيّك إن إشعارات المتصفح مسموحة من إعدادات الجهاز، وإن وضع "عدم الإزعاج" مطفي.`;
  } catch (err) {
    // الاشتراك انتهى: نجدده على طول ونجرب مرة ثانية
    if (err.status === 404 || err.status === 410) {
      try { await disablePush(); await enablePush(); await updatePushEndpoint(); await testPush(); toast('جددنا اشتراك الإشعارات وأرسلنا إشعار تجريبي', 'ok'); return; }
      catch { /* نكمل ونعرض الخطأ */ }
    }
    const why = {
      0: 'السيرفر ما قدر يوصل لخدمة الإشعارات',
      400: 'خدمة الإشعارات رفضت الطلب',
      401: 'خدمة الإشعارات رفضت توقيع الموقع',
      403: 'خدمة الإشعارات رفضت توقيع الموقع',
      413: 'الإشعار كبير',
      429: 'خدمة الإشعارات طلبت نخفف الإرسال، جرّب بعد شوي',
    }[err.status];
    const msg = err.status !== undefined ? `${why || 'خدمة الإشعارات ردت بخطأ'} (الرمز ${err.status}${err.service ? ` من ${err.service}` : ''})` : (ERRORS[err.message] || ERRORS.push_failed);
    toast(msg, 'err');
    hint.textContent = `آخر تجربة فشلت: ${msg}. صوّر هالرسالة وارسلها للدعم.`;
  }
}));
async function updatePushEndpoint() {
  S.pushEndpoint = (await currentSubscription().catch(() => null))?.endpoint || null;
  sendFocus();
}

// عامل الخلفية: نسجّله، ونسمع لما ينضغط إشعار والموقع مفتوح
registerWorker().then(async () => {
  const sub = await currentSubscription().catch(() => null);
  S.pushOn = !!sub && 'Notification' in window && Notification.permission === 'granted';
  S.pushEndpoint = sub?.endpoint || null;
  if (S.wsOpen) sendFocus();
});
navigator.serviceWorker?.addEventListener('message', (e) => {
  if (e.data?.type !== 'open') return;
  const q = new URL(e.data.url, location.origin).searchParams;
  openTarget({ channel: q.get('channel'), server: q.get('server'), dm: q.get('dm'), admin: q.get('admin') });
});

/* =====================================================
   الصور في الشات
   ===================================================== */
const MAX_PHOTO_SIDE = 1600;
// نصغّر الصورة (ونعدّل اتجاهها) قبل الرفع، عشان تكون خفيفة وسريعة
async function shrinkPhoto(file) {
  if (!file || !file.type.startsWith('image/')) throw new Error('bad_image');
  if (file.size > 40 * 1024 * 1024) throw new Error('image_too_big');
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { throw new Error('bad_image'); }
  let scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(bmp.width, bmp.height));
  for (let i = 0; i < 4; i++) {
    const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(bmp, 0, 0, w, h);
    let data = c.toDataURL('image/webp', 0.82);
    if (!data.startsWith('data:image/webp')) data = c.toDataURL('image/jpeg', 0.85);
    // لو للحين كبيرة نصغّرها أكثر
    if (data.length * 0.75 < 1.4 * 1024 * 1024) { bmp.close?.(); return { data, w, h }; }
    scale *= 0.75;
  }
  bmp.close?.();
  throw new Error('image_too_big');
}

function photoHtml(f, localSrc) {
  const src = localSrc || (f.id ? `/api/file/${encodeURIComponent(f.id)}` : '');
  const w = Math.min(f.w, 320);
  return `<button type="button" class="msg-photo" data-photo="${esc(src)}" style="width:${w}px; aspect-ratio:${f.w} / ${f.h}" aria-label="افتح الصورة">
    ${src ? `<img src="${esc(src)}" alt="صورة" loading="lazy" decoding="async">` : ''}
  </button>`;
}

async function setAttach(file) {
  if (!S.cur.channel || !isChat(S.cur.channel)) return;
  try {
    S.attach = await shrinkPhoto(file);
    $('#attachPreview img').src = S.attach.data;
    $('#attachPreview').classList.remove('hidden');
    $('#msgInput').focus();
  } catch (err) {
    toast(ERRORS[err.message] || ERRORS.bad_image, 'err');
  }
}
function clearAttach() {
  S.attach = null;
  $('#attachPreview').classList.add('hidden');
  $('#attachPreview img').removeAttribute('src');
  $('#fileGallery').value = '';
  $('#fileCamera').value = '';
}
$('#attachClear').addEventListener('click', clearAttach);
for (const id of ['#fileGallery', '#fileCamera']) $(id).addEventListener('change', (e) => setAttach(e.target.files[0]));

// زر الصورة: في الجوال تختار تصوّر أو من الألبوم، وفي الكمبيوتر يفتح الملفات على طول
$('#attachBtn').addEventListener('click', () => {
  if (!matchMedia('(pointer: coarse)').matches) { $('#fileGallery').click(); return; }
  openPop($('#attachBtn'), `
    <button type="button" class="pop-opt" data-pick="camera"><b>${I.camera} صوّر</b><small>افتح الكاميرا والتقط صورة</small></button>
    <button type="button" class="pop-opt" data-pick="gallery"><b>${I.image} من الألبوم</b><small>اختر صورة من جوالك</small></button>`, (pop) => {
    pop.onclick = (e) => {
      const b = e.target.closest('[data-pick]');
      if (!b) return;
      closePop();
      $(b.dataset.pick === 'camera' ? '#fileCamera' : '#fileGallery').click();
    };
  });
});
// لصق صورة (Ctrl+V) أو سحبها وإفلاتها على الشات
$('#msgInput').addEventListener('paste', (e) => {
  const item = [...(e.clipboardData?.items || [])].find((x) => x.type.startsWith('image/'));
  if (item) { e.preventDefault(); setAttach(item.getAsFile()); }
});
$('#textView').addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); $('#textView').classList.add('drop'); } });
$('#textView').addEventListener('dragleave', (e) => { if (!e.relatedTarget || !$('#textView').contains(e.relatedTarget)) $('#textView').classList.remove('drop'); });
$('#textView').addEventListener('drop', (e) => {
  $('#textView').classList.remove('drop');
  const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
  if (file) { e.preventDefault(); setAttach(file); }
});

/* ---- عرض الصورة كاملة ---- */
function openViewer(src) {
  $('#viewerImg').src = src;
  $('#viewerOpen').href = src;
  $('#viewer').classList.remove('hidden');
  $('#viewerClose').focus();
}
function closeViewer() {
  $('#viewer').classList.add('hidden');
  $('#viewerImg').removeAttribute('src');
}
$('#viewerClose').addEventListener('click', closeViewer);
$('#viewer').addEventListener('click', (e) => { if (e.target.id === 'viewer') closeViewer(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#viewer').classList.contains('hidden')) closeViewer(); });

/* =====================================================
   خيارات الرسالة: نسخ، حذف، بلاغ، حظر
   ===================================================== */
function msgById(id) {
  return chanStore(S.cur.channel).list.find((x) => x.id === id);
}
function openMsgMenu(anchor, id) {
  const m = msgById(id);
  if (!m || m.pending) return;
  const f = findChannel(m.channel);
  const mine = m.uid === S.me.id;
  const canDelete = mine || (f?.server && f.server.owner === S.me.id);
  const isDm = f?.channel.kind === 'dm';
  const opts = [];
  if (m.text) opts.push(['copy', I.copy, 'انسخ النص']);
  if (canDelete) opts.push(['delete', I.trash, 'احذف الرسالة', 'danger']);
  if (!mine) opts.push(['report', I.flag, 'بلّغ عن الرسالة', 'danger']);
  if (!mine && isDm) opts.push(['block', I.ban, S.blocks.has(m.uid) ? 'فك الحظر' : `احظر ${userOf(m.uid).display}`, 'danger']);
  openPop(anchor, opts.map(([a, icon, label, cls]) => `<button type="button" class="pop-opt row${cls ? ' ' + cls : ''}" data-msg-act="${a}">${icon}<b>${esc(label)}</b></button>`).join(''), (pop) => {
    pop.onclick = async (e) => {
      const b = e.target.closest('[data-msg-act]');
      if (!b) return;
      closePop();
      switch (b.dataset.msgAct) {
        case 'copy':
          try { await navigator.clipboard.writeText(m.text); toast('انسخ النص ✅', 'ok'); } catch { toast('ما قدرنا ننسخ', 'err'); }
          break;
        case 'delete':
          if (await confirmBox('تحذف الرسالة؟', mine ? 'بتنحذف عند الكل.' : 'بتنحذف عند الكل، لأنك صاحب القروب.', 'احذف')) send({ t: 'msg.delete', id: m.id });
          break;
        case 'report': openReport(m); break;
        case 'block': setBlock(m.uid, !S.blocks.has(m.uid)); break;
      }
    };
  });
}
$('#messages').addEventListener('click', (e) => {
  const more = e.target.closest('.msg-more');
  if (more) { openMsgMenu(more, more.closest('[data-msg]').dataset.msg); return; }
  const photo = e.target.closest('[data-photo]');
  if (photo?.dataset.photo) openViewer(photo.dataset.photo);
});
// في الجوال: اضغط مطوّل على الرسالة.
// الأندرويد يرسل حدث "contextmenu" للضغط المطوّل، والآيفون ما يرسله فنحسب الوقت بنفسنا
let pressTimer = null, pressOpenedAt = 0;
const openFromPress = (row) => {
  if (Date.now() - pressOpenedAt < 800) return;
  pressOpenedAt = Date.now();
  navigator.vibrate?.(15);
  openMsgMenu(row, row.dataset.msg);
};
$('#messages').addEventListener('touchstart', (e) => {
  const row = e.target.closest('[data-msg]');
  if (!row || e.touches.length > 1 || e.target.closest('a, .msg-photo, .msg-more')) return;
  const t0 = e.touches[0], start = { x: t0.clientX, y: t0.clientY };
  clearTimeout(pressTimer);
  pressTimer = setTimeout(() => openFromPress(row), 500);
  const stop = (ev) => {
    const t = ev.touches?.[0];
    if (ev.type === 'touchmove' && t && Math.hypot(t.clientX - start.x, t.clientY - start.y) < 10) return;
    clearTimeout(pressTimer);
    row.removeEventListener('touchmove', stop); row.removeEventListener('touchend', stop); row.removeEventListener('touchcancel', stop);
  };
  row.addEventListener('touchmove', stop, { passive: true });
  row.addEventListener('touchend', stop);
  row.addEventListener('touchcancel', stop);
}, { passive: true });
$('#messages').addEventListener('contextmenu', (e) => {
  const row = e.target.closest('[data-msg]');
  if (!row || !matchMedia('(pointer: coarse)').matches || e.target.closest('a, .msg-photo')) return;
  e.preventDefault();
  clearTimeout(pressTimer);
  openFromPress(row);
});

/* ---- البلاغ ---- */
let reporting = null;
function openReport(m) {
  reporting = m;
  const f = findChannel(m.channel);
  const isDm = f?.channel.kind === 'dm';
  const form = $('#reportForm');
  form.reset();
  $('#reportQuote').textContent = m.text || '📷 صورة';
  $('#reportBlockRow').classList.toggle('hidden', !isDm);
  $('#reportWho').textContent = isDm
    ? 'البلاغ ينحفظ عندنا. والحظر يمنعه يرسل لك.'
    : `البلاغ يوصل لصاحب القروب (${userOf(f?.server?.owner).display}) وهو يقرر وش يسوي. ما أحد يدري إنك انت اللي بلّغت غيره.`;
  openModal('#reportModal');
}
$('#reportForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, m = reporting;
  if (!m) return;
  await busy($('button[type=submit]', f), 'جاري الإرسال…', async () => {
    try {
      await request({ t: 'report', messageId: m.id, reason: f.reason.value, note: f.note.value, block: f.block.checked });
      closeModals();
      const isDm = findChannel(m.channel)?.channel.kind === 'dm';
      toast(isDm ? (f.block.checked ? 'وصل بلاغك، وحظرناه عنك' : 'وصل بلاغك') : 'وصل بلاغك لصاحب القروب. شكراً إنك تساعد', 'ok');
    } catch (err) { toast(ERRORS[err.message] || ERRORS.network, 'err'); }
  });
});

async function setBlock(uid, on) {
  try {
    await request({ t: 'block', userId: uid, on });
    toast(on ? `حظرت ${userOf(uid).display}. ما يقدر يرسل لك` : `فكّيت الحظر عن ${userOf(uid).display}`, 'ok');
  } catch (err) { toast(ERRORS[err.message] || ERRORS.network, 'err'); }
}
$('#unblockBtn').addEventListener('click', () => {
  const dm = S.dms.get(S.cur.channel);
  if (dm) setBlock(dm.other.id, false);
});

/* ---- بلاغات القروب (لصاحبه) ---- */
const REASON_LABEL = { spam: 'سبام', abuse: 'إزعاج أو تنمّر', nsfw: 'محتوى غير لائق', other: 'سبب ثاني' };
function renderReportCount() {
  const n = S.reportCounts[S.cur.server] || 0;
  const el = $('#reportCount');
  el.textContent = n;
  el.classList.toggle('hidden', !n);
  $('#serverHeadBtn').classList.toggle('has-reports', !!n && !!isOwner());
}
let reportsServer = null;
async function openReports(serverId) {
  reportsServer = serverId;
  $('#reportsList').innerHTML = '<div class="loading-msgs"><i></i><i></i><i></i></div>';
  openModal('#reportsModal');
  try { fillReports(serverId, await request({ t: 'reports.list', serverId })); }
  catch (err) { $('#reportsList').innerHTML = `<p class="hint warn">${esc(ERRORS[err.message] || ERRORS.network)}</p>`; }
}
function fillReports(serverId, list) {
  if (serverId !== reportsServer) return;
  $('#reportsList').innerHTML = list.length ? list.map((r) => `
    <div class="report-card">
      <div class="rc-head">${avatar(r.author || { display: '؟' }, 'sm')}<div><b>${esc(r.author?.display || 'حساب محذوف')}</b><small>في #${esc(r.channel || '')} · ${timeLabel(r.ts)}</small></div>
        <span class="rc-reason">${esc(REASON_LABEL[r.reason] || r.reason)}</span></div>
      ${r.text ? `<blockquote class="report-quote">${esc(r.text)}</blockquote>` : ''}
      ${r.file ? photoHtml(r.file) : ''}
      <p class="hint">بلّغ عنها ${esc(r.reporter?.display || '؟')}${r.note ? `: «${esc(r.note)}»` : ''}</p>
      <div class="rc-actions">
        <button type="button" class="btn btn-soft btn-sm" data-resolve="dismiss" data-id="${esc(r.id)}">تجاهل</button>
        <button type="button" class="btn btn-danger-soft btn-sm" data-resolve="delete" data-id="${esc(r.id)}">احذف الرسالة</button>
        ${r.author && r.author.id !== S.me.id ? `<button type="button" class="btn btn-danger btn-sm" data-resolve="ban" data-id="${esc(r.id)}">احذفها واطرده</button>` : ''}
      </div>
    </div>`).join('') : '<p class="bell-empty">ما فيه بلاغات مفتوحة 👍</p>';
}
$('#reportsList').addEventListener('click', async (e) => {
  const photo = e.target.closest('[data-photo]');
  if (photo?.dataset.photo) { openViewer(photo.dataset.photo); return; }
  const b = e.target.closest('[data-resolve]');
  if (!b) return;
  if (b.dataset.resolve === 'ban' && !await confirmBox('تطرده من القروب؟', 'بتنحذف رسالته، ويطلع من القروب وما يقدر يرجع حتى برابط الدعوة.', 'اطرده')) { openModal('#reportsModal'); return; }
  const id = b.dataset.id;
  if (!$('#reportsModal').classList.contains('hidden') || b.dataset.resolve === 'ban') {
    try {
      const list = await request({ t: 'report.resolve', id, action: b.dataset.resolve });
      if ($('#reportsModal').classList.contains('hidden')) openModal('#reportsModal');
      fillReports(reportsServer, list);
      toast({ dismiss: 'تجاهلنا البلاغ', delete: 'انحذفت الرسالة', ban: 'انحذفت الرسالة وانطرد من القروب' }[b.dataset.resolve], 'ok');
    } catch (err) { toast(ERRORS[err.message] || ERRORS.network, 'err'); }
  }
});

/* =====================================================
   الرسائل الخاصة
   ===================================================== */
function openDmModal() {
  const known = new Map();
  for (const s of S.servers.values()) for (const u of s.members.values()) if (u.id !== S.me.id) known.set(u.id, u);
  const people = [...known.values()].sort((a, b) => Number(S.online.has(b.id)) - Number(S.online.has(a.id)) || a.display.localeCompare(b.display, 'ar'));
  $('#dmForm').reset();
  $('#dmPeople').innerHTML = people.length
    ? `<div class="mb-title">ناس من قروباتك</div>` + people.map((u) => `
      <button type="button" class="mb-item" data-dm-user="${esc(u.id)}">${avatar(u, 'xs')}<b>${esc(u.display)}${vb(u)}</b>${S.online.has(u.id) ? '<i class="dot on"></i>' : ''}<small dir="ltr">@${esc(u.username)}</small></button>`).join('')
    : '<p class="hint">اكتب اسم المستخدم حق الشخص اللي تبي تراسله.</p>';
  openModal('#dmModal');
}
async function startDm(query) {
  try {
    const dm = await request({ t: 'dm.open', ...query });
    closeModals();
    S.dms.set(dm.id, { ...S.dms.get(dm.id), ...dm });
    S.users.set(dm.other.id, dm.other);
    S.cur.server = null;
    selectChannel(dm.id);
  } catch (err) { toast(ERRORS[err.message] || ERRORS.network, 'err'); }
}
$('#dmForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = e.target.username.value.trim();
  if (!name) { toast('اكتب اسم المستخدم', 'err'); return; }
  busy($('button[type=submit]', e.target), 'جاري البحث…', () => startDm({ username: name }));
});
$('#dmPeople').addEventListener('click', (e) => {
  const b = e.target.closest('[data-dm-user]');
  if (b) startDm({ userId: b.dataset.dmUser });
});
$('#channelList').addEventListener('click', (e) => { if (e.target.closest('[data-new-dm]')) openDmModal(); }, true);
$('#emptyDm').addEventListener('click', openDmModal);

/* =====================================================
   إدارة الموقع (للمشرف بس)
   ===================================================== */
function renderAdmin() {
  const b = $('#adminBtn');
  b.classList.toggle('hidden', !S.me?.admin);
  b.querySelector('.rail-badge')?.remove();
  if (S.adminCount) b.insertAdjacentHTML('beforeend', `<b class="rail-badge" aria-label="${S.adminCount} بلاغ">${S.adminCount > 99 ? '99+' : S.adminCount}</b>`);
  $('#adminTabCount').textContent = S.adminCount ? `(${S.adminCount})` : '';
}
async function openAdmin() {
  $('#adminReports').innerHTML = '<div class="loading-msgs"><i></i><i></i><i></i></div>';
  openModal('#adminModal');
  try { fillAdmin(await request({ t: 'admin.reports' })); }
  catch (err) { $('#adminReports').innerHTML = `<p class="hint warn">${esc(ERRORS[err.message] || ERRORS.network)}</p>`; }
}
function fillAdmin(d) {
  $('#adminReports').innerHTML = d.list.length ? d.list.map((r) => `
    <div class="report-card">
      <div class="rc-head">${avatar(r.author || { display: '؟' }, 'sm')}<div><b>${esc(r.author?.display || 'حساب محذوف')} <small dir="ltr">@${esc(r.author?.username || '')}</small></b>
        <small>${r.where.dm ? 'رسالة خاصة' : `${esc(r.where.server || '')} · #${esc(r.where.channel || '')}`} · ${timeLabel(r.ts)}</small></div>
        <span class="rc-reason">${esc(REASON_LABEL[r.reason] || r.reason)}</span></div>
      ${r.text ? `<blockquote class="report-quote">${esc(r.text)}</blockquote>` : ''}
      ${r.file ? photoHtml(r.file) : ''}
      ${!r.text && !r.file ? '<p class="hint">الرسالة انحذفت.</p>' : ''}
      <p class="hint">بلّغ عنها ${esc(r.reporter?.display || '؟')}${r.note ? `: «${esc(r.note)}»` : ''}</p>
      <div class="rc-actions">
        <button type="button" class="btn btn-soft btn-sm" data-admin="dismiss" data-id="${esc(r.id)}">تجاهل</button>
        <button type="button" class="btn btn-danger-soft btn-sm" data-admin="delete" data-id="${esc(r.id)}">احذف الرسالة</button>
        ${r.author && r.author.id !== S.me.id ? `<button type="button" class="btn btn-danger btn-sm" data-admin="suspend" data-id="${esc(r.id)}">احذفها وأوقف الحساب</button>` : ''}
      </div>
    </div>`).join('') : '<p class="bell-empty">ما فيه بلاغات مفتوحة 👍</p>';
  $('#adminSuspended').innerHTML = d.suspended.length ? d.suspended.map((u) => `
    <div class="report-card"><div class="rc-head">${avatar(u, 'sm')}<div><b>${esc(u.display)}</b><small dir="ltr">@${esc(u.username)}</small></div>
      <button type="button" class="btn btn-soft btn-sm" data-unsuspend="${esc(u.id)}">رجّع الحساب</button></div></div>`).join('')
    : '<p class="bell-empty">ما فيه حسابات موقوفة.</p>';
}
$('#adminBtn').addEventListener('click', openAdmin);
$('#adminModal').addEventListener('click', async (e) => {
  const photo = e.target.closest('[data-photo]');
  if (photo?.dataset.photo) { openViewer(photo.dataset.photo); return; }
  const act = e.target.closest('[data-admin]'), un = e.target.closest('[data-unsuspend]');
  if (!act && !un) return;
  try {
    if (un) {
      fillAdmin(await request({ t: 'admin.unsuspend', userId: un.dataset.unsuspend }));
      toast('رجع الحساب، يقدر يسجّل دخول', 'ok');
      return;
    }
    if (act.dataset.admin === 'suspend') {
      const ok = await confirmBox('توقف الحساب؟', 'بتنحذف الرسالة، ويطلع من الموقع وما يقدر يسجّل دخول لين ترجّعه.', 'أوقف الحساب');
      openModal('#adminModal');
      if (!ok) return;
    }
    fillAdmin(await request({ t: 'admin.resolve', id: act.dataset.id, action: act.dataset.admin }));
    toast({ dismiss: 'تجاهلنا البلاغ', delete: 'انحذفت الرسالة', suspend: 'انحذفت الرسالة وانوقف الحساب' }[act.dataset.admin], 'ok');
  } catch (err) { toast(ERRORS[err.message] || ERRORS.network, 'err'); }
});

/* =====================================================
   الرئيسية: لمحة عن كل شي يصير الحين
   ===================================================== */
const homeOpen = () => !S.cur.server && !S.cur.channel && !$('#app').classList.contains('hidden');
function refreshHome() { if (homeOpen()) renderHome(); }

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'سهرانين الليلة';
  if (h < 12) return 'صباح الخير';
  return 'مساء الخير';
}
const plural = (n, one, two, many) => (n === 1 ? one : n === 2 ? two : `${n} ${many}`);
const serverIcon = (s) => (s.iconUrl ? `<img src="${esc(s.iconUrl)}" alt="">` : `<span>${esc([...s.name][0] || '؟')}</span>`);

function renderHome() {
  if (!S.me) return;
  const servers = [...S.servers.values()];
  // الرومات الصوتية اللي فيها ناس الحين
  const rooms = new Map();
  for (const v of S.voice.values()) {
    const f = findChannel(v.channel);
    if (!f) continue;
    if (!rooms.has(v.channel)) rooms.set(v.channel, { ...f, people: [] });
    rooms.get(v.channel).people.push(v);
  }
  const live = [...rooms.values()].sort((a, b) => b.people.length - a.people.length);
  // ناس من قروباتك متصلين
  const friends = new Map();
  for (const s of servers) for (const u of s.members.values()) if (u.id !== S.me.id && S.online.has(u.id)) friends.set(u.id, u);
  const inVoice = new Map([...S.voice.values()].map((v) => [v.uid, v]));
  const dms = [...S.dms.values()].sort((a, b) => (b.last || 0) - (a.last || 0)).slice(0, 5);
  const dmUnread = dms.filter((d) => S.unread.has(d.id)).length;
  const pings = [...S.mentions.values()].reduce((a, b) => a + b, 0);
  const attention = S.notifs.filter((n) => !n.read).slice(0, 4);

  // سطر الملخص: وش الجديد بكلمات واضحة
  const news = [];
  if (dmUnread) news.push(plural(dmUnread, 'رسالة خاصة جديدة', 'رسالتين خاصة', 'رسايل خاصة جديدة'));
  if (pings) news.push(plural(pings, 'منشن ما شفته', 'منشنين ما شفتهم', 'منشنات ما شفتها'));
  const talking = live.reduce((n, r) => n + r.people.length, 0);
  let summary = news.length ? `عندك ${news.join(' و')}.` : '';
  if (talking) summary += `${summary ? ' ' : ''}فيه ${plural(talking, 'شخص واحد', 'شخصين', 'أشخاص')} في ${live.length === 1 ? 'روم صوتي' : 'رومات صوتية'} الحين.`;
  if (!summary) summary = servers.length ? 'كل شي مقري. وش ناوي تسوي الحين؟' : 'خلّنا نبدأ: سوّ قروب لك ولأصحابك، أو ادخل واحد بكود دعوة.';

  // خطوات البداية للمستخدم الجديد
  const steps = [
    ['create', 'ادخل أول قروب', servers.length > 0],
    ['invite', 'ادعُ أصحابك للقروب', servers.some((s) => s.members.size > 1)],
    ['push', 'فعّل الإشعارات', S.pushOn],
    ['mic', 'جرّب المايك', !!store.get('micTested', false)],
  ];
  const done = steps.filter((x) => x[2]).length;
  const showSteps = done < steps.length && !store.get('onboardDone', false);

  const actions = [
    ['create', I.plus, 'سوّ قروب', 'مكان لك ولأصحابك'],
    ['join', I.userPlus, 'ادخل بكود', 'عندك رابط أو كود دعوة'],
    ['dm', I.at, 'رسالة خاصة', 'كلّم أحد على انفراد'],
    ['mic', I.mic, 'جهّز المايك', 'اختبر صوتك وعزل الضوضاء'],
  ];

  let i = 0;
  const card = () => `style="--i:${i++}"`;
  $('#homeInner').innerHTML = `
    <header class="home-hero" ${card()}>
      <div class="hh-text">
        <h1>${greeting()}، ${esc(S.me.display)}</h1>
        <p>${esc(summary)}</p>
      </div>
      <div class="quick">
        ${actions.map(([a, icon, t, d]) => `<button type="button" class="quick-btn" data-home-act="${a}"><span class="qb-icon">${icon}</span><b>${t}</b><small>${d}</small></button>`).join('')}
      </div>
    </header>

    ${showSteps ? `
    <section class="home-card onboard" ${card()}>
      <div class="hc-head"><h2>خلّنا نجهّزك</h2><span class="muted">${done} من ${steps.length}</span>
        <button type="button" class="btn-link" data-home-act="hideOnboard">ما أحتاجها</button></div>
      <div class="progress"><i style="width:${(done / steps.length) * 100}%"></i></div>
      <div class="steps">${steps.map(([a, t, ok]) => `<button type="button" class="step${ok ? ' done' : ''}" data-home-act="${a}" ${ok ? 'disabled' : ''}>
        <span class="step-dot">${ok ? I.check : ''}</span>${t}</button>`).join('')}</div>
    </section>` : ''}

    ${servers.length || dms.length ? `<div class="home-cols">
      <div class="home-main">
        <section class="home-card" ${card()}>
          <div class="hc-head"><h2>شغّال الحين</h2>${live.length ? `<span class="live-dot">مباشر</span>` : ''}</div>
          ${live.length ? `<div class="live-list">${live.map((r) => {
            const mine = S.myVoice === r.channel.id;
            const sharing = r.people.find((v) => v.sharing);
            return `<div class="live-room">
              <div class="lr-icon">${serverIcon(r.server)}</div>
              <div class="lr-info">
                <b>${esc(r.channel.name)}</b><small>${esc(r.server.name)}</small>
                <div class="lr-people">${r.people.slice(0, 5).map((v) => avatar(userOf(v.uid), 'xs')).join('')}
                  <span>${r.people.length === 1 ? esc(userOf(r.people[0].uid).display) : plural(r.people.length, '', 'شخصين', 'أشخاص')}</span>
                  ${sharing ? `<b class="live-tag">LIVE</b><span class="muted">${esc(userOf(sharing.uid).display)} يبث</span>` : ''}</div>
              </div>
              <button type="button" class="btn ${mine ? 'btn-soft' : 'btn-primary'} btn-sm" data-join-voice="${esc(r.channel.id)}">${mine ? 'انت فيه' : 'ادخل'}</button>
            </div>`;
          }).join('')}</div>` : `<p class="home-empty">ما أحد في روم صوتي الحين. ادخل واحد وخلّهم يلحقونك 🎧</p>`}
        </section>

        <section class="home-card" ${card()}>
          <div class="hc-head"><h2>قروباتك</h2><span class="muted">${servers.length || ''}</span></div>
          ${servers.length ? `<div class="group-grid">${servers.map((s) => {
            const on = [...s.members.keys()].filter((id) => S.online.has(id)).length;
            const unread = s.channels.some((c) => S.unread.has(c.id)) && levelOf(s.id) !== 'none';
            const p = s.channels.reduce((n, c) => n + (S.mentions.get(c.id) || 0), 0);
            return `<button type="button" class="group-card${unread ? ' unread' : ''}" data-go-server="${esc(s.id)}">
              <span class="gc-icon">${serverIcon(s)}${p ? `<b class="rail-badge">${p}</b>` : ''}</span>
              <b>${esc(s.name)}</b>
              <small><i class="dot${on ? ' on' : ''}"></i>${on} متصل من ${s.members.size}</small>
            </button>`;
          }).join('')}</div>` : `<p class="home-empty">ما عندك قروبات للحين. اضغط "سوّ قروب" فوق.</p>`}
        </section>
      </div>

      <aside class="home-side">
        ${attention.length ? `<section class="home-card" ${card()}>
          <div class="hc-head"><h2>يحتاج انتباهك</h2><button type="button" class="btn-link" data-home-act="readAll">تحديد الكل كمقروء</button></div>
          <div class="home-list">${attention.map((n) => `<button type="button" class="hl-row notif" data-notif="${esc(n.id)}">
            ${avatar(n.actor || { display: '؟' }, 'xs')}<span class="bell-text">${notifLine(n)}<time>${timeLabel(n.ts)}</time></span></button>`).join('')}</div>
        </section>` : ''}

        <section class="home-card" ${card()}>
          <div class="hc-head"><h2>متصلين الحين</h2><span class="muted">${friends.size || ''}</span></div>
          ${friends.size ? `<div class="home-list">${[...friends.values()].slice(0, 8).map((u) => {
            const v = inVoice.get(u.id);
            const where = v && findChannel(v.channel);
            return `<div class="hl-row">
              <div class="avatar-wrap">${avatar(u, 'sm')}<i class="status on"></i></div>
              <span class="hl-text"><b>${esc(u.display)}${vb(u)}</b><small>${where ? `في ${esc(where.channel.name)}` : 'متصل'}</small></span>
              <button type="button" class="icon-btn ghost sm" data-dm-user="${esc(u.id)}" title="ارسل له رسالة" aria-label="ارسل رسالة لـ ${esc(u.display)}">${I.chat}</button>
            </div>`;
          }).join('')}</div>` : `<p class="home-empty">ما أحد من قروباتك متصل الحين.</p>`}
        </section>

        <section class="home-card" ${card()}>
          <div class="hc-head"><h2>آخر المحادثات</h2><button type="button" class="btn-link" data-home-act="dm">جديدة</button></div>
          ${dms.length ? `<div class="home-list">${dms.map((d) => `<button type="button" class="hl-row${S.unread.has(d.id) ? ' unread' : ''}" data-open-dm="${esc(d.id)}">
            ${avatar(d.other, 'sm')}<span class="hl-text"><b>${esc(d.other.display)}${vb(d.other)}</b><small>${d.last ? timeLabel(d.last) : ''}</small></span>
            ${S.unread.has(d.id) ? '<i class="dot unread-dot"></i>' : ''}</button>`).join('')}</div>`
            : `<p class="home-empty">ما عندك محادثات خاصة للحين.</p>`}
        </section>
      </aside>
    </div>` : ''}`;
}

$('#homeInner').addEventListener('click', (e) => {
  const act = e.target.closest('[data-home-act]');
  if (act) {
    switch (act.dataset.homeAct) {
      case 'create': openServerModal('create'); break;
      case 'join': openServerModal('join'); break;
      case 'dm': openDmModal(); break;
      case 'mic': openSettings(); break;
      case 'push': openSettings().then(() => $('#settingsModal .seg-tabs [data-pane=notify]').click()); break;
      case 'invite': {
        const s = [...S.servers.values()].find((x) => x.owner === S.me.id) || [...S.servers.values()][0];
        if (s) openInvite(s); else openServerModal('create');
        break;
      }
      case 'readAll': send({ t: 'notif.read', all: true }); break;
      case 'hideOnboard': store.set('onboardDone', true); renderHome(); toast('تقدر تلقى كل هذي من الأزرار فوق'); break;
    }
    return;
  }
  const join = e.target.closest('[data-join-voice]');
  if (join) { openChannel(join.dataset.joinVoice); joinVoice(join.dataset.joinVoice); return; }
  const srv = e.target.closest('[data-go-server]');
  if (srv) { selectServer(srv.dataset.goServer); return; }
  const dmU = e.target.closest('[data-dm-user]');
  if (dmU) { startDm({ userId: dmU.dataset.dmUser }); return; }
  const dm = e.target.closest('[data-open-dm]');
  if (dm) { openChannel(dm.dataset.openDm); return; }
  const n = e.target.closest('[data-notif]');
  if (n) openNotif(n.dataset.notif);
});
// التحية تتغير مع الوقت
setInterval(refreshHome, 60000);

// زر "راسل الإدارة" في الدعم الفني
$('#contactLinks').addEventListener('click', (e) => {
  const b = e.target.closest('[data-dm-user]');
  if (b) startDm({ userId: b.dataset.dmUser });
});
