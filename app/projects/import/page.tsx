"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { PROCURE_TYPE_LABELS, type ProcureType, type ExtractedBomRow } from "@/lib/db/types";

const PT = Object.entries(PROCURE_TYPE_LABELS) as [ProcureType, string][];
const PT_COLOR: Record<ProcureType, string> = { purchase: "#3b4658", outsource: "#f59e0b", inhouse: "#1d9e75" };

export default function ImportPage() {
  const router = useRouter();
  const supabase = createClient();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [drawingNo, setDrawingNo] = useState("");
  const [rows, setRows] = useState<ExtractedBomRow[] | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!file) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const isPdf = file?.type === "application/pdf";

  async function analyze() {
    if (!file) { setErr("도면 파일을 선택하세요."); return; }
    setBusy(true); setErr(null); setRows(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/bom/extract", { method: "POST", body: fd });
    setBusy(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      setErr(`분석 실패: ${e.detail ?? e.error ?? res.status}`);
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
  function addRow() { setRows((p) => [...(p ?? []), { item_no: (p?.length ?? 0) + 1, description: "", qty: 1, size: null, manufacturer: null, model: null, procure_type: "purchase" }]); }
  function delRow(i: number) { setRows((p) => (p ? p.filter((_, idx) => idx !== i) : p)); }

  const counts = useMemo(() => {
    const c: Record<string, number> = { purchase: 0, outsource: 0, inhouse: 0 };
    (rows ?? []).forEach((r) => { c[r.procure_type] = (c[r.procure_type] ?? 0) + 1; });
    return c;
  }, [rows]);

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
      if (payload.length) {
        const { error: bomErr } = await supabase.from("bom_items").insert(payload);
        if (bomErr) { setCreating(false); setErr(`BOM 저장 실패: ${bomErr.message}`); return; }
      }
    }
    router.push(`/projects/${pid}/bom`);
  }

  const input = "rounded-md border bg-transparent px-3 py-2 text-sm";
  const cell = "w-full rounded border bg-transparent px-2 py-1 text-xs";
  const style = { borderColor: "var(--border)" };

  return (
    <main>
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: "var(--navy)" }}>도면으로 수주 생성</h1>
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>도면(PDF·이미지)을 올리면 AI가 자재표(BOM)를 읽어 프로젝트 기준정보로 자동 입력합니다.</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="cursor-pointer rounded-md border px-3 py-2 text-sm font-medium" style={{ borderColor: "var(--border)" }}>
              파일 선택
              <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRows(null); }} />
            </label>
            <button onClick={analyze} disabled={busy || !file} className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>
              {busy ? "도면 분석 중…" : "도면 분석"}
            </button>
          </div>
        </div>
        {file && <p className="mb-3 text-xs" style={{ color: "var(--muted)" }}>선택된 파일: {file.name}</p>}
        {err && <p className="mb-3 rounded-md border px-3 py-2 text-sm text-red-500" style={{ borderColor: "#ef4444" }}>{err}</p>}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
          {/* 좌: 기준정보 + BOM */}
          <div className="min-w-0 space-y-4">
            {!rows && (
              <div className="flex h-64 items-center justify-center rounded-xl border text-sm" style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--muted)" }}>
                {busy ? "AI가 도면을 읽는 중입니다…" : "파일을 선택하고 '도면 분석'을 누르면 BOM이 여기에 표시됩니다."}
              </div>
            )}
            {rows && (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block"><span className="mb-1 block text-xs font-medium">프로젝트명 *</span>
                    <input className={`${input} w-full`} style={style} value={name} onChange={(e) => setName(e.target.value)} /></label>
                  <label className="block"><span className="mb-1 block text-xs font-medium">도면번호</span>
                    <input className={`${input} w-full`} style={style} value={drawingNo} onChange={(e) => setDrawingNo(e.target.value)} /></label>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {PT.map(([v, l]) => (
                    <span key={v} className="rounded-full px-2 py-0.5 font-medium text-white" style={{ background: PT_COLOR[v] }}>{l} {counts[v] ?? 0}</span>
                  ))}
                  <span style={{ color: "var(--muted)" }}>· 총 {rows.length}행</span>
                  <button onClick={addRow} className="ml-auto" style={{ color: "var(--accent)" }}>+ 행 추가</button>
                </div>

                <div className="overflow-x-auto rounded-xl border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                  <table className="w-full text-xs">
                    <thead><tr style={{ color: "var(--muted)" }}>
                      {["#", "품명", "수량", "규격", "제조사", "모델", "구매구분", ""].map((h, i) => <th key={i} className="px-2 py-2 text-left font-medium">{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                          <td className="px-2 py-1 text-center" style={{ color: "var(--muted)", width: 24 }}>{r.item_no ?? i + 1}</td>
                          <td className="px-2 py-1"><input className={cell} style={style} value={r.description} onChange={(e) => setRow(i, "description", e.target.value)} /></td>
                          <td className="px-2 py-1"><input className={`${cell} w-12`} style={style} value={r.qty} onChange={(e) => setRow(i, "qty", Number(e.target.value) || 0)} /></td>
                          <td className="px-2 py-1"><input className={`${cell} w-14`} style={style} value={r.size ?? ""} onChange={(e) => setRow(i, "size", e.target.value)} /></td>
                          <td className="px-2 py-1"><input className={`${cell} w-24`} style={style} value={r.manufacturer ?? ""} onChange={(e) => setRow(i, "manufacturer", e.target.value)} /></td>
                          <td className="px-2 py-1"><input className={`${cell} w-20`} style={style} value={r.model ?? ""} onChange={(e) => setRow(i, "model", e.target.value)} /></td>
                          <td className="px-2 py-1">
                            <select className={cell} style={style} value={r.procure_type} onChange={(e) => setRow(i, "procure_type", e.target.value)}>
                              {PT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                          </td>
                          <td className="px-2 py-1"><button onClick={() => delRow(i)} className="text-red-500">×</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex gap-3">
                  <button onClick={create} disabled={creating} className="rounded-md px-5 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>
                    {creating ? "생성 중…" : "프로젝트 생성 + BOM 저장"}
                  </button>
                  <button onClick={() => router.push("/")} className="rounded-md border px-5 py-2 text-sm" style={style}>취소</button>
                </div>
              </>
            )}
          </div>

          {/* 우: 도면 미리보기 */}
          <div className="lg:sticky lg:top-4 lg:self-start">
            <div className="mb-2 text-xs font-medium" style={{ color: "var(--muted)" }}>도면 미리보기</div>
            <div className="overflow-hidden rounded-xl border" style={{ background: "var(--surface)", borderColor: "var(--border)", height: "72vh" }}>
              {!previewUrl && <div className="flex h-full items-center justify-center text-sm" style={{ color: "var(--muted)" }}>파일을 선택하면 도면이 여기에 표시됩니다.</div>}
              {previewUrl && isPdf && <iframe src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`} className="h-full w-full" title="도면" />}
              {previewUrl && !isPdf && <div className="flex h-full items-center justify-center overflow-auto p-2"><img src={previewUrl} alt="도면" className="max-h-full max-w-full object-contain" /></div>}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
