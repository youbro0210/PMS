"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { PROCURE_TYPE_LABELS, type ProcureType, type ExtractedBomRow } from "@/lib/db/types";

const PT = Object.entries(PROCURE_TYPE_LABELS) as [ProcureType, string][];

export default function ImportPage() {
  const router = useRouter();
  const supabase = createClient();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [drawingNo, setDrawingNo] = useState("");
  const [rows, setRows] = useState<ExtractedBomRow[] | null>(null);
  const [creating, setCreating] = useState(false);

  async function analyze() {
    if (!file) { setErr("도면 파일을 선택하세요."); return; }
    setBusy(true); setErr(null); setRows(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/bom/extract", { method: "POST", body: fd });
    setBusy(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      setErr(`분석 실패: ${e.detail ?? e.error ?? res.status}. (도면 인식은 배포 환경에서 동작합니다)`);
      return;
    }
    const data = await res.json();
    setName(data.project_name ?? "");
    setDrawingNo(data.drawing_no ?? "");
    setRows((data.items ?? []) as ExtractedBomRow[]);
  }

  function setRow(i: number, k: keyof ExtractedBomRow, v: string | number) {
    setRows((p) => (p ? p.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)) : p));
  }
  function addRow() {
    setRows((p) => [...(p ?? []), { item_no: (p?.length ?? 0) + 1, description: "", qty: 1, size: null, manufacturer: null, model: null, procure_type: "purchase" }]);
  }
  function delRow(i: number) { setRows((p) => (p ? p.filter((_, idx) => idx !== i) : p)); }

  async function create() {
    if (!name.trim()) { setErr("프로젝트명을 입력하세요."); return; }
    setCreating(true); setErr(null);
    const { data: pid, error } = await supabase.rpc("create_project", { p_name: name.trim() });
    if (error || !pid) { setCreating(false); setErr(error?.message ?? "프로젝트 생성 실패"); return; }
    await supabase.rpc("seed_standard_phases", { p_project_id: pid as string });
    if (rows && rows.length) {
      const payload = rows.filter((r) => r.description.trim()).map((r) => ({
        project_id: pid as string, item_no: r.item_no, description: r.description.trim(),
        qty: r.qty, size: r.size, manufacturer: r.manufacturer, model: r.model,
        procure_type: r.procure_type, drawing_no: drawingNo || null,
      }));
      if (payload.length) await supabase.from("bom_items").insert(payload);
    }
    router.push(`/projects/${pid}/bom`);
  }

  const input = "rounded-md border bg-transparent px-3 py-2 text-sm";
  const cell = "rounded border bg-transparent px-2 py-1 text-xs";
  const style = { borderColor: "var(--border)" };

  return (
    <main>
      <SiteHeader />
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-xl font-semibold" style={{ color: "var(--navy)" }}>도면으로 수주 생성</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>도면(PDF·이미지)을 올리면 AI가 자재표(BOM)를 읽어 프로젝트 기준정보로 자동 입력합니다.</p>

        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
          <button onClick={analyze} disabled={busy || !file} className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>
            {busy ? "도면 분석 중…" : "도면 분석"}
          </button>
        </div>
        {err && <p className="mt-3 text-sm text-red-500">{err}</p>}

        {rows && (
          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block"><span className="mb-1 block text-xs font-medium">프로젝트명 *</span>
                <input className={`${input} w-full`} style={style} value={name} onChange={(e) => setName(e.target.value)} /></label>
              <label className="block"><span className="mb-1 block text-xs font-medium">도면번호</span>
                <input className={`${input} w-full`} style={style} value={drawingNo} onChange={(e) => setDrawingNo(e.target.value)} /></label>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-medium">추출된 BOM ({rows.length}행) — 검토·수정</h2>
                <button onClick={addRow} className="text-xs" style={{ color: "var(--accent)" }}>+ 행 추가</button>
              </div>
              <div className="overflow-x-auto rounded-xl border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                <table className="w-full text-xs">
                  <thead><tr style={{ color: "var(--muted)" }}>
                    {["#", "품명", "수량", "규격", "제조사", "모델", "구매구분", ""].map((h, i) => <th key={i} className="px-2 py-2 text-left font-medium">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="px-2 py-1"><input className={`${cell} w-10`} style={style} value={r.item_no ?? ""} onChange={(e) => setRow(i, "item_no", Number(e.target.value) || 0)} /></td>
                        <td className="px-2 py-1"><input className={`${cell} w-56`} style={style} value={r.description} onChange={(e) => setRow(i, "description", e.target.value)} /></td>
                        <td className="px-2 py-1"><input className={`${cell} w-14`} style={style} value={r.qty} onChange={(e) => setRow(i, "qty", Number(e.target.value) || 0)} /></td>
                        <td className="px-2 py-1"><input className={`${cell} w-16`} style={style} value={r.size ?? ""} onChange={(e) => setRow(i, "size", e.target.value)} /></td>
                        <td className="px-2 py-1"><input className={`${cell} w-28`} style={style} value={r.manufacturer ?? ""} onChange={(e) => setRow(i, "manufacturer", e.target.value)} /></td>
                        <td className="px-2 py-1"><input className={`${cell} w-24`} style={style} value={r.model ?? ""} onChange={(e) => setRow(i, "model", e.target.value)} /></td>
                        <td className="px-2 py-1">
                          <select className={cell} style={style} value={r.procure_type} onChange={(e) => setRow(i, "procure_type", e.target.value)}>
                            {PT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-1"><button onClick={() => delRow(i)} className="text-red-500">×</button></td>
                      </tr>
                    ))}
                    {rows.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center" style={{ color: "var(--muted)" }}>추출된 BOM이 없습니다. 행 추가로 직접 입력하거나 다른 도면을 시도하세요.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={create} disabled={creating} className="rounded-md px-5 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>
                {creating ? "생성 중…" : "프로젝트 생성 + BOM 저장"}
              </button>
              <button onClick={() => router.push("/")} className="rounded-md border px-5 py-2 text-sm" style={style}>취소</button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
