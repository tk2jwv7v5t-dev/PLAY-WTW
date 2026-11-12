/* إشعارات الجهاز (Web Push): تسجيل عامل الخلفية والاشتراك في الإشعارات */

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
// الآيفون ما يدعم الإشعارات إلا لما يكون الموقع مضاف للشاشة الرئيسية
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// داخل تطبيق الآيفون (Capacitor)
export const inApp = () => !!window.Capacitor?.isNativePlatform?.();

// إشعارات الجوال داخل التطبيق (بدون حساب مطوّرين): تشتغل والتطبيق مفتوح أو بالخلفية
import { nativeHas, nativeCall, nativeListen } from './native.js';
const LN = () => (inApp() && nativeHas('LocalNotifications') ? {
  checkPermissions: () => nativeCall('LocalNotifications', 'checkPermissions'),
  requestPermissions: () => nativeCall('LocalNotifications', 'requestPermissions'),
  schedule: (o) => nativeCall('LocalNotifications', 'schedule', o),
  addListener: (e, cb) => nativeListen('LocalNotifications', e, cb),
} : null);
export const appNotifySupported = () => inApp() && !!LN();
export async function appNotifyAllowed(ask = false) {
  const ln = LN();
  if (!ln) return false;
  try {
    let p = await ln.checkPermissions();
    if (p.display !== 'granted' && ask) p = await ln.requestPermissions();
    return p.display === 'granted';
  } catch { return false; }
}
let notifSeq = 0;
export function appNotify(title, body, extra = {}) {
  const ln = LN();
  if (!ln) return;
  const id = (Math.floor(Date.now() / 1000) * 10 + (notifSeq++ % 10)) % 2147483647;
  ln.schedule({ notifications: [{ id, title: String(title).slice(0, 120), body: String(body || '').slice(0, 240), extra }] }).catch(() => {});
}
export function onAppNotifyTap(cb) {
  LN()?.addListener('localNotificationActionPerformed', (e) => cb(e?.notification?.extra || {}));
}

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
