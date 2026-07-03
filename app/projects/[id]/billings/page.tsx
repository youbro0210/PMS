"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { ProjectNav } from "@/components/layout/ProjectNav";
import { formatThousands, parseAmount } from "@/lib/format";
import type { Billing, BillingStatus } from "@/lib/db/types";

const won = (n: number | null | undefined) => (n == null ? "-" : new Intl.NumberFormat("ko-KR").format(n) + "원");
const STATUS: { v: BillingStatus; l: string }[] = [
  { v: "draft", l: "작성" }, { v: "requested", l: "청구" }, { v: "reviewed", l: "사정" }, { v: "confirmed", l: "확정" }, { v: "paid", l: "지급" },
];

export default function BillingsPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();
  const [rows, setRows] = useState<Billing[]>([]);
  const [rates, setRates] = useState({ retention: 0, advance: 0, contract: 0 });
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: bs }, { data: proj }] = await Promise.all([
      supabase.from("billings").select("*").eq("project_id", id).is("subcontractor_id", null).order("period_no", { ascending: false }),
      supabase.from("projects").select("retention_rate, advance_recovery_rate, contract_amount").eq("id", id).single(),
    ]);
    setRows((bs as Billing[]) ?? []);
    setRates({ retention: Number(proj?.retention_rate ?? 0), advance: Number(proj?.advance_recovery_rate ?? 0), contract: Number(proj?.contract_amount ?? 0) });
  }, [supabase, id]);
  useEffect(() => { void load(); }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const amt = parseAmount(amount);
    if (!amt) { setErr("금액을 입력하세요."); return; }
    const prev = rows[0];
    const periodNo = (prev?.period_no ?? 0) + 1;
    const cumulative = (prev?.cumulative_amount ?? 0) + amt;
    const retention = Math.round((amt * rates.retention) / 100);
    const advance = Math.round((amt * rates.advance) / 100);
    const { error } = await supabase.from("billings").insert({
      project_id: id, period_no: periodNo, this_amount: amt, cumulative_amount: cumulative,
      contract_amount: rates.contract || null,
      progress_rate: rates.contract ? Math.round((cumulative / rates.contract) * 10000) / 100 : null,
      retention_amount: retention, advance_deduction: advance, status: "requested",
      requested_at: new Date().toISOString(),
    });
    if (error) { setErr(error.message); return; }
    setAmount(""); void load();
  }

  async function changeStatus(rowId: string, status: BillingStatus) {
    const patch: Record<string, unknown> = { status };
    if (status === "confirmed") patch.confirmed_at = new Date().toISOString();
    if (status === "paid") patch.paid_at = new Date().toISOString();
    await supabase.from("billings").update(patch).eq("id", rowId);
    void load();
  }

  async function remove(rowId: string, period: number) {
    if (!confirm(`${period}회차 대금을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    const { error } = await supabase.from("billings").delete().eq("id", rowId);
    if (error) { setErr(error.message); return; }
    void load();
  }

  const input = "rounded-md border bg-transparent px-3 py-2 text-sm";
  const style = { borderColor: "var(--border)" };

  return (
    <main>
      <SiteHeader />
      <ProjectNav projectId={id} />
      <div className="page">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold" style={{ color: "var(--navy)" }}>대금(기성) 관리</h1>
          <Link href={`/projects/${id}/board`} className="text-sm" style={{ color: "var(--accent)" }}>← 대시보드</Link>
        </div>

        <form onSubmit={add} className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium">금회 대금(원)</label>
            <input className={`${input} w-full`} style={style} inputMode="numeric" placeholder="예: 500,000,000" value={amount} onChange={(e) => setAmount(formatThousands(e.target.value))} required />
          </div>
          <button type="submit" className="rounded-md px-4 py-2 text-sm font-medium text-white" style={{ background: "var(--accent)" }}>회차 청구</button>
          <p className="w-full text-xs" style={{ color: "var(--muted)" }}>유보율 {rates.retention}% · 선급금 정산율 {rates.advance}% 자동 차감 → 실수금 계산(DB 트리거)</p>
        </form>
        {err && <p className="mb-3 text-sm text-red-500">{err}</p>}

        <div className="overflow-x-auto rounded-xl border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <table className="w-full text-sm">
            <thead><tr style={{ color: "var(--muted)" }}>
              {["회차", "금회", "누계", "유보", "선급정산", "실수금", "상태", ""].map((h, i) => <th key={i} className="px-3 py-2 text-left text-xs font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-3 py-2">{r.period_no}</td>
                  <td className="px-3 py-2">{won(r.this_amount)}</td>
                  <td className="px-3 py-2">{won(r.cumulative_amount)}</td>
                  <td className="px-3 py-2">{won(r.retention_amount)}</td>
                  <td className="px-3 py-2">{won(r.advance_deduction)}</td>
                  <td className="px-3 py-2 font-medium">{won(r.net_payment)}</td>
                  <td className="px-3 py-2">
                    <select className="rounded-md border bg-transparent px-2 py-1 text-xs" style={style} value={r.status} onChange={(e) => changeStatus(r.id, e.target.value as BillingStatus)}>
                      {STATUS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => remove(r.id, r.period_no)} className="text-xs text-red-500">삭제</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center" style={{ color: "var(--muted)" }}>등록된 대금이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>상태는 셀렉트로 변경(청구→사정→확정→지급), 삭제는 맨 끝 버튼. 삭제는 정정용이며 누계는 자동 보정되지 않으니 최신 회차부터 삭제하세요.</p>
      </div>
    </main>
  );
}
