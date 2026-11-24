self.addEventListener('push', (event) => {
  let payload = {}
  try { payload = event.data ? event.data.json() : {} } catch {}
  event.waitUntil(self.registration.showNotification(payload.title || '0 morosos', {
    body: payload.body || 'Tienes un recordatorio del piso.',
    icon: '/icon-dark-32x32-1.png',
    badge: '/icon-dark-32x32-1.png',
    tag: payload.tag || 'recordatorio-piso',
    data: { url: payload.url || '/' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => client.url.startsWith(self.location.origin))
    if (existing) return existing.focus().then(() => existing.navigate(target))
    return self.clients.openWindow(target)
  }))
})
