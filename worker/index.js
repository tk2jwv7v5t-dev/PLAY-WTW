/* =====================================================
   PLAY WTW — الباك إند (Cloudflare Worker + Durable Object)

   - الحسابات (يوزر + باسورد) والجلسات
   - القروبات (سيرفرات) والرومات (نصية وصوتية) والرسايل
   - الاتصال المباشر (WebSocket): الشات، مين أونلاين، مين في الصوت،
     وتوصيل إشارات WebRTC بين الأعضاء عشان الصوت والبث يكون مباشر بينهم

   كل البيانات في Durable Object واحد (قاعدة SQLite مدمجة).
   ===================================================== */
import { DurableObject } from 'cloudflare:workers';

const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 100000;
const MAX_OWNED_SERVERS = 20;
const MAX_CHANNELS = 50;
const MAX_MESSAGE = 2000;
const HISTORY_PAGE = 50;
const STUN_ONLY = [
  { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] },
];
const TURN_TTL = 86400; // صلاحية بيانات TURN بالثواني
const MAX_ICON_BYTES = 300 * 1024; // المتصفح يصغّر الصورة قبل الرفع، فهذا حد احتياطي

// نتأكد إن الملف صورة فعلاً من أول بايتات فيه، مو من اسمه
function imageType(b) {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      return env.HUB.get(env.HUB.idFromName('main')).fetch(req);
    }
    return env.ASSETS.fetch(req);
  },
};

/* ---------- أدوات ---------- */
const enc = new TextEncoder();
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const fail = (code, status = 400) => json({ error: code }, status);

const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (bytes) => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));
const newId = () => crypto.randomUUID();
function randomCode(len) {
  const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return [...randomBytes(len)].map((b) => a[b % a.length]).join('');
}
async function sha256(s) {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s))));
}
async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS }, key, 256);
  return new Uint8Array(bits);
}
function sameBytes(a, b) {
  return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b);
}
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanText = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, MAX_MESSAGE);
function cookie(req, name) {
  const m = (req.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : null;
}
function sessionCookie(req, token, maxAge) {
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

/* =====================================================
   Durable Object
   ===================================================== */
export class Hub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.attempts = new Map(); // ip -> { n, t } لمحاولات الدخول الغلط
    this.signups = new Map();  // ip -> { n, t } للتسجيلات الجديدة
    ctx.blockConcurrencyWhile(async () => this.migrate());
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  migrate() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, display TEXT NOT NULL,
        hash TEXT NOT NULL, salt TEXT NOT NULL, hue INTEGER NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS servers (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT NOT NULL, owner_id TEXT NOT NULL,
        invite TEXT UNIQUE NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS members (
        server_id TEXT NOT NULL, user_id TEXT NOT NULL, joined INTEGER NOT NULL,
        PRIMARY KEY (server_id, user_id));
      CREATE INDEX IF NOT EXISTS members_user ON members (user_id);
      CREATE TABLE IF NOT EXISTS channels (
        id TEXT PRIMARY KEY, server_id TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, position INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS channels_server ON channels (server_id);
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, user_id TEXT NOT NULL, text TEXT NOT NULL, ts INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS messages_channel ON messages (channel_id, ts);
      CREATE TABLE IF NOT EXISTS server_icons (
        server_id TEXT PRIMARY KEY, data BLOB NOT NULL, type TEXT NOT NULL, updated INTEGER NOT NULL);
    `);
  }

  /* ---------- HTTP ---------- */
  async fetch(req) {
    const url = new URL(req.url);
    const route = `${req.method} ${url.pathname}`;
    try {
      if (route === 'GET /api/ws') return this.openSocket(req, url);
      if (route === 'GET /api/ice') {
        if (!(await this.authed(req))) return fail('unauthorized', 401);
        return json({ iceServers: await this.iceServers() });
      }
      const icon = url.pathname.match(/^\/api\/icon\/([\w-]{1,64})$/);
      if (icon && req.method === 'GET') return this.getIcon(req, icon[1]);
      if (route === 'GET /api/me') {
        const user = await this.authed(req);
        return user ? json({ user: this.publicUser(user) }) : fail('unauthorized', 401);
      }
      if (req.method === 'POST') {
        // نطلب JSON عشان نمنع الطلبات من مواقع ثانية (CSRF)
        if (!(req.headers.get('content-type') || '').includes('application/json')) return fail('bad_request');
        if (route === 'POST /api/register') return this.register(req);
        if (route === 'POST /api/login') return this.login(req);
        if (route === 'POST /api/logout') return this.logout(req);
        if (route === 'POST /api/password') return this.changePassword(req);
        if (route === 'POST /api/account/delete') return this.deleteAccount(req);
        if (icon) return this.setIcon(req, icon[1]);
      }
      return fail('not_found', 404);
    } catch (e) {
      console.error(e);
      return fail('server_error', 500);
    }
  }

  async body(req) {
    try { return await req.json(); } catch { return {}; }
  }

  // حد بسيط لكل IP: 10 محاولات دخول غلط كل 10 دقايق، و20 حساب جديد كل ساعة
  limited(req, map = this.attempts, max = 10, windowMs = 10 * 60 * 1000) {
    const a = map.get(req.headers.get('cf-connecting-ip') || 'local');
    return !!a && Date.now() - a.t < windowMs && a.n >= max;
  }
  noteFailure(req, map = this.attempts, windowMs = 10 * 60 * 1000) {
    const ip = req.headers.get('cf-connecting-ip') || 'local';
    const a = map.get(ip);
    if (!a || Date.now() - a.t > windowMs) map.set(ip, { n: 1, t: Date.now() });
    else a.n++;
  }

  async register(req) {
    if (this.limited(req, this.signups, 20, 3600000)) return fail('too_many_attempts', 429);
    const b = await this.body(req);
    const username = String(b.username || '').trim().toLowerCase();
    const password = String(b.password || '');
    const display = clean(b.display, 32) || username;
    if (!/^[a-z0-9_.]{3,20}$/.test(username)) return fail('bad_username');
    if (password.length < 8 || password.length > 128) return fail('bad_password');
    if (this.sql.exec('SELECT 1 FROM users WHERE username = ?', username).toArray().length) return fail('username_taken', 409);
    this.noteFailure(req, this.signups, 3600000);
    const salt = randomBytes(16);
    const hash = await hashPassword(password, salt);
    const id = newId();
    const hue = randomBytes(1)[0] * 360 / 256 | 0;
    this.sql.exec('INSERT INTO users (id, username, display, hash, salt, hue, created) VALUES (?, ?, ?, ?, ?, ?, ?)',
      id, username, display, b64(hash), b64(salt), hue, Date.now());
    return this.startSession(req, id);
  }

  async login(req) {
    if (this.limited(req)) return fail('too_many_attempts', 429);
    const b = await this.body(req);
    const username = String(b.username || '').trim().toLowerCase();
    const password = String(b.password || '');
    const user = this.sql.exec('SELECT * FROM users WHERE username = ?', username).toArray()[0];
    // نحسب الهاش حتى لو اليوزر غلط عشان ما ينعرف من الوقت إذا اليوزر موجود
    const salt = user ? unb64(user.salt) : randomBytes(16);
    const hash = await hashPassword(password, salt);
    if (!user || !sameBytes(hash, unb64(user.hash))) {
      this.noteFailure(req);
      return fail('bad_credentials', 401);
    }
    return this.startSession(req, user.id);
  }

  async startSession(req, userId) {
    const token = b64url(randomBytes(32));
    const maxAge = SESSION_DAYS * 86400;
    this.sql.exec('DELETE FROM sessions WHERE expires < ?', Date.now());
    this.sql.exec('INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)', await sha256(token), userId, Date.now() + maxAge * 1000);
    const user = this.sql.exec('SELECT * FROM users WHERE id = ?', userId).one();
    return json({ user: this.publicUser(user) }, 200, { 'set-cookie': sessionCookie(req, token, maxAge) });
  }

  // نتأكد من كلمة المرور الحالية قبل أي تغيير حساس
  async checkPassword(req, user, password) {
    if (this.limited(req)) return fail('too_many_attempts', 429);
    const hash = await hashPassword(String(password || ''), unb64(user.salt));
    if (!sameBytes(hash, unb64(user.hash))) {
      this.noteFailure(req);
      return fail('wrong_password', 403);
    }
    return null;
  }

  async changePassword(req) {
    const user = await this.authed(req);
    if (!user) return fail('unauthorized', 401);
    const b = await this.body(req);
    const bad = await this.checkPassword(req, user, b.current);
    if (bad) return bad;
    const next = String(b.next || '');
    if (next.length < 8 || next.length > 128) return fail('bad_password');
    const salt = randomBytes(16);
    const hash = await hashPassword(next, salt);
    this.sql.exec('UPDATE users SET hash = ?, salt = ? WHERE id = ?', b64(hash), b64(salt), user.id);
    // نطلّع كل الأجهزة الثانية، ونخلي هذا الجهاز مسجّل
    const keep = await sha256(cookie(req, 'sid'));
    this.sql.exec('DELETE FROM sessions WHERE user_id = ? AND token != ?', user.id, keep);
    return json({ ok: true });
  }

  async deleteAccount(req) {
    const user = await this.authed(req);
    if (!user) return fail('unauthorized', 401);
    const b = await this.body(req);
    const bad = await this.checkPassword(req, user, b.password);
    if (bad) return bad;
    // القروبات اللي يملكها تنحذف بالكامل، واللي هو عضو فيها يطلع منها
    const owned = this.sql.exec('SELECT id FROM servers WHERE owner_id = ?', user.id).toArray().map((r) => r.id);
    for (const sid of owned) {
      this.purgeServer(sid);
    }
    const joined = this.sql.exec('SELECT server_id FROM members WHERE user_id = ?', user.id).toArray().map((r) => r.server_id);
    for (const sid of joined) {
      this.kickFromVoice(sid, user.id);
      this.sql.exec('DELETE FROM members WHERE server_id = ? AND user_id = ?', sid, user.id);
      this.toServer(sid, { t: 'member.remove', serverId: sid, uid: user.id });
    }
    this.sql.exec('DELETE FROM messages WHERE user_id = ?', user.id);
    this.sql.exec('DELETE FROM sessions WHERE user_id = ?', user.id);
    this.sql.exec('DELETE FROM users WHERE id = ?', user.id);
    for (const s of this.sockets()) if (s.att.uid === user.id) { try { s.ws.close(4001, 'deleted'); } catch { /* تسكر */ } }
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(req, '', 0) });
  }

  async logout(req) {
    const token = cookie(req, 'sid');
    if (token) this.sql.exec('DELETE FROM sessions WHERE token = ?', await sha256(token));
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(req, '', 0) });
  }

  async authed(req) {
    const token = cookie(req, 'sid');
    if (!token) return null;
    return this.sql.exec(
      'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires > ?',
      await sha256(token), Date.now()).toArray()[0] || null;
  }

  /* ---------- TURN ----------
     بعض الشبكات (خصوصاً بيانات الجوال) ما تقدر تتصل ببعض مباشرة،
     فنمرر الصوت والبث عن طريق سيرفر TURN حق Cloudflare.
     يحتاج سرّين في إعدادات الـ Worker: TURN_KEY_ID و TURN_KEY_API_TOKEN.
     نطلب بيانات دخول مؤقتة ونعيد استخدامها لين يقرب ينتهي وقتها. */
  async iceServers() {
    const { TURN_KEY_ID: id, TURN_KEY_API_TOKEN: token } = this.env;
    if (!id || !token) return STUN_ONLY;
    if (this.turn && Date.now() < this.turn.until) return this.turn.servers;
    try {
      const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate-ice-servers`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ ttl: TURN_TTL }),
      });
      if (!r.ok) throw new Error(`TURN ${r.status}`);
      const d = await r.json();
      const list = Array.isArray(d.iceServers) ? d.iceServers : [d.iceServers];
      // المنفذ 53 تمنعه المتصفحات وياخذ وقت لين يفشل، فنشيله
      const servers = list.map((s) => ({
        ...s,
        urls: [].concat(s.urls).filter((u) => !/:53(\?|$)/.test(u)),
      })).filter((s) => s.urls.length);
      this.turn = { servers, until: Date.now() + (TURN_TTL / 2) * 1000 };
      return servers;
    } catch (e) {
      console.error('turn', e);
      return STUN_ONLY;
    }
  }

  /* ---------- صورة القروب ---------- */
  iconUrl(serverId) {
    const row = this.sql.exec('SELECT updated FROM server_icons WHERE server_id = ?', serverId).toArray()[0];
    return row ? `/api/icon/${serverId}?v=${row.updated}` : null;
  }

  async getIcon(req, serverId) {
    const user = await this.authed(req);
    // الصورة تبان لأعضاء القروب بس
    if (!user || !this.isMember(serverId, user.id)) return fail('not_found', 404);
    const row = this.sql.exec('SELECT data, type FROM server_icons WHERE server_id = ?', serverId).toArray()[0];
    if (!row) return fail('not_found', 404);
    return new Response(row.data, {
      headers: {
        'content-type': row.type,
        'cache-control': 'private, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
      },
    });
  }

  // { image: "data:image/webp;base64,..." } للرفع، أو { remove: true } للحذف
  async setIcon(req, serverId) {
    const user = await this.authed(req);
    if (!user) return fail('unauthorized', 401);
    if (!this.isOwner(serverId, user.id)) return fail('forbidden', 403);
    const b = await this.body(req);
    if (b.remove) {
      this.sql.exec('DELETE FROM server_icons WHERE server_id = ?', serverId);
    } else {
      const m = String(b.image || '').match(/^data:image\/[a-z]+;base64,([A-Za-z0-9+/=]+)$/);
      if (!m) return fail('bad_image');
      let bytes;
      try { bytes = unb64(m[1]); } catch { return fail('bad_image'); }
      if (bytes.byteLength > MAX_ICON_BYTES) return fail('image_too_big');
      const type = imageType(bytes);
      if (!type) return fail('bad_image');
      this.sql.exec('INSERT OR REPLACE INTO server_icons (server_id, data, type, updated) VALUES (?, ?, ?, ?)',
        serverId, bytes.buffer, type, Date.now());
    }
    const iconUrl = this.iconUrl(serverId);
    this.toServer(serverId, { t: 'server.icon', serverId, iconUrl });
    return json({ iconUrl });
  }

  // نحذف القروب وكل شي فيه، ونبلغ أعضاءه
  purgeServer(sid) {
    this.kickFromVoice(sid, null);
    this.toServer(sid, { t: 'server.remove', serverId: sid });
    this.sql.exec('DELETE FROM messages WHERE channel_id IN (SELECT id FROM channels WHERE server_id = ?)', sid);
    this.sql.exec('DELETE FROM channels WHERE server_id = ?', sid);
    this.sql.exec('DELETE FROM members WHERE server_id = ?', sid);
    this.sql.exec('DELETE FROM server_icons WHERE server_id = ?', sid);
    this.sql.exec('DELETE FROM servers WHERE id = ?', sid);
  }

  publicUser(u) {
    return { id: u.id, username: u.username, display: u.display, hue: u.hue };
  }

  /* ---------- WebSocket ---------- */
  async openSocket(req, url) {
    if (req.headers.get('upgrade') !== 'websocket') return fail('expected_websocket', 426);
    const origin = req.headers.get('origin');
    if (origin && new URL(origin).host !== url.host) return fail('bad_origin', 403);
    const user = await this.authed(req);
    if (!user) return fail('unauthorized', 401);

    const pair = new WebSocketPair();
    const att = { sid: b64url(randomBytes(9)), uid: user.id, voice: null, mic: true, deaf: false, sharing: false, screen: null };
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment(att);

    const wasOnline = this.sockets().some((s) => s.att.uid === user.id && s.ws !== pair[1]);
    pair[1].send(JSON.stringify(this.snapshot(user, att.sid)));
    if (!wasOnline) this.toCoMembers(user.id, { t: 'presence', uid: user.id, online: true });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  sockets() {
    const out = [];
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment();
      if (att && !att.gone) out.push({ ws, att });
    }
    return out;
  }
  send(ws, msg) {
    try { ws.send(JSON.stringify(msg)); } catch { /* السوكت تسكر */ }
  }
  toUser(uid, msg) {
    for (const s of this.sockets()) if (s.att.uid === uid) this.send(s.ws, msg);
  }
  memberIds(serverId) {
    return new Set(this.sql.exec('SELECT user_id FROM members WHERE server_id = ?', serverId).toArray().map((r) => r.user_id));
  }
  toServer(serverId, msg, exceptWs = null) {
    const ids = this.memberIds(serverId);
    for (const s of this.sockets()) if (ids.has(s.att.uid) && s.ws !== exceptWs) this.send(s.ws, msg);
  }
  toCoMembers(uid, msg) {
    const ids = new Set(this.sql.exec(
      'SELECT DISTINCT m2.user_id AS id FROM members m1 JOIN members m2 ON m1.server_id = m2.server_id WHERE m1.user_id = ?', uid,
    ).toArray().map((r) => r.id));
    ids.delete(uid);
    for (const s of this.sockets()) if (ids.has(s.att.uid)) this.send(s.ws, msg);
  }

  serverPayload(serverId) {
    const s = this.sql.exec('SELECT * FROM servers WHERE id = ?', serverId).toArray()[0];
    if (!s) return null;
    const channels = this.sql.exec('SELECT id, name, kind FROM channels WHERE server_id = ? ORDER BY position, rowid', serverId).toArray();
    const members = this.sql.exec(
      'SELECT u.id, u.username, u.display, u.hue FROM members m JOIN users u ON u.id = m.user_id WHERE m.server_id = ? ORDER BY m.joined', serverId,
    ).toArray();
    return { id: s.id, name: s.name, iconUrl: this.iconUrl(s.id), owner: s.owner_id, invite: s.invite, channels, members };
  }

  voiceStates(channelIds) {
    const set = new Set(channelIds);
    return this.sockets().filter((s) => s.att.voice && set.has(s.att.voice)).map((s) => this.voiceState(s.att));
  }
  voiceState(att) {
    return { sid: att.sid, uid: att.uid, channel: att.voice, mic: att.mic, deaf: att.deaf, sharing: att.sharing, screen: att.screen };
  }

  snapshot(user, sid) {
    const ids = this.sql.exec('SELECT server_id FROM members WHERE user_id = ? ORDER BY joined', user.id).toArray().map((r) => r.server_id);
    const servers = ids.map((id) => this.serverPayload(id)).filter(Boolean);
    const channelIds = servers.flatMap((s) => s.channels.map((c) => c.id));
    const known = new Set(servers.flatMap((s) => s.members.map((u) => u.id)));
    const online = [...new Set(this.sockets().map((s) => s.att.uid))].filter((id) => known.has(id) || id === user.id);
    return { t: 'ready', me: this.publicUser(user), sid, servers, online, voice: this.voiceStates(channelIds) };
  }

  channel(channelId) {
    return this.sql.exec('SELECT * FROM channels WHERE id = ?', channelId).toArray()[0] || null;
  }
  isMember(serverId, uid) {
    return this.sql.exec('SELECT 1 FROM members WHERE server_id = ? AND user_id = ?', serverId, uid).toArray().length > 0;
  }
  isOwner(serverId, uid) {
    return this.sql.exec('SELECT 1 FROM servers WHERE id = ? AND owner_id = ?', serverId, uid).toArray().length > 0;
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > 65536) return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const att = ws.deserializeAttachment();
    if (!att || !m || typeof m.t !== 'string') return;
    const user = this.sql.exec('SELECT * FROM users WHERE id = ?', att.uid).toArray()[0];
    if (!user) { ws.close(4001, 'unauthorized'); return; }
    const reply = (msg) => this.send(ws, msg);
    const error = (code) => reply({ t: 'error', code, req: m.req });

    switch (m.t) {
      /* ---- القروبات ---- */
      case 'server.create': {
        const name = clean(m.name, 40);
        if (!name) return error('bad_name');
        const owned = this.sql.exec('SELECT COUNT(*) AS n FROM servers WHERE owner_id = ?', att.uid).one().n;
        if (owned >= MAX_OWNED_SERVERS) return error('too_many_servers');
        const id = newId(), now = Date.now();
        this.sql.exec('INSERT INTO servers (id, name, icon, owner_id, invite, created) VALUES (?, ?, ?, ?, ?, ?)',
          id, name, '', att.uid, randomCode(8), now);
        this.sql.exec('INSERT INTO members (server_id, user_id, joined) VALUES (?, ?, ?)', id, att.uid, now);
        this.sql.exec('INSERT INTO channels (id, server_id, name, kind, position) VALUES (?, ?, ?, ?, 0), (?, ?, ?, ?, 1)',
          newId(), id, 'العام', 'text', newId(), id, 'الصوتي', 'voice');
        this.toUser(att.uid, { t: 'server.add', server: this.serverPayload(id), voice: [], req: m.req });
        return;
      }
      case 'server.join': {
        const invite = clean(m.invite, 64).split('/').pop();
        const s = this.sql.exec('SELECT * FROM servers WHERE invite = ?', invite).toArray()[0];
        if (!s) return error('bad_invite');
        const already = this.isMember(s.id, att.uid);
        if (!already) this.sql.exec('INSERT INTO members (server_id, user_id, joined) VALUES (?, ?, ?)', s.id, att.uid, Date.now());
        const server = this.serverPayload(s.id);
        const memberIds = new Set(server.members.map((u) => u.id));
        const online = [...new Set(this.sockets().map((x) => x.att.uid))].filter((id) => memberIds.has(id));
        this.toUser(att.uid, { t: 'server.add', server, online, voice: this.voiceStates(server.channels.map((c) => c.id)), req: m.req });
        if (!already) this.toServer(s.id, { t: 'member.add', serverId: s.id, user: this.publicUser(user) });
        return;
      }
      case 'server.leave': {
        if (!this.isMember(m.serverId, att.uid)) return;
        if (this.isOwner(m.serverId, att.uid)) return error('owner_cannot_leave');
        this.kickFromVoice(m.serverId, att.uid);
        this.sql.exec('DELETE FROM members WHERE server_id = ? AND user_id = ?', m.serverId, att.uid);
        this.toUser(att.uid, { t: 'server.remove', serverId: m.serverId });
        this.toServer(m.serverId, { t: 'member.remove', serverId: m.serverId, uid: att.uid });
        return;
      }
      case 'server.delete': {
        if (!this.isOwner(m.serverId, att.uid)) return error('forbidden');
        this.purgeServer(m.serverId);
        return;
      }
      case 'server.update': {
        if (!this.isOwner(m.serverId, att.uid)) return error('forbidden');
        const name = clean(m.name, 40);
        if (!name) return error('bad_name');
        this.sql.exec('UPDATE servers SET name = ? WHERE id = ?', name, m.serverId);
        this.toServer(m.serverId, { t: 'server.update', serverId: m.serverId, name });
        return;
      }

      /* ---- الرومات ---- */
      case 'channel.create': {
        if (!this.isOwner(m.serverId, att.uid)) return error('forbidden');
        const kind = m.kind === 'voice' ? 'voice' : 'text';
        const name = clean(m.name, 32);
        if (!name) return error('bad_name');
        const count = this.sql.exec('SELECT COUNT(*) AS n, COALESCE(MAX(position), 0) AS p FROM channels WHERE server_id = ?', m.serverId).one();
        if (count.n >= MAX_CHANNELS) return error('too_many_channels');
        const channel = { id: newId(), name, kind };
        this.sql.exec('INSERT INTO channels (id, server_id, name, kind, position) VALUES (?, ?, ?, ?, ?)',
          channel.id, m.serverId, name, kind, count.p + 1);
        this.toServer(m.serverId, { t: 'channel.add', serverId: m.serverId, channel, req: m.req });
        return;
      }
      case 'channel.delete': {
        const ch = this.channel(m.channelId);
        if (!ch || !this.isOwner(ch.server_id, att.uid)) return error('forbidden');
        for (const s of this.sockets()) if (s.att.voice === ch.id) this.setVoice(s.ws, s.att, null);
        this.sql.exec('DELETE FROM messages WHERE channel_id = ?', ch.id);
        this.sql.exec('DELETE FROM channels WHERE id = ?', ch.id);
        this.toServer(ch.server_id, { t: 'channel.remove', serverId: ch.server_id, channelId: ch.id });
        return;
      }

      /* ---- الشات ---- */
      case 'msg.send': {
        const ch = this.channel(m.channelId);
        if (!ch || ch.kind !== 'text' || !this.isMember(ch.server_id, att.uid)) return error('forbidden');
        const text = cleanText(m.text);
        if (!text) return;
        const now = Date.now();
        // حد بسيط ضد السبام: 8 رسايل كل 5 ثواني
        att.burst = (att.burst || []).filter((t) => now - t < 5000);
        if (att.burst.length >= 8) return error('slow_down');
        att.burst.push(now);
        ws.serializeAttachment(att);
        const msg = { id: newId(), channel: ch.id, uid: att.uid, text, ts: now };
        this.sql.exec('INSERT INTO messages (id, channel_id, user_id, text, ts) VALUES (?, ?, ?, ?, ?)', msg.id, ch.id, att.uid, text, now);
        this.toServer(ch.server_id, { t: 'msg', msg, nonce: clean(m.nonce, 40) });
        return;
      }
      case 'msg.history': {
        const ch = this.channel(m.channelId);
        if (!ch || !this.isMember(ch.server_id, att.uid)) return error('forbidden');
        const before = Number(m.before) || Date.now() + 1;
        const rows = this.sql.exec(
          'SELECT id, channel_id AS channel, user_id AS uid, text, ts FROM messages WHERE channel_id = ? AND ts < ? ORDER BY ts DESC LIMIT ?',
          ch.id, before, HISTORY_PAGE + 1).toArray();
        const more = rows.length > HISTORY_PAGE;
        reply({ t: 'history', channelId: ch.id, msgs: rows.slice(0, HISTORY_PAGE).reverse(), more, users: this.authors(rows) });
        return;
      }
      case 'typing': {
        const ch = this.channel(m.channelId);
        if (!ch || !this.isMember(ch.server_id, att.uid)) return;
        this.toServer(ch.server_id, { t: 'typing', channelId: ch.id, uid: att.uid }, ws);
        return;
      }

      /* ---- الصوت ---- */
      case 'voice.join': {
        const ch = this.channel(m.channelId);
        if (!ch || ch.kind !== 'voice' || !this.isMember(ch.server_id, att.uid)) return error('forbidden');
        att.mic = !!m.mic; att.deaf = !!m.deaf; att.sharing = false; att.screen = null;
        this.setVoice(ws, att, ch.id);
        return;
      }
      case 'voice.leave':
        att.sharing = false; att.screen = null;
        this.setVoice(ws, att, null);
        return;
      case 'voice.update':
        if (!att.voice) return;
        att.mic = !!m.mic; att.deaf = !!m.deaf; att.sharing = !!m.sharing;
        att.screen = m.sharing ? clean(m.screen, 80) : null;
        ws.serializeAttachment(att);
        this.voiceBroadcast(att, [att.voice]);
        return;
      case 'rtc': {
        // نوصل إشارات WebRTC بس بين ناس في نفس الروم الصوتي
        if (!att.voice) return;
        const target = this.sockets().find((s) => s.att.sid === m.to);
        if (!target || target.att.voice !== att.voice) return;
        this.send(target.ws, { t: 'rtc', from: att.sid, d: m.d });
        return;
      }

      /* ---- البروفايل ---- */
      case 'profile.update': {
        const display = clean(m.display, 32);
        if (!display) return error('bad_name');
        const hue = Number.isFinite(m.hue) ? Math.round(m.hue) % 360 : user.hue;
        this.sql.exec('UPDATE users SET display = ?, hue = ? WHERE id = ?', display, hue, att.uid);
        const updated = { ...this.publicUser(user), display, hue };
        this.toUser(att.uid, { t: 'user.update', user: updated });
        this.toCoMembers(att.uid, { t: 'user.update', user: updated });
        return;
      }
    }
  }

  authors(rows) {
    const ids = [...new Set(rows.map((r) => r.uid))];
    if (!ids.length) return [];
    return this.sql.exec(`SELECT id, username, display, hue FROM users WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids).toArray();
  }

  setVoice(ws, att, channelId) {
    const old = att.voice;
    att.voice = channelId;
    ws.serializeAttachment(att);
    this.voiceBroadcast(att, [old, channelId]);
  }

  // نرسل حالة الصوت لكل أعضاء القروبات اللي فيها الروم القديم والجديد
  voiceBroadcast(att, channelIds) {
    const servers = new Set();
    for (const id of channelIds) {
      if (!id) continue;
      const ch = this.channel(id);
      if (ch) servers.add(ch.server_id);
    }
    const msg = { t: 'voice', state: this.voiceState(att) };
    const sent = new Set();
    for (const sid of servers) {
      const ids = this.memberIds(sid);
      for (const s of this.sockets()) {
        if (ids.has(s.att.uid) && !sent.has(s.ws)) { sent.add(s.ws); this.send(s.ws, msg); }
      }
    }
  }

  kickFromVoice(serverId, uid) {
    const ids = new Set(this.sql.exec('SELECT id FROM channels WHERE server_id = ?', serverId).toArray().map((r) => r.id));
    for (const s of this.sockets()) {
      if (s.att.voice && ids.has(s.att.voice) && (!uid || s.att.uid === uid)) {
        s.att.sharing = false; s.att.screen = null;
        this.setVoice(s.ws, s.att, null);
      }
    }
  }

  async webSocketClose(ws, code) {
    this.dropSocket(ws);
    try { ws.close(code === 1005 ? 1000 : code, 'bye'); } catch { /* تسكر */ }
  }
  async webSocketError(ws) {
    this.dropSocket(ws);
  }
  dropSocket(ws) {
    const att = ws.deserializeAttachment();
    if (!att || att.gone) return;
    att.gone = true;
    if (att.voice) {
      const old = att.voice;
      att.voice = null; att.sharing = false; att.screen = null;
      ws.serializeAttachment(att);
      this.voiceBroadcast(att, [old]);
    } else {
      ws.serializeAttachment(att);
    }
    const stillOnline = this.sockets().some((s) => s.ws !== ws && s.att.uid === att.uid);
    if (!stillOnline) this.toCoMembers(att.uid, { t: 'presence', uid: att.uid, online: false });
  }
}
