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
      <div className="page">
        <div className="page-head">
          <div>
            <p className="eyebrow">{project.name}</p>
            <h1 className="page-title">BOM 기준정보</h1>
            <p className="page-sub">도면 자재표 · 구매구분(구매·외주·자사)</p>
          </div>
          <Link href={`/projects/${id}/board`} className="link text-[13px]">← 대시보드</Link>
        </div>
        <BomView projectId={id} initial={(bom as BomItem[]) ?? []} />
      </div>
    </main>
  );
}
