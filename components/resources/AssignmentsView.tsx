"use client";

import { useEffect, useMemo, useState } from "react";
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
    const { data } = await supabase.from("project_assignments").select("*, resources(employee_no, name, rank, trade, monthly_rate)").eq("project_id", projectId).order("created_at");
    setRows((data as ProjectAssignment[]) ?? []);
    router.refresh();
  }

  // 최초 로드 시 사번·직급 포함 데이터로 한 번 더 동기화(서버 초기 데이터가 구버전이어도 표시 보장)
  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.from("project_assignments").select("*, resources(employee_no, name, rank, trade, monthly_rate)").eq("project_id", projectId).order("created_at");
      if (active && data) setRows(data as ProjectAssignment[]);
    })();
    return () => { active = false; };
  }, [supabase, projectId]);

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

  const activeRes = resources.filter((r) => r.is_active);

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-3 gap-3">
        <div className="kpi"><div className="kpi-label">투입 인원</div><div className="kpi-value">{summary?.headcount ?? new Set(rows.map((r) => r.resource_id)).size}<span className="ml-0.5 text-[14px] font-medium" style={{ color: "var(--muted)" }}>명</span></div></div>
        <div className="kpi"><div className="kpi-label">계획 M/M</div><div className="kpi-value">{(summary?.planned_mm_total ?? totalMM).toLocaleString()}</div></div>
        <div className="kpi"><div className="kpi-label">계획 노무비</div><div className="kpi-value num">{won(summary?.planned_labor_cost ?? totalCost)}</div></div>
      </section>

      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-bold" style={{ color: "var(--heading)" }}>인력 배정</h2>
        <button onClick={() => setOpen((v) => !v)} className="btn btn-primary btn-sm">{open ? "닫기" : "+ 인력 배정"}</button>
      </div>
      {err && <p className="rounded-[4px] px-3 py-2 text-[13px]" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>{err}</p>}
      {activeRes.length === 0 && <p className="rounded-[4px] px-3 py-2 text-[13px]" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>등록된 인력이 없습니다. 상단 메뉴 <b>인력</b>에서 사번·사원·직급을 먼저 등록(또는 엑셀 업로드)하세요.</p>}

      {open && (
        <div className="toolbar">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px]" style={{ color: "var(--muted)" }}>인력</span>
            <select className="select input-sm w-auto" value={f.resource_id} onChange={(e) => setF({ ...f, resource_id: e.target.value })}>
              {activeRes.map((r) => <option key={r.id} value={r.id}>{r.employee_no ? `[${r.employee_no}] ` : ""}{r.name}{r.rank ? ` ${r.rank}` : ""}{r.trade ? ` · ${r.trade}` : ""}</option>)}
            </select>
          </div>
          <input className="input input-sm w-32" placeholder="역할" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} />
          <div className="flex items-center gap-1.5"><span className="text-[13px]" style={{ color: "var(--muted)" }}>배정%</span><input className="input input-sm w-16 text-right" inputMode="numeric" value={f.allocation_pct} onChange={(e) => setF({ ...f, allocation_pct: e.target.value })} /></div>
          <div className="flex items-center gap-1.5"><span className="text-[13px]" style={{ color: "var(--muted)" }}>M/M</span><input className="input input-sm w-16 text-right" inputMode="decimal" value={f.planned_mm} onChange={(e) => setF({ ...f, planned_mm: e.target.value })} /></div>
          <div className="flex items-center gap-1.5"><span className="text-[13px]" style={{ color: "var(--muted)" }}>시작</span><input type="date" className="input input-sm w-auto" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></div>
          <div className="flex items-center gap-1.5"><span className="text-[13px]" style={{ color: "var(--muted)" }}>종료</span><input type="date" className="input input-sm w-auto" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></div>
          <button onClick={add} className="btn btn-primary btn-sm ml-auto">배정</button>
        </div>
      )}

      <div className="grid-wrap overflow-x-auto">
        <table className="data-table">
          <thead><tr>
            {["사번", "인력", "직급", "직종", "역할", "배정%", "M/M", "기간", "계획 노무비", ""].map((h, i) => <th key={i}>{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="num" style={{ color: "var(--faint)" }}>{r.resources?.employee_no ?? "-"}</td>
                <td className="font-medium">{r.resources?.name ?? "-"}</td>
                <td style={{ color: "var(--muted)" }}>{r.resources?.rank ?? "-"}</td>
                <td style={{ color: "var(--muted)" }}>{r.resources?.trade ?? "-"}</td>
                <td><input className="input input-sm w-24" value={r.role ?? ""} onChange={(e) => patch(r, "role", e.target.value)} /></td>
                <td><input className="input input-sm w-14 text-right" inputMode="numeric" value={r.allocation_pct} onChange={(e) => patch(r, "allocation_pct", Number(e.target.value) || 0)} /></td>
                <td><input className="input input-sm w-14 text-right" inputMode="decimal" value={r.planned_mm} onChange={(e) => patch(r, "planned_mm", Number(e.target.value) || 0)} /></td>
                <td className="whitespace-nowrap">
                  <div className="flex flex-col gap-1">
                    <input type="date" className="input input-sm w-32" value={r.start_date ?? ""} onChange={(e) => patch(r, "start_date", e.target.value)} />
                    <input type="date" className="input input-sm w-32" value={r.end_date ?? ""} onChange={(e) => patch(r, "end_date", e.target.value)} />
                  </div>
                </td>
                <td className="num whitespace-nowrap font-medium">{won(cost(r))}</td>
                <td className="whitespace-nowrap">
                  <button onClick={() => save(r)} className="btn btn-secondary btn-sm mr-1">저장</button>
                  <button onClick={() => remove(r)} className="btn btn-danger btn-sm">삭제</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={10} className="px-3 py-8 text-center" style={{ color: "var(--muted)" }}>배정된 인력이 없습니다. “+ 인력 배정”으로 추가하세요.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-[13px]" style={{ color: "var(--faint)" }}>계획 노무비 = 월단가 × 계획 M/M. 동일 인력이 여러 프로젝트에 배정되면 인력 관리 화면에서 과배정을 확인할 수 있습니다.</p>
    </div>
  );
}
