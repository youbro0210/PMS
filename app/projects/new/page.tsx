"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SiteHeader } from "@/components/layout/SiteHeader";

const CONSTRUCTION_TYPES = ["건축", "토목", "플랜트", "조경", "기계설비", "전기·통신", "기타"];

/**
 * 신규 현장(프로젝트) 등록.
 * 실제 건설 PMS의 현장 등록 화면을 참고해 기본정보 / 계약정보 / 정산조건으로 구성.
 * create_project RPC(security definer)가 현장 생성 + 생성자 소유자 멤버 등록을 원자적으로 처리.
 */
export default function NewProjectPage() {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seedWorks, setSeedWorks] = useState(true);

  const [f, setF] = useState({
    name: "",
    construction_type: "건축",
    client_name: "",
    contractor_name: "",
    contract_no: "",
    site_address: "",
    contract_amount: "",
    start_date: "",
    end_date: "",
    advance_payment: "",
    advance_recovery_rate: "",
    retention_rate: "",
    description: "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/,/g, "")));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.name.trim()) { setError("현장명(공사명)은 필수입니다."); return; }
    setBusy(true);

    const { data: projectId, error: rpcErr } = await supabase.rpc("create_project", {
      p_name: f.name.trim(),
      p_construction_type: f.construction_type,
      p_client_name: f.client_name || null,
      p_contractor_name: f.contractor_name || null,
      p_contract_no: f.contract_no || null,
      p_contract_amount: num(f.contract_amount),
      p_start_date: f.start_date || null,
      p_end_date: f.end_date || null,
      p_site_address: f.site_address || null,
      p_advance_payment: num(f.advance_payment),
      p_advance_recovery_rate: num(f.advance_recovery_rate),
      p_retention_rate: num(f.retention_rate),
      p_description: f.description || null,
    });

    if (rpcErr || !projectId) {
      setBusy(false);
      setError(rpcErr?.message ?? "현장 등록에 실패했습니다.");
      return;
    }

    if (seedWorks) {
      await supabase.rpc("seed_standard_works", { p_project_id: projectId as string });
    }

    router.push(`/projects/${projectId}/board`);
  }

  const input = "w-full rounded-md border bg-transparent px-3 py-2 text-sm";
  const inputStyle = { borderColor: "var(--border)" };
  const label = "mb-1 block text-xs font-medium";

  return (
    <main>
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-1 text-xl font-semibold" style={{ color: "var(--navy)" }}>신규 현장 등록</h1>
        <p className="mb-6 text-sm" style={{ color: "var(--muted)" }}>공사 기본정보·계약·정산 조건을 입력하면 현장이 생성됩니다.</p>

        <form onSubmit={submit} className="space-y-8">
          <section>
            <h2 className="mb-3 text-sm font-semibold" style={{ color: "var(--navy)" }}>기본 정보</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={label}>현장명(공사명) *</label>
                <input className={input} style={inputStyle} value={f.name} onChange={set("name")} placeholder="예: 한강 푸르지오 신축공사" required />
              </div>
              <div>
                <label className={label}>공사 종류</label>
                <select className={input} style={inputStyle} value={f.construction_type} onChange={set("construction_type")}>
                  {CONSTRUCTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>현장 위치</label>
                <input className={input} style={inputStyle} value={f.site_address} onChange={set("site_address")} placeholder="예: 서울시 광진구 …" />
              </div>
              <div className="sm:col-span-2">
                <label className={label}>공사 개요</label>
                <textarea className={input} style={inputStyle} rows={2} value={f.description} onChange={set("description")} placeholder="규모·연면적·세대수 등" />
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold" style={{ color: "var(--navy)" }}>계약 정보</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={label}>발주처</label>
                <input className={input} style={inputStyle} value={f.client_name} onChange={set("client_name")} placeholder="예: 한강도시공사" />
              </div>
              <div>
                <label className={label}>원도급사(시공사)</label>
                <input className={input} style={inputStyle} value={f.contractor_name} onChange={set("contractor_name")} />
              </div>
              <div>
                <label className={label}>계약번호</label>
                <input className={input} style={inputStyle} value={f.contract_no} onChange={set("contract_no")} />
              </div>
              <div>
                <label className={label}>도급액(원)</label>
                <input className={input} style={inputStyle} value={f.contract_amount} onChange={set("contract_amount")} inputMode="numeric" placeholder="예: 32000000000" />
              </div>
              <div>
                <label className={label}>착공일</label>
                <input type="date" className={input} style={inputStyle} value={f.start_date} onChange={set("start_date")} />
              </div>
              <div>
                <label className={label}>준공예정일</label>
                <input type="date" className={input} style={inputStyle} value={f.end_date} onChange={set("end_date")} />
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold" style={{ color: "var(--navy)" }}>정산 조건</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className={label}>선급금(원)</label>
                <input className={input} style={inputStyle} value={f.advance_payment} onChange={set("advance_payment")} inputMode="numeric" placeholder="예: 3200000000" />
              </div>
              <div>
                <label className={label}>선급금 정산율(%)</label>
                <input className={input} style={inputStyle} value={f.advance_recovery_rate} onChange={set("advance_recovery_rate")} inputMode="numeric" placeholder="예: 10" />
              </div>
              <div>
                <label className={label}>기성 유보율(%)</label>
                <input className={input} style={inputStyle} value={f.retention_rate} onChange={set("retention_rate")} inputMode="numeric" placeholder="예: 3" />
              </div>
            </div>
          </section>

          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text)" }}>
            <input type="checkbox" checked={seedWorks} onChange={(e) => setSeedWorks(e.target.checked)} />
            표준 공종(WBS) 9종 자동 생성 (가설·토공·골조·마감·설비·전기 등)
          </label>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-3">
            <button type="submit" disabled={busy} className="rounded-md px-5 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>
              {busy ? "등록 중…" : "현장 등록"}
            </button>
            <button type="button" onClick={() => router.push("/")} className="rounded-md border px-5 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
              취소
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
