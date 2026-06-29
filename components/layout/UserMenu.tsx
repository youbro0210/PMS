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
    <div className="flex items-center gap-3 text-sm">
      <NotificationBell />
      {isAdmin && (
        <>
          <Link href="/settings/erp" className="text-xs" style={{ color: "var(--muted)" }}>설정</Link>
          <Link href="/admin" className="rounded px-2 py-0.5 text-xs" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
            관리자
          </Link>
        </>
      )}
      <span className="hidden max-w-[160px] truncate sm:inline" style={{ color: "var(--muted)" }}>{email}</span>
      <button onClick={signOut} className="rounded-md border px-2.5 py-1 text-xs" style={{ borderColor: "var(--border)" }}>
        로그아웃
      </button>
    </div>
  );
}
