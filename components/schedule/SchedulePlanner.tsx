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

  const setDraft = (id: string, k: keyof Draft, v: string) =>
    setDrafts((p) => ({ ...p, [id]: { ...p[id], [k]: v } }));

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
                      <button onClick={() => save(w)} disabled={savingId === w.id} className="rounded px-2 py-1 font-medium text-white disabled:opacity-50" style={{ background: okId === w.id ? "#1d9e75" : "var(--accent)" }}>
                        {savingId === w.id ? "저장…" : okId === w.id ? "저장됨" : "저장"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {works.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center" style={{ color: "var(--muted)" }}>등록된 단계가 없습니다. 수주 등록 시 표준 단계를 생성하세요.</td></tr>}
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
