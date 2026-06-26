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
        <Link href="/">현장</Link>
        <span style={{ color: "var(--muted)" }}>공정</span>
        <span style={{ color: "var(--muted)" }}>기성</span>
        <span style={{ color: "var(--muted)" }}>원가</span>
        <span style={{ color: "var(--muted)" }}>안전</span>
      </nav>
    </header>
  );
}
