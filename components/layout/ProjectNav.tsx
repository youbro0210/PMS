"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const TABS: { seg: string; label: string; admin?: boolean }[] = [
  { seg: "bom", label: "BOM" },
  { seg: "schedule", label: "간트" },
  { seg: "resources", label: "인력" },
  { seg: "evm", label: "EVM" },
  { seg: "risks", label: "리스크" },
  { seg: "billings", label: "대금" },
  { seg: "procurement", label: "구매" },
  { seg: "accounting", label: "회계" },
  { seg: "activity", label: "활동", admin: true },
  { seg: "members", label: "멤버", admin: true },
];

/** 프로젝트 공통 탭 네비게이션 — 모든 프로젝트 화면에 고정 노출. 활동·멤버는 관리자만. */
export function ProjectNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const supabase = createClient();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !active) return;
      const { data } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
      if (active) setIsAdmin(Boolean(data?.is_admin));
    })();
    return () => { active = false; };
  }, [supabase]);

  const boardHref = `/projects/${projectId}/board`;
  return (
    <nav className="tabstrip sticky top-0 z-30 overflow-x-auto">
      <Link href={boardHref} className="tab" data-active={pathname === boardHref}>
        대시보드
      </Link>
      {TABS.filter((t) => !t.admin || isAdmin).map((t) => {
        const href = `/projects/${projectId}/${t.seg}`;
        return (
          <Link key={t.seg} href={href} className="tab" data-active={pathname === href}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
