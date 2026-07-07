"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { NotificationBell } from "@/components/layout/NotificationBell";

/** 헤더 우측 사용자 메뉴 — 알림·이메일·관리자 배지·관리자 페이지·로그아웃 */
export function UserMenu() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active || !user) return;
      setEmail(user.email ?? null);
      const { data } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
      if (active) setIsAdmin(Boolean(data?.is_admin));
    })();
    return () => { active = false; };
  }, [supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (!email) return null;

  return (
    <div className="flex items-center gap-2 text-sm sm:gap-3">
      <NotificationBell />
      <Link href="/settings/appearance" className="text-[12px] font-medium" style={{ color: "rgba(255,255,255,.72)" }}>설정</Link>
      {isAdmin && (
        <Link href="/admin" className="rounded-[4px] px-2 py-0.5 text-[12px] font-semibold" style={{ background: "rgba(255,255,255,.14)", color: "#fff" }}>
          관리자
        </Link>
      )}
      <span className="hidden h-4 w-px sm:inline" style={{ background: "rgba(255,255,255,.18)" }} />
      <span className="hidden max-w-[170px] truncate text-[12px] sm:inline" style={{ color: "rgba(255,255,255,.66)" }}>{email}</span>
      <button onClick={signOut} className="rounded-[4px] border px-2.5 py-1 text-[12px] font-medium" style={{ borderColor: "rgba(255,255,255,.24)", color: "rgba(255,255,255,.9)" }}>
        로그아웃
      </button>
    </div>
  );
}
