"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** 설정 공용 탭 — '화면'은 모두, ERP/수주 관리는 관리자만 */
export function SettingsTabs({ active }: { active: "appearance" | "erp" | "projects" }) {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let a = true;
    (async () => {
      const s = createClient();
      const { data: { user } } = await s.auth.getUser();
      if (!user || !a) return;
      const { data } = await s.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
      if (a) setIsAdmin(Boolean(data?.is_admin));
    })();
    return () => { a = false; };
  }, []);

  return (
    <div className="mb-4 flex items-center gap-1">
      <Link href="/settings/appearance" className="tab" data-active={active === "appearance"}>화면</Link>
      {isAdmin && <Link href="/settings/erp" className="tab" data-active={active === "erp"}>ERP 연동</Link>}
      {isAdmin && <Link href="/settings/projects" className="tab" data-active={active === "projects"}>수주 관리</Link>}
    </div>
  );
}
