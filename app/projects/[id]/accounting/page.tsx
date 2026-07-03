import Link from "next/link";
import { getProject, getVouchers, getAccountSummary, getAccountCodes, getMyProjects } from "@/lib/db/queries";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { ProjectNav } from "@/components/layout/ProjectNav";
import { AccountingView } from "@/components/accounting/AccountingView";
import type { JournalVoucher, AccountSummary, AccountCode } from "@/lib/db/types";

export default async function AccountingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [project, vouchers, summary, codes, projects] = await Promise.all([
    getProject(id),
    getVouchers(id),
    getAccountSummary(id),
    getAccountCodes(),
    getMyProjects(),
  ]);

  return (
    <main>
      <SiteHeader />
      <ProjectNav projectId={id} />
      <div className="page">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: "var(--navy)" }}>회계 전표</h1>
            <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{project.name} · 복식부기 분개 · 시산표 · ERP 전표 전송</p>
          </div>
          <Link href={`/projects/${id}/board`} className="text-sm" style={{ color: "var(--accent)" }}>← 대시보드</Link>
        </div>
        <AccountingView
          projectId={id}
          vouchers={(vouchers as JournalVoucher[]) ?? []}
          summary={(summary as AccountSummary[]) ?? []}
          codes={(codes as AccountCode[]) ?? []}
          projects={(projects as { id: string; name: string }[]) ?? []}
        />
      </div>
    </main>
  );
}
