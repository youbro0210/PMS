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
        <span className="text-2xl">{project.icon}</span>
        <div>
          <h1 className="text-lg font-semibold">{project.name}</h1>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {project.client_name ?? "고객 미지정"} · {project.end_user ?? "납품처 미지정"}
            {project.delivery_date ? ` · 납기 ${project.delivery_date}` : ""}
          </p>
        </div>
        <Link href={`/projects/${id}/members`} className="ml-auto text-sm" style={{ color: "var(--accent)" }}>
          멤버 관리
        </Link>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <SiteDashboard works={works} progress={progress} billing={billing} cost={cost} procurement={procurement} contractAmount={project.contract_amount} />
        <ChatPanel projectId={id} />
      </div>
    </main>
  );
}
