/* =====================================================
   PLAY WTW — الباك إند (Cloudflare Worker + Durable Object)

   - الحسابات (يوزر + باسورد) والجلسات
   - القروبات (سيرفرات) والرومات (نصية وصوتية) والرسايل
   - الاتصال المباشر (WebSocket): الشات، مين أونلاين، مين في الصوت،
     وتوصيل إشارات WebRTC بين الأعضاء عشان الصوت والبث يكون مباشر بينهم

   كل البيانات في Durable Object واحد (قاعدة SQLite مدمجة).
   ===================================================== */
import { DurableObject } from 'cloudflare:workers';
import { validSubscription, newVapidJwk, loadVapid, sendPush } from './push.js';

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
const NOTIFY_LEVELS = ['all', 'mentions', 'none'];
const MAX_NOTIFS = 100;       // نحتفظ بآخر 100 إشعار لكل شخص
// اسم حساب الإدارة (الدعم الفني) — ثابت ومحجوز، ما أحد ثاني يقدر يتسمّى فيه
const STAFF_NAME = 'Play WTW Support';
const reservedName = (name) => /play\s*[-_.~]?\s*wtw|support|الدعم|دعم فني|الإدارة|الادارة|ادارة الموقع|إدارة الموقع|admin|مشرف/i.test(String(name || '').normalize('NFKC'));
const MAX_PUSH_DEVICES = 10;  // أجهزة الإشعارات لكل حساب
const snippet = (t, n = 140) => (t.length > n ? Array.from(t).slice(0, n).join('') + '…' : t);
const MAX_FILE_BYTES = 1536 * 1024;   // الصور تتصغّر في المتصفح قبل الرفع، فهذا حد احتياطي
const REPORT_REASONS = { spam: 'سبام', abuse: 'إزعاج أو تنمّر', nsfw: 'محتوى غير لائق', other: 'سبب ثاني' };

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
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      ...headers,
    },
  });
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
// رموز تحكم ورموز قلب اتجاه النص المخفية (تُستخدم أحياناً عشان يتنكّر اسم بشكل ثاني)
const HIDDEN = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069\ufeff]/g;
const cut = (s, max) => (s.length <= max ? s : Array.from(s).slice(0, max).join(''));
const clean = (s, max) => cut(String(s ?? '').replace(HIDDEN, '').replace(/\s+/g, ' ').trim(), max);
const cleanText = (s) => cut(String(s ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '').trim(), MAX_MESSAGE);
// المعرّفات اللي تجي من المتصفح: نص قصير بس، وإلا نرفضها
const asId = (v) => (typeof v === 'string' && v.length <= 80 ? v : '');
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
      CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS push_subs (
        endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS push_subs_user ON push_subs (user_id);
      CREATE TABLE IF NOT EXISTS notify_prefs (
        user_id TEXT NOT NULL, server_id TEXT NOT NULL, level TEXT NOT NULL, PRIMARY KEY (user_id, server_id));
      CREATE TABLE IF NOT EXISTS notifs (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, server_id TEXT, channel_id TEXT,
        actor_id TEXT, text TEXT NOT NULL, ts INTEGER NOT NULL, read INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS notifs_user ON notifs (user_id, ts);
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, scope_id TEXT NOT NULL, data BLOB NOT NULL, type TEXT NOT NULL,
        w INTEGER NOT NULL, h INTEGER NOT NULL, ts INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS files_scope ON files (scope_id);
      CREATE TABLE IF NOT EXISTS dms (
        id TEXT PRIMARY KEY, a TEXT NOT NULL, b TEXT NOT NULL, created INTEGER NOT NULL, last INTEGER, UNIQUE (a, b));
      CREATE INDEX IF NOT EXISTS dms_b ON dms (b);
      CREATE TABLE IF NOT EXISTS blocks (blocker TEXT NOT NULL, blocked TEXT NOT NULL, PRIMARY KEY (blocker, blocked));
      CREATE TABLE IF NOT EXISTS bans (server_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (server_id, user_id));
      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY, reporter_id TEXT NOT NULL, message_id TEXT NOT NULL, channel_id TEXT NOT NULL, server_id TEXT,
        author_id TEXT NOT NULL, reason TEXT NOT NULL, note TEXT NOT NULL, status TEXT NOT NULL, ts INTEGER NOT NULL,
        UNIQUE (reporter_id, message_id));
      CREATE INDEX IF NOT EXISTS reports_server ON reports (server_id, status);
    `);
    // عمود الصورة للرسايل (للقواعد القديمة)
    try { this.sql.exec('ALTER TABLE messages ADD COLUMN file_id TEXT'); } catch { /* موجود */ }
    // الحسابات الموقوفة من إدارة الموقع
    try { this.sql.exec('ALTER TABLE users ADD COLUMN suspended INTEGER NOT NULL DEFAULT 0'); } catch { /* موجود */ }
  }

  /* ---------- HTTP ---------- */
  async fetch(req) {
    const url = new URL(req.url);
    const route = `${req.method} ${url.pathname}`;
    try {
      this.site ??= url.origin;
      if (route === 'GET /api/ws') return this.openSocket(req, url);
      if (route === 'GET /api/push/key') {
        if (!(await this.authed(req))) return fail('unauthorized', 401);
        return json({ key: (await this.vapid()).publicB64 });
      }
      if (route === 'GET /api/ice') {
        if (!(await this.authed(req))) return fail('unauthorized', 401);
        return json({ iceServers: await this.iceServers() });
      }
      const icon = url.pathname.match(/^\/api\/icon\/([\w-]{1,64})$/);
      if (icon && req.method === 'GET') return this.getIcon(req, icon[1]);
      const file = url.pathname.match(/^\/api\/file\/([\w-]{1,64})$/);
      if (file && req.method === 'GET') return this.getFile(req, file[1]);
      if (route === 'GET /api/me') {
        const user = await this.authed(req);
        return user ? json({ user: this.publicUser(user) }) : fail('unauthorized', 401);
      }
      if (req.method === 'POST') {
        // نطلب JSON عشان نمنع الطلبات من مواقع ثانية (CSRF)
        if (!(req.headers.get('content-type') || '').includes('application/json')) return fail('bad_request');
        const origin = req.headers.get('origin');
        if (origin && origin !== url.origin) return fail('bad_origin', 403);
        if (route === 'POST /api/register') return this.register(req);
        if (route === 'POST /api/login') return this.login(req);
        if (route === 'POST /api/logout') return this.logout(req);
        if (route === 'POST /api/password') return this.changePassword(req);
        if (route === 'POST /api/account/delete') return this.deleteAccount(req);
        if (icon) return this.setIcon(req, icon[1]);
        if (route === 'POST /api/upload') return this.upload(req);
        if (route === 'POST /api/push/subscribe') return this.pushSubscribe(req);
        if (route === 'POST /api/push/unsubscribe') return this.pushUnsubscribe(req);
        if (route === 'POST /api/push/test') return this.pushTest(req);
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
    if (!this.adminNames().includes(username) && reservedName(display)) return fail('reserved_name');
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
    if (user.suspended) return fail('suspended', 403);
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
    // والأجهزة الثانية اللي فاتحة الموقع الحين تنقطع على طول
    this.closeSessions((att) => att.uid === user.id && att.tok !== keep);
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
    this.sql.exec('DELETE FROM push_subs WHERE user_id = ?', user.id);
    this.sql.exec('DELETE FROM notify_prefs WHERE user_id = ?', user.id);
    this.sql.exec('DELETE FROM notifs WHERE user_id = ? OR actor_id = ?', user.id, user.id);
    const dmIds = this.sql.exec('SELECT id FROM dms WHERE a = ? OR b = ?', user.id, user.id).toArray().map((r) => r.id);
    for (const dm of dmIds) {
      this.sql.exec('DELETE FROM messages WHERE channel_id = ?', dm);
      this.sql.exec('DELETE FROM files WHERE scope_id = ?', dm);
      this.sql.exec('DELETE FROM dms WHERE id = ?', dm);
    }
    this.sql.exec('DELETE FROM files WHERE owner_id = ?', user.id);
    this.sql.exec('DELETE FROM blocks WHERE blocker = ? OR blocked = ?', user.id, user.id);
    this.sql.exec('DELETE FROM reports WHERE reporter_id = ? OR author_id = ?', user.id, user.id);
    this.sql.exec('DELETE FROM bans WHERE user_id = ?', user.id);
    this.sql.exec('DELETE FROM users WHERE id = ?', user.id);
    for (const s of this.sockets()) if (s.att.uid === user.id) { try { s.ws.close(4001, 'deleted'); } catch { /* تسكر */ } }
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(req, '', 0) });
  }

  async logout(req) {
    const token = cookie(req, 'sid');
    if (token) {
      const hashed = await sha256(token);
      this.sql.exec('DELETE FROM sessions WHERE token = ?', hashed);
      this.closeSessions((att) => att.tok === hashed);
    }
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(req, '', 0) });
  }

  closeSessions(match) {
    for (const s of this.sockets()) {
      if (match(s.att)) { try { s.ws.close(4001, 'signed_out'); } catch { /* تسكر */ } }
    }
  }

  async authed(req) {
    const token = cookie(req, 'sid');
    if (!token) return null;
    const user = this.sql.exec(
      'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires > ? AND u.suspended = 0',
      await sha256(token), Date.now()).toArray()[0] || null;
    // حساب الإدارة يطلع دايم باسم الدعم الفني
    if (user && this.isAdmin(user) && user.display !== STAFF_NAME) {
      this.sql.exec('UPDATE users SET display = ? WHERE id = ?', STAFF_NAME, user.id);
      user.display = STAFF_NAME;
    }
    return user;
  }

  /* ---------- إدارة الموقع ----------
     المشرفين: أسماء مستخدمين في إعداد ADMINS (في wrangler.jsonc)، مفصولة بفاصلة.
     المشرف توصله كل البلاغات (القروبات والخاص)، ويقدر يحذف الرسالة أو يوقف الحساب. */
  adminNames() {
    return String(this.env.ADMINS || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  }
  isAdmin(user) {
    return !!user && this.adminNames().includes(user.username);
  }
  adminIds() {
    const names = this.adminNames();
    if (!names.length) return [];
    return this.sql.exec(`SELECT id FROM users WHERE username IN (${names.map(() => '?').join(',')}) AND suspended = 0`, ...names)
      .toArray().map((r) => r.id);
  }
  // الروم أو المحادثة بدون شرط العضوية (للمشرف وللإرسال)
  roomOf(channelId) {
    const ch = this.channel(channelId);
    if (ch) return { kind: ch.kind, id: ch.id, serverId: ch.server_id, ch };
    const dm = this.sql.exec('SELECT * FROM dms WHERE id = ?', channelId).toArray()[0];
    return dm ? { kind: 'dm', id: dm.id, dm, other: dm.b } : null;
  }
  adminReportList(status = 'open') {
    return this.sql.exec(
      `SELECT r.id, r.reason, r.note, r.ts, r.message_id, r.channel_id, r.server_id, c.name AS channel, s.name AS server,
              m.text, m.file_id, f.w, f.h,
              a.id AS aid, a.username AS auser, a.display AS adisp, a.hue AS ahue, a.suspended AS asusp,
              p.id AS pid, p.username AS puser, p.display AS pdisp, p.hue AS phue
       FROM reports r
       LEFT JOIN messages m ON m.id = r.message_id LEFT JOIN files f ON f.id = m.file_id
       LEFT JOIN channels c ON c.id = r.channel_id LEFT JOIN servers s ON s.id = r.server_id
       LEFT JOIN users a ON a.id = r.author_id LEFT JOIN users p ON p.id = r.reporter_id
       WHERE r.status = ? ORDER BY r.ts DESC LIMIT 100`, status,
    ).toArray().map((x) => ({
      id: x.id, reason: x.reason, note: x.note, ts: x.ts, messageId: x.message_id,
      where: x.server_id ? { server: x.server, channel: x.channel } : { dm: true },
      text: x.text, file: x.file_id ? { id: x.file_id, w: x.w, h: x.h } : null,
      author: x.aid ? { id: x.aid, username: x.auser, display: x.adisp, hue: x.ahue, suspended: !!x.asusp } : null,
      reporter: x.pid ? { id: x.pid, username: x.puser, display: x.pdisp, hue: x.phue } : null,
    }));
  }
  adminOpenCount() {
    return this.sql.exec("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'").one().n;
  }
  sendAdminCount() {
    const n = this.adminOpenCount();
    for (const uid of this.adminIds()) this.toUser(uid, { t: 'admin.count', n });
  }
  suspendedList() {
    return this.sql.exec('SELECT id, username, display, hue FROM users WHERE suspended = 1 ORDER BY username LIMIT 200').toArray();
  }
  // نوقف الحساب: ما يقدر يدخل، ونطلّعه من كل الأجهزة
  suspendUser(uid) {
    this.sql.exec('UPDATE users SET suspended = 1 WHERE id = ?', uid);
    this.sql.exec('DELETE FROM sessions WHERE user_id = ?', uid);
    this.sql.exec('DELETE FROM push_subs WHERE user_id = ?', uid);
    this.closeSessions((att) => att.uid === uid);
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

  /* ---------- الرومات والرسايل الخاصة ---------- */
  // وين تنكتب الرسالة: روم كتابي في قروب أنت عضو فيه، أو محادثة خاصة أنت طرف فيها. غيرها: null
  room(channelId, uid) {
    if (!channelId) return null;
    const ch = this.channel(channelId);
    if (ch) return ch.kind === 'text' && this.isMember(ch.server_id, uid) ? { kind: 'text', id: ch.id, serverId: ch.server_id, ch } : null;
    const dm = this.sql.exec('SELECT * FROM dms WHERE id = ?', channelId).toArray()[0];
    if (dm && (dm.a === uid || dm.b === uid)) return { kind: 'dm', id: dm.id, dm, other: dm.a === uid ? dm.b : dm.a };
    return null;
  }
  toRoom(r, msg) {
    if (r.kind === 'dm') { this.toUser(r.dm.a, msg); this.toUser(r.dm.b, msg); } else this.toServer(r.serverId, msg);
  }
  dmPayload(dm, me) {
    const other = this.sql.exec('SELECT * FROM users WHERE id = ?', dm.a === me ? dm.b : dm.a).toArray()[0];
    // آخر رسالة عشان تبان تحت اسم الشخص في القائمة
    const lastMsg = this.sql.exec('SELECT user_id, text, file_id, ts FROM messages WHERE channel_id = ? ORDER BY ts DESC LIMIT 1', dm.id).toArray()[0];
    const preview = lastMsg ? { uid: lastMsg.user_id, text: snippet(lastMsg.text || (lastMsg.file_id ? '📷 صورة' : ''), 80), ts: lastMsg.ts } : null;
    return { id: dm.id, other: other ? this.publicUser(other) : null, last: dm.last, preview };
  }
  isBlocked(a, b) {
    return this.sql.exec('SELECT 1 FROM blocks WHERE (blocker = ? AND blocked = ?) OR (blocker = ? AND blocked = ?)', a, b, b, a).toArray().length > 0;
  }
  blockList(uid) {
    return this.sql.exec('SELECT blocked FROM blocks WHERE blocker = ?', uid).toArray().map((r) => r.blocked);
  }
  deleteMessage(row, r) {
    this.sql.exec('DELETE FROM messages WHERE id = ?', row.id);
    if (row.file_id) this.sql.exec('DELETE FROM files WHERE id = ?', row.file_id);
    this.sql.exec("UPDATE reports SET status = 'resolved' WHERE message_id = ? AND status = 'open'", row.id);
    if (r) this.toRoom(r, { t: 'msg.remove', channel: row.channel_id, id: row.id });
    if (r?.serverId) this.sendReportCount(r.serverId);
  }
  // نطرد العضو من القروب ونمنعه يرجع
  banMember(serverId, uid) {
    this.sql.exec('INSERT OR IGNORE INTO bans (server_id, user_id) VALUES (?, ?)', serverId, uid);
    if (!this.isMember(serverId, uid)) return;
    this.kickFromVoice(serverId, uid);
    this.sql.exec('DELETE FROM members WHERE server_id = ? AND user_id = ?', serverId, uid);
    this.sql.exec('DELETE FROM notify_prefs WHERE server_id = ? AND user_id = ?', serverId, uid);
    this.toUser(uid, { t: 'server.remove', serverId, banned: true });
    this.toServer(serverId, { t: 'member.remove', serverId, uid });
  }
  openReports(serverId) {
    return this.sql.exec("SELECT COUNT(*) AS n FROM reports WHERE server_id = ? AND status = 'open'", serverId).one().n;
  }
  sendReportCount(serverId) {
    const owner = this.sql.exec('SELECT owner_id FROM servers WHERE id = ?', serverId).toArray()[0]?.owner_id;
    if (owner) this.toUser(owner, { t: 'reports.count', serverId, n: this.openReports(serverId) });
  }
  reportList(serverId) {
    return this.sql.exec(
      `SELECT r.id, r.reason, r.note, r.ts, r.message_id, r.channel_id, c.name AS channel,
              m.text, m.file_id, f.w, f.h,
              a.id AS aid, a.username AS auser, a.display AS adisp, a.hue AS ahue,
              p.id AS pid, p.username AS puser, p.display AS pdisp, p.hue AS phue
       FROM reports r
       LEFT JOIN messages m ON m.id = r.message_id LEFT JOIN files f ON f.id = m.file_id
       LEFT JOIN channels c ON c.id = r.channel_id
       LEFT JOIN users a ON a.id = r.author_id LEFT JOIN users p ON p.id = r.reporter_id
       WHERE r.server_id = ? AND r.status = 'open' ORDER BY r.ts DESC LIMIT 50`, serverId,
    ).toArray().map((x) => ({
      id: x.id, reason: x.reason, note: x.note, ts: x.ts, messageId: x.message_id, channel: x.channel,
      text: x.text, file: x.file_id ? { id: x.file_id, w: x.w, h: x.h } : null,
      author: x.aid ? { id: x.aid, username: x.auser, display: x.adisp, hue: x.ahue } : null,
      reporter: x.pid ? { id: x.pid, username: x.puser, display: x.pdisp, hue: x.phue } : null,
    }));
  }

  // رسالة خاصة: إشعار للجهاز (ما تحتاج الجرس، عندها عدّاد على زر الرسايل الخاصة)
  notifyDM(r, author, msg) {
    if (this.isBlocked(author.id, r.other)) return;
    this.pushTo(r.other, { title: author.display, body: snippet(msg.text), tag: `dm:${r.id}`, url: `/?dm=${r.id}`, urgent: true });
  }

  /* ---------- الصور ---------- */
  // { scope: روم أو محادثة، image: "data:image/webp;base64,...", w, h }
  async upload(req) {
    const user = await this.authed(req);
    if (!user) return fail('unauthorized', 401);
    const b = await this.body(req);
    const r = this.room(asId(b.scope), user.id);
    if (!r) return fail('forbidden', 403);
    if (r.kind === 'dm' && this.isBlocked(r.dm.a, r.dm.b)) return fail('blocked', 403);
    // حد: 15 صورة كل دقيقة لكل شخص
    this.uploads ??= new Map();
    const now = Date.now();
    const recent = (this.uploads.get(user.id) || []).filter((t) => now - t < 60000);
    if (recent.length >= 15) return fail('slow_down', 429);
    const m = String(b.image || '').match(/^data:image\/[a-z]+;base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return fail('bad_image');
    let bytes;
    try { bytes = unb64(m[1]); } catch { return fail('bad_image'); }
    if (bytes.byteLength > MAX_FILE_BYTES) return fail('image_too_big');
    const type = imageType(bytes);
    if (!type) return fail('bad_image');
    const w = Math.max(1, Math.min(10000, Math.round(Number(b.w) || 1)));
    const h = Math.max(1, Math.min(10000, Math.round(Number(b.h) || 1)));
    recent.push(now);
    this.uploads.set(user.id, recent);
    // الصور اللي انرفعت وما انرسلت خلال يوم ننظّفها
    this.sql.exec('DELETE FROM files WHERE used = 0 AND ts < ?', now - 86400000);
    const id = newId();
    this.sql.exec('INSERT INTO files (id, owner_id, scope_id, data, type, w, h, ts, used) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)',
      id, user.id, r.id, bytes.buffer, type, w, h, now);
    return json({ id, w, h });
  }

  async getFile(req, id) {
    const user = await this.authed(req);
    const f = user && this.sql.exec('SELECT * FROM files WHERE id = ?', id).toArray()[0];
    // الصورة تبان بس للي في نفس الروم أو المحادثة
    const reported = () => this.isAdmin(user) && this.sql.exec(
      'SELECT 1 FROM reports r JOIN messages m ON m.id = r.message_id WHERE m.file_id = ?', id).toArray().length > 0;
    if (!f || !(this.room(f.scope_id, user.id) || reported())) return fail('not_found', 404);
    return new Response(f.data, {
      headers: {
        'content-type': f.type,
        'cache-control': 'private, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
        'content-disposition': 'inline',
      },
    });
  }

  /* ---------- الإشعارات ---------- */
  // المنشن: @username لأعضاء القروب بس (ما تنشن نفسك)
  findMentions(serverId, text, authorId) {
    const names = [...new Set([...text.matchAll(/(?:^|\s)@([a-z0-9_.]{3,20})/g)].map((x) => x[1]))].slice(0, 20);
    if (!names.length) return [];
    return this.sql.exec(
      `SELECT u.id FROM users u JOIN members m ON m.user_id = u.id WHERE m.server_id = ? AND u.username IN (${names.map(() => '?').join(',')})`,
      serverId, ...names).toArray().map((r) => r.id).filter((uid) => uid !== authorId);
  }

  level(uid, serverId) {
    return this.sql.exec('SELECT level FROM notify_prefs WHERE user_id = ? AND server_id = ?', uid, serverId).toArray()[0]?.level || 'all';
  }
  // الاتصالات اللي المستخدم فاتح فيها الموقع وقدامه الحين.
  // لو ما لمسه 5 دقايق (أو الجوال جمّد التاب) نعتبره مو قدامه
  lookingSockets(uid) {
    const now = Date.now();
    return this.sockets().filter((s) => s.att.uid === uid && s.att.visible && now - (s.att.activeAt || 0) < 5 * 60 * 1000);
  }
  isLooking(uid) {
    return this.lookingSockets(uid).length > 0;
  }

  notifList(uid) {
    return this.sql.exec(
      `SELECT n.id, n.kind, n.server_id, n.channel_id, n.text, n.ts, n.read, u.id AS aid, u.username, u.display, u.hue
       FROM notifs n LEFT JOIN users u ON u.id = n.actor_id WHERE n.user_id = ? ORDER BY n.ts DESC LIMIT 50`, uid,
    ).toArray().map((r) => this.notifPayload(r));
  }
  notifPayload(r) {
    return {
      id: r.id, kind: r.kind, serverId: r.server_id, channelId: r.channel_id, text: r.text, ts: r.ts, read: !!r.read,
      actor: r.aid ? { id: r.aid, username: r.username, display: r.display, hue: r.hue } : null,
    };
  }

  // إشعار داخل الموقع (الجرس)، ولو يبي: إشعار للجهاز بعد
  // minLevel: أقل مستوى لازم يكون مختاره للقروب عشان يوصله إشعار الجهاز
  notify(uid, n, push, minLevel) {
    const row = { id: newId(), user_id: uid, ts: Date.now(), read: 0, channel_id: null, ...n };
    this.sql.exec('INSERT INTO notifs (id, user_id, kind, server_id, channel_id, actor_id, text, ts, read) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)',
      row.id, uid, row.kind, row.server_id, row.channel_id, row.actor_id, row.text, row.ts);
    this.sql.exec('DELETE FROM notifs WHERE user_id = ? AND id NOT IN (SELECT id FROM notifs WHERE user_id = ? ORDER BY ts DESC LIMIT ?)', uid, uid, MAX_NOTIFS);
    const actor = this.sql.exec('SELECT id, username, display, hue FROM users WHERE id = ?', row.actor_id).toArray()[0];
    this.toUser(uid, { t: 'notif', notif: this.notifPayload({ ...row, aid: actor?.id, username: actor?.username, display: actor?.display, hue: actor?.hue }) });
    const lvl = this.level(uid, n.server_id);
    const allowed = lvl === 'all' || (lvl === 'mentions' && minLevel === 'mentions');
    if (push && allowed) this.pushTo(uid, push);
  }

  notifyMessage(ch, author, msg) {
    const server = this.sql.exec('SELECT name FROM servers WHERE id = ?', ch.server_id).one();
    for (const uid of msg.mentions) {
      this.notify(uid, { kind: 'mention', server_id: ch.server_id, channel_id: ch.id, actor_id: author.id, text: snippet(msg.text) },
        { title: `${author.display} منشنك في #${ch.name}`, body: snippet(msg.text), tag: `ch:${ch.id}`, url: `/?channel=${ch.id}`, urgent: true },
        'mentions');
    }
    // باقي الأعضاء: إشعار للجهاز بس (بدون الجرس)، مرة كل 15 ثانية لكل روم عشان ما يصير إزعاج
    this.lastPush ??= new Map();
    const now = Date.now();
    for (const uid of this.memberIds(ch.server_id)) {
      if (uid === author.id || msg.mentions.includes(uid)) continue;
      if (this.level(uid, ch.server_id) !== 'all' || this.isLooking(uid)) continue;
      const key = `${uid}:${ch.id}`;
      if (now - (this.lastPush.get(key) || 0) < 15000) continue;
      this.lastPush.set(key, now);
      this.pushTo(uid, { title: `${author.display} في #${ch.name} · ${server.name}`, body: snippet(msg.text), tag: `ch:${ch.id}`, url: `/?channel=${ch.id}` });
    }
  }

  notifyLive(att, user) {
    const ch = this.channel(att.voice);
    if (!ch) return;
    // مرة كل 10 دقايق لنفس الشخص في نفس الروم
    this.lastLive ??= new Map();
    const key = `${user.id}:${ch.id}`;
    if (Date.now() - (this.lastLive.get(key) || 0) < 600000) return;
    this.lastLive.set(key, Date.now());
    const inRoom = new Set(this.sockets().filter((s) => s.att.voice === ch.id).map((s) => s.att.uid));
    for (const uid of this.memberIds(ch.server_id)) {
      if (uid === user.id || inRoom.has(uid)) continue;
      this.notify(uid, { kind: 'live', server_id: ch.server_id, channel_id: ch.id, actor_id: user.id, text: ch.name },
        { title: `${user.display} ${att.screen === 'camera' ? 'يبث كاميرته' : 'يبث شاشته'} الحين`, body: `في ${ch.name}، تعال تفرّج`, tag: `live:${ch.id}`, url: `/?channel=${ch.id}` }, 'all');
    }
  }

  /* ---------- إشعارات الجهاز (Web Push) ---------- */
  // مفتاح التوقيع ينسوى أول مرة وينحفظ في قاعدة البيانات بس
  async vapid() {
    if (this.vapidKeys) return this.vapidKeys;
    let row = this.sql.exec("SELECT v FROM kv WHERE k = 'vapid'").toArray()[0];
    if (!row) {
      const jwk = await newVapidJwk();
      this.sql.exec("INSERT OR IGNORE INTO kv (k, v) VALUES ('vapid', ?)", JSON.stringify(jwk));
      row = this.sql.exec("SELECT v FROM kv WHERE k = 'vapid'").one();
    }
    this.vapidKeys = await loadVapid(JSON.parse(row.v));
    return this.vapidKeys;
  }

  async pushSubscribe(req) {
    const user = await this.authed(req);
    if (!user) return fail('unauthorized', 401);
    const sub = validSubscription(await this.body(req));
    if (!sub) return fail('bad_subscription');
    this.sql.exec('INSERT OR REPLACE INTO push_subs (endpoint, user_id, p256dh, auth, created) VALUES (?, ?, ?, ?, ?)',
      sub.endpoint, user.id, sub.p256dh, sub.auth, Date.now());
    this.sql.exec('DELETE FROM push_subs WHERE user_id = ? AND endpoint NOT IN (SELECT endpoint FROM push_subs WHERE user_id = ? ORDER BY created DESC LIMIT ?)',
      user.id, user.id, MAX_PUSH_DEVICES);
    return json({ ok: true });
  }

  async pushUnsubscribe(req) {
    const user = await this.authed(req);
    if (!user) return fail('unauthorized', 401);
    const b = await this.body(req);
    this.sql.exec('DELETE FROM push_subs WHERE user_id = ? AND endpoint = ?', user.id, String(b.endpoint || ''));
    return json({ ok: true });
  }

  async pushTest(req) {
    const user = await this.authed(req);
    if (!user) return fail('unauthorized', 401);
    const b = await this.body(req);
    const sub = this.sql.exec('SELECT * FROM push_subs WHERE user_id = ? AND endpoint = ?', user.id, String(b.endpoint || '')).toArray()[0];
    if (!sub) return fail('not_found', 404);
    const r = await this.sendOne(sub, { title: 'PLAY WTW', body: 'الإشعارات شغالة على هذا الجهاز ✅', tag: 'test', url: '/' });
    if (r.status >= 200 && r.status < 300) return json({ ok: true, service: new URL(sub.endpoint).host });
    return json({ error: 'push_failed', status: r.status, service: new URL(sub.endpoint).host, detail: r.detail }, 502);
  }

  pushTo(uid, data) {
    // ما نرسل للجهاز اللي المستخدم يشوف الموقع فيه الحين (يشوف الرسالة أصلاً)
    const looking = new Set(this.lookingSockets(uid).map((s) => s.att.endpoint).filter(Boolean));
    const subs = this.sql.exec('SELECT * FROM push_subs WHERE user_id = ?', uid).toArray().filter((s) => !looking.has(s.endpoint));
    // ما ننتظر الإرسال عشان الشات ما يتأخر
    for (const sub of subs) {
      const p = this.sendOne(sub, data).catch((e) => console.error('push', e));
      if (this.ctx.waitUntil) this.ctx.waitUntil(p);
    }
  }

  async sendOne(sub, data) {
    const r = await sendPush(sub, data, await this.vapid(), this.site || 'mailto:support@play-wtw.invalid');
    if (r.status < 200 || r.status >= 300) {
      // نسجّل السبب في سجلات Cloudflare (بدون عنوان الجهاز الكامل)
      console.error('push failed', r.status, new URL(sub.endpoint).host, r.detail);
    }
    // الجهاز ألغى الاشتراك أو انتهى: نشيله
    if (r.status === 404 || r.status === 410) this.sql.exec('DELETE FROM push_subs WHERE endpoint = ?', sub.endpoint);
    return r;
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
    this.sql.exec('DELETE FROM notify_prefs WHERE server_id = ?', sid);
    this.sql.exec('DELETE FROM notifs WHERE server_id = ?', sid);
    this.sql.exec('DELETE FROM files WHERE scope_id IN (SELECT id FROM channels WHERE server_id = ?)', sid);
    this.sql.exec('DELETE FROM reports WHERE server_id = ?', sid);
    this.sql.exec('DELETE FROM bans WHERE server_id = ?', sid);
    this.sql.exec('DELETE FROM servers WHERE id = ?', sid);
  }

  publicUser(u) {
    const pub = { id: u.id, username: u.username, display: u.display, hue: u.hue };
    // حساب الإدارة عليه علامة توثيق
    if (this.isAdmin(u)) pub.verified = true;
    return pub;
  }
  // حسابات الإدارة: تطلع لكل المستخدمين عشان يقدرون يراسلونها
  staffList() {
    const names = this.adminNames();
    if (!names.length) return [];
    return this.sql.exec(`SELECT * FROM users WHERE username IN (${names.map(() => '?').join(',')}) AND suspended = 0`, ...names)
      .toArray().map((u) => this.publicUser(u));
  }

  /* ---------- WebSocket ---------- */
  async openSocket(req, url) {
    if (req.headers.get('upgrade') !== 'websocket') return fail('expected_websocket', 426);
    const origin = req.headers.get('origin');
    if (origin && new URL(origin).host !== url.host) return fail('bad_origin', 403);
    const user = await this.authed(req);
    if (!user) return fail('unauthorized', 401);

    const pair = new WebSocketPair();
    const att = {
      sid: b64url(randomBytes(9)), uid: user.id, tok: await sha256(cookie(req, 'sid')),
      voice: null, mic: true, deaf: false, sharing: false, screen: null,
    };
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
    const prefs = Object.fromEntries(this.sql.exec('SELECT server_id, level FROM notify_prefs WHERE user_id = ?', user.id).toArray().map((r) => [r.server_id, r.level]));
    const dms = this.sql.exec('SELECT * FROM dms WHERE (a = ? OR b = ?) AND last IS NOT NULL ORDER BY last DESC LIMIT 100', user.id, user.id)
      .toArray().map((d) => this.dmPayload(d, user.id));
    const reports = Object.fromEntries(servers.filter((s) => s.owner === user.id).map((s) => [s.id, this.openReports(s.id)]));
    return {
      t: 'ready', me: { ...this.publicUser(user), admin: this.isAdmin(user) }, sid, servers, online, voice: this.voiceStates(channelIds), prefs,
      adminCount: this.isAdmin(user) ? this.adminOpenCount() : 0,
      notifs: this.notifList(user.id), dms, blocks: this.blockList(user.id), reports, staff: this.staffList(),
    };
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
    if (!att || !m || typeof m !== 'object' || typeof m.t !== 'string') return;
    // حد عام: 300 رسالة كل 10 ثواني (الاتصال بين الأجهزة يرسل كثير وقت البداية)
    const now = Date.now();
    if (!att.win || now - att.win > 10000) { att.win = now; att.count = 0; }
    if (++att.count > 300) { ws.serializeAttachment(att); return; }
    if (att.count % 50 === 0) ws.serializeAttachment(att);
    const user = this.sql.exec('SELECT * FROM users WHERE id = ?', att.uid).toArray()[0];
    if (!user) { ws.close(4001, 'unauthorized'); return; }
    // المعرّفات لازم تكون نصوص قصيرة
    for (const k of ['serverId', 'channelId', 'to']) if (k in m) m[k] = asId(m[k]);
    m.req = clean(m.req, 20);
    try {
      await this.handleMessage(ws, att, user, m);
    } catch (e) {
      console.error('ws message', m.t, e);
      this.send(ws, { t: 'error', code: 'server_error', req: m.req });
    }
  }

  async handleMessage(ws, att, user, m) {
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
        // ما نسمح بتخمين أكواد الدعوة: 10 محاولات غلط كل 10 دقايق لكل اتصال
        if (att.badInvites >= 10 && Date.now() - att.badInviteAt < 600000) return error('too_many_attempts');
        const invite = clean(m.invite, 64).split('/').pop();
        const s = this.sql.exec('SELECT * FROM servers WHERE invite = ?', invite).toArray()[0];
        if (s && this.sql.exec('SELECT 1 FROM bans WHERE server_id = ? AND user_id = ?', s.id, att.uid).toArray().length) return error('banned');
        if (!s) {
          if (!att.badInviteAt || Date.now() - att.badInviteAt > 600000) att.badInvites = 0;
          att.badInvites++; att.badInviteAt = Date.now();
          ws.serializeAttachment(att);
          return error('bad_invite');
        }
        const already = this.isMember(s.id, att.uid);
        if (!already) this.sql.exec('INSERT INTO members (server_id, user_id, joined) VALUES (?, ?, ?)', s.id, att.uid, Date.now());
        const server = this.serverPayload(s.id);
        const memberIds = new Set(server.members.map((u) => u.id));
        const online = [...new Set(this.sockets().map((x) => x.att.uid))].filter((id) => memberIds.has(id));
        this.toUser(att.uid, { t: 'server.add', server, online, voice: this.voiceStates(server.channels.map((c) => c.id)), req: m.req });
        if (!already) {
          this.toServer(s.id, { t: 'member.add', serverId: s.id, user: this.publicUser(user) });
          this.notify(s.owner_id, { kind: 'join', server_id: s.id, actor_id: att.uid, text: s.name },
            { title: `${user.display} دخل قروبك`, body: s.name, tag: `join:${s.id}`, url: `/?server=${s.id}` }, 'all');
        }
        return;
      }
      case 'server.leave': {
        if (!this.isMember(m.serverId, att.uid)) return;
        if (this.isOwner(m.serverId, att.uid)) return error('owner_cannot_leave');
        this.kickFromVoice(m.serverId, att.uid);
        this.sql.exec('DELETE FROM members WHERE server_id = ? AND user_id = ?', m.serverId, att.uid);
        this.sql.exec('DELETE FROM notify_prefs WHERE server_id = ? AND user_id = ?', m.serverId, att.uid);
        this.sql.exec('DELETE FROM notifs WHERE server_id = ? AND user_id = ?', m.serverId, att.uid);
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
        this.sql.exec('DELETE FROM notifs WHERE channel_id = ?', ch.id);
        this.sql.exec('DELETE FROM files WHERE scope_id = ?', ch.id);
        this.sql.exec('DELETE FROM reports WHERE channel_id = ?', ch.id);
        this.sql.exec('DELETE FROM channels WHERE id = ?', ch.id);
        this.toServer(ch.server_id, { t: 'channel.remove', serverId: ch.server_id, channelId: ch.id });
        return;
      }

      /* ---- الشات ---- */
      case 'msg.send': {
        const r = this.room(m.channelId, att.uid);
        if (!r) return error('forbidden');
        if (r.kind === 'dm' && this.isBlocked(r.dm.a, r.dm.b)) return error('blocked');
        const text = cleanText(m.text);
        let file = null;
        if (m.fileId) {
          file = this.sql.exec('SELECT id, w, h FROM files WHERE id = ? AND owner_id = ? AND scope_id = ? AND used = 0',
            asId(m.fileId), att.uid, r.id).toArray()[0];
          if (!file) return error('bad_file');
        }
        if (!text && !file) return;
        const now = Date.now();
        // حد بسيط ضد السبام: 8 رسايل كل 5 ثواني
        att.burst = (att.burst || []).filter((t) => now - t < 5000);
        if (att.burst.length >= 8) return error('slow_down');
        att.burst.push(now);
        ws.serializeAttachment(att);
        const msg = {
          id: newId(), channel: r.id, uid: att.uid, text, ts: now,
          mentions: r.kind === 'text' ? this.findMentions(r.serverId, text, att.uid) : [],
          file: file ? { id: file.id, w: file.w, h: file.h } : null,
        };
        this.sql.exec('INSERT INTO messages (id, channel_id, user_id, text, ts, file_id) VALUES (?, ?, ?, ?, ?, ?)',
          msg.id, r.id, att.uid, text, now, file?.id || null);
        if (file) this.sql.exec('UPDATE files SET used = 1 WHERE id = ?', file.id);
        const preview = { ...msg, text: text || '📷 صورة' };
        if (r.kind === 'dm') {
          // أول رسالة: الطرف الثاني يشوف المحادثة عنده
          this.sql.exec('UPDATE dms SET last = ? WHERE id = ?', now, r.id);
          if (!r.dm.last) this.toUser(r.other, { t: 'dm.add', dm: this.dmPayload({ ...r.dm, last: now }, r.other) });
          this.toRoom(r, { t: 'msg', msg, nonce: clean(m.nonce, 40) });
          this.notifyDM(r, user, preview);
        } else {
          this.toRoom(r, { t: 'msg', msg, nonce: clean(m.nonce, 40) });
          this.notifyMessage(r.ch, user, preview);
        }
        return;
      }
      case 'msg.delete': {
        // صاحب الرسالة، أو صاحب القروب
        const row = this.sql.exec('SELECT * FROM messages WHERE id = ?', asId(m.id)).toArray()[0];
        const r = row && this.room(row.channel_id, att.uid);
        if (!r) return error('not_found');
        if (row.user_id !== att.uid && !(r.kind === 'text' && this.isOwner(r.serverId, att.uid))) return error('forbidden');
        this.deleteMessage(row, r);
        return;
      }
      case 'msg.history': {
        const r = this.room(m.channelId, att.uid);
        if (!r) return error('forbidden');
        const before = Number(m.before) || Date.now() + 1;
        const rows = this.sql.exec(
          `SELECT m.id, m.channel_id AS channel, m.user_id AS uid, m.text, m.ts, f.id AS fid, f.w, f.h
           FROM messages m LEFT JOIN files f ON f.id = m.file_id WHERE m.channel_id = ? AND m.ts < ? ORDER BY m.ts DESC LIMIT ?`,
          r.id, before, HISTORY_PAGE + 1).toArray();
        const more = rows.length > HISTORY_PAGE;
        const msgs = rows.slice(0, HISTORY_PAGE).reverse().map((x) => ({
          id: x.id, channel: x.channel, uid: x.uid, text: x.text, ts: x.ts, file: x.fid ? { id: x.fid, w: x.w, h: x.h } : null,
        }));
        reply({ t: 'history', channelId: r.id, msgs, more, users: this.authors(rows) });
        return;
      }
      case 'typing': {
        const r = this.room(m.channelId, att.uid);
        if (!r) return;
        if (r.kind === 'dm') this.toUser(r.other, { t: 'typing', channelId: r.id, uid: att.uid });
        else this.toServer(r.serverId, { t: 'typing', channelId: r.id, uid: att.uid }, ws);
        return;
      }

      /* ---- الرسايل الخاصة ---- */
      case 'dm.open': {
        const target = m.userId
          ? this.sql.exec('SELECT * FROM users WHERE id = ?', asId(m.userId)).toArray()[0]
          : this.sql.exec('SELECT * FROM users WHERE username = ?', clean(m.username, 24).replace(/^@/, '').toLowerCase()).toArray()[0];
        if (!target) return error('user_not_found');
        if (target.id === att.uid) return error('dm_self');
        if (this.isBlocked(att.uid, target.id)) return error('blocked');
        const [a, b] = [att.uid, target.id].sort();
        this.sql.exec('INSERT OR IGNORE INTO dms (id, a, b, created, last) VALUES (?, ?, ?, ?, NULL)', newId(), a, b, Date.now());
        const dm = this.sql.exec('SELECT * FROM dms WHERE a = ? AND b = ?', a, b).one();
        reply({ t: 'dm.add', dm: this.dmPayload(dm, att.uid), req: m.req });
        return;
      }
      case 'block': {
        const target = asId(m.userId);
        if (!target || target === att.uid) return error('bad_request');
        if (m.on) this.sql.exec('INSERT OR IGNORE INTO blocks (blocker, blocked) VALUES (?, ?)', att.uid, target);
        else this.sql.exec('DELETE FROM blocks WHERE blocker = ? AND blocked = ?', att.uid, target);
        this.toUser(att.uid, { t: 'blocks', list: this.blockList(att.uid), req: m.req });
        return;
      }

      /* ---- البلاغات ---- */
      case 'report': {
        const row = this.sql.exec('SELECT * FROM messages WHERE id = ?', asId(m.messageId)).toArray()[0];
        const r = row && this.room(row.channel_id, att.uid);
        if (!r) return error('not_found');
        if (row.user_id === att.uid) return error('bad_request');
        if (!REPORT_REASONS[m.reason]) return error('bad_request');
        // حد: 10 بلاغات كل ساعة
        att.reports = (att.reports || []).filter((t) => Date.now() - t < 3600000);
        if (att.reports.length >= 10) return error('slow_down');
        att.reports.push(Date.now());
        ws.serializeAttachment(att);
        this.sql.exec(`INSERT OR IGNORE INTO reports (id, reporter_id, message_id, channel_id, server_id, author_id, reason, note, status, ts)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
          newId(), att.uid, row.id, row.channel_id, r.serverId || null, row.user_id, m.reason, clean(m.note, 300), Date.now());
        if (r.kind === 'dm' && m.block) this.sql.exec('INSERT OR IGNORE INTO blocks (blocker, blocked) VALUES (?, ?)', att.uid, row.user_id);
        if (r.kind === 'text') {
          const owner = this.sql.exec('SELECT owner_id FROM servers WHERE id = ?', r.serverId).one().owner_id;
          if (owner !== att.uid) {
            this.notify(owner, { kind: 'report', server_id: r.serverId, channel_id: r.id, actor_id: att.uid, text: snippet(row.text || '📷 صورة') },
              { title: `بلاغ جديد في #${r.ch.name}`, body: `${user.display}: ${REPORT_REASONS[m.reason]}`, tag: `report:${r.serverId}`, url: `/?server=${r.serverId}` }, 'mentions');
          }
          this.sendReportCount(r.serverId);
        }
        for (const admin of this.adminIds()) {
          if (admin === att.uid) continue;
          this.notify(admin, { kind: 'report', server_id: r.serverId || null, channel_id: r.id, actor_id: att.uid, text: snippet(row.text || '📷 صورة') },
            { title: r.kind === 'dm' ? 'بلاغ جديد (رسالة خاصة)' : `بلاغ جديد في ${this.sql.exec('SELECT name FROM servers WHERE id = ?', r.serverId).one().name}`,
              body: `${user.display}: ${REPORT_REASONS[m.reason]}`, tag: 'admin-report', url: '/?admin=reports', urgent: true }, 'mentions');
        }
        this.sendAdminCount();
        reply({ t: 'reported', req: m.req, blocks: this.blockList(att.uid) });
        return;
      }
      case 'admin.reports': {
        if (!this.isAdmin(user)) return error('forbidden');
        reply({ t: 'admin.data', list: this.adminReportList(), suspended: this.suspendedList(), req: m.req });
        return;
      }
      case 'admin.resolve': {
        if (!this.isAdmin(user)) return error('forbidden');
        const rep = this.sql.exec('SELECT * FROM reports WHERE id = ?', asId(m.id)).toArray()[0];
        if (!rep) return error('not_found');
        if (m.action === 'dismiss') {
          this.sql.exec("UPDATE reports SET status = 'dismissed' WHERE id = ?", rep.id);
        } else if (m.action === 'delete' || m.action === 'suspend') {
          const row = this.sql.exec('SELECT * FROM messages WHERE id = ?', rep.message_id).toArray()[0];
          if (row) this.deleteMessage(row, this.roomOf(row.channel_id));
          this.sql.exec("UPDATE reports SET status = 'resolved' WHERE message_id = ?", rep.message_id);
          // ما يوقف نفسه ولا مشرف ثاني
          if (m.action === 'suspend' && !this.adminIds().includes(rep.author_id)) {
            this.suspendUser(rep.author_id);
            this.sql.exec("UPDATE reports SET status = 'resolved' WHERE author_id = ? AND status = 'open'", rep.author_id);
          }
        } else return error('bad_request');
        if (rep.server_id) this.sendReportCount(rep.server_id);
        this.sendAdminCount();
        reply({ t: 'admin.data', list: this.adminReportList(), suspended: this.suspendedList(), req: m.req });
        return;
      }
      case 'admin.unsuspend': {
        if (!this.isAdmin(user)) return error('forbidden');
        this.sql.exec('UPDATE users SET suspended = 0 WHERE id = ?', asId(m.userId));
        reply({ t: 'admin.data', list: this.adminReportList(), suspended: this.suspendedList(), req: m.req });
        return;
      }
      case 'reports.list': {
        if (!this.isOwner(m.serverId, att.uid)) return error('forbidden');
        reply({ t: 'reports', serverId: m.serverId, list: this.reportList(m.serverId), req: m.req });
        return;
      }
      case 'report.resolve': {
        const rep = this.sql.exec('SELECT * FROM reports WHERE id = ?', asId(m.id)).toArray()[0];
        if (!rep || !rep.server_id || !this.isOwner(rep.server_id, att.uid)) return error('forbidden');
        if (m.action === 'dismiss') {
          this.sql.exec("UPDATE reports SET status = 'dismissed' WHERE id = ?", rep.id);
        } else if (m.action === 'delete' || m.action === 'ban') {
          const row = this.sql.exec('SELECT * FROM messages WHERE id = ?', rep.message_id).toArray()[0];
          if (row) this.deleteMessage(row, this.room(row.channel_id, att.uid));
          this.sql.exec("UPDATE reports SET status = 'resolved' WHERE message_id = ?", rep.message_id);
          if (m.action === 'ban' && rep.author_id !== att.uid) this.banMember(rep.server_id, rep.author_id);
        } else return error('bad_request');
        this.sendReportCount(rep.server_id);
        reply({ t: 'reports', serverId: rep.server_id, list: this.reportList(rep.server_id), req: m.req });
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
        const wasSharing = att.sharing;
        att.mic = !!m.mic; att.deaf = !!m.deaf; att.sharing = !!m.sharing;
        // نوع البث: شاشة أو كاميرا الجوال
        att.screen = m.sharing ? (m.screen === 'camera' ? 'camera' : 'screen') : null;
        if (att.sharing && !wasSharing) this.notifyLive(att, user);
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

      /* ---- الإشعارات ---- */
      case 'notify.set': {
        // مستوى إشعارات القروب: كل الرسايل / المنشن بس / بدون
        if (!this.isMember(m.serverId, att.uid) || !NOTIFY_LEVELS.includes(m.level)) return error('bad_request');
        this.sql.exec('INSERT OR REPLACE INTO notify_prefs (user_id, server_id, level) VALUES (?, ?, ?)', att.uid, m.serverId, m.level);
        this.toUser(att.uid, { t: 'notify.pref', serverId: m.serverId, level: m.level });
        return;
      }
      case 'notif.read': {
        if (m.all) this.sql.exec('UPDATE notifs SET read = 1 WHERE user_id = ?', att.uid);
        else this.sql.exec('UPDATE notifs SET read = 1 WHERE user_id = ? AND id = ?', att.uid, clean(m.id, 80));
        this.toUser(att.uid, { t: 'notif.read', id: m.all ? null : clean(m.id, 80) });
        return;
      }
      case 'focus':
        // هل الموقع قدام المستخدم الحين؟ ومن أي جهاز (عشان ما نرسل إشعار لنفس الجهاز اللي يشوف فيه)
        att.visible = !!m.visible;
        att.activeAt = Date.now();
        att.endpoint = typeof m.endpoint === 'string' ? m.endpoint.slice(0, 1000) : null;
        ws.serializeAttachment(att);
        return;

      /* ---- البروفايل ---- */
      case 'profile.update': {
        const display = this.isAdmin(user) ? STAFF_NAME : clean(m.display, 32);
        if (!display) return error('bad_name');
        if (!this.isAdmin(user) && reservedName(display)) return error('reserved_name');
        const hue = Number.isFinite(m.hue) ? ((Math.round(m.hue) % 360) + 360) % 360 : user.hue;
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
