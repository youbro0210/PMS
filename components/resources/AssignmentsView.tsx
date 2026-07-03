"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Resource, ProjectAssignment, ProjectLaborSummary } from "@/lib/db/types";

const won = (n: number | null | undefined) => (n == null ? "-" : new Intl.NumberFormat("ko-KR").format(Math.round(n)) + "원");

export function AssignmentsView({
  projectId, resources, initial, summary,
}: {
  projectId: string;
  resources: Resource[];
  initial: ProjectAssignment[];
  summary: ProjectLaborSummary | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [rows, setRows] = useState<ProjectAssignment[]>(initial);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ resource_id: resources[0]?.id ?? "", role: "", allocation_pct: "100", start_date: "", end_date: "", planned_mm: "1" });

  async function reload() {
    const { data } = await supabase.from("project_assignments").select("*, resources(name, trade, monthly_rate)").eq("project_id", projectId).order("created_at");
    setRows((data as ProjectAssignment[]) ?? []);
    router.refresh();
  }

  async function add() {
    setErr(null);
    if (!f.resource_id) { setErr("인력을 선택하세요. (없으면 인력 관리에서 먼저 등록)"); return; }
    const { error } = await supabase.from("project_assignments").insert({
      project_id: projectId, resource_id: f.resource_id, role: f.role.trim() || null,
      allocation_pct: Number(f.allocation_pct) || 100, start_date: f.start_date || null, end_date: f.end_date || null,
      planned_mm: Number(f.planned_mm) || 0,
    });
    if (error) { setErr(error.message); return; }
    setOpen(false); setF({ resource_id: resources[0]?.id ?? "", role: "", allocation_pct: "100", start_date: "", end_date: "", planned_mm: "1" });
    await reload();
  }
  async function patch(r: ProjectAssignment, k: keyof ProjectAssignment, v: string | number | null) {
    setRows((p) => p.map((x) => (x.id === r.id ? { ...x, [k]: v } as ProjectAssignment : x)));
  }
  async function save(r: ProjectAssignment) {
    const { error } = await supabase.from("project_assignments").update({
      role: r.role, allocation_pct: r.allocation_pct, start_date: r.start_date, end_date: r.end_date, planned_mm: r.planned_mm, actual_mm: r.actual_mm,
    }).eq("id", r.id);
    if (error) { setErr(error.message); return; }
    await reload();
  }
  async function remove(r: ProjectAssignment) {
    if (!confirm(`${r.resources?.name ?? "인력"} 배정을 삭제할까요?`)) return;
    const { error } = await supabase.from("project_assignments").delete().eq("id", r.id);
    if (error) { setErr(error.message); return; }
    await reload();
  }

  const cost = (r: ProjectAssignment) => (r.resources?.monthly_rate ?? 0) * (r.planned_mm ?? 0);
  const totalCost = useMemo(() => rows.reduce((a, r) => a + cost(r), 0), [rows]);
  const totalMM = useMemo(() => rows.reduce((a, r) => a + (r.planned_mm ?? 0), 0), [rows]);

  const cell = "rounded border bg-transparent px-2 py-1 text-xs";
  const style = { borderColor: "var(--border)" };

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-3 gap-3">
        <div className="rounded-xl p-4" style={{ background: "var(--surface)" }}><div className="text-xs" style={{ color: "var(--muted)" }}>투입 인원</div><div className="mt-1 text-2xl font-semibold">{summary?.headcount ?? new Set(rows.map((r) => r.resource_id)).size}명</div></div>
        <div className="rounded-xl p-4" style={{ background: "var(--surface)" }}><div className="text-xs" style={{ color: "var(--muted)" }}>계획 M/M</div><div className="mt-1 text-2xl font-semibold">{(summary?.planned_mm_total ?? totalMM).toLocaleString()}</div></div>
        <div className="rounded-xl p-4" style={{ background: "var(--surface)" }}><div className="text-xs" style={{ color: "var(--muted)" }}>계획 노무비</div><div className="mt-1 text-xl font-semibold">{won(summary?.planned_labor_cost ?? totalCost)}</div></div>
      </section>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">인력 배정</h2>
        <button onClick={() => setOpen((v) => !v)} className="rounded-md px-3 py-1.5 text-sm font-medium text-white" style={{ background: "var(--accent)" }}>{open ? "닫기" : "+ 인력 배정"}</button>
      </div>
      {err && <p className="text-sm text-red-500">{err}</p>}

      {open && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <label className="text-xs">인력
            <select className={`${cell} ml-1`} style={style} value={f.resource_id} onChange={(e) => setF({ ...f, resource_id: e.target.value })}>
              {resources.filter((r) => r.is_active).map((r) => <option key={r.id} value={r.id}>{r.name}{r.trade ? ` (${r.trade})` : ""}</option>)}
            </select>
          </label>
          <input className={cell} style={style} placeholder="역할" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} />
          <label className="text-xs">배정%<input className={`${cell} ml-1 w-14`} style={style} inputMode="numeric" value={f.allocation_pct} onChange={(e) => setF({ ...f, allocation_pct: e.target.value })} /></label>
          <label className="text-xs">M/M<input className={`${cell} ml-1 w-14`} style={style} inputMode="decimal" value={f.planned_mm} onChange={(e) => setF({ ...f, planned_mm: e.target.value })} /></label>
          <label className="text-xs">시작<input type="date" className={`${cell} ml-1`} style={style} value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></label>
          <label className="text-xs">종료<input type="date" className={`${cell} ml-1`} style={style} value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></label>
          <button onClick={add} className="rounded-md px-3 py-1.5 text-sm font-medium text-white" style={{ background: "var(--accent)" }}>배정</button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <table className="w-full text-xs">
          <thead><tr style={{ color: "var(--muted)" }}>
            {["인력", "직종", "역할", "배정%", "M/M", "기간", "계획 노무비", ""].map((h, i) => <th key={i} className="px-2 py-2 text-left font-medium">{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="px-2 py-1">{r.resources?.name ?? "-"}</td>
                <td className="px-2 py-1" style={{ color: "var(--muted)" }}>{r.resources?.trade ?? "-"}</td>
                <td className="px-2 py-1"><input className={`${cell} w-20`} style={style} value={r.role ?? ""} onChange={(e) => patch(r, "role", e.target.value)} /></td>
                <td className="px-2 py-1"><input className={`${cell} w-12`} style={style} inputMode="numeric" value={r.allocation_pct} onChange={(e) => patch(r, "allocation_pct", Number(e.target.value) || 0)} /></td>
                <td className="px-2 py-1"><input className={`${cell} w-12`} style={style} inputMode="decimal" value={r.planned_mm} onChange={(e) => patch(r, "planned_mm", Number(e.target.value) || 0)} /></td>
                <td className="px-2 py-1 whitespace-nowrap">
                  <input type="date" className={`${cell} w-28`} style={style} value={r.start_date ?? ""} onChange={(e) => patch(r, "start_date", e.target.value)} />
                  <input type="date" className={`${cell} mt-1 w-28`} style={style} value={r.end_date ?? ""} onChange={(e) => patch(r, "end_date", e.target.value)} />
                </td>
                <td className="px-2 py-1 whitespace-nowrap font-medium">{won(cost(r))}</td>
                <td className="px-2 py-1 whitespace-nowrap">
                  <button onClick={() => save(r)} className="mr-2 rounded px-2 py-1 font-medium text-white" style={{ background: "var(--accent)" }}>저장</button>
                  <button onClick={() => remove(r)} className="text-red-500">삭제</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center" style={{ color: "var(--muted)" }}>배정된 인력이 없습니다. "인력 배정"으로 추가하세요. (인력이 없으면 상단 인력 관리에서 먼저 등록)</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs" style={{ color: "var(--muted)" }}>계획 노무비 = 월단가 × 계획 M/M. 동일 인력이 여러 프로젝트에 배정되면 인력 관리 화면에서 과배정을 확인할 수 있습니다.</p>
    </div>
  );
}
