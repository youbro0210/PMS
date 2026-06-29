"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { SiteHeader } from "@/components/layout/SiteHeader";

interface OutboxRow { id: string; entity: string; op: string; status: string; erp_doc_no: string | null; error: string | null; created_at: string }
interface Mapping { id: string; kind: string; pms_id: string; erp_code: string }
interface Config { adapter: string; base_url: string | null; api_key: string | null; enabled: boolean; auto_sync: boolean }

const STATUS_LABEL: Record<string, string> = { pending: "대기", sent: "전송", confirmed: "확정", failed: "실패", skipped: "건너뜀" };
const STATUS_COLOR: Record<string, string> = { pending: "var(--muted)", confirmed: "#1d9e75", failed: "#d93a3a", skipped: "var(--muted)", sent: "var(--accent)" };
const ENTITY_LABEL: Record<string, string> = { billing: "대금", procurement: "구매", project: "수주" };
const ADAPTERS = [
  { v: "mock", l: "Mock (미연동·테스트)" },
  { v: "staging", l: "인터페이스 테이블" },
  { v: "rest", l: "REST (옴니이솔 게이트웨이)" },
];
const MAP_KINDS = [
  { v: "vendor", l: "거래처" }, { v: "item", l: "품목" }, { v: "account", l: "계정" }, { v: "project", l: "프로젝트" }, { v: "doc", l: "문서" },
];

export default function ErpSettingsPage() {
  const supabase = createClient();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [cfg, setCfg] = useState<Config>({ adapter: "mock", base_url: "", api_key: "", enabled: false, auto_sync: false });
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [rows, setRows] = useState<OutboxRow[]>([]);
  const [maps, setMaps] = useState<Mapping[]>([]);
  const [newMap, setNewMap] = useState({ kind: "vendor", pms_id: "", erp_code: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: c, error } = await supabase.from("erp_config").select("adapter, base_url, api_key, enabled, auto_sync").eq("id", 1).maybeSingle();
    if (error && (error.code === "42501" || error.code === "PGRST301")) { setAllowed(false); return; }
    setAllowed(true);
    if (c) setCfg({ adapter: c.adapter, base_url: c.base_url ?? "", api_key: c.api_key ?? "", enabled: c.enabled, auto_sync: c.auto_sync });
    const [{ data: ob }, { data: mp }] = await Promise.all([
      supabase.from("erp_sync_outbox").select("id, entity, op, status, erp_doc_no, error, created_at").order("created_at", { ascending: false }).limit(20),
      supabase.from("erp_mapping").select("id, kind, pms_id, erp_code").order("updated_at", { ascending: false }).limit(50),
    ]);
    const list = (ob as OutboxRow[]) ?? [];
    setRows(list);
    const ct: Record<string, number> = { pending: 0, sent: 0, confirmed: 0, failed: 0, skipped: 0 };
    // 전체 카운트는 별도 집계
    const { data: all } = await supabase.from("erp_sync_outbox").select("status");
    for (const r of all ?? []) ct[(r as { status: string }).status] = (ct[(r as { status: string }).status] ?? 0) + 1;
    setCounts(ct);
    setMaps((mp as Mapping[]) ?? []);
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  async function saveConfig(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const { error } = await supabase.from("erp_config").update({
      adapter: cfg.adapter, base_url: cfg.base_url || null, api_key: cfg.api_key || null,
      enabled: cfg.enabled, auto_sync: cfg.auto_sync, updated_at: new Date().toISOString(),
    }).eq("id", 1);
    setBusy(false);
    setMsg(error ? `저장 오류: ${error.message}` : "설정을 저장했습니다.");
  }

  async function addMapping(e: React.FormEvent) {
    e.preventDefault();
    if (!newMap.pms_id.trim() || !newMap.erp_code.trim()) return;
    const { error } = await supabase.from("erp_mapping").insert({ kind: newMap.kind, pms_id: newMap.pms_id.trim(), erp_code: newMap.erp_code.trim() });
    if (error) { setMsg(`매핑 오류: ${error.message}`); return; }
    setNewMap({ kind: "vendor", pms_id: "", erp_code: "" });
    void load();
  }

  async function removeMapping(id: string) {
    await supabase.from("erp_mapping").delete().eq("id", id);
    void load();
  }

  async function runSync() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/erp/sync", { method: "POST" });
    const j = await res.json();
    setBusy(false);
    setMsg(res.ok ? `동기화 완료: 처리 ${j.processed ?? 0}건 (확정 ${j.ok ?? 0} · 실패 ${j.failed ?? 0} · 건너뜀 ${j.skipped ?? 0})` : `오류: ${j.error ?? res.status}`);
    void load();
  }

  const input = "rounded-md border bg-transparent px-3 py-2 text-sm";
  const style = { borderColor: "var(--border)" };
  const card = "rounded-xl border p-5";
  const cardStyle = { background: "var(--surface)", borderColor: "var(--border)" };

  return (
    <main>
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold" style={{ color: "var(--navy)" }}>설정 · ERP 연동</h1>
          <Link href="/" className="text-sm" style={{ color: "var(--accent)" }}>← 홈</Link>
        </div>

        {allowed === false && <p className="text-sm" style={{ color: "var(--muted)" }}>시스템 관리자만 접근할 수 있습니다.</p>}

        {allowed && (
          <div className="space-y-6">
            {/* 연동 설정 입력 */}
            <form onSubmit={saveConfig} className={card} style={cardStyle}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold" style={{ color: "var(--navy)" }}>연동 설정</h2>
                <button type="button" onClick={runSync} disabled={busy} className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>
                  {busy ? "처리 중…" : "지금 동기화"}
                </button>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium">연동 방식</label>
                  <select className={`${input} w-full`} style={style} value={cfg.adapter} onChange={(e) => setCfg({ ...cfg, adapter: e.target.value })}>
                    {ADAPTERS.map((a) => <option key={a.v} value={a.v}>{a.l}</option>)}
                  </select>
                </div>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} />
                  연동 사용(꺼두면 실연동은 전송 안 함)
                </label>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium">ERP 주소 (REST 방식)</label>
                  <input className={`${input} w-full`} style={style} placeholder="https://erp-gw.옴니이솔.example/api" value={cfg.base_url ?? ""} onChange={(e) => setCfg({ ...cfg, base_url: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium">API 키 (REST 방식)</label>
                  <input className={`${input} w-full`} style={style} type="password" placeholder="옴니이솔 발급 토큰" value={cfg.api_key ?? ""} onChange={(e) => setCfg({ ...cfg, api_key: e.target.value })} />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={cfg.auto_sync} onChange={(e) => setCfg({ ...cfg, auto_sync: e.target.checked })} />
                  자동 동기화(크론) 사용
                </label>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button type="submit" disabled={busy} className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>설정 저장</button>
                {msg && <span className="text-sm" style={{ color: "var(--accent)" }}>{msg}</span>}
              </div>
              <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>방식·매핑·규격은 옴니이솔과 협의 후 확정(docs/ERP_INTEGRATION.md). 확정 전엔 Mock으로 안전하게 큐만 쌓입니다.</p>
            </form>

            {/* 큐 현황 */}
            <section>
              <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--navy)" }}>동기화 큐</h2>
              <div className="mb-3 grid grid-cols-3 gap-3 sm:grid-cols-5">
                {["pending", "sent", "confirmed", "failed", "skipped"].map((s) => (
                  <div key={s} className="rounded-lg p-3" style={{ background: "var(--surface)" }}>
                    <div className="text-xs" style={{ color: "var(--muted)" }}>{STATUS_LABEL[s]}</div>
                    <div className="text-xl font-semibold" style={{ color: STATUS_COLOR[s] }}>{counts[s] ?? 0}</div>
                  </div>
                ))}
              </div>
              <div className="overflow-hidden rounded-xl border" style={cardStyle}>
                {rows.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2 border-b px-4 py-2.5 text-sm last:border-b-0" style={style}>
                    <div><span style={{ color: "var(--muted)" }}>{ENTITY_LABEL[r.entity] ?? r.entity}</span> · {r.op}{r.erp_doc_no && <span style={{ color: "var(--muted)" }}> · {r.erp_doc_no}</span>}{r.error && <span className="text-red-500"> · {r.error.slice(0, 40)}</span>}</div>
                    <span className="text-xs" style={{ color: STATUS_COLOR[r.status] }}>{STATUS_LABEL[r.status] ?? r.status}</span>
                  </div>
                ))}
                {rows.length === 0 && <p className="px-4 py-6 text-sm" style={{ color: "var(--muted)" }}>대금/구매/수주를 저장하면 여기에 쌓입니다.</p>}
              </div>
            </section>

            {/* 코드 매핑 입력 */}
            <section>
              <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--navy)" }}>코드 매핑 (PMS ↔ ERP)</h2>
              <form onSubmit={addMapping} className="mb-3 flex flex-wrap items-end gap-2 rounded-xl border p-4" style={cardStyle}>
                <select className={input} style={style} value={newMap.kind} onChange={(e) => setNewMap({ ...newMap, kind: e.target.value })}>
                  {MAP_KINDS.map((k) => <option key={k.v} value={k.v}>{k.l}</option>)}
                </select>
                <input className={`${input} flex-1`} style={{ ...style, minWidth: 140 }} placeholder="PMS 코드/ID" value={newMap.pms_id} onChange={(e) => setNewMap({ ...newMap, pms_id: e.target.value })} />
                <input className={`${input} flex-1`} style={{ ...style, minWidth: 140 }} placeholder="ERP 코드" value={newMap.erp_code} onChange={(e) => setNewMap({ ...newMap, erp_code: e.target.value })} />
                <button type="submit" className="rounded-md px-4 py-2 text-sm font-medium text-white" style={{ background: "var(--accent)" }}>추가</button>
              </form>
              <div className="overflow-hidden rounded-xl border" style={cardStyle}>
                {maps.map((m) => (
                  <div key={m.id} className="flex items-center justify-between border-b px-4 py-2.5 text-sm last:border-b-0" style={style}>
                    <span><span style={{ color: "var(--muted)" }}>{MAP_KINDS.find((k) => k.v === m.kind)?.l ?? m.kind}</span> · {m.pms_id} → <span style={{ color: "var(--accent)" }}>{m.erp_code}</span></span>
                    <button onClick={() => removeMapping(m.id)} className="text-xs text-red-500">삭제</button>
                  </div>
                ))}
                {maps.length === 0 && <p className="px-4 py-6 text-sm" style={{ color: "var(--muted)" }}>거래처·품목·계정 코드를 위에서 추가하거나 ERP webhook으로 수신합니다.</p>}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
