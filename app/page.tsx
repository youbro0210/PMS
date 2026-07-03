import Link from "next/link";
import { getMyProjects } from "@/lib/db/queries";
import { SiteHeader } from "@/components/layout/SiteHeader";

const STATUS: Record<string, { label: string; cls: string }> = {
  planning: { label: "계획", cls: "badge-neutral" },
  in_progress: { label: "진행", cls: "badge-info" },
  active: { label: "진행", cls: "badge-info" },
  on_hold: { label: "보류", cls: "badge-warn" },
  completed: { label: "완료", cls: "badge-ok" },
  cancelled: { label: "취소", cls: "badge-danger" },
};

export default async function HomePage() {
  const projects = await getMyProjects();

  return (
    <main>
      <SiteHeader />
      <div className="page">
        <div className="page-head">
          <div>
            <p className="eyebrow">수주 프로젝트</p>
            <h1 className="page-title">수주 목록</h1>
            <p className="page-sub">진행 중인 수주·제작 프로젝트를 관리합니다. 총 {projects.length}건</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/projects/import" className="btn btn-secondary">도면으로 수주 생성</Link>
            <Link href="/projects/new" className="btn btn-primary">+ 신규 수주 등록</Link>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="card flex flex-col items-center justify-center gap-1 py-16">
            <p className="text-[14px] font-semibold" style={{ color: "var(--heading)" }}>등록된 수주가 없습니다</p>
            <p className="text-[13px]" style={{ color: "var(--muted)" }}>‘신규 수주 등록’ 또는 ‘도면으로 수주 생성’으로 시작하세요.</p>
          </div>
        ) : (
          <div className="grid-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>프로젝트</th>
                  <th>발주처 / 최종수요처</th>
                  <th style={{ width: 90 }}>상태</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p, i) => {
                  const s = STATUS[p.status as string] ?? { label: p.status, cls: "badge-neutral" };
                  return (
                    <tr key={p.id} className="group">
                      <td className="num" style={{ color: "var(--faint)" }}>{i + 1}</td>
                      <td>
                        <Link href={`/projects/${p.id}/board`} className="flex items-center gap-2 font-semibold" style={{ color: "var(--heading)" }}>
                          <span className="text-[15px] leading-none">{p.icon}</span>
                          <span className="hover:underline">{p.name}</span>
                        </Link>
                      </td>
                      <td style={{ color: "var(--muted)" }}>
                        {p.client_name ?? "발주처 미지정"}{p.end_user ? ` · ${p.end_user}` : ""}
                      </td>
                      <td><span className={`badge ${s.cls}`}>{s.label}</span></td>
                      <td className="text-right">
                        <Link href={`/projects/${p.id}/board`} className="link text-[13px]">열기 →</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
