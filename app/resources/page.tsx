"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { formatThousands } from "@/lib/format";
import type { Resource, ResourceUtilization } from "@/lib/db/types";

const won = (n: number | null | undefined) => (n == null ? "-" : new Intl.NumberFormat("ko-KR").format(Math.round(n)) + "원");

export default function ResourcesPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<Resource[]>([]);
  const [util, setUtil] = useState<Record<string, ResourceUtilization>>({});
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", trade: "", monthly_rate: "", capacity_pct: "100" });

  const load = useCallback(async () => {
    const [{ data: rs }, { data: us }] = await Promise.all([
      supabase.from("resources").select("*").order("is_active", { ascending: false }).order("name"),
      supabase.from("resource_utilization").select("*"),
    ]);
    setRows((rs as Resource[]) ?? []);
    setUtil(Object.fromEntries(((us as ResourceUtilization[]) ?? []).map((u) => [u.resource_id, u])));
  }, [supabase]);
  useEffect(() => { void load(); }, [load]);

  async function add() {
    setErr(null);
    if (!form.name.trim()) { setErr("이름을 입력하세요."); return; }
    const { error } = await supabase.from("resources").insert({
      name: form.name.trim(), trade: form.trade.trim() || null,
      monthly_rate: Number(form.monthly_rate.replace(/,/g, "")) || 0, capacity_pct: Number(form.capacity_pct) || 100,
    });
    if (error) { setErr(error.message); return; }
    setForm({ name: "", trade: "", monthly_rate: "", capacity_pct: "100" }); void load();
  }
  async function patch(r: Resource, k: keyof Resource, v: string | number | boolean | null) {
    setRows((p) => p.map((x) => (x.id === r.id ? { ...x, [k]: v } as Resource : x)));
  }
  async function save(r: Resource) {
    const { error } = await supabase.from("resources").update({
      name: r.name, trade: r.trade, monthly_rate: r.monthly_rate, capacity_pct: r.capacity_pct, is_active: r.is_active,
    }).eq("id", r.id);
    if (error) { setErr(error.message); return; }
    void load();
  }
  async function remove(r: Resource) {
    if (!confirm(`${r.name} 인력을 삭제할까요? 배정 이력도 함께 삭제됩니다.`)) return;
    const { error } = await supabase.from("resources").delete().eq("id", r.id);
    if (error) { setErr(error.message); return; }
    void load();
  }

  const overCount = useMemo(() => Object.values(util).filter((u) => u.current_allocation_pct > u.capacity_pct).length, [util]);

  const cell = "rounded border bg-transparent px-2 py-1 text-xs";
  const style = { borderColor: "var(--border)" };

  return (
    <main>
      <SiteHeader />
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-xl font-semibold" style={{ color: "var(--navy)" }}>인력 관리 (전사 인력 풀)</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>직종·월단가·가동률을 등록하고, 프로젝트별 인력 화면에서 배정합니다. 현재 배정률 합이 가동률을 넘으면 과배정으로 표시됩니다.</p>
        {overCount > 0 && <p className="mt-2 text-sm" style={{ color: "#ef4444" }}>⚠ 과배정 인력 {overCount}명</p>}

        <div className="mt-5 flex flex-wrap items-end gap-2 rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <input className={cell} style={style} placeholder="이름" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className={cell} style={style} placeholder="직종(설계·용접·PM 등)" value={form.trade} onChange={(e) => setForm({ ...form, trade: e.target.value })} />
          <input className={cell} style={style} inputMode="numeric" placeholder="월단가" value={form.monthly_rate} onChange={(e) => setForm({ ...form, monthly_rate: formatThousands(e.target.value) })} />
          <input className={`${cell} w-16`} style={style} inputMode="numeric" placeholder="가동%" value={form.capacity_pct} onChange={(e) => setForm({ ...form, capacity_pct: e.target.value })} />
          <button onClick={add} className="rounded-md px-3 py-1.5 text-sm font-medium text-white" style={{ background: "var(--accent)" }}>+ 인력 추가</button>
        </div>
        {err && <p className="mt-3 text-sm text-red-500">{err}</p>}

        <div className="mt-4 overflow-x-auto rounded-xl border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <table className="w-full text-xs">
            <thead><tr style={{ color: "var(--muted)" }}>
              {["이름", "직종", "월단가", "가동%", "현재 배정률", "활성", ""].map((h, i) => <th key={i} className="px-2 py-2 text-left font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const u = util[r.id];
                const over = u && u.current_allocation_pct > r.capacity_pct;
                return (
                  <tr key={r.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-2 py-1"><input className={`${cell} w-24`} style={style} value={r.name} onChange={(e) => patch(r, "name", e.target.value)} /></td>
                    <td className="px-2 py-1"><input className={`${cell} w-24`} style={style} value={r.trade ?? ""} onChange={(e) => patch(r, "trade", e.target.value)} /></td>
                    <td className="px-2 py-1"><input className={`${cell} w-24`} style={style} inputMode="numeric" value={formatThousands(String(r.monthly_rate))} onChange={(e) => patch(r, "monthly_rate", Number(e.target.value.replace(/,/g, "")) || 0)} /></td>
                    <td className="px-2 py-1"><input className={`${cell} w-14`} style={style} inputMode="numeric" value={r.capacity_pct} onChange={(e) => patch(r, "capacity_pct", Number(e.target.value) || 0)} /></td>
                    <td className="px-2 py-1 font-medium" style={{ color: over ? "#ef4444" : "var(--text)" }}>{u?.current_allocation_pct ?? 0}%{over ? " 과배정" : ""}</td>
                    <td className="px-2 py-1"><input type="checkbox" checked={r.is_active} onChange={(e) => patch(r, "is_active", e.target.checked)} /></td>
                    <td className="px-2 py-1 whitespace-nowrap">
                      <button onClick={() => save(r)} className="mr-2 rounded px-2 py-1 font-medium text-white" style={{ background: "var(--accent)" }}>저장</button>
                      <button onClick={() => remove(r)} className="text-red-500">삭제</button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center" style={{ color: "var(--muted)" }}>등록된 인력이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>월단가는 프로젝트 배정의 계획 노무비(월단가 × 계획 M/M) 계산에 쓰입니다. 인력 관리는 시스템 관리자만 가능합니다.</p>
      </div>
    </main>
  );
}
