import Link from "next/link";
import { getProject, getWorkPackages } from "@/lib/db/queries";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { ProjectNav } from "@/components/layout/ProjectNav";
import { SchedulePlanner } from "@/components/schedule/SchedulePlanner";

export default async function SchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [project, works] = await Promise.all([getProject(id), getWorkPackages(id)]);

  return (
    <main>
      <SiteHeader />
      <ProjectNav projectId={id} />
      <div className="page">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: "var(--navy)" }}>일정 간트차트 · 단계 계획</h1>
            <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{project.name} · 단계별 계획 일정·예산·진척을 입력하면 간트와 EVM에 즉시 반영됩니다.</p>
          </div>
          <Link href={`/projects/${id}/board`} className="text-sm" style={{ color: "var(--accent)" }}>← 대시보드</Link>
        </div>
        <SchedulePlanner projectId={id} initial={works} />
      </div>
    </main>
  );
}
