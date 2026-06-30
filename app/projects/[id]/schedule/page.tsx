import Link from "next/link";
import { getProject, getWorkPackages } from "@/lib/db/queries";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Gantt } from "@/components/schedule/Gantt";

export default async function SchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [project, works] = await Promise.all([getProject(id), getWorkPackages(id)]);

  return (
    <main>
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: "var(--navy)" }}>일정 간트차트</h1>
            <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{project.name} · 단계별 계획 일정 대비 실적 진척</p>
          </div>
          <Link href={`/projects/${id}/board`} className="text-sm" style={{ color: "var(--accent)" }}>← 대시보드</Link>
        </div>
        <Gantt works={works} />
      </div>
    </main>
  );
}
