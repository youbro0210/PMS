import Link from "next/link";
import { UserMenu } from "@/components/layout/UserMenu";

/** SYU 스타일 상단 네비게이션 — 화이트 바탕, 네이비 로고, 사용자 메뉴 */
export function SiteHeader() {
  return (
    <header
      className="flex items-center justify-between border-b px-6 py-3"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center gap-8">
        <Link href="/" className="syu-logo text-2xl">
          SYU<span style={{ color: "var(--accent)" }}>·</span>PMS
        </Link>
        <nav className="hidden items-center gap-6 text-sm sm:flex" style={{ color: "var(--text)" }}>
          <Link href="/">수주</Link>
          <Link href="/portfolio">전사 현황</Link>
          <Link href="/resources">인력</Link>
        </nav>
      </div>
      <UserMenu />
    </header>
  );
}
