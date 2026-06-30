"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatThousands } from "@/lib/format";
import { Gantt } from "@/components/schedule/Gantt";
import type { WorkPackage } from "@/lib/db/types";

interface Draft {
  planned_start: string;
  planned_end: string;
  planned_amount: string;
  planned_progress: string;
  actual_progress: string;
}

const won = (n: number | null | undefined) => (n == null ? "-" : new Intl.NumberFormat("ko-KR").format(n) + "원");

/**
 * 단계 계획 편집기 — 단계별 계획 일정·예산·진척을 직접 입력/수정.
 * 저장 시 work_packages를 갱신하고 간트차트가 즉시 반영된다.
 */
export function SchedulePlanner({ projectId, initial }: { projectId: string; initial: WorkPackage[] }) {
  const supabase = createClient();
  const [works, setWorks] = useState<WorkPackage[]>(initial);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => Object.fromEntries(
    initial.map((w) => [w.id, {
      planned_start: w.planned_start ?? "",
      planned_end: w.planned_end ?? "",
      planned_amount: w.planned_amount != null ? formatThousands(String(w.planned_amount)) : "",
      planned_progress: String(w.planned_progress ?? 0),
      actual_progress: String(w.actual_progress ?? 0),
    }]),
  ));
  const [savingId, setSavingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [okId, setOkId] = useState<string | null>(null);
  const [redist, setRedist] = useState({ start: "", end: "" });
  const [busy, setBusy] = useState(false);
  const [newPhase, setNewPhase] = useState({ name: "", weight: "10" });

  const setDraft = (id: string, k: keyof Draft, v: string) =>
    setDrafts((p) => ({ ...p, [id]: { ...p[id], [k]: v } }));

  async function reload() {
    const { data } = await supabase.from("work_packages").select("*").eq("project_id", projectId).order("code", { ascending: true });
    const rows = (data as WorkPackage[]) ?? [];
    setWorks(rows);
    setDrafts(Object.fromEntries(rows.map((w) => [w.id, {
      planned_start: w.planned_start ?? "", planned_end: w.planned_end ?? "",
      planned_amount: w.planned_amount != null ? formatThousands(String(w.planned_amount)) : "",
      planned_progress: String(w.planned_progress ?? 0), actual_progress: String(w.actual_progress ?? 0),
    }])));
  }

  // 착수~납기를 단계 가중치로 자동 배분(계획 시작/종료 일괄 저장)
  async function redistribute() {
    setErr(null);
    const s = new Date(redist.start + "T00:00:00").getTime();
    const e = new Date(redist.end + "T00:00:00").getTime();
    if (!redist.start || !redist.end || Number.isNaN(s) || Number.isNaN(e) || e <= s) { setErr("착수일·납기를 올바르게 입력하세요(납기 > 착수)."); return; }
    setBusy(true);
    const ordered = [...works].sort((a, b) => (a.code ?? "").localeCompare(b.code ?? ""));
    const totW = ordered.reduce((a, w) => a + (w.weight || 0), 0) || 1;
    const span = e - s;
    let acc = 0;
    for (const w of ordered) {
      const ps = new Date(s + (span * acc) / totW).toISOString().slice(0, 10);
      acc += w.weight || 0;
      const pe = new Date(s + (span * acc) / totW).toISOString().slice(0, 10);
      await supabase.from("work_packages").update({ planned_start: ps, planned_end: pe }).eq("id", w.id);
    }
    setBusy(false);
    await reload();
  }

  async function addPhase() {
    setErr(null);
    if (!newPhase.name.trim()) { setErr("단계명을 입력하세요."); return; }
    setBusy(true);
    const nextNo = works.length + 1;
    const { error } = await supabase.from("work_packages").insert({
      project_id: projectId, code: `P${nextNo}`, name: newPhase.name.trim(),
      weight: Number(newPhase.weight) || 0, planned_progress: 0, actual_progress: 0, status: "not_started",
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setNewPhase({ name: "", weight: "10" });
    await reload();
  }

  async function removePhase(w: WorkPackage) {
    if (!confirm(`'${w.name}' 단계를 삭제할까요?`)) return;
    const { error } = await supabase.from("work_packages").delete().eq("id", w.id);
    if (error) { setErr(error.message); return; }
    await reload();
  }

  async function save(w: WorkPackage) {
    const d = drafts[w.id];
    setSavingId(w.id); setErr(null); setOkId(null);
    const amount = d.planned_amount.trim() === "" ? null : Number(d.planned_amount.replace(/,/g, ""));
    const pp = Math.max(0, Math.min(100, Number(d.planned_progress) || 0));
    const ap = Math.max(0, Math.min(100, Number(d.actual_progress) || 0));
    const status = ap >= 100 ? "completed" : ap > 0 ? "in_progress" : "not_started";
    const patch = {
      planned_start: d.planned_start || null,
      planned_end: d.planned_end || null,
      planned_amount: amount,
      planned_progress: pp,
      actual_progress: ap,
      status,
    };
    const { error } = await supabase.from("work_packages").update(patch).eq("id", w.id);
    setSavingId(null);
    if (error) { setErr(`${w.name}: ${error.message}`); return; }
    setWorks((prev) => prev.map((x) => (x.id === w.id ? { ...x, ...patch } as WorkPackage : x)));
    setOkId(w.id);
    setTimeout(() => setOkId((v) => (v === w.id ? null : v)), 1500);
  }

  const totalBudget = works.reduce((a, w) => a + (w.planned_amount ?? 0), 0);
  const input = "w-full rounded border bg-transparent px-2 py-1 text-xs";
  const style = { borderColor: "var(--border)" };

  return (
    <div className="space-y-6">
      <Gantt works={works} />

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium">단계 계획 입력 (일정·예산·진척)</h2>
          <span className="text-xs" style={{ color: "var(--muted)" }}>총 계획예산 {won(totalBudget)}</span>
        </div>
        {err && <p className="mb-2 text-sm text-red-500">{err}</p>}

        <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border p-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <span className="text-xs font-medium">기본 일정 자동배분</span>
          <label className="text-xs">착수<input type="date" className={`${input} ml-1 w-auto`} style={style} value={redist.start} onChange={(e) => setRedist({ ...redist, start: e.target.value })} /></label>
          <label className="text-xs">납기<input type="date" className={`${input} ml-1 w-auto`} style={style} value={redist.end} onChange={(e) => setRedist({ ...redist, end: e.target.value })} /></label>
          <button onClick={redistribute} disabled={busy} className="rounded px-3 py-1 text-xs font-medium text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>가중치대로 배분</button>
          <span className="text-[11px]" style={{ color: "var(--muted)" }}>모든 단계의 계획 시작·종료를 착수~납기 구간에 비중대로 채웁니다.</span>
        </div>

        <div className="overflow-x-auto rounded-xl border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <table className="w-full text-xs">
            <thead><tr style={{ color: "var(--muted)" }}>
              {["단계", "계획 시작", "계획 종료", "계획 예산(원)", "계획 진척%", "실적 진척%", ""].map((h, i) => (
                <th key={i} className="px-2 py-2 text-left font-medium">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {works.map((w) => {
                const d = drafts[w.id];
                return (
                  <tr key={w.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="whitespace-nowrap px-2 py-2">
                      {w.code && <span style={{ color: "var(--muted)" }} className="mr-1">{w.code}</span>}{w.name}
                    </td>
                    <td className="px-2 py-2"><input type="date" className={input} style={style} value={d.planned_start} onChange={(e) => setDraft(w.id, "planned_start", e.target.value)} /></td>
                    <td className="px-2 py-2"><input type="date" className={input} style={style} value={d.planned_end} onChange={(e) => setDraft(w.id, "planned_end", e.target.value)} /></td>
                    <td className="px-2 py-2"><input className={`${input} w-28`} style={style} inputMode="numeric" value={d.planned_amount} onChange={(e) => setDraft(w.id, "planned_amount", formatThousands(e.target.value))} /></td>
                    <td className="px-2 py-2"><input className={`${input} w-16`} style={style} inputMode="numeric" value={d.planned_progress} onChange={(e) => setDraft(w.id, "planned_progress", e.target.value)} /></td>
                    <td className="px-2 py-2"><input className={`${input} w-16`} style={style} inputMode="numeric" value={d.actual_progress} onChange={(e) => setDraft(w.id, "actual_progress", e.target.value)} /></td>
                    <td className="whitespace-nowrap px-2 py-2">
                      <button onClick={() => save(w)} disabled={savingId === w.id} className="mr-2 rounded px-2 py-1 font-medium text-white disabled:opacity-50" style={{ background: okId === w.id ? "#1d9e75" : "var(--accent)" }}>
                        {savingId === w.id ? "저장…" : okId === w.id ? "저장됨" : "저장"}
                      </button>
                      <button onClick={() => removePhase(w)} className="text-red-500">삭제</button>
                    </td>
                  </tr>
                );
              })}
              {works.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center" style={{ color: "var(--muted)" }}>등록된 단계가 없습니다. 아래에서 단계를 추가하세요.</td></tr>}
              <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="px-2 py-2"><input className={input} style={style} placeholder="새 단계명" value={newPhase.name} onChange={(e) => setNewPhase({ ...newPhase, name: e.target.value })} /></td>
                <td className="px-2 py-2" colSpan={3}><span className="text-[11px]" style={{ color: "var(--muted)" }}>추가 후 일정·예산을 입력하세요</span></td>
                <td className="px-2 py-2"><input className={`${input} w-16`} style={style} inputMode="numeric" value={newPhase.weight} onChange={(e) => setNewPhase({ ...newPhase, weight: e.target.value })} placeholder="비중%" /></td>
                <td className="px-2 py-2"></td>
                <td className="px-2 py-2"><button onClick={addPhase} disabled={busy} className="rounded border px-2 py-1 font-medium disabled:opacity-50" style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>+ 단계 추가</button></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
          계획 예산 합계가 EVM의 BAC(총예산)로 쓰이고, 계획·실적 진척이 S-curve와 게이지에 반영됩니다.
        </p>
      </section>
    </div>
  );
}
