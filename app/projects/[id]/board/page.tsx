import {
  getProject,
  getWorkPackages,
  getProgressSummary,
  getBillingSummary,
  getCostSummary,
  getProcurementSummary,
} from "@/lib/db/queries";
import Link from "next/link";
import { SiteDashboard } from "@/components/dashboard/SiteDashboard";
import { ChatPanel } from "@/components/chat/ChatPanel";

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
      <header className="flex items-center gap-3 border-b p-4" style={{ borderColor: "var(--border)" }}>
        <Link href="/portfolio" className="rounded-md px-3 py-1.5 text-sm font-medium text-white" style={{ background: "var(--accent)" }}>
          전체 수주현황
        </Link>
        <Link href="/" className="text-sm" style={{ color: "var(--muted)" }}>수주목록</Link>
        <div className="ml-2">
          <h1 className="text-lg font-semibold">{project.name}</h1>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {project.client_name ?? "고객 미지정"} · {project.end_user ?? "납품처 미지정"}
            {project.delivery_date ? ` · 납기 ${project.delivery_date}` : ""}
          </p>
        </div>
        <nav className="ml-auto flex items-center gap-4 text-sm" style={{ color: "var(--accent)" }}>
          <Link href={`/projects/${id}/billings`}>대금</Link>
          <Link href={`/projects/${id}/procurement`}>구매</Link>
          <Link href={`/projects/${id}/activity`}>활동</Link>
          <Link href={`/projects/${id}/members`}>멤버</Link>
        </nav>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <SiteDashboard works={works} progress={progress} billing={billing} cost={cost} procurement={procurement} contractAmount={project.contract_amount} />
        <ChatPanel projectId={id} />
      </div>
    </main>
  );
}
