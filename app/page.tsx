import Link from "next/link";
import { getMyProjects } from "@/lib/db/queries";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { ProjectExplorer, type ProjectItem } from "@/components/projects/ProjectExplorer";

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
          <ProjectExplorer projects={(projects as unknown as ProjectItem[])} />
        )}
      </div>
    </main>
  );
}
