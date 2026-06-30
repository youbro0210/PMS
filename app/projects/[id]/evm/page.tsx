import Link from "next/link";
import { getProject, getWorkPackages, getEvmSummary, getEvmSnapshots } from "@/lib/db/queries";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { EvmView } from "@/components/evm/EvmView";
import type { EvmSummary, EvmSnapshot } from "@/lib/db/types";

export default async function EvmPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [project, works, summary, snapshots] = await Promise.all([
    getProject(id),
    getWorkPackages(id),
    getEvmSummary(id),
    getEvmSnapshots(id),
  ]);

  return (
    <main>
      <SiteHeader />
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: "var(--navy)" }}>EVM 성과분석</h1>
            <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{project.name} · 획득가치 기반 원가·일정 성과 및 완료시점 예측</p>
          </div>
          <Link href={`/projects/${id}/board`} className="text-sm" style={{ color: "var(--accent)" }}>← 대시보드</Link>
        </div>
        <EvmView
          projectId={id}
          summary={(summary as EvmSummary | null) ?? null}
          snapshots={(snapshots as EvmSnapshot[]) ?? []}
          works={works}
        />
      </div>
    </main>
  );
}
