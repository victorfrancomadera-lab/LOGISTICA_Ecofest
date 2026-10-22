// Service worker mínimo: permite instalar la app en el celular. No guarda datos en caché.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
