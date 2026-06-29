"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { SiteHeader } from "@/components/layout/SiteHeader";

interface OutboxRow { id: string; entity: string; op: string; status: string; erp_doc_no: string | null; error: string | null }
interface Mapping { id: string; kind: string; pms_id: string; erp_code: string }
interface ModuleCfg { module: string; label: string; method: string; direction: string; enabled: boolean; endpoint: string | null; auth_key: string | null }

const STATUS_LABEL: Record<string, string> = { pending: "대기", sent: "전송", confirmed: "확정", failed: "실패", skipped: "건너뜀" };
const STATUS_COLOR: Record<string, string> = { pending: "var(--muted)", confirmed: "#1d9e75", failed: "#d93a3a", skipped: "var(--muted)", sent: "var(--accent)" };
const ENTITY_LABEL: Record<string, string> = { billing: "대금", procurement: "구매", project: "수주", cost: "원가", inspection: "품질" };
const METHODS = [{ v: "none", l: "미사용" }, { v: "mock", l: "Mock(테스트)" }, { v: "db", l: "DB-to-DB(인터페이스 테이블)" }, { v: "api", l: "API(REST)" }];
const DIRECTIONS = [{ v: "out", l: "PMS→ERP" }, { v: "in", l: "ERP→PMS" }, { v: "both", l: "양방향" }];
const MAP_KINDS = [{ v: "vendor", l: "거래처" }, { v: "item", l: "품목" }, { v: "account", l: "계정" }, { v: "project", l: "프로젝트" }, { v: "doc", l: "문서" }];

export default function ErpSettingsPage() {
  const supabase = createClient();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [modules, setModules] = useState<ModuleCfg[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [rows, setRows] = useState<OutboxRow[]>([]);
  const [maps, setMaps] = useState<Mapping[]>([]);
  const [newMap, setNewMap] = useState({ kind: "vendor", pms_id: "", erp_code: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: mods, error } = await supabase.from("erp_module_config").select("module, label, method, direction, enabled, endpoint, auth_key").order("module");
    if (error && (error.code === "42501" || error.code === "PGRST301" || error.code === "42P01")) { setAllowed(false); return; }
    setAllowed(true);
    setModules((mods as ModuleCfg[]) ?? []);
    const [{ data: ob }, { data: all }, { data: mp }] = await Promise.all([
      supabase.from("erp_sync_outbox").select("id, entity, op, status, erp_doc_no, error").order("created_at", { ascending: false }).limit(20),
      supabase.from("erp_sync_outbox").select("status"),
      supabase.from("erp_mapping").select("id, kind, pms_id, erp_code").order("updated_at", { ascending: false }).limit(50),
    ]);
    setRows((ob as OutboxRow[]) ?? []);
    const ct: Record<string, number> = { pending: 0, sent: 0, confirmed: 0, failed: 0, skipped: 0 };
    for (const r of all ?? []) ct[(r as { status: string }).status] = (ct[(r as { status: string }).status] ?? 0) + 1;
    setCounts(ct);
    setMaps((mp as Mapping[]) ?? []);
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  function setMod(i: number, patch: Partial<ModuleCfg>) {
    setModules((m) => m.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }

  async function saveModule(m: ModuleCfg) {
    setBusy(true); setMsg(null);
    const { error } = await supabase.from("erp_module_config").update({
      method: m.method, direction: m.direction, enabled: m.enabled, endpoint: m.endpoint || null, auth_key: m.auth_key || null, updated_at: new Date().toISOString(),
    }).eq("module", m.module);
    setBusy(false);
    setMsg(error ? `저장 오류: ${error.message}` : `'${m.label}' 설정을 저장했습니다.`);
  }

  async function addMapping(e: React.FormEvent) {
    e.preventDefault();
    if (!newMap.pms_id.trim() || !newMap.erp_code.trim()) return;
    const { error } = await supabase.from("erp_mapping").insert({ kind: newMap.kind, pms_id: newMap.pms_id.trim(), erp_code: newMap.erp_code.trim() });
    if (error) { setMsg(`매핑 오류: ${error.message}`); return; }
    setNewMap({ kind: "vendor", pms_id: "", erp_code: "" }); void load();
  }
  async function removeMapping(id: string) { await supabase.from("erp_mapping").delete().eq("id", id); void load(); }

  async function runSync() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/erp/sync", { method: "POST" });
    const j = await res.json();
    setBusy(false);
    setMsg(res.ok ? `동기화: 처리 ${j.processed ?? 0} (확정 ${j.ok ?? 0}·실패 ${j.failed ?? 0}·건너뜀 ${j.skipped ?? 0})` : `오류: ${j.error ?? res.status}`);
    void load();
  }

  const input = "rounded-md border bg-transparent px-2.5 py-1.5 text-sm";
  const style = { borderColor: "var(--border)" };
  const cardStyle = { background: "var(--surface)", borderColor: "var(--border)" };

  return (
    <main>
      <SiteHeader />
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-xl font-semibold" style={{ color: "var(--navy)" }}>설정 · ERP 연동</h1>
          <Link href="/" className="text-sm" style={{ color: "var(--accent)" }}>← 홈</Link>
        </div>
        <p className="mb-6 text-xs" style={{ color: "var(--muted)" }}>모듈마다 연동 방식(미사용·테스트·DB·API)·방향·엔드포인트를 따로 설정합니다. 규격은 옴니이솔과 협의 후 확정(docs/ERP_INTEGRATION.md).</p>

        {allowed === false && <p className="text-sm" style={{ color: "var(--muted)" }}>시스템 관리자만 접근할 수 있습니다.</p>}

        {allowed && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold" style={{ color: "var(--navy)" }}>모듈별 연동 설정</h2>
              <button onClick={runSync} disabled={busy} className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>지금 동기화</button>
            </div>
            {msg && <p className="text-sm" style={{ color: "var(--accent)" }}>{msg}</p>}

            {/* 모듈별 카드 */}
            <div className="space-y-3">
              {modules.map((m, i) => (
                <div key={m.module} className="rounded-xl border p-4" style={cardStyle}>
                  <div className="mb-3 flex items-center justify-between">
                    <div className="font-medium" style={{ color: "var(--navy)" }}>{m.label}</div>
                    <label className="flex items-center gap-1.5 text-xs">
                      <input type="checkbox" checked={m.enabled} onChange={(e) => setMod(i, { enabled: e.target.checked })} /> 사용
                    </label>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>연동 방식</label>
                      <select className={`${input} w-full`} style={style} value={m.method} onChange={(e) => setMod(i, { method: e.target.value })}>
                        {METHODS.map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>방향</label>
                      <select className={`${input} w-full`} style={style} value={m.direction} onChange={(e) => setMod(i, { direction: e.target.value })}>
                        {DIRECTIONS.map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>엔드포인트 (API: URL / DB: 인터페이스 테이블명)</label>
                      <input className={`${input} w-full`} style={style} placeholder={m.method === "db" ? "예: IF_PMS_BILLING" : "예: https://erp-gw.옴니이솔/api/billing"} value={m.endpoint ?? ""} onChange={(e) => setMod(i, { endpoint: e.target.value })} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>인증키 (선택, 모듈별)</label>
                      <input className={`${input} w-full`} style={style} type="password" placeholder="비우면 전역 키 사용" value={m.auth_key ?? ""} onChange={(e) => setMod(i, { auth_key: e.target.value })} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <button onClick={() => saveModule(m)} disabled={busy} className="rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50" style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>이 모듈 저장</button>
                  </div>
                </div>
              ))}
              {modules.length === 0 && <p className="text-sm" style={{ color: "var(--muted)" }}>모듈 설정이 없습니다. 마이그레이션 0011을 실행하세요.</p>}
            </div>

            {/* 동기화 큐 */}
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
                {rows.length === 0 && <p className="px-4 py-6 text-sm" style={{ color: "var(--muted)" }}>대금/구매/수주/원가/품질을 저장하면 여기에 쌓입니다.</p>}
              </div>
            </section>

            {/* 코드 매핑 */}
            <section>
              <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--navy)" }}>코드 매핑 (PMS ↔ ERP)</h2>
              <form onSubmit={addMapping} className="mb-3 flex flex-wrap items-end gap-2 rounded-xl border p-4" style={cardStyle}>
                <select className={input} style={style} value={newMap.kind} onChange={(e) => setNewMap({ ...newMap, kind: e.target.value })}>
                  {MAP_KINDS.map((k) => <option key={k.v} value={k.v}>{k.l}</option>)}
                </select>
                <input className={`${input} flex-1`} style={{ ...style, minWidth: 130 }} placeholder="PMS 코드/ID" value={newMap.pms_id} onChange={(e) => setNewMap({ ...newMap, pms_id: e.target.value })} />
                <input className={`${input} flex-1`} style={{ ...style, minWidth: 130 }} placeholder="ERP 코드" value={newMap.erp_code} onChange={(e) => setNewMap({ ...newMap, erp_code: e.target.value })} />
                <button type="submit" className="rounded-md px-4 py-2 text-sm font-medium text-white" style={{ background: "var(--accent)" }}>추가</button>
              </form>
              <div className="overflow-hidden rounded-xl border" style={cardStyle}>
                {maps.map((m) => (
                  <div key={m.id} className="flex items-center justify-between border-b px-4 py-2.5 text-sm last:border-b-0" style={style}>
                    <span><span style={{ color: "var(--muted)" }}>{MAP_KINDS.find((k) => k.v === m.kind)?.l ?? m.kind}</span> · {m.pms_id} → <span style={{ color: "var(--accent)" }}>{m.erp_code}</span></span>
                    <button onClick={() => removeMapping(m.id)} className="text-xs text-red-500">삭제</button>
                  </div>
                ))}
                {maps.length === 0 && <p className="px-4 py-6 text-sm" style={{ color: "var(--muted)" }}>거래처·품목·계정 코드를 추가하거나 ERP webhook으로 수신합니다.</p>}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
