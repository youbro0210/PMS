import Link from "next/link";

/** SYU 스타일 상단 네비게이션 — 화이트 바탕, 네이비 로고, 우측 메뉴 */
export function SiteHeader() {
  return (
    <header
      className="flex items-center justify-between border-b px-6 py-3"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <Link href="/" className="syu-logo text-2xl">
        SYU<span style={{ color: "var(--accent)" }}>·</span>PMS
      </Link>
      <nav className="flex items-center gap-7 text-sm" style={{ color: "var(--text)" }}>
        <Link href="/">수주</Link>
        <span style={{ color: "var(--muted)" }}>단계</span>
        <span style={{ color: "var(--muted)" }}>대금</span>
        <span style={{ color: "var(--muted)" }}>구매</span>
        <span style={{ color: "var(--muted)" }}>FAT</span>
      </nav>
    </header>
  );
}
