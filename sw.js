/* Cache para o app abrir sem internet.
   - Código (página, CSS, JS): tenta a internet primeiro (assim as atualizações chegam na hora) e,
     se estiver sem rede ou lenta (mais de 4 s), usa a cópia guardada.
   - Ícones e fontes: usa a cópia guardada.
   - Só respostas do próprio site entram no cache; Google Drive e login nunca passam por aqui.
   Os dados dos empréstimos e cotistas NÃO ficam neste cache. */
const V = "caixinha-v25";
const ARQUIVOS = [
  "./", "index.html", "manifest.webmanifest", "css/main.css",
  "js/theme.js", "js/config.js", "js/core.js", "js/vault.js", "js/ui.js", "js/drive.js", "js/views.js", "js/membros.js", "js/rifa.js", "js/app.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
  "fonts/cormorant-garamond-latin-500-normal.woff2",
  "fonts/cormorant-garamond-latin-600-normal.woff2",
  "fonts/cormorant-garamond-latin-700-normal.woff2",
  "fonts/inter-latin-wght-normal.woff2"
];
const ehCodigo = (u, r) => r.mode === "navigate" || /\.(html|css|js|webmanifest)$/.test(u.pathname) || u.pathname.endsWith("/");

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(ARQUIVOS.map((a) => new Request(a, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) return;

  if (ehCodigo(u, r)) {
    e.respondWith((async () => {
      const cache = await caches.open(V);
      const chave = r.mode === "navigate" ? "index.html" : r;
      const rede = fetch(r).then((res) => {
        if (res.ok && res.type === "basic") cache.put(chave, res.clone());
        return res;
      });
      rede.catch(() => { /* já tratado abaixo */ });
      const guardada = await cache.match(chave, { ignoreSearch: true });
      if (!guardada) return rede;
      const limite = new Promise((ok) => setTimeout(() => ok(guardada), 4000));
      return Promise.race([rede.catch(() => guardada), limite]);
    })());
    return;
  }

  e.respondWith(
    caches.match(r).then((m) => m || fetch(r).then((res) => {
      if (res.ok && res.type === "basic") { const cp = res.clone(); caches.open(V).then((c) => c.put(r, cp)); }
      return res;
    }))
  );
});
