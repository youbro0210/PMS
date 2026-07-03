import Link from "next/link";
import { getProject, getBomItems } from "@/lib/db/queries";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { ProjectNav } from "@/components/layout/ProjectNav";
import { BomView } from "@/components/bom/BomView";
import type { BomItem } from "@/lib/db/types";

export default async function BomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [project, bom] = await Promise.all([getProject(id), getBomItems(id)]);

  return (
    <main>
      <SiteHeader />
      <ProjectNav projectId={id} />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: "var(--navy)" }}>BOM 기준정보</h1>
            <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{project.name} · 도면 자재표 · 구매구분(구매·외주·자사)</p>
          </div>
          <Link href={`/projects/${id}/board`} className="text-sm" style={{ color: "var(--accent)" }}>← 대시보드</Link>
        </div>
        <BomView projectId={id} initial={(bom as BomItem[]) ?? []} />
      </div>
    </main>
  );
}
