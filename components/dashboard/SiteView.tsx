"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SiteDashboard } from "@/components/dashboard/SiteDashboard";
import { ChatPanel } from "@/components/chat/ChatPanel";
import type { WorkPackage } from "@/lib/db/types";

interface InitialData {
  works: WorkPackage[];
  progress: unknown;
  billing: unknown;
  cost: unknown;
  procurement: unknown;
}

export interface ProjectInfo {
  name: string;
  client_name: string | null;
  end_user: string | null;
  status: string;
  contract_amount: number | null;
  start_date: string | null;
  end_date: string | null;
  delivery_date: string | null;
  retention_rate: number | null;
  description: string | null;
}

/**
 * 대시보드 + AI 패널 클라이언트 래퍼.
 * AI 명령이 데이터를 바꾸면 onChange로 Supabase에서 즉시 재조회해
 * 단계별 진척·지표를 새로고침 없이 갱신한다.
 */
export function SiteView({
  projectId,
  contractAmount,
  info,
  initial,
}: {
  projectId: string;
  contractAmount: number | null;
  info: ProjectInfo;
  initial: InitialData;
}) {
  const supabase = createClient();
  const [works, setWorks] = useState<WorkPackage[]>(initial.works);
  const [progress, setProgress] = useState(initial.progress);
  const [billing, setBilling] = useState(initial.billing);
  const [cost, setCost] = useState(initial.cost);
  const [procurement, setProcurement] = useState(initial.procurement);

  const refresh = useCallback(async () => {
    const [w, p, b, c, pr] = await Promise.all([
      supabase.from("work_packages").select("*").eq("project_id", projectId).order("code", { ascending: true }),
      supabase.from("project_progress_summary").select("*").eq("project_id", projectId).maybeSingle(),
      supabase.from("billing_summary").select("*").eq("project_id", projectId).maybeSingle(),
      supabase.from("cost_summary").select("*").eq("project_id", projectId).maybeSingle(),
      supabase.from("procurement_summary").select("*").eq("project_id", projectId).maybeSingle(),
    ]);
    if (w.data) setWorks(w.data as WorkPackage[]);
    setProgress(p.data);
    setBilling(b.data);
    setCost(c.data);
    setProcurement(pr.data);
  }, [supabase, projectId]);

  return (
    <div className="flex flex-1 flex-col overflow-visible lg:flex-row lg:overflow-hidden">
      <SiteDashboard
        works={works}
        progress={progress as never}
        billing={billing as never}
        cost={cost as never}
        procurement={procurement as never}
        contractAmount={contractAmount}
        info={info}
      />
      <ChatPanel projectId={projectId} onChange={refresh} />
    </div>
  );
}
