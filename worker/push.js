/* =====================================================
   إشعارات Web Push (توصل حتى لو الموقع مسكّر)

   - كل إشعار مشفّر لجهاز المستلم بس (RFC 8291 / aes128gcm)،
     فخدمة الإشعارات (قوقل/أبل/موزيلا) ما تقدر تقرا محتواه.
   - نوقّع كل طلب بمفتاح VAPID (RFC 8292). المفتاح الخاص ينحفظ
     في السيرفر بس، وما يطلع للمتصفح أبد.
   ===================================================== */

const enc = new TextEncoder();

export const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function unb64url(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

// HKDF-SHA256 (extract + expand)
async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

// خدمات الإشعارات المعروفة بس، عشان ما يقدر أحد يخلي السيرفر يرسل طلبات لأي مكان
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/, /^push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/,
];

// نتأكد إن بيانات الاشتراك سليمة قبل ما نحفظها
export function validSubscription(sub) {
  try {
    const url = new URL(String(sub?.endpoint || ''));
    if (url.protocol !== 'https:' || url.href.length > 1000) return null;
    if (!PUSH_HOSTS.some((re) => re.test(url.hostname))) return null;
    const p256dh = unb64url(sub.keys?.p256dh || '');
    const auth = unb64url(sub.keys?.auth || '');
    if (p256dh.length !== 65 || p256dh[0] !== 4 || auth.length !== 16) return null;
    return { endpoint: url.href, p256dh: b64url(p256dh), auth: b64url(auth) };
  } catch {
    return null;
  }
}

// نشفّر محتوى الإشعار لجهاز واحد (aes128gcm)
export async function encryptPayload(sub, text) {
  const uaPublic = unb64url(sub.p256dh);
  const authSecret = unb64url(sub.auth);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // 0x02 = آخر جزء من الرسالة
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(enc.encode(text), new Uint8Array([2]))));

  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, cipher);
}

// توقيع VAPID: يثبت لخدمة الإشعارات إن الطلب جاي من موقعنا
export async function vapidHeader(endpoint, keys, subject) {
  const part = (o) => b64url(enc.encode(JSON.stringify(o)));
  const claims = { aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject };
  const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part(claims)}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, enc.encode(unsigned)));
  return `vapid t=${unsigned}.${b64url(sig)}, k=${keys.publicB64}`;
}

// نجهّز مفاتيح VAPID من الـ JWK المحفوظ (أو نسوي جديدة أول مرة)
export async function newVapidJwk() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return crypto.subtle.exportKey('jwk', kp.privateKey);
}
export async function loadVapid(jwk) {
  const privateKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const pub = concat(new Uint8Array([4]), unb64url(jwk.x), unb64url(jwk.y));
  return { privateKey, publicB64: b64url(pub) };
}

// نرسل إشعار مشفّر. يرجع { status, detail } (status = 0 لو فشل الاتصال)
export async function sendPush(sub, data, keys, subject) {
  try {
    const body = await encryptPayload(sub, JSON.stringify(data));
    const r = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        authorization: await vapidHeader(sub.endpoint, keys, subject),
        'content-encoding': 'aes128gcm',
        'content-type': 'application/octet-stream',
        ttl: '86400',
        urgency: data.urgent ? 'high' : 'normal',
      },
      body,
    });
    const detail = r.ok ? '' : (await r.text().catch(() => '')).slice(0, 300);
    return { status: r.status, detail };
  } catch (e) {
    return { status: 0, detail: String(e?.message || e).slice(0, 300) };
  }
}
