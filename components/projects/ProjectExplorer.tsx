"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export interface ProjectItem {
  id: string;
  name: string;
  client_name: string | null;
  end_user: string | null;
  status: string;
  icon: string | null;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  planning: { label: "계획", cls: "badge-neutral" },
  active: { label: "진행", cls: "badge-info" },
  in_progress: { label: "진행", cls: "badge-info" },
  on_hold: { label: "보류", cls: "badge-warn" },
  completed: { label: "완료", cls: "badge-ok" },
  cancelled: { label: "취소", cls: "badge-danger" },
};
const STATUS_OPTIONS = [
  { v: "", l: "전체 상태" },
  { v: "planning", l: "계획" },
  { v: "active", l: "진행" },
  { v: "on_hold", l: "보류" },
  { v: "completed", l: "완료" },
  { v: "cancelled", l: "취소" },
];
const PAGE_SIZE = 10;

export function ProjectExplorer({ projects }: { projects: ProjectItem[] }) {
  const [qDraft, setQDraft] = useState("");
  const [sDraft, setSDraft] = useState("");
  const [q, setQ] = useState("");
  const [s, setS] = useState("");
  const [page, setPage] = useState(1);

  function search(e?: React.FormEvent) {
    e?.preventDefault();
    setQ(qDraft.trim().toLowerCase());
    setS(sDraft);
    setPage(1);
  }
  function reset() {
    setQDraft(""); setSDraft(""); setQ(""); setS(""); setPage(1);
  }

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (s && p.status !== s) return false;
      if (q) {
        const hay = `${p.name} ${p.client_name ?? ""} ${p.end_user ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [projects, q, s]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const cur = Math.min(page, totalPages);
  const pageItems = filtered.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);
  const pageNums = pageWindow(cur, totalPages);

  return (
    <div className="space-y-3">
      {/* 조회 조건 — 조회 버튼 항상 왼쪽 */}
      <form onSubmit={search} className="toolbar">
        <button type="submit" className="btn btn-primary btn-sm">조회</button>
        <input
          className="input input-sm w-full sm:w-64"
          placeholder="프로젝트명·발주처 검색"
          value={qDraft}
          onChange={(e) => setQDraft(e.target.value)}
        />
        <select className="select input-sm w-full sm:w-36" value={sDraft} onChange={(e) => setSDraft(e.target.value)}>
          {STATUS_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
        <button type="button" onClick={reset} className="btn btn-ghost btn-sm">초기화</button>
        <span className="ml-auto text-[13px]" style={{ color: "var(--muted)" }}>
          검색 <b style={{ color: "var(--heading)" }}>{filtered.length}</b>건 / 전체 {projects.length}건
        </span>
      </form>

      {filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-1 py-14">
          <p className="text-[14px] font-semibold" style={{ color: "var(--heading)" }}>조건에 맞는 수주가 없습니다</p>
          <p className="text-[13px]" style={{ color: "var(--muted)" }}>검색어·상태를 바꾸거나 ‘초기화’를 눌러보세요.</p>
        </div>
      ) : (
        <>
          {/* 데스크톱: 표 */}
          <div className="hidden sm:block">
            <div className="grid-wrap overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 44 }}>#</th>
                    <th>프로젝트</th>
                    <th>발주처 / 최종수요처</th>
                    <th style={{ width: 90 }}>상태</th>
                    <th style={{ width: 64 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((p, i) => {
                    const st = STATUS[p.status] ?? { label: p.status, cls: "badge-neutral" };
                    return (
                      <tr key={p.id}>
                        <td className="num" style={{ color: "var(--faint)" }}>{(cur - 1) * PAGE_SIZE + i + 1}</td>
                        <td>
                          <Link href={`/projects/${p.id}/board`} className="flex items-center gap-2 font-semibold" style={{ color: "var(--heading)" }}>
                            <span className="text-[15px] leading-none">{p.icon}</span>
                            <span className="hover:underline">{p.name}</span>
                          </Link>
                        </td>
                        <td style={{ color: "var(--muted)" }}>{p.client_name ?? "발주처 미지정"}{p.end_user ? ` · ${p.end_user}` : ""}</td>
                        <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                        <td className="text-right"><Link href={`/projects/${p.id}/board`} className="link text-[13px]">열기 →</Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 모바일: 카드 */}
          <div className="space-y-2 sm:hidden">
            {pageItems.map((p, i) => {
              const st = STATUS[p.status] ?? { label: p.status, cls: "badge-neutral" };
              return (
                <Link key={p.id} href={`/projects/${p.id}/board`} className="card block p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[16px] leading-none">{p.icon}</span>
                        <span className="truncate text-[15px] font-bold" style={{ color: "var(--heading)" }}>{p.name}</span>
                      </div>
                      <div className="mt-1 text-[13px]" style={{ color: "var(--muted)", overflowWrap: "anywhere" }}>
                        {p.client_name ?? "발주처 미지정"}{p.end_user ? ` · ${p.end_user}` : ""}
                      </div>
                    </div>
                    <span className={`badge ${st.cls} shrink-0`}>{st.label}</span>
                  </div>
                  <div className="mt-2 text-right"><span className="link text-[13px]">열기 →</span></div>
                </Link>
              );
            })}
          </div>

          {/* 페이징 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1 pt-1">
              <PgBtn disabled={cur === 1} onClick={() => setPage(1)}>«</PgBtn>
              <PgBtn disabled={cur === 1} onClick={() => setPage(cur - 1)}>‹</PgBtn>
              {pageNums.map((n) => (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  className="min-w-8 rounded-[4px] border px-2.5 py-1.5 text-[13px] font-semibold"
                  style={n === cur
                    ? { background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" }
                    : { background: "var(--surface)", color: "var(--text)", borderColor: "var(--border-strong)" }}
                >
                  {n}
                </button>
              ))}
              <PgBtn disabled={cur === totalPages} onClick={() => setPage(cur + 1)}>›</PgBtn>
              <PgBtn disabled={cur === totalPages} onClick={() => setPage(totalPages)}>»</PgBtn>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PgBtn({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="rounded-[4px] border px-2.5 py-1.5 text-[13px] font-semibold disabled:opacity-40"
      style={{ background: "var(--surface)", color: "var(--text)", borderColor: "var(--border-strong)" }}>
      {children}
    </button>
  );
}

function pageWindow(cur: number, total: number): number[] {
  const span = 5;
  let start = Math.max(1, cur - Math.floor(span / 2));
  const end = Math.min(total, start + span - 1);
  start = Math.max(1, end - span + 1);
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}
