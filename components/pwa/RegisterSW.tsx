"use client";

import { useEffect } from "react";

/** 서비스 워커 등록 — PWA 설치/오프라인 셸 활성화 */
export function RegisterSW() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    // updateViaCache:'none' → sw.js 자체를 HTTP 캐시하지 않아 새 버전이 바로 반영됨
    const onLoad = () => navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {});
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
  }, []);
  return null;
}
