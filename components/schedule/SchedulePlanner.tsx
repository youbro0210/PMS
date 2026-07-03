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

  return (
    <div className="space-y-6">
      <Gantt works={works} />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-bold" style={{ color: "var(--heading)" }}>단계 계획 입력 <span className="font-normal" style={{ color: "var(--muted)" }}>(일정·예산·진척)</span></h2>
          <span className="text-[14px]" style={{ color: "var(--muted)" }}>총 계획예산 <b className="num" style={{ color: "var(--heading)" }}>{won(totalBudget)}</b></span>
        </div>
        {err && <p className="rounded-[4px] px-3 py-2 text-[13px]" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>{err}</p>}

        <div className="toolbar">
          <span className="toolbar-label">기본 일정 자동배분</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[13px]" style={{ color: "var(--muted)" }}>착수</span>
            <input type="date" className="input input-sm w-auto" value={redist.start} onChange={(e) => setRedist({ ...redist, start: e.target.value })} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[13px]" style={{ color: "var(--muted)" }}>납기</span>
            <input type="date" className="input input-sm w-auto" value={redist.end} onChange={(e) => setRedist({ ...redist, end: e.target.value })} />
          </div>
          <button onClick={redistribute} disabled={busy} className="btn btn-primary btn-sm">가중치대로 배분</button>
          <span className="w-full text-[12px]" style={{ color: "var(--faint)" }}>모든 단계의 계획 시작·종료를 착수~납기 구간에 비중대로 채웁니다.</span>
        </div>

        <div className="grid-wrap overflow-x-auto">
          <table className="data-table">
            <thead><tr>
              {["단계", "계획 시작", "계획 종료", "계획 예산(원)", "계획 진척%", "실적 진척%", ""].map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {works.map((w) => {
                const d = drafts[w.id];
                return (
                  <tr key={w.id}>
                    <td className="whitespace-nowrap font-medium">
                      {w.code && <span style={{ color: "var(--faint)" }} className="mr-1.5">{w.code}</span>}{w.name}
                    </td>
                    <td><input type="date" className="input input-sm" value={d.planned_start} onChange={(e) => setDraft(w.id, "planned_start", e.target.value)} /></td>
                    <td><input type="date" className="input input-sm" value={d.planned_end} onChange={(e) => setDraft(w.id, "planned_end", e.target.value)} /></td>
                    <td><input className="input input-sm w-32 text-right" inputMode="numeric" value={d.planned_amount} onChange={(e) => setDraft(w.id, "planned_amount", formatThousands(e.target.value))} /></td>
                    <td><input className="input input-sm w-20 text-right" inputMode="numeric" value={d.planned_progress} onChange={(e) => setDraft(w.id, "planned_progress", e.target.value)} /></td>
                    <td><input className="input input-sm w-20 text-right" inputMode="numeric" value={d.actual_progress} onChange={(e) => setDraft(w.id, "actual_progress", e.target.value)} /></td>
                    <td className="whitespace-nowrap">
                      <button onClick={() => save(w)} disabled={savingId === w.id} className={`btn btn-sm mr-1 ${okId === w.id ? "btn-primary" : "btn-secondary"}`} style={okId === w.id ? { background: "var(--ok)", borderColor: "var(--ok)" } : undefined}>
                        {savingId === w.id ? "저장…" : okId === w.id ? "저장됨" : "저장"}
                      </button>
                      <button onClick={() => removePhase(w)} className="btn btn-danger btn-sm">삭제</button>
                    </td>
                  </tr>
                );
              })}
              {works.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center" style={{ color: "var(--muted)" }}>등록된 단계가 없습니다. 아래에서 단계를 추가하세요.</td></tr>}
              <tr style={{ background: "var(--surface-2)" }}>
                <td><input className="input input-sm" placeholder="새 단계명" value={newPhase.name} onChange={(e) => setNewPhase({ ...newPhase, name: e.target.value })} /></td>
                <td colSpan={3}><span className="text-[12px]" style={{ color: "var(--faint)" }}>추가 후 일정·예산을 입력하세요</span></td>
                <td><input className="input input-sm w-20 text-right" inputMode="numeric" value={newPhase.weight} onChange={(e) => setNewPhase({ ...newPhase, weight: e.target.value })} placeholder="비중%" /></td>
                <td></td>
                <td><button onClick={addPhase} disabled={busy} className="btn btn-secondary btn-sm">+ 단계 추가</button></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[13px]" style={{ color: "var(--faint)" }}>
          계획 예산 합계가 EVM의 BAC(총예산)로 쓰이고, 계획·실적 진척이 S-curve와 게이지에 반영됩니다.
        </p>
      </section>
    </div>
  );
}
