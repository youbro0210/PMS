/* SYU PMS 서비스 워커 v2
   - 화면(HTML/네비게이션): 항상 네트워크 최신 → "새로고침해도 옛 화면" 문제 방지(캐시 안 함)
   - 정적 자산(_next/static·아이콘 등 해시된 불변 파일): 캐시 우선(빠름)
   - 그 외: 네트워크 우선, 오프라인일 때만 캐시 폴백 */
const CACHE = "syu-pms-v2";
const ASSET = /\/(_next\/static\/|icon-|apple-touch-icon|manifest\.webmanifest)/;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  // 이전 버전 캐시(구버전이 저장한 HTML 포함) 모두 제거
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return;

  const isHTML = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");

  // 화면: 항상 네트워크(최신). 오프라인이면 캐시에 있으면 폴백.
  if (isHTML) {
    e.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // 불변 정적 자산: 캐시 우선
  if (ASSET.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then((hit) =>
        hit || fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
      )
    );
    return;
  }

  // 그 외(API 등): 네트워크 우선
  e.respondWith(fetch(req).catch(() => caches.match(req)));
});
