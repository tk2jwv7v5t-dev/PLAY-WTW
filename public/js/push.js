/* إشعارات الجهاز (Web Push): تسجيل عامل الخلفية والاشتراك في الإشعارات */

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
// الآيفون ما يدعم الإشعارات إلا لما يكون الموقع مضاف للشاشة الرئيسية
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

let regPromise = null;
export function registerWorker() {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  regPromise ??= navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((e) => { console.warn('sw', e); return null; });
  return regPromise;
}

async function post(url, body) {
  const r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || 'server_error'), { status: d.status, service: d.service, detail: d.detail });
  return d;
}

const toKey = (b64) => {
  const s = b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4);
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};

// الاشتراك الحالي لهذا الجهاز (أو null)
export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await registerWorker();
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function enablePush() {
  if (!pushSupported()) throw new Error('push_unsupported');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('push_denied');
  const reg = await registerWorker();
  if (!reg) throw new Error('push_unsupported');
  await navigator.serviceWorker.ready;
  const r = await fetch('/api/push/key', { credentials: 'same-origin' });
  if (!r.ok) throw new Error('server_error');
  const { key } = await r.json();
  let sub = await reg.pushManager.getSubscription();
  // لو المفتاح تغيّر نسوي اشتراك جديد
  if (sub && sub.options?.applicationServerKey) {
    const old = new Uint8Array(sub.options.applicationServerKey);
    const now = toKey(key);
    if (old.length !== now.length || old.some((b, i) => b !== now[i])) { await sub.unsubscribe(); sub = null; }
  }
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) });
    } catch {
      // أشهر سبب: نافذة خاصة (Incognito) أو المتصفح مقفل الإشعارات من إعداداته
      throw new Error('push_subscribe_failed');
    }
  }
  await post('/api/push/subscribe', sub.toJSON());
  return sub;
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await post('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

export async function testPush() {
  const sub = await currentSubscription();
  if (!sub) throw new Error('push_off');
  return post('/api/push/test', { endpoint: sub.endpoint });
}
