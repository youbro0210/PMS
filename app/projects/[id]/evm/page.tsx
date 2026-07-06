import Link from "next/link";
import { getProject, getWorkPackages, getEvmSummary, getEvmSnapshots } from "@/lib/db/queries";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { ProjectNav } from "@/components/layout/ProjectNav";
import { EvmView } from "@/components/evm/EvmView";
import { EvmHelp } from "@/components/evm/EvmHelp";
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
      <ProjectNav projectId={id} />
      <div className="page">
        <div className="page-head">
          <div>
            <p className="eyebrow">{project.name}</p>
            <div className="flex items-center gap-2">
              <h1 className="page-title">EVM 성과분석</h1>
              <EvmHelp />
            </div>
            <p className="page-sub">획득가치 기반 원가·일정 성과 및 완료시점 예측</p>
          </div>
          <Link href={`/projects/${id}/board`} className="link text-[14px]">← 대시보드</Link>
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
