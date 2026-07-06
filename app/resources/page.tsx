"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { formatThousands } from "@/lib/format";
import type { Resource, ResourceUtilization } from "@/lib/db/types";

const won = (n: number | null | undefined) => (n == null ? "-" : new Intl.NumberFormat("ko-KR").format(Math.round(n)) + "원");

/** CSV 유틸 — 엑셀이 바로 열고 저장하는 형식(UTF-8 BOM으로 한글 보존) */
const HEADERS = ["사번", "사원명", "직급", "부서", "직종", "월단가(원)", "가동률(%)", "이메일", "연락처", "활성(Y/N)"];
function toCsvValue(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let cur: string[] = []; let val = ""; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { val += '"'; i++; } else inQ = false; }
      else val += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { cur.push(val); val = ""; }
    else if (c === "\n") { cur.push(val); rows.push(cur); cur = []; val = ""; }
    else if (c === "\r") { /* skip */ }
    else val += c;
  }
  if (val !== "" || cur.length) { cur.push(val); rows.push(cur); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

export default function ResourcesPage() {
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Resource[]>([]);
  const [util, setUtil] = useState<Record<string, ResourceUtilization>>({});
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({ employee_no: "", name: "", rank: "", department: "", trade: "", monthly_rate: "", capacity_pct: "100" });
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, { project: string; alloc: number; sd: string | null; ed: string | null; active: boolean }[]>>({});

  const load = useCallback(async () => {
    const [{ data: rs }, { data: us }, { data: asg }] = await Promise.all([
      supabase.from("resources").select("*").order("is_active", { ascending: false }).order("employee_no", { nullsFirst: false }),
      supabase.from("resource_utilization").select("*"),
      supabase.from("project_assignments").select("resource_id, allocation_pct, start_date, end_date, role, projects(name)"),
    ]);
    setRows((rs as Resource[]) ?? []);
    setUtil(Object.fromEntries(((us as ResourceUtilization[]) ?? []).map((u) => [u.resource_id, u])));
    const today = new Date().toISOString().slice(0, 10);
    const grp: Record<string, { project: string; alloc: number; sd: string | null; ed: string | null; active: boolean }[]> = {};
    for (const a of (asg as unknown as { resource_id: string; allocation_pct: number; start_date: string | null; end_date: string | null; projects: { name: string } | null }[]) ?? []) {
      const active = (!a.start_date || a.start_date <= today) && (!a.end_date || a.end_date >= today);
      (grp[a.resource_id] ??= []).push({ project: a.projects?.name ?? "(프로젝트)", alloc: a.allocation_pct, sd: a.start_date, ed: a.end_date, active });
    }
    setDetail(grp);
  }, [supabase]);
  useEffect(() => { void load(); }, [load]);

  async function add() {
    setErr(null); setMsg(null);
    if (!form.name.trim()) { setErr("사원명을 입력하세요."); return; }
    const { error } = await supabase.from("resources").insert({
      employee_no: form.employee_no.trim() || null, name: form.name.trim(), rank: form.rank.trim() || null,
      department: form.department.trim() || null, trade: form.trade.trim() || null,
      monthly_rate: Number(form.monthly_rate.replace(/,/g, "")) || 0, capacity_pct: Number(form.capacity_pct) || 100,
    });
    if (error) { setErr(error.message); return; }
    setForm({ employee_no: "", name: "", rank: "", department: "", trade: "", monthly_rate: "", capacity_pct: "100" }); void load();
  }
  function patch(r: Resource, k: keyof Resource, v: string | number | boolean | null) {
    setRows((p) => p.map((x) => (x.id === r.id ? { ...x, [k]: v } as Resource : x)));
  }
  async function save(r: Resource) {
    setErr(null);
    const { error } = await supabase.from("resources").update({
      employee_no: r.employee_no || null, name: r.name, rank: r.rank, department: r.department,
      trade: r.trade, monthly_rate: r.monthly_rate, capacity_pct: r.capacity_pct, is_active: r.is_active,
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

  // 엑셀(CSV) 양식 다운로드 — 헤더 + 예시 1행
  function downloadTemplate() {
    const sample = ["S1001", "홍길동", "책임", "설계", "설계", "8000000", "100", "hong@syu.co.kr", "010-0000-0000", "Y"];
    const csv = "﻿" + [HEADERS, sample].map((r) => r.map(toCsvValue).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "인력_등록양식.csv"; a.click(); URL.revokeObjectURL(url);
  }
  // 현재 인력 내보내기
  function exportCsv() {
    const body = rows.map((r) => [r.employee_no ?? "", r.name, r.rank ?? "", r.department ?? "", r.trade ?? "", r.monthly_rate ?? 0, r.capacity_pct ?? 100, r.email ?? "", r.phone ?? "", r.is_active ? "Y" : "N"]);
    const csv = "﻿" + [HEADERS, ...body].map((r) => r.map(toCsvValue).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "인력_목록.csv"; a.click(); URL.revokeObjectURL(url);
  }
  // 엑셀(CSV) 업로드 — 사번 기준 upsert
  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    setErr(null); setMsg(null);
    const file = e.target.files?.[0]; if (!file) return;
    const text = await file.text();
    const grid = parseCsv(text);
    if (grid.length < 2) { setErr("데이터 행이 없습니다. 양식을 확인하세요."); return; }
    const dataRows = grid.slice(1); // 첫 행은 헤더
    const payload = dataRows.map((c) => ({
      employee_no: (c[0] ?? "").trim() || null,
      name: (c[1] ?? "").trim(),
      rank: (c[2] ?? "").trim() || null,
      department: (c[3] ?? "").trim() || null,
      trade: (c[4] ?? "").trim() || null,
      monthly_rate: Number((c[5] ?? "0").replace(/[,\s]/g, "")) || 0,
      capacity_pct: Number((c[6] ?? "100").replace(/[^\d]/g, "")) || 100,
      email: (c[7] ?? "").trim() || null,
      phone: (c[8] ?? "").trim() || null,
      is_active: !/^n/i.test((c[9] ?? "Y").trim()),
    })).filter((r) => r.name);
    if (!payload.length) { setErr("사원명이 있는 행이 없습니다."); return; }
    const withNo = payload.filter((p) => p.employee_no);
    const without = payload.filter((p) => !p.employee_no);
    let ok = 0;
    if (withNo.length) {
      const { error } = await supabase.from("resources").upsert(withNo, { onConflict: "employee_no" });
      if (error) { setErr(`업로드 실패: ${error.message}`); return; }
      ok += withNo.length;
    }
    if (without.length) {
      const { error } = await supabase.from("resources").insert(without);
      if (error) { setErr(`업로드 실패(사번없음): ${error.message}`); return; }
      ok += without.length;
    }
    setMsg(`${ok}명을 등록/갱신했습니다. (사번 있으면 갱신, 없으면 신규)`);
    if (fileRef.current) fileRef.current.value = "";
    void load();
  }

  const overCount = useMemo(() => Object.values(util).filter((u) => u.current_allocation_pct > u.capacity_pct).length, [util]);

  return (
    <main>
      <SiteHeader />
      <div className="page">
        <div className="page-head">
          <div>
            <p className="eyebrow">전사 인력 풀</p>
            <h1 className="page-title">인력 관리</h1>
            <p className="page-sub">사번·직급·부서·월단가를 등록하고, 프로젝트별 인력 화면에서 배정합니다. <b>현재 배정률</b>을 클릭하면 어느 프로젝트에 몇 % 배정됐는지(과배정 사유)가 펼쳐집니다.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={downloadTemplate} className="btn btn-secondary btn-sm">엑셀 양식 다운로드</button>
            <button onClick={() => fileRef.current?.click()} className="btn btn-secondary btn-sm">엑셀 업로드</button>
            <button onClick={exportCsv} className="btn btn-ghost btn-sm">내보내기</button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onUpload} />
          </div>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="kpi"><div className="kpi-label">등록 인력</div><div className="kpi-value">{rows.length}<span className="ml-0.5 text-[14px] font-medium" style={{ color: "var(--muted)" }}>명</span></div></div>
          <div className="kpi"><div className="kpi-label">활성 인력</div><div className="kpi-value">{rows.filter((r) => r.is_active).length}<span className="ml-0.5 text-[14px] font-medium" style={{ color: "var(--muted)" }}>명</span></div></div>
          <div className="kpi"><div className="kpi-label">과배정</div><div className="kpi-value" style={{ color: overCount ? "var(--danger)" : undefined }}>{overCount}<span className="ml-0.5 text-[14px] font-medium" style={{ color: "var(--muted)" }}>명</span></div></div>
          <div className="kpi"><div className="kpi-label">부서 수</div><div className="kpi-value">{new Set(rows.map((r) => r.department).filter(Boolean)).size}</div></div>
        </div>

        {msg && <p className="mb-3 rounded-[4px] px-3 py-2 text-[13px]" style={{ background: "var(--ok-soft)", color: "var(--ok)" }}>{msg}</p>}
        {err && <p className="mb-3 rounded-[4px] px-3 py-2 text-[13px]" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>{err}</p>}

        <div className="toolbar mb-3">
          <span className="toolbar-label">인력 추가</span>
          <input className="input input-sm w-24" placeholder="사번" value={form.employee_no} onChange={(e) => setForm({ ...form, employee_no: e.target.value })} />
          <input className="input input-sm w-28" placeholder="사원명" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input input-sm w-20" placeholder="직급" value={form.rank} onChange={(e) => setForm({ ...form, rank: e.target.value })} />
          <input className="input input-sm w-24" placeholder="부서" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
          <input className="input input-sm w-24" placeholder="직종" value={form.trade} onChange={(e) => setForm({ ...form, trade: e.target.value })} />
          <input className="input input-sm w-28 text-right" inputMode="numeric" placeholder="월단가" value={form.monthly_rate} onChange={(e) => setForm({ ...form, monthly_rate: formatThousands(e.target.value) })} />
          <input className="input input-sm w-16 text-right" inputMode="numeric" placeholder="가동%" value={form.capacity_pct} onChange={(e) => setForm({ ...form, capacity_pct: e.target.value })} />
          <button onClick={add} className="btn btn-primary btn-sm">+ 추가</button>
        </div>

        <div className="grid-wrap overflow-x-auto">
          <table className="data-table">
            <thead><tr>
              {["사번", "사원명", "직급", "부서", "직종", "월단가", "가동%", "현재 배정률", "활성", "관리"].map((h, i) => <th key={i}>{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const u = util[r.id];
                const over = u && u.current_allocation_pct > r.capacity_pct;
                const list = detail[r.id] ?? [];
                const open = openId === r.id;
                return (
                  <Fragment key={r.id}>
                  <tr>
                    <td><input className="input input-sm w-20" value={r.employee_no ?? ""} onChange={(e) => patch(r, "employee_no", e.target.value)} /></td>
                    <td><input className="input input-sm w-24 font-medium" value={r.name} onChange={(e) => patch(r, "name", e.target.value)} /></td>
                    <td><input className="input input-sm w-16" value={r.rank ?? ""} onChange={(e) => patch(r, "rank", e.target.value)} /></td>
                    <td><input className="input input-sm w-24" value={r.department ?? ""} onChange={(e) => patch(r, "department", e.target.value)} /></td>
                    <td><input className="input input-sm w-20" value={r.trade ?? ""} onChange={(e) => patch(r, "trade", e.target.value)} /></td>
                    <td><input className="input input-sm w-28 text-right" inputMode="numeric" value={formatThousands(String(r.monthly_rate))} onChange={(e) => patch(r, "monthly_rate", Number(e.target.value.replace(/,/g, "")) || 0)} /></td>
                    <td><input className="input input-sm w-14 text-right" inputMode="numeric" value={r.capacity_pct} onChange={(e) => patch(r, "capacity_pct", Number(e.target.value) || 0)} /></td>
                    <td className="num font-medium">
                      <button onClick={() => setOpenId(open ? null : r.id)} className="inline-flex items-center gap-1 hover:underline" style={{ color: over ? "var(--danger)" : "var(--text)" }} title="배정 내역(사유) 보기">
                        {u?.current_allocation_pct ?? 0}%{over ? " 과배정" : ""}
                        <span style={{ fontSize: 10, color: "var(--faint)" }}>{open ? "▲" : "▾"}</span>
                      </button>
                    </td>
                    <td className="text-center"><input type="checkbox" checked={r.is_active} onChange={(e) => patch(r, "is_active", e.target.checked)} /></td>
                    <td className="whitespace-nowrap">
                      <button onClick={() => save(r)} className="btn btn-secondary btn-sm mr-1">저장</button>
                      <button onClick={() => remove(r)} className="btn btn-danger btn-sm">삭제</button>
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={10} style={{ background: "var(--surface-2)" }}>
                        <div className="px-2 py-1">
                          <div className="mb-1 text-[12px] font-bold" style={{ color: over ? "var(--danger)" : "var(--heading)" }}>
                            {over ? `과배정 사유 — 현재 배정 합 ${u?.current_allocation_pct}% (가동률 ${r.capacity_pct}% 초과)` : "배정 내역"}
                          </div>
                          {list.length === 0 ? (
                            <div className="text-[13px]" style={{ color: "var(--muted)" }}>배정된 프로젝트가 없습니다.</div>
                          ) : (
                            <ul className="space-y-0.5">
                              {list.sort((a, b) => Number(b.active) - Number(a.active)).map((a, idx) => (
                                <li key={idx} className="flex flex-wrap items-center gap-x-3 text-[13px]">
                                  <span className={`badge ${a.active ? "badge-info" : "badge-neutral"}`}>{a.active ? "진행중" : "기간외"}</span>
                                  <span className="font-semibold" style={{ color: "var(--heading)" }}>{a.project}</span>
                                  <span className="num" style={{ color: a.active && over ? "var(--danger)" : "var(--text)" }}>배정 {a.alloc}%</span>
                                  <span style={{ color: "var(--faint)" }}>{a.sd ?? "-"} ~ {a.ed ?? "-"}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                          {over && <p className="mt-1 text-[12px]" style={{ color: "var(--muted)" }}>‘진행중’ 배정의 합이 가동률을 초과했습니다. 배정%를 조정하거나 기간을 겹치지 않게 하세요.</p>}
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={10} className="px-3 py-8 text-center" style={{ color: "var(--muted)" }}>등록된 인력이 없습니다. ‘엑셀 양식 다운로드’로 양식을 받아 작성 후 ‘엑셀 업로드’ 하거나, 위에서 직접 추가하세요.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[13px]" style={{ color: "var(--faint)" }}>엑셀 업로드는 사번이 있으면 갱신(upsert), 없으면 신규 등록됩니다. 월단가는 프로젝트 배정의 계획 노무비(월단가 × 계획 M/M) 계산에 쓰입니다. 인력 관리는 시스템 관리자만 가능합니다.</p>
      </div>
    </main>
  );
}
