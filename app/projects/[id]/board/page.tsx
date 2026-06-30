import {
  getProject,
  getWorkPackages,
  getProgressSummary,
  getBillingSummary,
  getCostSummary,
  getProcurementSummary,
} from "@/lib/db/queries";
import Link from "next/link";
import { SiteView } from "@/components/dashboard/SiteView";
import { ProjectNav } from "@/components/layout/ProjectNav";

export default async function SitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [project, works, progress, billing, cost, procurement] = await Promise.all([
    getProject(id),
    getWorkPackages(id),
    getProgressSummary(id),
    getBillingSummary(id),
    getCostSummary(id),
    getProcurementSummary(id),
  ]);

  return (
    <main className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b p-3 sm:p-4" style={{ borderColor: "var(--border)" }}>
        <Link href="/portfolio" className="rounded-md px-3 py-1.5 text-xs font-medium text-white sm:text-sm" style={{ background: "var(--accent)" }}>
          전체 수주현황
        </Link>
        <Link href="/" className="text-xs sm:text-sm" style={{ color: "var(--muted)" }}>수주목록</Link>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold sm:text-lg">{project.name}</h1>
          <p className="truncate text-xs" style={{ color: "var(--muted)" }}>
            {project.client_name ?? "고객 미지정"} · {project.end_user ?? "납품처 미지정"}
            {project.delivery_date ? ` · 납기 ${project.delivery_date}` : ""}
          </p>
        </div>
      </header>

      <ProjectNav projectId={id} />

      <SiteView
        projectId={id}
        contractAmount={project.contract_amount}
        initial={{ works, progress, billing, cost, procurement }}
      />
    </main>
  );
}
