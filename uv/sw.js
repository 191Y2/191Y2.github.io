importScripts('./uv.bundle.js?v=22');
importScripts('./uv.config.js?v=22');
importScripts('./uv.sw.js?v=22');

const sw = new UVServiceWorker();
self.addEventListener('fetch', (event) => event.respondWith(sw.fetch(event)));
