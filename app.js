/* =====================================================
   غُرَف — رومات صوت وشات وبث شاشة
   كل شي مباشر بين المتصفحات (WebRTC عبر PeerJS).

   طريقة الروم:
   - كل عضو له معرف عشوائي، ويتصل مع كل الباقين (mesh).
   - أول واحد يدخل يحجز معرف "المرساة" (PREFIX + رمز الروم).
     اللي يدخل بعده يسأل المرساة عن قائمة الأعضاء ويتصل فيهم.
   - إذا طلع صاحب المرساة، واحد من الباقين يحجزها مكانه.
   ===================================================== */
(() => {
  'use strict';

  const PREFIX = 'playwtw-v2-';
  const PEER_OPTS = {
    debug: 0,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' },
        // لو بعض الشبكات ما اتصلت، أضف سيرفر TURN هنا:
        // { urls: 'turn:YOUR_TURN_SERVER:3478', username: 'user', credential: 'pass' },
      ],
    },
    // لو عندك سيرفر PeerJS خاص، عرّف قبل app.js:
    // window.GHURAF_PEER_SERVER = { host: 'example.com', port: 443, path: '/', secure: true };
    ...(window.GHURAF_PEER_SERVER || {}),
  };

  const PUBLIC_ROOMS = [
    { code: 'diwaniya', name: 'الديوانية', desc: 'سوالف وطقطقة', icon: '☕' },
    { code: 'gaming', name: 'قيمنق', desc: 'بث ألعاب وتنسيق', icon: '🎮' },
    { code: 'cinema', name: 'السينما', desc: 'نتفرج سوا', icon: '🎬' },
    { code: 'study', name: 'المذاكرة', desc: 'شغل وتركيز', icon: '📚' },
    { code: 'music', name: 'طرب', desc: 'أغاني وجلسات', icon: '🎧' },
    { code: 'dev', name: 'المبرمجين', desc: 'كود وشاشات', icon: '💻' },
  ];

  const RES = { 720: [1280, 720], 1080: [1920, 1080], 1440: [2560, 1440], 2160: [3840, 2160] };
  const PRESETS = [
    { label: 'موفّر', res: '720', fps: 30, mode: 'balanced' },
    { label: 'FHD', res: '1080', fps: 60, mode: 'balanced' },
    { label: '2K', res: '1440', fps: 60, mode: 'balanced' },
    { label: '4K', res: '2160', fps: 30, mode: 'detail' },
    { label: '4K 60', res: '2160', fps: 60, mode: 'balanced' },
    { label: 'قيمرز', res: '1080', fps: 144, mode: 'motion' },
  ];
  const DEGRADATION = { detail: 'maintain-resolution', motion: 'maintain-framerate', balanced: 'balanced' };

  /* ---------- أيقونات ---------- */
  const svg = (p) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
  const I = {
    mic: svg('<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/>'),
    micOff: svg('<path d="m2 2 20 20"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><path d="M12 19v3"/>'),
    headphones: svg('<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>'),
    headphonesOff: svg('<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/><path d="m2 2 20 20"/>'),
    monitor: svg('<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>'),
    monitorOff: svg('<path d="M17 17H4a2 2 0 0 1-2-2V5c0-1.5 1-2 1-2"/><path d="M22 15V5a2 2 0 0 0-2-2H9"/><path d="M8 21h8"/><path d="M12 17v4"/><path d="m2 2 20 20"/>'),
    sliders: svg('<path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M2 14h4"/><path d="M10 8h4"/><path d="M18 16h4"/>'),
    cog: svg('<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>'),
    chat: svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
    phoneOff: svg('<path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><path d="M22 2 2 22"/>'),
    link: svg('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'),
    send: svg('<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>'),
    x: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
    maximize: svg('<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>'),
    focus: svg('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/>'),
    activity: svg('<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>'),
    volume: svg('<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>'),
    volumeOff: svg('<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/>'),
  };

  /* ---------- أدوات ---------- */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clean = (s, max = 24) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.codePointAt(0)) % 360; return h; };
  const avatar = (name, cls = '') => `<div class="avatar ${cls}" style="--h:${hue(name)}">${esc([...(clean(name) || '؟')][0])}</div>`;
  const time = (ts) => new Date(ts).toLocaleTimeString('ar', { hour: 'numeric', minute: '2-digit' });
  const sanitizeCode = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '').slice(0, 24);
  const randomCode = () => { const a = 'abcdefghjkmnpqrstuvwxyz23456789'; let s = ''; for (let i = 0; i < 7; i++) s += a[Math.floor(Math.random() * a.length)]; return s; };
  const idFromError = (e) => String(e?.message || '').trim().split(' ').pop();
  const store = {
    get(k, d) { try { const v = localStorage.getItem('ghuraf:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('ghuraf:' + k, JSON.stringify(v)); } catch { /* تجاهل */ } },
  };
  function fillIcons(root = document) {
    for (const el of $$('[data-icon]', root)) el.innerHTML = I[el.dataset.icon] || '';
  }

  function toast(text, type = '') {
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = text;
    $('#toasts').append(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 3600);
  }

  let actx = null;
  function audioCtx() {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume().catch(() => {});
    return actx;
  }
  function beep(kind) {
    if (!settings.sounds) return;
    const seq = {
      join: [[660, 0], [880, 0.09]], leave: [[700, 0], [460, 0.1]], msg: [[940, 0]],
      on: [[520, 0], [780, 0.07]], off: [[600, 0], [380, 0.07]],
    }[kind];
    try {
      const ctx = audioCtx();
      for (const [f, t] of seq) {
        const o = ctx.createOscillator(), g = ctx.createGain(), t0 = ctx.currentTime + t;
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(0.07, t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
        o.connect(g).connect(ctx.destination);
        o.start(t0); o.stop(t0 + 0.18);
      }
    } catch { /* تجاهل */ }
  }

  /* ---------- الحالة ---------- */
  const settings = Object.assign({ deviceId: '', ns: true, ec: true, agc: true, sounds: true }, store.get('settings', {}));
  const shareCfg = Object.assign({ res: '1080', fps: 60, mode: 'balanced', brAuto: true, br: 12, audio: true }, store.get('share', {}));

  const S = {
    peer: null, anchor: null, myId: '', name: '', code: '',
    mic: null, micTrack: null, micOn: true, hasMic: false, deaf: false, micBeforeDeaf: true,
    screen: null,
    members: new Map(),        // id -> { id, name, conn, hello, mic, deaf, sharing, anchor, voice, audio, volume, lastSeen, added }
    screens: new Map(),        // id ('me' أو معرف العضو) -> { tile, video, call, statsEl, prev, muted }
    outScreenCalls: new Map(), // id -> المكالمة اللي أبث فيها شاشتي له
    messages: [], seen: new Set(), history: 'none',
    unread: 0, panelOpen: matchMedia('(min-width: 901px)').matches, tab: 'chat', focus: null,
    joinedAt: 0, leaving: false, whoTimer: null, typing: new Map(), lastTypingSent: 0,
  };

  const anchorId = () => PREFIX + S.code;
  const viewers = () => [...S.members.values()].filter((m) => m.hello).length;

  function autoBitrate(cfg = shareCfg) {
    const [w, h] = RES[cfg.res] || [screen.width * devicePixelRatio, screen.height * devicePixelRatio];
    const factor = { detail: 0.065, balanced: 0.075, motion: 0.085 }[cfg.mode] || 0.075;
    return Math.round(Math.min(80, Math.max(1.5, (w * h * cfg.fps * factor) / 1e6)) * 10) / 10;
  }
  const bitrateFor = (cfg = shareCfg) => (cfg.brAuto ? autoBitrate(cfg) : cfg.br);

  /* =====================================================
     اللوبي
     ===================================================== */
  function initLobby() {
    $('#nameInput').value = store.get('name', '');
    $('#publicRooms').innerHTML = PUBLIC_ROOMS.map((r) => `
      <button class="room-card glass" type="button" data-code="${r.code}">
        <span class="rc-icon">${r.icon}</span>
        <span class="rc-text"><b>${esc(r.name)}</b><small>${esc(r.desc)}</small></span>
        <span class="rc-count" data-count="${r.code}"><i class="dot"></i><span>…</span></span>
      </button>`).join('');

    $('#publicRooms').addEventListener('click', (e) => {
      const card = e.target.closest('[data-code]');
      if (card) tryJoin(card.dataset.code);
    });
    $('#createBtn').addEventListener('click', () => tryJoin(randomCode()));
    $('#joinForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const raw = $('#codeInput').value;
      const code = sanitizeCode(raw);
      if (code.length < 3) {
        shake($('#codeInput'));
        toast(raw.trim() ? 'الرمز لازم يكون حروف إنجليزية وأرقام (3 أحرف أو أكثر)' : 'اكتب رمز الروم');
        return;
      }
      tryJoin(code);
    });
    $('#nameInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const c = sanitizeCode($('#codeInput').value); tryJoin(c.length >= 3 ? c : randomCode()); }
    });
    $('#refreshRooms').addEventListener('click', probeRooms);

    const invite = sanitizeCode(new URLSearchParams(location.search).get('room') || location.hash.slice(1));
    if (invite.length >= 3) {
      $('#inviteBanner').classList.remove('hidden');
      $('#inviteRoom').textContent = invite;
      $('#codeInput').value = invite;
      $('#nameInput').focus();
    }
    probeRooms();
  }

  function shake(el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); el.focus(); }

  function tryJoin(code) {
    const name = clean($('#nameInput').value);
    if (!name) { shake($('#nameInput')); toast('اكتب اسمك أول'); return; }
    if (!window.Peer) { toast('ما قدرنا نحمل مكتبة الاتصال — تأكد من النت وحدّث الصفحة', 'err'); return; }
    store.set('name', name);
    joinRoom(code, name);
  }

  // نعرف كم واحد في كل روم عامة بسؤال المرساة حقتها
  let probe = null;
  function probeRooms() {
    if (!window.Peer || S.code) return;
    const setCount = (code, n, names) => {
      const el = $(`[data-count="${code}"]`);
      if (!el) return;
      el.querySelector('.dot').className = 'dot' + (n > 0 ? ' on' : '');
      el.querySelector('span').textContent = n == null ? '—' : n > 0 ? `${n} متصل` : 'فاضي';
      el.title = names?.length ? names.join('، ') : '';
    };
    const run = () => {
      for (const r of PUBLIC_ROOMS) {
        const conn = probe.connect(PREFIX + r.code, { serialization: 'json' });
        const to = setTimeout(() => { setCount(r.code, null); conn.close(); }, 7000);
        conn.on('open', () => conn.send({ t: 'who' }));
        conn.on('data', (d) => {
          if (d?.t !== 'list') return;
          clearTimeout(to);
          setCount(r.code, d.peers.length, (d.names || []).map((n) => clean(n)));
          setTimeout(() => conn.close(), 200);
        });
      }
    };
    if (probe && !probe.destroyed && probe.open) return run();
    if (probe) probe.destroy();
    probe = new Peer(PEER_OPTS);
    probe.on('open', run);
    probe.on('error', (e) => {
      if (e.type === 'peer-unavailable') setCount(idFromError(e).slice(PREFIX.length), 0);
    });
  }

  /* =====================================================
     الدخول للروم
     ===================================================== */
  async function joinRoom(code, name) {
    S.code = code; S.name = name; S.joinedAt = Date.now();
    if (probe) { probe.destroy(); probe = null; }

    const pub = PUBLIC_ROOMS.find((r) => r.code === code);
    const title = pub ? `${pub.icon} ${pub.name}` : 'روم خاص';
    $('#roomTitle').textContent = title;
    $('#roomCode').textContent = code;
    document.title = `${pub ? pub.name : code} — غُرَف`;
    history.replaceState(null, '', `${location.pathname}?room=${code}`);

    $('#lobby').classList.add('hidden');
    $('#room').classList.remove('hidden');
    setPanel(S.panelOpen);
    setStatus('connecting');
    renderAll();
    renderChatEmpty();

    await setupMic();

    S.peer = new Peer(PEER_OPTS);
    S.peer.on('open', (id) => {
      if (S.myId) { setStatus('online'); return; } // رجع بعد انقطاع
      S.myId = id;
      claimAnchor();
    });
    S.peer.on('connection', onIncomingConn);
    S.peer.on('call', onIncomingCall);
    S.peer.on('disconnected', () => {
      if (S.leaving) return;
      setStatus('reconnecting');
      setTimeout(() => { if (S.peer && !S.peer.destroyed && S.peer.disconnected) S.peer.reconnect(); }, 1500);
    });
    S.peer.on('error', onPeerError);

    setInterval(heartbeat, 4000);
    setInterval(updateStats, 1000);
  }

  function onPeerError(e) {
    if (e.type === 'peer-unavailable') {
      const id = idFromError(e);
      if (id === anchorId()) { clearTimeout(S.whoTimer); claimAnchor(); }
      else removeMember(id, false);
      return;
    }
    if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) {
      setStatus('reconnecting');
      return;
    }
    if (e.type === 'browser-incompatible') toast('متصفحك ما يدعم المكالمات — جرب كروم أو إيدج أو فايرفوكس', 'err');
    console.warn('peer error', e.type, e);
  }

  // نحاول نحجز معرف المرساة. إذا محجوز، نسأل صاحبه عن الأعضاء
  function claimAnchor() {
    if (S.anchor || S.leaving) return;
    const a = new Peer(anchorId(), PEER_OPTS);
    a.on('open', () => {
      S.anchor = a;
      setStatus('online');
      broadcast({ t: 'anchor' });
      if (!S.members.size) sysMsg('أنت أول واحد في الروم — ارسل رابط الدعوة لخويك 👋');
    });
    a.on('connection', (conn) => {
      conn.on('data', (d) => {
        if (d?.t !== 'who') return;
        const list = [...S.members.values()].filter((m) => m.hello);
        conn.send({ t: 'list', peers: [S.myId, ...list.map((m) => m.id)], names: [S.name, ...list.map((m) => m.name)] });
      });
    });
    a.on('disconnected', () => { if (S.anchor === a && !S.leaving) a.reconnect(); });
    a.on('error', (e) => {
      if (e.type !== 'unavailable-id') return;
      a.destroy();
      if (S.anchor === a) S.anchor = null;
      askAnchor();
    });
  }

  function askAnchor() {
    if (S.leaving) return;
    const conn = S.peer.connect(anchorId(), { serialization: 'json' });
    clearTimeout(S.whoTimer);
    S.whoTimer = setTimeout(() => { conn.close(); claimAnchor(); }, 9000);
    conn.on('open', () => conn.send({ t: 'who' }));
    conn.on('data', (d) => {
      if (d?.t !== 'list') return;
      clearTimeout(S.whoTimer);
      setTimeout(() => conn.close(), 200);
      setStatus('online');
      for (const id of d.peers) connectMember(id);
    });
  }

  /* =====================================================
     الأعضاء والرسائل بينهم
     ===================================================== */
  function addMember(id, conn) {
    const m = {
      id, name: '…', conn, hello: false, mic: true, deaf: false, sharing: false, anchor: false,
      voice: null, audio: null, volume: 1, lastSeen: Date.now(), added: Date.now(),
    };
    S.members.set(id, m);
    return m;
  }

  function connectMember(id) {
    if (!id || id === S.myId || S.members.has(id) || S.leaving) return;
    const conn = S.peer.connect(id, { serialization: 'json', reliable: true });
    wireConn(addMember(id, conn), conn);
  }

  function onIncomingConn(conn) {
    let m = S.members.get(conn.peer);
    if (m?.conn && m.conn !== conn) {
      // اتصلنا ببعض بنفس اللحظة: نخلي اتصال صاحب المعرف الأصغر
      if (conn.peer < S.myId) { const old = m.conn; m.conn = conn; old.close(); }
      else { conn.close(); return; }
    }
    if (!m) m = addMember(conn.peer, conn);
    m.conn = conn;
    wireConn(m, conn);
  }

  function wireConn(m, conn) {
    conn.on('open', () => send(m, helloMsg()));
    conn.on('data', (d) => { if (m.conn === conn) onData(m, d); });
    conn.on('close', () => { if (m.conn === conn) removeMember(m.id, true); });
    conn.on('error', (e) => console.warn('conn error', e));
  }

  const helloMsg = () => ({
    t: 'hello', name: S.name, mic: S.micOn && S.hasMic, deaf: S.deaf, sharing: !!S.screen, anchor: !!S.anchor,
  });
  function send(m, msg) { try { if (m.conn?.open) m.conn.send(msg); } catch { /* تجاهل */ } }
  function broadcast(msg) { for (const m of S.members.values()) if (m.hello) send(m, msg); }
  const broadcastState = () => broadcast({ t: 'state', mic: S.micOn && S.hasMic, deaf: S.deaf, sharing: !!S.screen });

  function onData(m, d) {
    if (!d || typeof d !== 'object') return;
    m.lastSeen = Date.now();
    switch (d.t) {
      case 'hello': {
        const first = !m.hello;
        m.hello = true;
        m.name = clean(d.name) || 'ضيف';
        Object.assign(m, { mic: !!d.mic, deaf: !!d.deaf, sharing: !!d.sharing, anchor: !!d.anchor });
        if (!first) break;
        if (Date.now() - S.joinedAt > 4000) { sysMsg(`${m.name} دخل الروم`); beep('join'); }
        if (S.myId < m.id) startVoice(m); // واحد بس من الطرفين يبدأ المكالمة
        if (S.screen) startScreenTo(m);
        if (S.history === 'none') { S.history = 'pending'; send(m, { t: 'history-req' }); }
        break;
      }
      case 'state':
        Object.assign(m, { mic: !!d.mic, deaf: !!d.deaf, sharing: !!d.sharing });
        if (!m.sharing) removeScreen(m.id);
        break;
      case 'anchor':
        for (const o of S.members.values()) o.anchor = false;
        m.anchor = true;
        break;
      case 'chat':
        if (d.msg?.from === m.id) addMessage(d.msg);
        S.typing.delete(m.id); renderTyping();
        break;
      case 'typing':
        S.typing.set(m.id, Date.now()); renderTyping();
        break;
      case 'history-req':
        send(m, { t: 'history', msgs: S.messages.slice(-80) });
        break;
      case 'history':
        if (S.history === 'done' || !Array.isArray(d.msgs)) break;
        S.history = 'done';
        d.msgs.slice().sort((a, b) => a.ts - b.ts).forEach((msg) => addMessage(msg, true));
        break;
      case 'bye':
        removeMember(m.id, true);
        return;
    }
    renderAll();
  }

  function removeMember(id, announce) {
    const m = S.members.get(id);
    if (!m) return;
    S.members.delete(id);
    try { m.conn?.close(); } catch { /* تجاهل */ }
    try { m.voice?.close(); } catch { /* تجاهل */ }
    if (m.audio) { m.audio.srcObject = null; m.audio.remove(); }
    unwatchLevel(id);
    removeScreen(id);
    const out = S.outScreenCalls.get(id);
    if (out) { S.outScreenCalls.delete(id); out.close(); }
    S.typing.delete(id);
    if (m.hello && announce) { sysMsg(`${m.name} طلع من الروم`); beep('leave'); }
    // صاحب المرساة طلع: واحد منا يحجزها (تأخير عشوائي عشان ما نتزاحم)
    if (m.anchor && !S.anchor && !S.leaving) setTimeout(claimAnchor, 300 + Math.random() * 1500);
    renderAll();
  }

  function heartbeat() {
    if (S.leaving) return;
    broadcast({ t: 'ping' });
    const now = Date.now();
    for (const m of S.members.values()) {
      if ((m.hello && now - m.lastSeen > 16000) || (!m.hello && now - m.added > 20000)) removeMember(m.id, m.hello);
    }
    for (const [id, t] of S.typing) if (now - t > 3500) { S.typing.delete(id); renderTyping(); }
  }

  /* =====================================================
     الصوت
     ===================================================== */
  async function setupMic() {
    const audio = {
      echoCancellation: settings.ec, noiseSuppression: settings.ns, autoGainControl: settings.agc, channelCount: 1,
    };
    if (settings.deviceId) audio.deviceId = { exact: settings.deviceId };
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
      let st;
      try { st = await navigator.mediaDevices.getUserMedia({ audio }); }
      catch (e) {
        if (!settings.deviceId) throw e;
        delete audio.deviceId; settings.deviceId = '';
        st = await navigator.mediaDevices.getUserMedia({ audio });
      }
      S.hasMic = true;
      setMicTrack(st.getAudioTracks()[0]);
    } catch (e) {
      S.hasMic = false; S.micOn = false;
      if (!S.micTrack) setMicTrack(silentTrack());
      toast('ما قدرنا نوصل للمايك — تقدر تسمع وتكتب، واضغط زر المايك لما تسمح له', 'err');
    }
    renderAll();
  }

  function silentTrack() {
    const dest = audioCtx().createMediaStreamDestination();
    return dest.stream.getAudioTracks()[0];
  }

  function setMicTrack(track) {
    const old = S.micTrack;
    S.micTrack = track;
    track.enabled = S.micOn;
    if (!S.mic) S.mic = new MediaStream([track]);
    else { if (old) S.mic.removeTrack(old); S.mic.addTrack(track); }
    for (const m of S.members.values()) {
      const sender = m.voice?.peerConnection?.getSenders().find((s) => s.track === old || s.track?.kind === 'audio');
      sender?.replaceTrack(track).catch(() => {});
    }
    if (old && old !== track) old.stop();
    watchLevel('me', S.mic);
  }

  function startVoice(m) {
    if (m.voice || !S.mic) return;
    wireVoice(m, S.peer.call(m.id, S.mic, { metadata: { kind: 'voice' } }));
  }

  function onIncomingCall(call) {
    if (call.metadata?.kind === 'screen') {
      call.answer();
      call.on('stream', (st) => addRemoteScreen(call.peer, st, call));
      call.on('close', () => { if (S.screens.get(call.peer)?.call === call) removeScreen(call.peer); });
      return;
    }
    const m = S.members.get(call.peer) || addMember(call.peer, null);
    if (m.voice && m.voice !== call) m.voice.close();
    call.answer(S.mic);
    wireVoice(m, call);
  }

  function wireVoice(m, call) {
    m.voice = call;
    call.on('stream', (st) => {
      if (!m.audio) { m.audio = new Audio(); m.audio.autoplay = true; }
      m.audio.srcObject = st;
      m.audio.volume = m.volume;
      m.audio.muted = S.deaf;
      m.audio.play().catch(needGesture);
      watchLevel(m.id, st);
    });
    call.on('close', () => { if (m.voice === call) m.voice = null; });
    call.on('error', (e) => console.warn('voice error', e));
  }

  let gestureWaiting = false;
  function needGesture() {
    if (gestureWaiting) return;
    gestureWaiting = true;
    toast('اضغط في أي مكان عشان يشتغل الصوت 🔊');
    document.addEventListener('pointerdown', () => {
      gestureWaiting = false;
      audioCtx();
      for (const m of S.members.values()) m.audio?.play().catch(() => {});
      for (const s of S.screens.values()) s.video.play().catch(() => {});
    }, { once: true });
  }

  async function toggleMic() {
    if (!S.hasMic) {
      S.micOn = true;
      await setupMic();
      if (!S.hasMic) return;
    } else {
      S.micOn = !S.micOn;
      if (S.micOn && S.deaf) setDeaf(false);
    }
    S.micTrack.enabled = S.micOn;
    beep(S.micOn ? 'on' : 'off');
    broadcastState();
    renderAll();
  }

  function setDeaf(v) {
    S.deaf = v;
    if (v) { S.micBeforeDeaf = S.micOn; S.micOn = false; }
    else if (S.hasMic) S.micOn = S.micBeforeDeaf;
    if (S.micTrack) S.micTrack.enabled = S.micOn;
    for (const m of S.members.values()) if (m.audio) m.audio.muted = v;
    for (const [id, s] of S.screens) if (id !== 'me') s.video.muted = v || s.muted;
    beep(v ? 'off' : 'on');
    broadcastState();
    renderAll();
  }

  /* ---- مين يتكلم ---- */
  const meters = new Map();
  function watchLevel(id, stream) {
    unwatchLevel(id);
    try {
      const ctx = audioCtx();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      meters.set(id, { src, an, buf: new Uint8Array(an.fftSize), level: 0, hold: 0, speaking: false });
    } catch { /* تجاهل */ }
  }
  function unwatchLevel(id) {
    const x = meters.get(id);
    if (x) { try { x.src.disconnect(); } catch { /* تجاهل */ } meters.delete(id); }
  }
  setInterval(() => {
    for (const [id, x] of meters) {
      x.an.getByteTimeDomainData(x.buf);
      let sum = 0;
      for (const v of x.buf) { const f = (v - 128) / 128; sum += f * f; }
      x.level = Math.sqrt(sum / x.buf.length);
      const allowed = id === 'me' ? S.micOn : S.members.get(id)?.mic;
      if (allowed && x.level > 0.03) x.hold = 4; else if (x.hold > 0) x.hold--;
      const sp = x.hold > 0;
      if (sp !== x.speaking) {
        x.speaking = sp;
        for (const el of $$(`[data-pid="${id}"]`)) el.classList.toggle('speaking', sp);
      }
    }
    if (!$('#settingsModal').classList.contains('hidden')) {
      $('#micMeter').style.width = Math.min(100, (meters.get('me')?.level || 0) * 450) + '%';
    }
  }, 100);

  /* =====================================================
     بث الشاشة
     ===================================================== */
  function videoConstraints(cfg) {
    const v = { frameRate: { ideal: cfg.fps, max: cfg.fps } };
    const r = RES[cfg.res];
    if (r) { v.width = { ideal: r[0], max: r[0] }; v.height = { ideal: r[1], max: r[1] }; }
    return v;
  }

  async function startShare() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast('جهازك أو متصفحك ما يدعم بث الشاشة — جرب كروم أو إيدج على الكمبيوتر', 'err');
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
    if (S.screen) stopShare(true);
    S.screen = st;
    const vt = st.getVideoTracks()[0];
    vt.contentHint = shareCfg.mode === 'motion' ? 'motion' : 'detail';
    vt.addEventListener('ended', () => stopShare());

    const s = screenTile('me');
    s.video.muted = true;
    s.video.srcObject = st;
    s.video.play().catch(() => {});

    for (const m of S.members.values()) if (m.hello) startScreenTo(m);
    broadcastState();
    renderAll();

    const set = vt.getSettings();
    toast(`بدأ البث: ${set.width || '?'}×${set.height || '?'} · ${Math.round(set.frameRate || shareCfg.fps)} فريم · ${bitrateFor()} Mbps`, 'ok');
  }

  function stopShare(silent) {
    if (!S.screen) return;
    S.screen.getTracks().forEach((t) => t.stop());
    S.screen = null;
    for (const call of S.outScreenCalls.values()) call.close();
    S.outScreenCalls.clear();
    removeScreen('me');
    if (!silent) { broadcastState(); renderAll(); }
  }

  function startScreenTo(m) {
    if (!S.screen || S.outScreenCalls.has(m.id)) return;
    const call = S.peer.call(m.id, S.screen, { metadata: { kind: 'screen' } });
    S.outScreenCalls.set(m.id, call);
    call.on('close', () => { if (S.outScreenCalls.get(m.id) === call) S.outScreenCalls.delete(m.id); });
    call.on('error', (e) => console.warn('screen call error', e));
    // نضبط الجودة بعد ما يتم الاتصال (ونعيدها كم مرة احتياط)
    for (const ms of [800, 2500, 6000]) setTimeout(() => tuneSender(call), ms);
  }

  async function tuneSender(call) {
    const pc = call.peerConnection;
    if (!pc || pc.connectionState === 'closed') return;
    for (const sender of pc.getSenders()) {
      if (!sender.track) continue;
      const p = sender.getParameters();
      if (!p.encodings || !p.encodings.length) p.encodings = [{}];
      if (sender.track.kind === 'video') {
        Object.assign(p.encodings[0], {
          maxBitrate: Math.round(bitrateFor() * 1e6),
          maxFramerate: shareCfg.fps,
          scaleResolutionDownBy: 1,
          priority: 'high',
          networkPriority: 'high',
        });
        p.degradationPreference = DEGRADATION[shareCfg.mode];
      } else {
        p.encodings[0].maxBitrate = 192000;
      }
      try { await sender.setParameters(p); }
      catch {
        delete p.degradationPreference;
        try { await sender.setParameters(p); } catch (e) { console.warn('setParameters', e); }
      }
    }
  }

  // تغيير الجودة وقت البث بدون ما نوقفه
  async function applyLiveShare() {
    const vt = S.screen?.getVideoTracks()[0];
    if (!vt) return;
    vt.contentHint = shareCfg.mode === 'motion' ? 'motion' : 'detail';
    try { await vt.applyConstraints(videoConstraints(shareCfg)); } catch (e) { console.warn(e); }
    for (const call of S.outScreenCalls.values()) tuneSender(call);
    const set = vt.getSettings();
    toast(`تحدثت الجودة: ${set.width}×${set.height} · ${Math.round(set.frameRate || shareCfg.fps)} فريم · ${bitrateFor()} Mbps`, 'ok');
  }

  function addRemoteScreen(id, stream, call) {
    const s = screenTile(id);
    s.call = call;
    if (s.video.srcObject !== stream) {
      s.video.srcObject = stream;
      s.video.muted = S.deaf || s.muted;
      s.video.play().catch(() => { s.video.muted = true; s.video.play().catch(() => {}); needGesture(); });
    }
    renderAll();
  }

  function screenTile(id) {
    let s = S.screens.get(id);
    if (s) return s;
    const me = id === 'me';
    const tile = document.createElement('div');
    tile.className = 'screen-tile loading';
    tile.dataset.sid = id;
    tile.innerHTML = `
      <video autoplay playsinline></video>
      <div class="screen-top">
        <span class="chip live">LIVE</span>
        <span class="chip screen-who"></span>
        <span class="chip screen-stats"></span>
      </div>
      <div class="screen-actions">
        ${me
          ? `<button class="tile-btn" data-act="cfg" title="جودة البث">${I.sliders}</button>
             <button class="tile-btn danger" data-act="stop" title="وقف البث">${I.monitorOff}</button>`
          : `<button class="tile-btn" data-act="mute" title="صوت البث">${I.volume}</button>
             <input class="tile-vol" type="range" min="0" max="1" step="0.05" value="1" aria-label="مستوى صوت البث">`}
        <button class="tile-btn" data-act="stats" title="الإحصائيات">${I.activity}</button>
        <button class="tile-btn" data-act="focus" title="تكبير">${I.focus}</button>
        <button class="tile-btn" data-act="full" title="ملء الشاشة">${I.maximize}</button>
      </div>`;
    s = { tile, video: $('video', tile), statsEl: $('.screen-stats', tile), call: null, prev: null, muted: false };
    s.video.addEventListener('playing', () => tile.classList.remove('loading'));
    S.screens.set(id, s);
    $('#screens').append(tile);
    return s;
  }

  function removeScreen(id) {
    const s = S.screens.get(id);
    if (!s) return;
    S.screens.delete(id);
    if (id !== 'me') try { s.call?.close(); } catch { /* تجاهل */ }
    s.video.srcObject = null;
    s.tile.remove();
    if (S.focus === id) S.focus = null;
    renderStage();
  }

  function onScreenAction(e) {
    const tile = e.target.closest('.screen-tile');
    if (!tile) return;
    const id = tile.dataset.sid, s = S.screens.get(id);
    const btn = e.target.closest('[data-act]');
    if (!btn || !s) return;
    switch (btn.dataset.act) {
      case 'stop': stopShare(); break;
      case 'cfg': openShareModal(); break;
      case 'stats': tile.classList.toggle('show-stats'); btn.classList.toggle('active'); break;
      case 'focus': S.focus = S.focus === id ? null : id; renderStage(); break;
      case 'full': fullscreen(tile); break;
      case 'mute':
        s.muted = !s.muted;
        s.video.muted = S.deaf || s.muted;
        if (!s.video.muted) s.video.play().catch(() => {});
        btn.innerHTML = s.muted ? I.volumeOff : I.volume;
        break;
    }
  }

  function fullscreen(el) {
    if (document.fullscreenElement) document.exitFullscreen();
    else (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
  }

  // إحصائيات البث الحقيقية (الدقة والفريمات والبت ريت اللي فعلاً واصلة)
  async function updateStats() {
    for (const [id, s] of S.screens) {
      const calls = id === 'me' ? [...S.outScreenCalls.values()] : [s.call];
      let w = 0, h = 0, fps = 0, bytes = 0, rtt = null, limit = '';
      for (const call of calls) {
        const pc = call?.peerConnection;
        if (!pc) continue;
        let report;
        try { report = await pc.getStats(); } catch { continue; }
        report.forEach((r) => {
          const kind = r.kind || r.mediaType;
          if (id === 'me' && r.type === 'outbound-rtp' && kind === 'video') {
            w = r.frameWidth || w; h = r.frameHeight || h; fps = r.framesPerSecond || fps; bytes += r.bytesSent || 0;
            if (r.qualityLimitationReason && r.qualityLimitationReason !== 'none') limit = r.qualityLimitationReason;
          }
          if (id !== 'me' && r.type === 'inbound-rtp' && kind === 'video') {
            w = r.frameWidth || w; h = r.frameHeight || h; fps = r.framesPerSecond || fps; bytes += r.bytesReceived || 0;
          }
          if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded' && r.currentRoundTripTime != null) rtt = r.currentRoundTripTime;
        });
      }
      const now = performance.now();
      let mbps = 0;
      if (s.prev && bytes >= s.prev.bytes) mbps = ((bytes - s.prev.bytes) * 8) / ((now - s.prev.t) / 1000) / 1e6;
      s.prev = { bytes, t: now };
      const parts = [];
      if (w) parts.push(`${w}×${h}`);
      if (fps) parts.push(`${Math.round(fps)}fps`);
      parts.push(`${id === 'me' ? '↑' : '↓'} ${mbps.toFixed(1)} Mbps`);
      if (id === 'me') parts.push(`👁 ${calls.length}`);
      if (rtt != null) parts.push(`${Math.round(rtt * 1000)}ms`);
      if (limit) parts.push(limit === 'bandwidth' ? '⚠ محدود بالنت' : limit === 'cpu' ? '⚠ محدود بالمعالج' : '⚠ ' + limit);
      s.statsEl.textContent = parts.join(' · ');
    }
  }

  /* =====================================================
     الشات
     ===================================================== */
  function sendChat(text) {
    text = String(text).trim().slice(0, 1000);
    if (!text) return;
    const msg = { id: `${S.myId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, from: S.myId, name: S.name, text, ts: Date.now() };
    addMessage(msg);
    broadcast({ t: 'chat', msg });
  }

  function addMessage(msg, fromHistory = false) {
    if (!msg || typeof msg.text !== 'string' || typeof msg.id !== 'string' || S.seen.has(msg.id)) return;
    msg = { id: msg.id.slice(0, 80), from: String(msg.from || ''), name: clean(msg.name) || 'ضيف', text: msg.text.slice(0, 1000), ts: Number(msg.ts) || Date.now() };
    S.seen.add(msg.id);
    S.messages.push(msg);
    if (S.messages.length > 300) S.messages.shift();

    const list = $('#chatList');
    $('.chat-empty', list)?.remove();
    const last = S.lastMsg;
    const cont = last && last.from === msg.from && msg.ts - last.ts < 180000;
    const mine = msg.from === S.myId;
    const el = document.createElement('div');
    el.className = `msg${mine ? ' mine' : ''}${cont ? ' cont' : ''}`;
    el.innerHTML = `${avatar(msg.name)}
      <div class="msg-body">
        <div class="msg-meta"><b>${esc(mine ? 'أنت' : msg.name)}</b>${time(msg.ts)}</div>
        <div class="bubble">${linkify(esc(msg.text))}</div>
      </div>`;
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    list.append(el);
    S.lastMsg = msg;
    if (atBottom || mine) list.scrollTop = list.scrollHeight;

    if (!mine && !fromHistory) {
      if (!S.panelOpen || S.tab !== 'chat' || document.hidden) { S.unread++; renderUnread(); }
      beep('msg');
    }
  }

  const linkify = (html) => html.replace(/\bhttps?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);

  function sysMsg(text) {
    const list = $('#chatList');
    $('.chat-empty', list)?.remove();
    const el = document.createElement('div');
    el.className = 'sys';
    el.textContent = text;
    list.append(el);
    S.lastMsg = null;
    list.scrollTop = list.scrollHeight;
  }

  function renderChatEmpty() {
    $('#chatList').innerHTML = '<div class="chat-empty">💬 ما فيه رسايل للحين<br>ابدأ السالفة!</div>';
  }

  function renderTyping() {
    const names = [...S.typing.keys()].map((id) => S.members.get(id)?.name).filter(Boolean);
    $('#typing').textContent = names.length ? `${names.join('، ')} ${names.length > 1 ? 'يكتبون' : 'يكتب'}…` : '';
  }

  function renderUnread() {
    const b = $('#unread');
    b.textContent = S.unread > 99 ? '99+' : S.unread;
    b.classList.toggle('hidden', !S.unread);
  }

  /* =====================================================
     الرسم
     ===================================================== */
  function renderAll() {
    renderPeople();
    renderMembers();
    renderDock();
    renderStage();
    const n = 1 + viewers();
    $('#memberCount').textContent = `${n} ${n === 1 ? 'متصل' : 'متصلين'}`;
    $('#membersBadge').textContent = n;
    for (const [id, s] of S.screens) {
      $('.screen-who', s.tile).textContent = id === 'me' ? 'شاشتك' : `${S.members.get(id)?.name || '…'} يبث`;
    }
  }

  function people() {
    return [
      { id: 'me', name: S.name, mic: S.micOn && S.hasMic, deaf: S.deaf, sharing: !!S.screen, me: true },
      ...[...S.members.values()].filter((m) => m.hello),
    ];
  }

  function icons(p) {
    return `${p.mic ? '' : I.micOff}${p.deaf ? I.headphonesOff : ''}${p.sharing ? '<span class="tag live">يبث</span>' : ''}`;
  }

  function renderPeople() {
    $('#people').innerHTML = people().map((p) => `
      <div class="person glass${meters.get(p.id)?.speaking ? ' speaking' : ''}" data-pid="${esc(p.id)}">
        ${avatar(p.name, 'lg')}
        <div class="p-name">${esc(p.name)}${p.me ? ' <small>(أنت)</small>' : ''}</div>
        <div class="p-icons">${icons(p)}</div>
      </div>`).join('');
  }

  function renderMembers() {
    // ما نعيد الرسم وهو يسحب مستوى الصوت
    if ($('#membersList').contains(document.activeElement) && document.activeElement.type === 'range') return;
    $('#membersList').innerHTML = people().map((p) => `
      <div class="member${meters.get(p.id)?.speaking ? ' speaking' : ''}" data-pid="${esc(p.id)}">
        ${avatar(p.name)}
        <div class="m-main">
          <div class="m-name">${esc(p.name)}${p.me ? ' <small>(أنت)</small>' : ''}</div>
          <div class="m-tags">${icons(p)}</div>
        </div>
        ${p.me ? '' : `<label class="m-vol" title="مستوى صوته عندك">${I.volume}<input type="range" min="0" max="1" step="0.05" value="${p.volume}" data-vol="${esc(p.id)}"></label>`}
      </div>`).join('');
  }

  function renderDock() {
    const mic = $('#micBtn'), deaf = $('#deafBtn'), share = $('#shareBtn');
    const micOn = S.micOn && S.hasMic;
    mic.innerHTML = micOn ? I.mic : I.micOff;
    mic.classList.toggle('off', !micOn);
    mic.setAttribute('aria-label', micOn ? 'اقفل المايك' : 'افتح المايك');
    deaf.innerHTML = S.deaf ? I.headphonesOff : I.headphones;
    deaf.classList.toggle('off', S.deaf);
    deaf.setAttribute('aria-label', S.deaf ? 'رجّع الصوت' : 'اكتم الصوت');
    share.innerHTML = S.screen ? I.monitorOff : I.monitor;
    share.classList.toggle('live', !!S.screen);
    share.title = S.screen ? 'وقف البث' : 'بث الشاشة';
    share.setAttribute('aria-label', share.title);
  }

  function renderStage() {
    $('#stage').classList.toggle('has-screens', S.screens.size > 0);
    $('#screens').classList.toggle('has-focus', !!S.focus && S.screens.has(S.focus));
    for (const [id, s] of S.screens) {
      s.tile.classList.toggle('focused', id === S.focus);
      $('[data-act="focus"]', s.tile)?.classList.toggle('active', id === S.focus);
    }
  }

  function setStatus(st) {
    const map = {
      connecting: ['warn', 'يتصل…'], reconnecting: ['warn', 'يعيد الاتصال…'], online: ['on', 'متصل'], offline: ['off', 'مفصول'],
    };
    const [cls, text] = map[st];
    $('#netStatus .dot').className = 'dot ' + cls;
    $('#netStatus span:last-child').textContent = text;
  }

  function setPanel(open) {
    S.panelOpen = open;
    $('#room').classList.toggle('no-panel', !open);
    if (open && S.tab === 'chat') { S.unread = 0; renderUnread(); }
  }

  function setTab(tab) {
    S.tab = tab;
    for (const t of $$('.tab[data-tab]')) t.classList.toggle('active', t.dataset.tab === tab);
    $('#tab-chat').classList.toggle('hidden', tab !== 'chat');
    $('#tab-members').classList.toggle('hidden', tab !== 'members');
    if (tab === 'chat') { S.unread = 0; renderUnread(); $('#chatList').scrollTop = 1e9; }
  }

  /* =====================================================
     نافذة جودة البث
     ===================================================== */
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
    return {
      res: f.res.value, fps: Number(f.fps.value), mode: f.mode.value,
      brAuto: $('#brAuto').checked, br: Number($('#brRange').value), audio: $('#shareAudio').checked,
    };
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

  function initShareModal() {
    $('#presets').innerHTML = PRESETS.map((p, i) => `
      <button type="button" class="preset" data-i="${i}"><b>${esc(p.label)}</b><small>${p.res === '2160' ? '4K' : p.res + 'p'} · ${p.fps}fps</small></button>`).join('');
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
  }

  /* =====================================================
     الإعدادات
     ===================================================== */
  async function openSettings() {
    $('#optNs').checked = settings.ns;
    $('#optEc').checked = settings.ec;
    $('#optAgc').checked = settings.agc;
    $('#optSounds').checked = settings.sounds;
    const sel = $('#micSelect');
    try {
      const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
      const current = S.micTrack?.getSettings?.().deviceId || settings.deviceId;
      sel.innerHTML = devs.length
        ? devs.map((d, i) => `<option value="${esc(d.deviceId)}"${d.deviceId === current ? ' selected' : ''}>${esc(d.label || `مايك ${i + 1}`)}</option>`).join('')
        : '<option value="">ما فيه مايك</option>';
    } catch { sel.innerHTML = '<option value="">ما قدرنا نقرا الأجهزة</option>'; }
    openModal('#settingsModal');
  }

  function initSettings() {
    $('#micSelect').addEventListener('change', (e) => { settings.deviceId = e.target.value; store.set('settings', settings); setupMic(); });
    for (const [id, key] of [['#optNs', 'ns'], ['#optEc', 'ec'], ['#optAgc', 'agc']]) {
      $(id).addEventListener('change', (e) => { settings[key] = e.target.checked; store.set('settings', settings); if (S.hasMic) setupMic(); });
    }
    $('#optSounds').addEventListener('change', (e) => { settings.sounds = e.target.checked; store.set('settings', settings); });
  }

  function openModal(sel) {
    closeModals();
    $(sel).classList.remove('hidden');
    $(sel).querySelector('button, input, select')?.focus();
  }
  function closeModals() { for (const m of $$('.modal')) m.classList.add('hidden'); }

  /* =====================================================
     ربط الأزرار
     ===================================================== */
  function initRoomUI() {
    $('#micBtn').addEventListener('click', toggleMic);
    $('#deafBtn').addEventListener('click', () => setDeaf(!S.deaf));
    $('#shareBtn').addEventListener('click', () => (S.screen ? stopShare() : startShare()));
    $('#shareCfgBtn').addEventListener('click', openShareModal);
    $('#settingsBtn').addEventListener('click', openSettings);
    $('#leaveBtn').addEventListener('click', leave);
    $('#panelToggle').addEventListener('click', () => {
      if (S.panelOpen && S.tab !== 'chat') setTab('chat');
      else setPanel(!S.panelOpen);
    });
    $('#panelClose').addEventListener('click', () => setPanel(false));
    for (const t of $$('.tab[data-tab]')) t.addEventListener('click', () => setTab(t.dataset.tab));

    $('#copyLinkBtn').addEventListener('click', async () => {
      const url = `${location.origin}${location.pathname}?room=${S.code}`;
      try { await navigator.clipboard.writeText(url); toast('انسخ الرابط ✅ ارسله لخويك', 'ok'); }
      catch { window.prompt('انسخ الرابط:', url); }
    });

    $('#chatForm').addEventListener('submit', (e) => {
      e.preventDefault();
      sendChat($('#chatInput').value);
      $('#chatInput').value = '';
    });
    $('#chatInput').addEventListener('input', () => {
      if (Date.now() - S.lastTypingSent > 2500) { S.lastTypingSent = Date.now(); broadcast({ t: 'typing' }); }
    });

    $('#screens').addEventListener('click', onScreenAction);
    $('#screens').addEventListener('input', (e) => {
      if (!e.target.classList.contains('tile-vol')) return;
      const s = S.screens.get(e.target.closest('.screen-tile').dataset.sid);
      if (s) s.video.volume = Number(e.target.value);
    });
    $('#screens').addEventListener('dblclick', (e) => {
      const tile = e.target.closest('.screen-tile');
      if (tile && e.target.tagName === 'VIDEO') fullscreen(tile);
    });

    $('#membersList').addEventListener('input', (e) => {
      const m = S.members.get(e.target.dataset.vol);
      if (!m) return;
      m.volume = Number(e.target.value);
      if (m.audio) m.audio.volume = m.volume;
    });

    for (const modal of $$('.modal')) {
      modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-close]')) closeModals(); });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeModals(); return; }
      if (!S.code || e.ctrlKey || e.metaKey || e.altKey || e.target.closest('input, textarea, select')) return;
      if (e.code === 'KeyM') toggleMic();
      if (e.code === 'KeyD') setDeaf(!S.deaf);
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && S.panelOpen && S.tab === 'chat') { S.unread = 0; renderUnread(); }
    });
    window.addEventListener('beforeunload', () => { if (S.code) { broadcast({ t: 'bye' }); destroyAll(); } });
  }

  function destroyAll() {
    S.leaving = true;
    stopShare(true);
    for (const m of S.members.values()) { try { m.voice?.close(); m.conn?.close(); } catch { /* تجاهل */ } }
    S.mic?.getTracks().forEach((t) => t.stop());
    S.anchor?.destroy();
    S.peer?.destroy();
  }

  function leave() {
    broadcast({ t: 'bye' });
    // نعطي رسالة الوداع وقت توصل قبل ما نسكر
    setTimeout(() => { destroyAll(); location.replace(location.pathname); }, 150);
  }

  /* ---------- البداية ---------- */
  fillIcons();
  initLobby();
  initRoomUI();
  initShareModal();
  initSettings();
  renderDock();
})();
