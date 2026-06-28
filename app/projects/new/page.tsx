"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { formatThousands } from "@/lib/format";

const PRODUCT_TYPES: { value: string; label: string }[] = [
  { value: "compressor", label: "압축기 유닛(수소·가스)" },
  { value: "booster", label: "부스터 유닛" },
  { value: "purifier", label: "퓨리파이어 유닛" },
  { value: "diesel_power", label: "디젤 발전 유닛" },
  { value: "electric_heater", label: "전기 히터" },
  { value: "filter_valve", label: "필터·특수밸브" },
  { value: "module", label: "마린/오프쇼어/파워 모듈" },
  { value: "other", label: "기타" },
];

/**
 * 신규 수주 프로젝트 등록 (ETO: 수주설계제작).
 * 기본정보 / 계약·납기 / 정산조건 + 표준 단계(Phase) 자동 생성.
 * create_project RPC(security definer)가 프로젝트 + 소유자 멤버를 원자적으로 생성.
 */
export default function NewProjectPage() {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seedPhases, setSeedPhases] = useState(true);

  const [f, setF] = useState({
    name: "",
    order_no: "",
    product_type: "compressor",
    client_name: "",
    end_user: "",
    contract_no: "",
    contract_amount: "",
    start_date: "",
    delivery_date: "",
    advance_payment: "",
    advance_recovery_rate: "",
    retention_rate: "",
    description: "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));
  const money = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((p) => ({ ...p, [k]: formatThousands(e.target.value) }));
  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/,/g, "")));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.name.trim()) { setError("수주명(프로젝트명)은 필수입니다."); return; }
    setBusy(true);

    const { data: projectId, error: rpcErr } = await supabase.rpc("create_project", {
      p_name: f.name.trim(),
      p_order_no: f.order_no || null,
      p_product_type: f.product_type,
      p_client_name: f.client_name || null,
      p_end_user: f.end_user || null,
      p_contract_no: f.contract_no || null,
      p_contract_amount: num(f.contract_amount),
      p_start_date: f.start_date || null,
      p_delivery_date: f.delivery_date || null,
      p_advance_payment: num(f.advance_payment),
      p_advance_recovery_rate: num(f.advance_recovery_rate),
      p_retention_rate: num(f.retention_rate),
      p_description: f.description || null,
    });

    if (rpcErr || !projectId) {
      setBusy(false);
      setError(rpcErr?.message ?? "등록에 실패했습니다.");
      return;
    }

    if (seedPhases) {
      await supabase.rpc("seed_standard_phases", { p_project_id: projectId as string });
    }
    router.push(`/projects/${projectId}/board`);
  }

  const input = "w-full rounded-md border bg-transparent px-3 py-2 text-sm";
  const inputStyle = { borderColor: "var(--border)" };
  const label = "mb-1 block text-xs font-medium";
  const sec = "mb-3 text-sm font-semibold";
  const secStyle = { color: "var(--navy)" };

  return (
    <main>
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-1 text-xl font-semibold" style={{ color: "var(--navy)" }}>신규 수주 등록</h1>
        <p className="mb-6 text-sm" style={{ color: "var(--muted)" }}>제품·계약·납기·정산 조건을 입력하면 수주 프로젝트가 생성됩니다.</p>

        <form onSubmit={submit} className="space-y-8">
          <section>
            <h2 className={sec} style={secStyle}>기본 정보</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={label}>수주명(프로젝트명) *</label>
                <input className={input} style={inputStyle} value={f.name} onChange={set("name")} placeholder="예: 창원 수소충전소 압축기 패키지" required />
              </div>
              <div>
                <label className={label}>수주번호</label>
                <input className={input} style={inputStyle} value={f.order_no} onChange={set("order_no")} placeholder="예: MNSI-2026-014" />
              </div>
              <div>
                <label className={label}>제품 유형</label>
                <select className={input} style={inputStyle} value={f.product_type} onChange={set("product_type")}>
                  {PRODUCT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={label}>제품 사양 개요</label>
                <textarea className={input} style={inputStyle} rows={2} value={f.description} onChange={set("description")} placeholder="예: 다이어프램 압축기, 토출압 900bar, 처리량 …" />
              </div>
            </div>
          </section>

          <section>
            <h2 className={sec} style={secStyle}>계약 · 납기</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={label}>발주처(고객)</label>
                <input className={input} style={inputStyle} value={f.client_name} onChange={set("client_name")} placeholder="예: ○○에너지" />
              </div>
              <div>
                <label className={label}>최종 납품처</label>
                <input className={input} style={inputStyle} value={f.end_user} onChange={set("end_user")} placeholder="예: 창원 수소충전소" />
              </div>
              <div>
                <label className={label}>계약번호</label>
                <input className={input} style={inputStyle} value={f.contract_no} onChange={set("contract_no")} />
              </div>
              <div>
                <label className={label}>계약금액(원)</label>
                <input className={input} style={inputStyle} value={f.contract_amount} onChange={money("contract_amount")} inputMode="numeric" placeholder="예: 1,800,000,000" />
              </div>
              <div>
                <label className={label}>착수일</label>
                <input type="date" className={input} style={inputStyle} value={f.start_date} onChange={set("start_date")} />
              </div>
              <div>
                <label className={label}>납기(출하 예정일)</label>
                <input type="date" className={input} style={inputStyle} value={f.delivery_date} onChange={set("delivery_date")} />
              </div>
            </div>
          </section>

          <section>
            <h2 className={sec} style={secStyle}>정산 조건</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className={label}>선급금(원)</label>
                <input className={input} style={inputStyle} value={f.advance_payment} onChange={money("advance_payment")} inputMode="numeric" placeholder="예: 180,000,000" />
              </div>
              <div>
                <label className={label}>선급금 정산율(%)</label>
                <input className={input} style={inputStyle} value={f.advance_recovery_rate} onChange={set("advance_recovery_rate")} inputMode="numeric" placeholder="예: 10" />
              </div>
              <div>
                <label className={label}>대금 유보율(%)</label>
                <input className={input} style={inputStyle} value={f.retention_rate} onChange={set("retention_rate")} inputMode="numeric" placeholder="예: 5" />
              </div>
            </div>
          </section>

          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text)" }}>
            <input type="checkbox" checked={seedPhases} onChange={(e) => setSeedPhases(e.target.checked)} />
            표준 단계(Phase) 자동 생성 (수주·설계·구매·제작·조립·FAT·출하·시운전)
          </label>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-3">
            <button type="submit" disabled={busy} className="rounded-md px-5 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>
              {busy ? "등록 중…" : "수주 등록"}
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
