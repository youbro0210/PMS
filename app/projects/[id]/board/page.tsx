import {
  getProject,
  getWorkPackages,
  getProgressSummary,
  getBillingSummary,
  getCostSummary,
} from "@/lib/db/queries";
import { SiteDashboard } from "@/components/dashboard/SiteDashboard";
import { ChatPanel } from "@/components/chat/ChatPanel";

export default async function SitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [project, works, progress, billing, cost] = await Promise.all([
    getProject(id),
    getWorkPackages(id),
    getProgressSummary(id),
    getBillingSummary(id),
    getCostSummary(id),
  ]);

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b p-4" style={{ borderColor: "var(--border)" }}>
        <span className="text-2xl">{project.icon}</span>
        <div>
          <h1 className="text-lg font-semibold">{project.name}</h1>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {project.client_name ?? "발주처 미지정"} · {project.construction_type ?? "공사"}
          </p>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <SiteDashboard works={works} progress={progress} billing={billing} cost={cost} contractAmount={project.contract_amount} />
        <ChatPanel projectId={id} />
      </div>
    </main>
  );
}
