/* التواصل مع أجزاء تطبيق الآيفون (Capacitor).
   التطبيق يفتح الموقع من النت، فأحياناً Capacitor.Plugins ما تكون جاهزة،
   فنستخدم الطريقة الأساسية (nativePromise) بدالها. */
const cap = () => window.Capacitor;

export const inNativeApp = () => !!cap()?.isNativePlatform?.();

export function nativeHas(name) {
  const c = cap();
  if (!c) return false;
  if (c.Plugins?.[name]) return true;
  try { return !!c.isPluginAvailable?.(name); } catch { return false; }
}

export function nativeCall(name, method, opts = {}) {
  const c = cap();
  const p = c?.Plugins?.[name];
  if (p && typeof p[method] === 'function') return p[method](opts);
  if (typeof c?.nativePromise === 'function') return c.nativePromise(name, method, opts);
  return Promise.reject(new Error(`native ${name}.${method} unavailable`));
}

export function nativeListen(name, event, cb) {
  const c = cap();
  const p = c?.Plugins?.[name];
  try {
    if (p?.addListener) return p.addListener(event, cb);
    if (typeof c?.nativeCallback === 'function') return c.nativeCallback(name, 'addListener', { eventName: event }, cb);
  } catch { /* ما فيه */ }
  return null;
}
