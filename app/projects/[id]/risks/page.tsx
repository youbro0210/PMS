"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { SiteHeader } from "@/components/layout/SiteHeader";
import {
  type Risk, type RiskCategory, type RiskStatus,
  RISK_CATEGORY_LABELS, RISK_STATUS_LABELS,
} from "@/lib/db/types";

const CATS = Object.entries(RISK_CATEGORY_LABELS) as [RiskCategory, string][];
const STATUSES = Object.entries(RISK_STATUS_LABELS) as [RiskStatus, string][];

function grade(score: number) {
  if (score >= 15) return { label: "심각", color: "#ef4444" };
  if (score >= 8) return { label: "높음", color: "#f59e0b" };
  if (score >= 4) return { label: "보통", color: "#eab308" };
  return { label: "낮음", color: "#1d9e75" };
}

const emptyForm = { title: "", category: "schedule" as RiskCategory, probability: 3, impact: 3, status: "open" as RiskStatus, mitigation: "", due_date: "" };

export default function RisksPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();
  const [rows, setRows] = useState<Risk[]>([]);
  const [form, setForm] = useState({ ...emptyForm });
  const [editing, setEditing] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("risk_register").select("*").eq("project_id", id).order("score", { ascending: false });
    setRows((data as Risk[]) ?? []);
  }, [supabase, id]);
  useEffect(() => { void load(); }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    if (!form.title.trim()) { setErr("리스크 제목을 입력하세요."); return; }
    const payload = {
      project_id: id, title: form.title.trim(), category: form.category,
      probability: form.probability, impact: form.impact, status: form.status,
      mitigation: form.mitigation.trim() || null, due_date: form.due_date || null,
    };
    const res = editing
      ? await supabase.from("risk_register").update(payload).eq("id", editing)
      : await supabase.from("risk_register").insert(payload);
    if (res.error) { setErr(res.error.message); return; }
    setForm({ ...emptyForm }); setEditing(null); setOpen(false); void load();
  }

  function edit(r: Risk) {
    setEditing(r.id); setOpen(true); setErr(null);
    setForm({ title: r.title, category: r.category, probability: r.probability, impact: r.impact, status: r.status, mitigation: r.mitigation ?? "", due_date: r.due_date ?? "" });
  }

  async function remove(r: Risk) {
    if (!confirm(`"${r.title}" 리스크를 삭제할까요?`)) return;
    const { error } = await supabase.from("risk_register").delete().eq("id", r.id);
    if (error) { setErr(error.message); return; }
    void load();
  }

  async function quickStatus(r: Risk, status: RiskStatus) {
    await supabase.from("risk_register").update({ status }).eq("id", r.id);
    void load();
  }

  const stats = useMemo(() => {
    const open = rows.filter((r) => r.status !== "closed");
    return { total: rows.length, open: open.length, high: open.filter((r) => r.score >= 15).length, avg: open.length ? Math.round((open.reduce((a, r) => a + r.score, 0) / open.length) * 10) / 10 : 0 };
  }, [rows]);

  // 5×5 매트릭스 집계(종결 제외)
  const matrix = useMemo(() => {
    const m: number[][] = Array.from({ length: 5 }, () => Array(5).fill(0));
    for (const r of rows) if (r.status !== "closed") m[5 - r.impact][r.probability - 1]++;
    return m;
  }, [rows]);

  const input = "rounded-md border bg-transparent px-3 py-2 text-sm";
  const style = { borderColor: "var(--border)" };

  return (
    <main>
      <SiteHeader />
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold" style={{ color: "var(--navy)" }}>리스크 관리</h1>
          <Link href={`/projects/${id}/board`} className="text-sm" style={{ color: "var(--accent)" }}>← 대시보드</Link>
        </div>

        <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="전체 리스크" value={`${stats.total}건`} />
          <Stat label="진행 중(미종결)" value={`${stats.open}건`} />
          <Stat label="심각(≥15)" value={`${stats.high}건`} color={stats.high > 0 ? "#ef4444" : undefined} />
          <Stat label="평균 위험도" value={`${stats.avg}`} />
        </section>

        <div className="mb-6 grid gap-6 lg:grid-cols-[1fr_auto]">
          {/* 등록부 */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium">리스크 등록부</h2>
              <button onClick={() => { setEditing(null); setForm({ ...emptyForm }); setOpen((v) => !v); }} className="rounded-md px-3 py-1.5 text-sm font-medium text-white" style={{ background: "var(--accent)" }}>
                {open && !editing ? "닫기" : "+ 리스크 추가"}
              </button>
            </div>

            {open && (
              <form onSubmit={save} className="mb-4 space-y-3 rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                <input className={`${input} w-full`} style={style} placeholder="리스크 제목 (예: NEA 압축기 본체 납기 지연)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Field label="분류">
                    <select className={`${input} w-full`} style={style} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as RiskCategory })}>
                      {CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </Field>
                  <Field label="발생확률 1~5">
                    <select className={`${input} w-full`} style={style} value={form.probability} onChange={(e) => setForm({ ...form, probability: Number(e.target.value) })}>
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </Field>
                  <Field label="영향도 1~5">
                    <select className={`${input} w-full`} style={style} value={form.impact} onChange={(e) => setForm({ ...form, impact: Number(e.target.value) })}>
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </Field>
                  <Field label="상태">
                    <select className={`${input} w-full`} style={style} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as RiskStatus })}>
                      {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
                  <textarea className={`${input} w-full`} style={style} rows={2} placeholder="대응 계획 (예: 대체 벤더 병행 발주, 예비 4주 확보)" value={form.mitigation} onChange={(e) => setForm({ ...form, mitigation: e.target.value })} />
                  <Field label="기한">
                    <input type="date" className={`${input} w-full`} style={style} value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                  </Field>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: "var(--muted)" }}>위험도 {form.probability * form.impact} · {grade(form.probability * form.impact).label}</span>
                  <button type="submit" className="ml-auto rounded-md px-4 py-2 text-sm font-medium text-white" style={{ background: "var(--accent)" }}>{editing ? "수정 저장" : "등록"}</button>
                </div>
              </form>
            )}
            {err && <p className="mb-3 text-sm text-red-500">{err}</p>}

            <div className="space-y-2">
              {rows.map((r) => {
                const g = grade(r.score);
                return (
                  <div key={r.id} className="rounded-lg border p-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white" style={{ background: g.color }}>{g.label} {r.score}</span>
                          <span className="text-xs" style={{ color: "var(--muted)" }}>{RISK_CATEGORY_LABELS[r.category]}</span>
                          {r.due_date && <span className="text-[11px]" style={{ color: "var(--muted)" }}>· 기한 {r.due_date}</span>}
                        </div>
                        <p className="mt-1 text-sm font-medium">{r.title}</p>
                        {r.mitigation && <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>대응: {r.mitigation}</p>}
                        <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>확률 {r.probability} × 영향 {r.impact}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <select className="rounded-md border bg-transparent px-2 py-1 text-xs" style={style} value={r.status} onChange={(e) => quickStatus(r, e.target.value as RiskStatus)}>
                          {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        <div className="flex gap-2 text-xs">
                          <button onClick={() => edit(r)} style={{ color: "var(--accent)" }}>수정</button>
                          <button onClick={() => remove(r)} className="text-red-500">삭제</button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {rows.length === 0 && <p className="rounded-lg border p-6 text-center text-sm" style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--muted)" }}>등록된 리스크가 없습니다.</p>}
            </div>
          </div>

          {/* 확률×영향 매트릭스 */}
          <div className="lg:w-64">
            <h2 className="mb-3 text-sm font-medium">확률 × 영향 매트릭스</h2>
            <div className="rounded-xl border p-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              <div className="flex">
                <div className="flex flex-col justify-around pr-1 text-[9px]" style={{ color: "var(--muted)" }}>
                  {[5, 4, 3, 2, 1].map((n) => <span key={n} className="h-8 leading-8">{n}</span>)}
                </div>
                <div className="grid flex-1 grid-cols-5 grid-rows-5 gap-0.5">
                  {matrix.map((row, ri) => row.map((c, ci) => {
                    const score = (5 - ri) * (ci + 1);
                    const g = grade(score);
                    return (
                      <div key={`${ri}-${ci}`} className="flex h-8 items-center justify-center rounded text-xs font-medium text-white" style={{ background: g.color, opacity: c > 0 ? 1 : 0.28 }}>
                        {c > 0 ? c : ""}
                      </div>
                    );
                  }))}
                </div>
              </div>
              <div className="mt-1 flex justify-around pl-5 text-[9px]" style={{ color: "var(--muted)" }}>
                {[1, 2, 3, 4, 5].map((n) => <span key={n}>{n}</span>)}
              </div>
              <p className="mt-2 text-center text-[10px]" style={{ color: "var(--muted)" }}>세로 영향도 · 가로 발생확률 · 숫자=리스크 수</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--surface)" }}>
      <div className="text-xs" style={{ color: "var(--muted)" }}>{label}</div>
      <div className="mt-1 text-2xl font-semibold" style={{ color }}>{value}</div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium">{label}</span>{children}</label>;
}
