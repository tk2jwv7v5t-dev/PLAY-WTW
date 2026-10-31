/* =====================================================
   PLAY WTW — الواجهة
   ===================================================== */
import { I, $, $$, esc, clean, fillIcons, avatar, linkify, timeLabel, store, toast, beep, ERRORS } from './util.js';
import { startIntro } from './intro.js';
import { MicPipeline, LevelWatcher } from './audio.js';
import { VoiceSession } from './voice.js';
import { SUPPORT } from './config.js';

const RES = { 720: [1280, 720], 1080: [1920, 1080], 1440: [2560, 1440], 2160: [3840, 2160] };
const PRESETS = [
  { label: 'موفّر', res: '720', fps: 30, mode: 'balanced' },
  { label: 'FHD', res: '1080', fps: 60, mode: 'balanced' },
  { label: '2K', res: '1440', fps: 60, mode: 'balanced' },
  { label: '4K', res: '2160', fps: 30, mode: 'detail' },
  { label: '4K 60', res: '2160', fps: 60, mode: 'balanced' },
  { label: 'قيمرز', res: '1080', fps: 144, mode: 'motion' },
];
const ICONS = ['🎮', '☕', '🎬', '📚', '💻', '🎧', '⚽', '🔥', '🌙', '🚀', '🎨', '🍿'];
const NS_LABEL = { gtcrn: 'ذكاء اصطناعي قوي', rnnoise: 'ذكاء اصطناعي خفيف', browser: 'المتصفح', off: 'مقفل' };

const settings = Object.assign({
  inDevice: '', outDevice: '', ns: 'rnnoise', gateAuto: true, gateDb: -50,
  inVol: 100, outVol: 100, ec: true, agc: true, sounds: true, userVol: {}, userMute: {},
  notify: false, notifyAll: false, fontScale: 'md', reduceMotion: false, ptt: false, pttKey: 'KeyV',
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
let introCtl = null;
const meReq = fetch('/api/me', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
meReq.then((d) => { if (d?.user) $('#introGoText').textContent = `ادخل يا ${d.user.display}`; });
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
  ws.onclose = async () => {
    if (S.ws !== ws) return;
    S.wsOpen = false;
    if (S.loggingOut) return;
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
      selectServer(S.cur.server, true);
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
      if (s) { s.name = m.name; s.icon = m.icon; renderAll(); }
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
      break;
    }
    case 'user.update': {
      const u = m.user;
      S.users.set(u.id, u);
      for (const s of S.servers.values()) if (s.members.has(u.id)) s.members.set(u.id, u);
      if (u.id === S.me.id) S.me = u;
      renderAll();
      if (S.cur.channel && channelKind(S.cur.channel) === 'text') renderMessages(true);
      break;
    }
    case 'rtc': S.vs?.onSignal(m.from, m.d); break;
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
  return null;
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
  if (!s?.channels.some((c) => c.id === ch)) ch = defaultChannel(s);
  if (fromReady && S.cur.channel && s?.channels.some((c) => c.id === S.cur.channel)) ch = S.cur.channel;
  selectChannel(ch);
}

function selectChannel(id) {
  S.cur.channel = id;
  const s = curServer();
  if (s && id) { S.lastChannel[s.id] = id; store.set('lastChannel', S.lastChannel); }
  S.unread.delete(id);
  closeNav();
  renderAll();
  if (id && channelKind(id) === 'text') {
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
    const unread = s.channels.some((c) => S.unread.has(c.id));
    const voice = S.myVoice && s.channels.some((c) => c.id === S.myVoice);
    return `<button class="rail-btn server${s.id === S.cur.server ? ' active' : ''}${unread ? ' unread' : ''}" type="button" data-server="${s.id}" title="${esc(s.name)}">
      ${s.icon ? `<span class="emoji">${esc(s.icon)}</span>` : `<span>${esc([...s.name][0] || '؟')}</span>`}
      ${voice ? `<i class="rail-voice">${I.volume}</i>` : ''}
    </button>`;
  }).join('');
  $('#homeBtn').classList.toggle('active', !S.cur.server);
}

function renderSidebar() {
  const s = curServer();
  $('#serverName').textContent = s ? s.name : 'PLAY WTW';
  $('#serverHeadBtn').disabled = !s;
  $('#app').classList.toggle('is-owner', !!isOwner(s));
  const list = $('#channelList');
  if (!s) {
    list.innerHTML = `<div class="side-empty">ما عندك قروب مختار.<br>اضغط <b>+</b> عشان تسوي أو تدخل قروب.</div>`;
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

function channelRow(c) {
  const active = c.id === S.cur.channel;
  const people = c.kind === 'voice' ? [...S.voice.values()].filter((v) => v.channel === c.id) : [];
  const row = `<div class="ch${active ? ' active' : ''}${S.unread.has(c.id) ? ' unread' : ''}${S.myVoice === c.id ? ' joined' : ''}" role="button" tabindex="0" data-ch="${c.id}">
    <span class="ch-icon">${c.kind === 'voice' ? I.volume : I.hash}</span>
    <span class="ch-name">${esc(c.name)}</span>
    ${isOwner() ? `<button class="mini-btn ch-del" type="button" data-del="${c.id}" title="احذف الروم">${I.trash}</button>` : ''}
  </div>`;
  if (!people.length) return row;
  return row + `<div class="vc-users">${people.map((v) => {
    const u = userOf(v.uid);
    const me = v.sid === S.sid;
    const speaking = me ? mic.speaking : levels.speaking(v.sid);
    return `<div class="vc-user${speaking ? ' speaking' : ''}${me ? '' : ' clickable'}" data-speak="${me ? 'me' : v.sid}"${me ? '' : ` data-user="${v.uid}" data-pop`}>
      ${avatar(u, 'xs')}<span>${esc(u.display)}</span>
      <span class="vc-icons">${v.sharing ? '<b class="live-tag">LIVE</b>' : ''}${settings.userMute[v.uid] ? `<i class="local-mute" title="مكتوم عندك">${I.volumeOff}</i>` : ''}${!v.mic ? I.micOff : ''}${v.deaf ? I.headphonesOff : ''}</span>
    </div>`;
  }).join('')}</div>`;
}

function renderMain() {
  const s = curServer();
  const found = S.cur.channel ? findChannel(S.cur.channel) : null;
  const c = found?.server === s ? found.channel : null;
  $('#emptyView').classList.toggle('hidden', !!c);
  $('#textView').classList.toggle('hidden', c?.kind !== 'text');
  $('#voiceView').classList.toggle('hidden', c?.kind !== 'voice');
  $('#chanIcon').innerHTML = c ? (c.kind === 'voice' ? I.volume : I.hash) : '';
  $('#chanName').textContent = c ? c.name : s ? s.name : 'PLAY WTW';
  $('#chanTopic').textContent = c?.kind === 'voice' ? 'روم صوتي' : c ? `في ${s.name}` : '';
  $('#msgInput').placeholder = c ? `اكتب رسالة في #${c.name}` : '';
  document.title = c ? `${c.kind === 'voice' ? '🔊' : '#'}${c.name} · ${s.name} — PLAY WTW` : 'PLAY WTW';
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
    <div class="m-names"><b>${esc(u.display)}${u.id === s.owner ? `<span class="crown" title="صاحب القروب">${I.crown}</span>` : ''}</b><small dir="ltr">@${esc(u.username)}</small></div>
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
  for (const b of [$('#dShare'), $('#vpShare')]) {
    b.innerHTML = S.screen ? I.monitorOff : I.monitor;
    b.classList.toggle('live', !!S.screen);
    b.title = S.screen ? 'وقف البث' : 'بث الشاشة';
  }
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
  if (!mine) notifyMessage(msg);
  if (!mine && !visible) {
    S.unread.add(msg.channel);
    renderRail(); renderSidebar();
    beep('msg', settings.sounds);
  }
}

function renderMessages(scrollToEnd) {
  const id = S.cur.channel;
  const box = $('#messages');
  const st = chanStore(id);
  const c = findChannel(id)?.channel;
  let html = '';
  if (st.loaded && !st.more) {
    html += `<div class="chan-start"><div class="cs-icon">${I.hash}</div><h2>هلا في #${esc(c?.name || '')}</h2><p class="muted">هذي بداية الروم. ابدأ السالفة!</p></div>`;
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
    html += `<div class="msg${cont ? ' cont' : ''}${m.pending ? ' pending' : ''}">
      ${cont ? `<span class="msg-time-h">${new Date(m.ts).toLocaleTimeString('ar', { hour: 'numeric', minute: '2-digit' })}</span>` : avatar(u)}
      <div class="msg-body">
        ${cont ? '' : `<div class="msg-meta"><b style="--h:${u.hue}">${esc(u.display)}</b><time>${timeLabel(m.ts)}</time></div>`}
        <div class="msg-text">${linkify(esc(m.text))}</div>
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

function sendMessage() {
  const input = $('#msgInput');
  const text = input.value.trim();
  if (!text || !S.cur.channel) return;
  if (!S.wsOpen) { toast(ERRORS.network, 'err'); return; }
  const nonce = Math.random().toString(36).slice(2);
  chanStore(S.cur.channel).list.push({ id: 'p-' + nonce, nonce, channel: S.cur.channel, uid: S.me.id, text, ts: Date.now(), pending: true });
  renderMessages(true);
  send({ t: 'msg.send', channelId: S.cur.channel, text, nonce });
  input.value = '';
  autosize();
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
  send({ t: 'voice.update', mic: S.micOn && S.hasMic && !S.deaf, deaf: S.deaf, sharing: !!S.screen });
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
    $('.tile-who', t.el).textContent = sid === S.sid ? 'شاشتك' : `${userOf(v?.uid).display} يبث`;
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
      <div class="tile-name">${esc(u.display)}${me ? ' <small>(أنت)</small>' : ''}</div>
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
          ? `<button class="tile-btn" data-act="cfg" title="جودة البث">${I.sliders}</button>
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
$('#screens').addEventListener('dblclick', (e) => {
  const el = e.target.closest('.screen-tile');
  if (el && e.target.tagName === 'VIDEO') fullscreen(el);
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
    <div class="pop-user">${avatar(u, 'sm')}<div><b>${esc(u.display)}</b><small dir="ltr">@${esc(u.username)}</small></div></div>
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
    // ضغطتين بالإصبع: تكبير/ملء شاشة (الماوس عنده dblclick)
    if (e.pointerType !== 'mouse' && !moved && pts.size === 0) {
      const now = Date.now();
      if (now - lastTap < 320) {
        lastTap = 0;
        if (t.zoom.s > 1) setZoom(t, 1, 0, 0); else fullscreen(t.el);
      } else lastTap = now;
    }
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

async function startShare() {
  if (!S.myVoice) { toast('ادخل روم صوتي أول عشان تبث'); return; }
  if (!navigator.mediaDevices?.getDisplayMedia) {
    toast('جهازك أو متصفحك ما يدعم بث الشاشة — جرّب كروم أو إيدج على الكمبيوتر', 'err');
    return;
  }
  let st;
  try {
    st = await navigator.mediaDevices.getDisplayMedia({
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
  if (!vt) return;
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

function iconPicker(el, selected) {
  el.innerHTML = ['', ...ICONS].map((i) => `<label><input type="radio" name="icon" value="${i}"${i === selected ? ' checked' : ''}><span>${i || 'Aa'}</span></label>`).join('');
}

/* ---- قروب جديد / دخول ---- */
function openServerModal(pane = 'create') {
  $('#createServerForm').reset();
  $('#joinServerForm').reset();
  iconPicker($('#iconPicker'), ICONS[Math.floor(Math.random() * ICONS.length)]);
  openModal('#serverModal');
  $(`#serverModal .seg-tabs [data-pane="${pane}"]`).click();
}
$('#createServerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    const s = await request({ t: 'server.create', name: f.name.value, icon: f.icon.value });
    closeModals();
    selectServer(s.id);
    toast(`سوّينا ${s.name} 🎉 ادعُ أصحابك من قائمة القروب`, 'ok');
  } catch (err) { toast(ERRORS[err.message] || ERRORS.network, 'err'); }
});
$('#joinServerForm').addEventListener('submit', (e) => {
  e.preventDefault();
  joinServer(e.target.invite.value);
});
async function joinServer(raw) {
  const code = String(raw).trim().split(/invite=|\//).pop();
  if (!code) return;
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
    case 'newText': openChannelModal('text'); break;
    case 'newVoice': openChannelModal('voice'); break;
    case 'rename':
      iconPicker($('#iconPicker2'), s.icon);
      $('#renameForm').name.value = s.name;
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
$('#renameForm').addEventListener('submit', (e) => {
  e.preventDefault();
  send({ t: 'server.update', serverId: S.cur.server, name: e.target.name.value, icon: e.target.icon.value });
  closeModals();
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
  try {
    const c = await request({ t: 'channel.create', serverId: S.cur.server, name: f.name.value, kind: f.kind.value });
    closeModals();
    if (c.kind === 'text') selectChannel(c.id); else renderAll();
  } catch (err) { toast(ERRORS[err.message] || ERRORS.network, 'err'); }
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
  $('#optNotify').checked = settings.notify && 'Notification' in window && Notification.permission === 'granted';
  $('#optNotifyAll').checked = settings.notifyAll;
  $('#optNotifyAll').disabled = !$('#optNotify').checked;
  $('#optNotify').disabled = !('Notification' in window);
  if (!('Notification' in window)) $('#notifyHint').textContent = 'متصفحك ما يدعم الإشعارات. في الآيفون: أضف الموقع للشاشة الرئيسية أول.';
  $$('#settingsModal input[name=fontScale]').forEach((r) => { r.checked = r.value === settings.fontScale; });
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
  if (!mic.running) {
    try { await mic.start(settings); S.hasMic = true; } catch { $('#nsHint').textContent = 'ما قدرنا نوصل للمايك — اسمح له من إعدادات المتصفح.'; }
  }
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
  if (!mic.running) return;
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
$('#micTest').addEventListener('click', () => {
  const on = !$('#micTest').classList.contains('active');
  $('#micTest').classList.toggle('active', on);
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
  if (f.next.value.length < 8) { err.textContent = ERRORS.bad_password; return; }
  err.textContent = '';
  try {
    await postJSON('/api/password', { current: f.current.value, next: f.next.value });
    f.reset();
    toast('تغيّرت كلمة المرور ✅', 'ok');
  } catch (ex) { err.textContent = ERRORS[ex.message] || ERRORS.network; }
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
  if (b) selectServer(b.dataset.server);
});
$('#homeBtn').addEventListener('click', () => selectServer(null));
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
  const row = e.target.closest('[data-ch]');
  if (!row) return;
  const id = row.dataset.ch;
  selectChannel(id);
  if (channelKind(id) === 'voice') joinVoice(id);
});
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
for (const id of ['#dShare', '#vpShare']) $(id).addEventListener('click', () => (S.screen ? stopShare() : startShare()));
$('#dShareCfg').addEventListener('click', openShareModal);
for (const id of ['#dLeave', '#vpLeave']) $(id).addEventListener('click', () => leaveVoice());
$('#settingsBtn').addEventListener('click', openSettings);

$('#membersToggle').addEventListener('click', () => {
  const app = $('#app');
  if (matchMedia('(max-width: 900px)').matches) { app.classList.toggle('members-open'); app.classList.remove('nav-open'); }
  else app.classList.toggle('members-hidden');
});
$('#navToggle').addEventListener('click', () => { $('#app').classList.toggle('nav-open'); $('#app').classList.remove('members-open'); });
$('#scrim').addEventListener('click', () => $('#app').classList.remove('nav-open', 'members-open'));
function closeNav() { $('#app').classList.remove('nav-open', 'members-open'); }

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
function notifyMessage(msg) {
  if (!settings.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
  if (!document.hidden && !(settings.notifyAll && S.cur.channel !== msg.channel)) return;
  const f = findChannel(msg.channel);
  const u = userOf(msg.uid);
  try {
    const n = new Notification(`${u.display} في #${f?.channel.name || ''}`, {
      body: msg.text.length > 140 ? msg.text.slice(0, 140) + '…' : msg.text,
      tag: msg.channel,
      icon: '/icon.svg',
      lang: 'ar', dir: 'rtl',
    });
    n.onclick = () => { focus(); if (f) { S.cur.server = f.server.id; selectChannel(f.channel.id); } n.close(); };
  } catch { /* بعض الجوالات ما تدعم الإشعار من الصفحة */ }
}

/* ---- المظهر ---- */
function applyLook() {
  document.documentElement.style.zoom = { sm: 0.9, md: 1, lg: 1.12 }[settings.fontScale] || 1;
  document.body.classList.toggle('reduce-motion', !!settings.reduceMotion);
}
applyLook();

/* ---- الدعم الفني ---- */
function openHelp() {
  const links = [];
  if (SUPPORT.email) links.push(`<a class="btn btn-primary btn-sm" href="mailto:${esc(SUPPORT.email)}?subject=${encodeURIComponent('مشكلة في PLAY WTW')}">راسلنا على الإيميل</a>`);
  for (const l of SUPPORT.links || []) if (/^https:\/\//.test(l.url)) links.push(`<a class="btn btn-soft btn-sm" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}</a>`);
  $('#contactLinks').innerHTML = links.join('');
  $('#contactBox').classList.toggle('hidden', !links.length);
  openModal('#helpModal');
}
$('#helpBtn').addEventListener('click', openHelp);
$('#authHelp').addEventListener('click', openHelp);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && S.cur.channel) { S.unread.delete(S.cur.channel); renderRail(); renderSidebar(); }
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
