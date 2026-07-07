"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SettingsTabs } from "@/components/layout/SettingsTabs";

interface Row { id: string; name: string; client_name: string | null; status: string; icon: string | null }

const STATUS: Record<string, { label: string; cls: string }> = {
  planning: { label: "계획", cls: "badge-neutral" },
  in_progress: { label: "진행", cls: "badge-info" },
  active: { label: "진행", cls: "badge-info" },
  on_hold: { label: "보류", cls: "badge-warn" },
  completed: { label: "완료", cls: "badge-ok" },
  cancelled: { label: "취소", cls: "badge-danger" },
};

export default function ProjectSettingsPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("projects").select("id, name, client_name, status, icon").order("updated_at", { ascending: false });
    setRows((data as Row[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  async function remove(r: Row) {
    setBusyId(r.id); setErr(null); setMsg(null);
    const { error } = await supabase.rpc("admin_delete_project", { p_project_id: r.id });
    setBusyId(null);
    if (error) { setErr(`삭제 실패: ${error.message}`); return; }
    setConfirmId(null); setConfirmText("");
    setMsg(`‘${r.name}’ 수주를 삭제했습니다.`);
    await load();
  }

  return (
    <main>
      <SiteHeader />
      <div className="page" style={{ maxWidth: 1080 }}>
        <div className="page-head">
          <div>
            <p className="eyebrow">설정</p>
            <h1 className="page-title">수주 관리</h1>
            <p className="page-sub">수주 프로젝트를 삭제합니다. 삭제 시 관련 BOM·일정·구매·대금·회계 데이터가 함께 영구 삭제됩니다.</p>
          </div>
          <Link href="/" className="link text-[14px]">← 홈</Link>
        </div>

        <SettingsTabs active="projects" />

        {msg && <p className="mb-3 rounded-[4px] px-3 py-2 text-[13px]" style={{ background: "var(--ok-soft)", color: "var(--ok)" }}>{msg}</p>}
        {err && <p className="mb-3 rounded-[4px] px-3 py-2 text-[13px]" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>{err}</p>}

        <div className="grid-wrap overflow-x-auto">
          <table className="data-table">
            <thead><tr>
              <th style={{ width: 44 }}>#</th>
              <th>프로젝트</th>
              <th>발주처</th>
              <th style={{ width: 90 }}>상태</th>
              <th style={{ width: 220 }}>관리</th>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const s = STATUS[r.status] ?? { label: r.status, cls: "badge-neutral" };
                const confirming = confirmId === r.id;
                return (
                  <tr key={r.id}>
                    <td className="num" style={{ color: "var(--faint)" }}>{i + 1}</td>
                    <td className="font-semibold" style={{ color: "var(--heading)" }}>
                      <span className="mr-1.5">{r.icon}</span>{r.name}
                    </td>
                    <td style={{ color: "var(--muted)" }}>{r.client_name ?? "발주처 미지정"}</td>
                    <td><span className={`badge ${s.cls}`}>{s.label}</span></td>
                    <td>
                      {!confirming ? (
                        <button onClick={() => { setConfirmId(r.id); setConfirmText(""); setErr(null); }} className="btn btn-danger btn-sm">삭제</button>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <input autoFocus className="input input-sm w-36" placeholder="수주명 입력" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
                          <button onClick={() => remove(r)} disabled={confirmText !== r.name || busyId === r.id} className="btn btn-danger-solid btn-sm">{busyId === r.id ? "삭제 중…" : "확정"}</button>
                          <button onClick={() => { setConfirmId(null); setConfirmText(""); }} className="btn btn-ghost btn-sm">취소</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!loading && rows.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center" style={{ color: "var(--muted)" }}>수주가 없습니다.</td></tr>}
              {loading && <tr><td colSpan={5} className="px-3 py-8 text-center" style={{ color: "var(--muted)" }}>불러오는 중…</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[13px]" style={{ color: "var(--faint)" }}>삭제하려면 삭제 버튼을 누른 뒤 수주명을 정확히 입력하고 ‘확정’을 누르세요. 소유자 또는 시스템 관리자만 삭제할 수 있습니다.</p>
      </div>
    </main>
  );
}
