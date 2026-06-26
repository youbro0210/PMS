"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { SiteHeader } from "@/components/layout/SiteHeader";

interface Row {
  id: string; name: string; client: string | null; status: string; delivery: string | null;
  contract: number; progress: number | null; billed: number | null; llOverdue: number;
}

const eok = (n: number) => (n ? (n / 1e8).toFixed(1) + "억" : "-");
const todayStr = new Date().toISOString().slice(0, 10);

export default function PortfolioPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<Row[]>([]);

  const load = useCallback(async () => {
    const { data: projs } = await supabase.from("projects").select("id, name, client_name, status, delivery_date, contract_amount").order("updated_at", { ascending: false });
    if (!projs) return;
    const out: Row[] = [];
    for (const p of projs) {
      const [{ data: prog }, { data: bill }, { data: proc }] = await Promise.all([
        supabase.from("project_progress_summary").select("actual_progress").eq("project_id", p.id).maybeSingle(),
        supabase.from("billing_summary").select("billed_rate").eq("project_id", p.id).maybeSingle(),
        supabase.from("procurement_summary").select("long_lead_overdue").eq("project_id", p.id).maybeSingle(),
      ]);
      out.push({
        id: p.id, name: p.name, client: p.client_name as string | null, status: p.status as string,
        delivery: p.delivery_date as string | null, contract: Number(p.contract_amount ?? 0),
        progress: prog?.actual_progress ?? 0, billed: bill?.billed_rate ?? 0, llOverdue: proc?.long_lead_overdue ?? 0,
      });
    }
    setRows(out);
  }, [supabase]);
  useEffect(() => { void load(); }, [load]);

  const totalContract = rows.reduce((s, r) => s + r.contract, 0);
  const avgProgress = rows.length ? Math.round(rows.reduce((s, r) => s + (r.progress ?? 0), 0) / rows.length) : 0;
  const atRisk = rows.filter((r) => r.llOverdue > 0 || (r.delivery && r.delivery < todayStr && r.status !== "completed")).length;

  return (
    <main>
      <SiteHeader />
      <div className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="mb-6 text-xl font-semibold" style={{ color: "var(--navy)" }}>전사 수주 현황</h1>

        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[["수주 건수", String(rows.length)], ["총 계약액", eok(totalContract)], ["평균 진척", avgProgress + "%"], ["리스크 수주", String(atRisk)]].map(([l, v], i) => (
            <div key={l} className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div className="text-xs" style={{ color: "var(--muted)" }}>{l}</div>
              <div className="mt-1 text-2xl font-semibold" style={{ color: i === 3 && atRisk > 0 ? "var(--danger, #d93a3a)" : "var(--navy)" }}>{v}</div>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto rounded-xl border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <table className="w-full text-sm">
            <thead><tr style={{ color: "var(--muted)" }}>
              {["수주", "고객", "상태", "진척", "대금률", "납기", "리스크"].map((h) => <th key={h} className="px-3 py-2 text-left text-xs font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const late = r.delivery && r.delivery < todayStr && r.status !== "completed";
                const risk = r.llOverdue > 0 || late;
                return (
                  <tr key={r.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-2"><Link href={`/projects/${r.id}/board`} style={{ color: "var(--accent)" }}>{r.name}</Link></td>
                    <td className="px-3 py-2" style={{ color: "var(--muted)" }}>{r.client ?? "-"}</td>
                    <td className="px-3 py-2">{r.status}</td>
                    <td className="px-3 py-2">{r.progress}%</td>
                    <td className="px-3 py-2">{r.billed}%</td>
                    <td className="px-3 py-2" style={{ color: late ? "var(--danger, #d93a3a)" : undefined }}>{r.delivery ?? "-"}</td>
                    <td className="px-3 py-2">{risk ? <span style={{ color: "var(--danger, #d93a3a)" }}>● {r.llOverdue > 0 ? `롱리드 ${r.llOverdue}` : "납기"}</span> : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center" style={{ color: "var(--muted)" }}>수주가 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
