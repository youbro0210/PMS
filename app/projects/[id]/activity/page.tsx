"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { ProjectNav } from "@/components/layout/ProjectNav";

interface Item { id: string; when: string; who: string; kind: string; text: string; ai: boolean }

const ENTITY_LABEL: Record<string, string> = {
  billing: "대금", procurement: "구매", inspection: "점검", phase: "진척", member: "멤버",
};

export default function ActivityPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();
  const [items, setItems] = useState<Item[]>([]);

  const load = useCallback(async () => {
    const [{ data: acts }, { data: ai }] = await Promise.all([
      supabase.from("activity_log").select("id, entity, action, summary, created_at, profiles:actor_id(full_name, email)").eq("project_id", id).order("created_at", { ascending: false }).limit(100),
      supabase.from("ai_action_logs").select("id, input_text, ai_response, created_at, intent").eq("project_id", id).order("created_at", { ascending: false }).limit(50),
    ]);

    const a: Item[] = (acts ?? []).map((r) => {
      const p = r.profiles as unknown as { full_name: string | null; email: string } | null;
      return { id: "a" + r.id, when: r.created_at as string, who: p?.full_name ?? p?.email ?? "—", kind: ENTITY_LABEL[r.entity as string] ?? r.entity as string, text: (r.summary as string) ?? "", ai: false };
    });
    const b: Item[] = (ai ?? []).map((r) => ({ id: "i" + r.id, when: r.created_at as string, who: "AI", kind: "AI 명령", text: (r.input_text as string) ?? "", ai: true }));

    setItems([...a, ...b].sort((x, y) => (x.when < y.when ? 1 : -1)));
  }, [supabase, id]);

  useEffect(() => { void load(); }, [load]);

  return (
    <main>
      <SiteHeader />
      <ProjectNav projectId={id} />
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold" style={{ color: "var(--navy)" }}>활동 로그 · 감사</h1>
          <Link href={`/projects/${id}/board`} className="text-sm" style={{ color: "var(--accent)" }}>← 대시보드</Link>
        </div>

        <div className="overflow-hidden rounded-xl border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          {items.map((it) => (
            <div key={it.id} className="flex items-start gap-3 border-b px-4 py-3 last:border-b-0" style={{ borderColor: "var(--border)" }}>
              <span className="mt-0.5 rounded px-2 py-0.5 text-[11px]" style={{ background: it.ai ? "var(--accent-soft)" : "var(--surface-2, #f8fafc)", color: it.ai ? "var(--accent)" : "var(--muted)" }}>{it.kind}</span>
              <div className="flex-1">
                <div className="text-sm">{it.text}</div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>{it.who} · {new Date(it.when).toLocaleString("ko-KR")}</div>
              </div>
            </div>
          ))}
          {items.length === 0 && <p className="px-4 py-6 text-sm" style={{ color: "var(--muted)" }}>활동 기록이 없습니다.</p>}
        </div>
      </div>
    </main>
  );
}
