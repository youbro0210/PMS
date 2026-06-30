"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** 우측 하단 고정 로그아웃 버튼 — 로그인 상태에서만 표시 */
export function FloatingLogout() {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (active) setShow(Boolean(user));
    })();
    return () => { active = false; };
  }, [supabase, pathname]);

  if (!show || pathname === "/login" || pathname === "/signup") return null;

  async function signOut() {
    setBusy(true);
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <button
      onClick={signOut}
      disabled={busy}
      aria-label="로그아웃"
      className="fixed bottom-5 right-5 z-50 flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-medium text-white shadow-lg transition-opacity hover:opacity-90 disabled:opacity-50"
      style={{ background: "var(--navy)" }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
      {busy ? "로그아웃 중…" : "로그아웃"}
    </button>
  );
}
