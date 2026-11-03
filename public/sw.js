/* عامل الخلفية: يستقبل إشعارات الجهاز حتى لو الموقع مسكّر */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data?.text() || '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'PLAY WTW', {
    body: d.body || '',
    icon: '/icon-192.png',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { url: d.url || '/' },
    lang: 'ar',
    dir: 'rtl',
  }));
});

// الضغط على الإشعار: نفتح الموقع (أو نرجع للتاب المفتوح) على الروم المطلوب
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/', self.location.origin);
  if (url.origin !== self.location.origin) return;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) {
        await w.focus();
        w.postMessage({ type: 'open', url: url.pathname + url.search });
        return;
      }
    }
    await self.clients.openWindow(url.href);
  })());
});
