"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { formatThousands, parseAmount } from "@/lib/format";
import type { ProcurementItem, ProcurementStatus } from "@/lib/db/types";

const won = (n: number | null | undefined) => (n == null ? "-" : new Intl.NumberFormat("ko-KR").format(n) + "원");
const ST: { v: ProcurementStatus; l: string }[] = [
  { v: "planned", l: "발주예정" }, { v: "ordered", l: "발주" }, { v: "in_transit", l: "운송중" }, { v: "received", l: "입고" }, { v: "inspected", l: "검사완료" },
];
const STL = Object.fromEntries(ST.map((s) => [s.v, s.l]));

export default function ProcurementPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();
  const [rows, setRows] = useState<ProcurementItem[]>([]);
  const [f, setF] = useState({ name: "", unitPrice: "", qty: "1", lead: "", longLead: false });
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("procurement_items").select("*").eq("project_id", id).order("created_at", { ascending: false });
    setRows((data as ProcurementItem[]) ?? []);
  }, [supabase, id]);
  useEffect(() => { void load(); }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!f.name.trim()) { setErr("품목명을 입력하세요."); return; }
    const lead = f.lead ? Number(f.lead) : null;
    const eta = lead != null ? new Date(Date.now() + lead * 7 * 86400000).toISOString().slice(0, 10) : null;
    const unit = parseAmount(f.unitPrice) ?? 0;
    const qty = Number(f.qty.replace(/,/g, "")) || 1;
    const { error } = await supabase.from("procurement_items").insert({
      project_id: id, name: f.name.trim(), qty, amount: unit * qty,   // 금액 = 단가 × 수량
      lead_time_weeks: lead, eta, is_long_lead: f.longLead, status: "ordered", order_date: new Date().toISOString().slice(0, 10),
    });
    if (error) { setErr(error.message); return; }
    setF({ name: "", unitPrice: "", qty: "1", lead: "", longLead: false }); void load();
  }

  async function setStatus(itemId: string, status: ProcurementStatus) {
    const patch: Record<string, unknown> = { status };
    if (status === "received" || status === "inspected") patch.received_date = new Date().toISOString().slice(0, 10);
    await supabase.from("procurement_items").update(patch).eq("id", itemId);
    void load();
  }

  async function remove(itemId: string, name: string) {
    if (!confirm(`'${name}' 기자재를 삭제할까요?`)) return;
    const { error } = await supabase.from("procurement_items").delete().eq("id", itemId);
    if (error) { setErr(error.message); return; }
    void load();
  }

  const input = "rounded-md border bg-transparent px-3 py-2 text-sm";
  const style = { borderColor: "var(--border)" };

  return (
    <main>
      <SiteHeader />
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold" style={{ color: "var(--navy)" }}>기자재 구매</h1>
          <Link href={`/projects/${id}/board`} className="text-sm" style={{ color: "var(--accent)" }}>← 대시보드</Link>
        </div>

        <form onSubmit={add} className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="flex-1" style={{ minWidth: 180 }}>
            <label className="mb-1 block text-xs font-medium">품목명</label>
            <input className={`${input} w-full`} style={style} placeholder="예: NEA 압축기 본체" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
          </div>
          <div><label className="mb-1 block text-xs font-medium">단가(원)</label><input className={input} style={{ ...style, width: 150 }} inputMode="numeric" placeholder="예: 360,000,000" value={f.unitPrice} onChange={(e) => setF({ ...f, unitPrice: formatThousands(e.target.value) })} /></div>
          <div><label className="mb-1 block text-xs font-medium">수량</label><input className={input} style={{ ...style, width: 80 }} inputMode="numeric" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value.replace(/[^\d]/g, "") })} /></div>
          <div><label className="mb-1 block text-xs font-medium">리드타임(주)</label><input className={input} style={{ ...style, width: 90 }} inputMode="numeric" value={f.lead} onChange={(e) => setF({ ...f, lead: e.target.value })} /></div>
          <label className="flex items-center gap-1.5 pb-2 text-xs"><input type="checkbox" checked={f.longLead} onChange={(e) => setF({ ...f, longLead: e.target.checked })} />롱리드</label>
          <button type="submit" className="rounded-md px-4 py-2 text-sm font-medium text-white" style={{ background: "var(--accent)" }}>발주 등록</button>
        </form>
        {err && <p className="mb-3 text-sm text-red-500">{err}</p>}

        <div className="overflow-hidden rounded-xl border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          {rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 last:border-b-0" style={{ borderColor: "var(--border)" }}>
              <div>
                <div className="text-sm font-medium">{r.is_long_lead && <span style={{ color: "var(--warn, #e09017)" }}>⚠ </span>}{r.name}</div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>수량 {r.qty} · {won(r.amount)}{r.eta ? ` · ETA ${r.eta}` : ""}{r.lead_time_weeks ? ` · 리드 ${r.lead_time_weeks}주` : ""}</div>
              </div>
              <div className="flex items-center gap-3">
                <select className="rounded-md border bg-transparent px-2 py-1 text-xs" style={style} value={r.status} onChange={(e) => setStatus(r.id, e.target.value as ProcurementStatus)}>
                  {ST.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
                </select>
                <button onClick={() => remove(r.id, r.name)} className="text-xs text-red-500">삭제</button>
              </div>
            </div>
          ))}
          {rows.length === 0 && <p className="px-4 py-6 text-sm" style={{ color: "var(--muted)" }}>등록된 기자재가 없습니다.</p>}
        </div>
      </div>
    </main>
  );
}
