"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatThousands } from "@/lib/format";
import { PROCURE_TYPE_LABELS, type ProcureType, type BomItem } from "@/lib/db/types";

const PT = Object.entries(PROCURE_TYPE_LABELS) as [ProcureType, string][];
const won = (n: number | null | undefined) => (n == null ? "-" : new Intl.NumberFormat("ko-KR").format(Math.round(n)) + "원");

/** 프로젝트 BOM 기준정보 — 구매구분·단가·금액 편집, 구매구분별 집계 */
export function BomView({ projectId, initial }: { projectId: string; initial: BomItem[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [rows, setRows] = useState<BomItem[]>(initial);
  const [err, setErr] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [basis, setBasis] = useState("delivery");
  const [anchor, setAnchor] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const [genMsg, setGenMsg] = useState<string | null>(null);

  async function generatePOs() {
    setGenBusy(true); setGenMsg(null); setErr(null);
    const { data, error } = await supabase.rpc("generate_pos_from_bom", { p_project_id: projectId, p_basis: basis, p_anchor: anchor || null });
    setGenBusy(false);
    if (error) { setErr(error.message); return; }
    setGenMsg(`구매품·외주품 ${data ?? 0}건의 발주(PO)를 생성했습니다. 리드타임으로 발주일·입고예정(ETA)이 계산됐습니다.`);
    router.refresh();
  }

  async function reload() {
    const { data } = await supabase.from("bom_items").select("*").eq("project_id", projectId).order("item_no", { ascending: true });
    setRows((data as BomItem[]) ?? []);
  }

  async function patch(r: BomItem, k: keyof BomItem, v: string | number | null) {
    setRows((p) => p.map((x) => (x.id === r.id ? { ...x, [k]: v } as BomItem : x)));
  }
  async function save(r: BomItem) {
    setSavingId(r.id); setErr(null);
    const amount = r.unit_price != null ? Number(r.unit_price) * Number(r.qty) : r.amount;
    const { error } = await supabase.from("bom_items").update({
      description: r.description, qty: r.qty, size: r.size, manufacturer: r.manufacturer, model: r.model,
      procure_type: r.procure_type, lead_time_weeks: r.lead_time_weeks, unit_price: r.unit_price, amount, note: r.note,
    }).eq("id", r.id);
    setSavingId(null);
    if (error) { setErr(error.message); return; }
    await reload();
  }
  async function saveAll() {
    setSavingAll(true); setErr(null);
    const payload = rows.map((r) => ({
      id: r.id, project_id: projectId, item_no: r.item_no, description: r.description, qty: r.qty,
      size: r.size, manufacturer: r.manufacturer, model: r.model, procure_type: r.procure_type,
      lead_time_weeks: r.lead_time_weeks,
      unit_price: r.unit_price, amount: r.unit_price != null ? Number(r.unit_price) * Number(r.qty) : r.amount, note: r.note,
    }));
    const { error } = await supabase.from("bom_items").upsert(payload);
    setSavingAll(false);
    if (error) { setErr(`일괄 저장 실패: ${error.message}`); return; }
    await reload();
  }
  async function remove(r: BomItem) {
    if (!confirm(`${r.description} 항목을 삭제할까요?`)) return;
    const { error } = await supabase.from("bom_items").delete().eq("id", r.id);
    if (error) { setErr(error.message); return; }
    await reload();
  }
  async function add() {
    const { error } = await supabase.from("bom_items").insert({ project_id: projectId, item_no: rows.length + 1, description: "새 품목", qty: 1, procure_type: "purchase" });
    if (error) { setErr(error.message); return; }
    await reload();
  }

  const summary = useMemo(() => {
    const g: Record<string, { count: number; amount: number }> = {};
    for (const r of rows) {
      const amt = r.amount ?? (r.unit_price != null ? r.unit_price * r.qty : 0);
      (g[r.procure_type] ??= { count: 0, amount: 0 });
      g[r.procure_type].count += 1;
      g[r.procure_type].amount += Number(amt) || 0;
    }
    return g;
  }, [rows]);
  const totalAmount = Object.values(summary).reduce((a, s) => a + s.amount, 0);

  const cell = "rounded border bg-transparent px-2 py-1 text-xs";
  const style = { borderColor: "var(--border)" };

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {PT.map(([v, l]) => (
          <div key={v} className="rounded-xl p-4" style={{ background: "var(--surface)" }}>
            <div className="text-xs" style={{ color: "var(--muted)" }}>{l}</div>
            <div className="mt-1 text-lg font-semibold">{summary[v]?.count ?? 0}건</div>
            <div className="text-[11px]" style={{ color: "var(--muted)" }}>{won(summary[v]?.amount ?? 0)}</div>
          </div>
        ))}
      </section>
      <div className="flex items-center justify-between">
        <span className="text-sm" style={{ color: "var(--muted)" }}>BOM 총 {rows.length}행 · 합계 {won(totalAmount)}</span>
        <div className="flex items-center gap-2">
          <button onClick={saveAll} disabled={savingAll || rows.length === 0} className="rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50" style={{ background: "var(--navy)" }}>{savingAll ? "저장 중…" : "전체 저장"}</button>
          <button onClick={add} className="rounded-md px-3 py-1.5 text-sm font-medium text-white" style={{ background: "var(--accent)" }}>+ 품목 추가</button>
        </div>
      </div>

      <div className="rounded-lg border p-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-sm font-semibold" style={{ color: "var(--navy)" }}>발주(PO) 자동생성</span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs" style={{ color: "var(--muted)" }}>기준</span>
            <select className="rounded border bg-transparent px-2 py-1 text-xs" style={style} value={basis} onChange={(e) => setBasis(e.target.value)}>
              <option value="delivery">납기 역산</option>
              <option value="start">착수 정산</option>
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs" style={{ color: "var(--muted)" }}>{basis === "start" ? "착수일" : "납기일"}</span>
            <input type="date" className="rounded border bg-transparent px-2 py-1 text-xs" style={style} value={anchor} onChange={(e) => setAnchor(e.target.value)} />
          </div>
          <button onClick={generatePOs} disabled={genBusy} className="ml-auto rounded-md px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>{genBusy ? "생성 중…" : "발주 생성"}</button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed" style={{ color: "var(--muted)" }}>구매품·외주품을 리드타임(L/T)으로 발주일·입고예정(ETA)을 계산해 구매 탭에 생성합니다. 날짜를 비우면 프로젝트 납기/착수일을 사용하며, 롱리드(L/T≥8주)는 임계경로로 표시됩니다.</p>
      </div>
      {genMsg && <p className="text-xs" style={{ color: "#1d9e75" }}>{genMsg} <button onClick={() => router.push(`/projects/${projectId}/procurement`)} style={{ color: "var(--accent)" }}>구매 탭 보기 →</button></p>}
      {err && <p className="text-sm text-red-500">{err}</p>}

      <div className="overflow-x-auto rounded-xl border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <table className="w-full text-xs">
          <thead><tr style={{ color: "var(--muted)" }}>
            {["#", "품명", "수량", "규격", "제조사", "모델", "구매구분", "L/T주", "단가", "금액", ""].map((h, i) => <th key={i} className="px-2 py-2 text-left font-medium">{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="px-2 py-1">{r.item_no ?? "-"}</td>
                <td className="px-2 py-1"><input className={`${cell} w-52`} style={style} value={r.description} onChange={(e) => patch(r, "description", e.target.value)} /></td>
                <td className="px-2 py-1"><input className={`${cell} w-12`} style={style} value={r.qty} onChange={(e) => patch(r, "qty", Number(e.target.value) || 0)} /></td>
                <td className="px-2 py-1"><input className={`${cell} w-16`} style={style} value={r.size ?? ""} onChange={(e) => patch(r, "size", e.target.value)} /></td>
                <td className="px-2 py-1"><input className={`${cell} w-24`} style={style} value={r.manufacturer ?? ""} onChange={(e) => patch(r, "manufacturer", e.target.value)} /></td>
                <td className="px-2 py-1"><input className={`${cell} w-24`} style={style} value={r.model ?? ""} onChange={(e) => patch(r, "model", e.target.value)} /></td>
                <td className="px-2 py-1">
                  <select className={cell} style={style} value={r.procure_type} onChange={(e) => patch(r, "procure_type", e.target.value)}>
                    {PT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1"><input className={`${cell} w-12`} style={style} inputMode="numeric" value={r.lead_time_weeks ?? ""} onChange={(e) => patch(r, "lead_time_weeks", e.target.value.trim() === "" ? null : Number(e.target.value) || 0)} /></td>
                <td className="px-2 py-1"><input className={`${cell} w-24`} style={style} inputMode="numeric" value={r.unit_price != null ? formatThousands(String(r.unit_price)) : ""} onChange={(e) => patch(r, "unit_price", e.target.value.trim() === "" ? null : Number(e.target.value.replace(/,/g, "")))} /></td>
                <td className="px-2 py-1 whitespace-nowrap">{won(r.amount ?? (r.unit_price != null ? r.unit_price * r.qty : null))}</td>
                <td className="px-2 py-1 whitespace-nowrap">
                  <button onClick={() => save(r)} disabled={savingId === r.id} className="mr-2 rounded px-2 py-1 font-medium text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>{savingId === r.id ? "…" : "저장"}</button>
                  <button onClick={() => remove(r)} className="text-red-500">삭제</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={11} className="px-3 py-6 text-center" style={{ color: "var(--muted)" }}>BOM이 없습니다. "도면으로 수주 생성"으로 도면을 올리거나 품목을 추가하세요.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs" style={{ color: "var(--muted)" }}>단가를 입력하면 금액(단가×수량)이 자동 계산되고, 구매구분별 집계·예산 배부·PO 생성의 기준이 됩니다.</p>

      {rows.length > 0 && (
        <div className="sticky bottom-0 z-20 -mx-1 flex items-center justify-between gap-3 rounded-lg border px-4 py-3 shadow-lg"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <span className="text-sm" style={{ color: "var(--muted)" }}>총 {rows.length}행 · 합계 {won(totalAmount)}</span>
          <div className="flex items-center gap-2">
            <button onClick={add} className="rounded-md border px-3 py-2 text-sm font-medium" style={{ borderColor: "var(--border)" }}>+ 품목 추가</button>
            <button onClick={saveAll} disabled={savingAll} className="rounded-md px-5 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>
              {savingAll ? "저장 중…" : "전체 저장"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
