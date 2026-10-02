const CACHE = 'lapki-shell-v1';
const CORE = ['./', './manifest.webmanifest', './paw.svg'];
self.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
	event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
	if (request.mode === 'navigate') {
		event.respondWith(fetch(request).then(async (response) => {
			if (response.ok) await (await caches.open(CACHE)).put('./', response.clone());
			return response;
		}).catch(() => caches.match('./')));
		return;
	}
	event.respondWith(caches.match(request).then(async (cached) => cached ?? fetch(request).then(async (response) => {
			if (response.ok) {
				await (await caches.open(CACHE)).put(request, response.clone());
			}
			return response;
		})));
});
self.addEventListener('push', (event) => {
	let data = { title: 'Лапки', body: 'Новое событие в семейном дневнике', url: './' };
	try { if (event.data) data = { ...data, ...event.data.json() }; } catch { if (event.data) data.body = event.data.text(); }
	event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: './paw-192.png', badge: './paw-192.png', data: { url: data.url }, tag: data.tag }));
});
self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
		const target = new URL(event.notification.data?.url ?? './', self.registration.scope).href;
		const existing = windows.find((client) => client.url === target);
		return existing ? existing.focus() : clients.openWindow(target);
	}));
});
