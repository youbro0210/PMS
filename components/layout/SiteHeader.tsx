"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserMenu } from "@/components/layout/UserMenu";

const NAV = [
  { href: "/", label: "수주" },
  { href: "/portfolio", label: "전사 현황" },
  { href: "/resources", label: "인력" },
];

/** 엔터프라이즈 상단바 — 네이비 바탕, 정갈한 워드마크, 밀도 높은 네비 */
export function SiteHeader() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header className="app-topbar">
      <div className="flex items-center gap-7">
        <Link href="/" className="syu-logo text-[17px]">
          SYU<span className="mark" style={{ opacity: 0.55 }}>·</span>PMS
        </Link>
        <nav className="hidden items-center gap-5 sm:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="topnav-link" data-active={isActive(n.href)}>
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
      <UserMenu />
    </header>
  );
}
