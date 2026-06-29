"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { SiteHeader } from "@/components/layout/SiteHeader";

interface OutboxRow { id: string; entity: string; op: string; status: string; erp_doc_no: string | null; error: string | null; created_at: string }
interface Mapping { id: string; kind: string; pms_id: string; erp_code: string }

const STATUS_LABEL: Record<string, string> = { pending: "대기", sent: "전송", confirmed: "확정", failed: "실패", skipped: "건너뜀" };
const STATUS_COLOR: Record<string, string> = { pending: "var(--muted)", confirmed: "var(--ok,#1d9e75)", failed: "var(--danger,#d93a3a)", skipped: "var(--muted)", sent: "var(--accent)" };
const ENTITY_LABEL: Record<string, string> = { billing: "대금", procurement: "구매", project: "수주" };
const ADAPTER_LABEL: Record<string, string> = { mock: "Mock(미연동·테스트)", staging: "인터페이스 테이블", rest: "REST(옴니이솔)" };

export default function ErpSettingsPage() {
  const supabase = createClient();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [adapter, setAdapter] = useState("mock");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [rows, setRows] = useState<OutboxRow[]>([]);
  const [maps, setMaps] = useState<Mapping[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/erp/sync", { method: "GET" });
    if (res.status === 401) { setAllowed(false); return; }
    setAllowed(true);
    const status = await res.json();
    setAdapter(status.adapter ?? "mock");
    setCounts(status.counts ?? {});
    const [{ data: ob }, { data: mp }] = await Promise.all([
      supabase.from("erp_sync_outbox").select("id, entity, op, status, erp_doc_no, error, created_at").order("created_at", { ascending: false }).limit(20),
      supabase.from("erp_mapping").select("id, kind, pms_id, erp_code").limit(50),
    ]);
    setRows((ob as OutboxRow[]) ?? []);
    setMaps((mp as Mapping[]) ?? []);
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  async function runSync() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/erp/sync", { method: "POST" });
    const j = await res.json();
    setBusy(false);
    setMsg(res.ok ? `동기화 완료: 처리 ${j.processed ?? 0}건 (확정 ${j.ok ?? 0} · 실패 ${j.failed ?? 0})` : `오류: ${j.error ?? res.status}`);
    void load();
  }

  return (
    <main>
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold" style={{ color: "var(--navy)" }}>설정 · ERP 연동</h1>
          <Link href="/" className="text-sm" style={{ color: "var(--accent)" }}>← 홈</Link>
        </div>

        {allowed === false && <p className="text-sm" style={{ color: "var(--muted)" }}>시스템 관리자만 접근할 수 있습니다.</p>}

        {allowed && (
          <div className="space-y-6">
            {/* 연동 상태 */}
            <section className="rounded-xl border p-5" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium" style={{ color: "var(--navy)" }}>연동 방식</div>
                  <div className="mt-1 text-sm">{ADAPTER_LABEL[adapter] ?? adapter}</div>
                </div>
                <button onClick={runSync} disabled={busy} className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>
                  {busy ? "동기화 중…" : "지금 동기화"}
                </button>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-5">
                {["pending", "sent", "confirmed", "failed", "skipped"].map((s) => (
                  <div key={s} className="rounded-lg p-3" style={{ background: "var(--surface-2,#f8fafc)" }}>
                    <div className="text-xs" style={{ color: "var(--muted)" }}>{STATUS_LABEL[s]}</div>
                    <div className="text-xl font-semibold" style={{ color: STATUS_COLOR[s] }}>{counts[s] ?? 0}</div>
                  </div>
                ))}
              </div>
              {msg && <p className="mt-3 text-sm" style={{ color: "var(--accent)" }}>{msg}</p>}
              <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
                방식·매핑·규격은 옴니이솔과 협의 후 확정합니다(문서: docs/ERP_INTEGRATION.md). 규격 확정 전엔 Mock으로 안전하게 큐만 쌓입니다.
              </p>
            </section>

            {/* 동기화 큐 */}
            <section>
              <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--navy)" }}>동기화 큐 (최근 20건)</h2>
              <div className="overflow-hidden rounded-xl border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                {rows.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2 border-b px-4 py-2.5 text-sm last:border-b-0" style={{ borderColor: "var(--border)" }}>
                    <div>
                      <span style={{ color: "var(--muted)" }}>{ENTITY_LABEL[r.entity] ?? r.entity}</span> · {r.op}
                      {r.erp_doc_no && <span style={{ color: "var(--muted)" }}> · {r.erp_doc_no}</span>}
                      {r.error && <span className="text-red-500"> · {r.error.slice(0, 40)}</span>}
                    </div>
                    <span className="text-xs" style={{ color: STATUS_COLOR[r.status] }}>{STATUS_LABEL[r.status] ?? r.status}</span>
                  </div>
                ))}
                {rows.length === 0 && <p className="px-4 py-6 text-sm" style={{ color: "var(--muted)" }}>아직 동기화 항목이 없습니다. 대금/구매/수주를 저장하면 여기에 쌓입니다.</p>}
              </div>
            </section>

            {/* 코드 매핑 */}
            <section>
              <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--navy)" }}>코드 매핑 (PMS ↔ ERP)</h2>
              <div className="overflow-hidden rounded-xl border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                {maps.map((m) => (
                  <div key={m.id} className="flex items-center justify-between border-b px-4 py-2.5 text-sm last:border-b-0" style={{ borderColor: "var(--border)" }}>
                    <span><span style={{ color: "var(--muted)" }}>{m.kind}</span> · {m.pms_id}</span>
                    <span style={{ color: "var(--accent)" }}>{m.erp_code}</span>
                  </div>
                ))}
                {maps.length === 0 && <p className="px-4 py-6 text-sm" style={{ color: "var(--muted)" }}>거래처·품목·계정 코드 매핑은 ERP에서 webhook으로 수신하거나 옴니이솔과 합의해 등록합니다.</p>}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
