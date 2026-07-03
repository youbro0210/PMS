import Link from "next/link";
import { getProject, getResources, getProjectAssignments, getProjectLaborSummary } from "@/lib/db/queries";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { ProjectNav } from "@/components/layout/ProjectNav";
import { AssignmentsView } from "@/components/resources/AssignmentsView";
import type { Resource, ProjectAssignment, ProjectLaborSummary } from "@/lib/db/types";

export default async function ProjectResourcesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [project, resources, assignments, summary] = await Promise.all([
    getProject(id),
    getResources(),
    getProjectAssignments(id),
    getProjectLaborSummary(id),
  ]);

  return (
    <main>
      <SiteHeader />
      <ProjectNav projectId={id} />
      <div className="page">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: "var(--navy)" }}>인력 배정</h1>
            <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{project.name} · 인력 배정·계획 M/M·노무비. 인력 풀은 <Link href="/resources" style={{ color: "var(--accent)" }}>인력 관리</Link>에서 등록.</p>
          </div>
          <Link href={`/projects/${id}/board`} className="text-sm" style={{ color: "var(--accent)" }}>← 대시보드</Link>
        </div>
        <AssignmentsView
          projectId={id}
          resources={(resources as Resource[]) ?? []}
          initial={(assignments as ProjectAssignment[]) ?? []}
          summary={(summary as ProjectLaborSummary | null) ?? null}
        />
      </div>
    </main>
  );
}
