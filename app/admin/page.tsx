"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { ROLE_LABELS, type MemberRole } from "@/lib/db/types";

interface UserRow { id: string; email: string; full_name: string | null; is_admin: boolean; created_at: string }
interface ProjectRow { id: string; name: string }

const ASSIGN_ROLES: MemberRole[] = ["manager", "developer", "designer", "tester", "viewer"];

/** 시스템 관리자 페이지 — 사용자 관리(관리자 토글) + 회원가입자 프로젝트 배정 */
export default function AdminPage() {
  const supabase = createClient();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [assign, setAssign] = useState({ userId: "", projectId: "", role: "developer" as MemberRole });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("admin_list_users");
    if (error) { setAllowed(false); return; }
    setAllowed(true);
    const list = (data as UserRow[]) ?? [];
    setUsers(list);
    const { data: pj } = await supabase.from("projects").select("id, name").order("name");
    setProjects((pj as ProjectRow[]) ?? []);
    setAssign((a) => ({ ...a, userId: a.userId || list[0]?.id || "", projectId: a.projectId || (pj as ProjectRow[])?.[0]?.id || "" }));
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  async function toggle(u: UserRow) {
    await supabase.rpc("admin_set_user_admin", { p_user_id: u.id, p_is_admin: !u.is_admin });
    void load();
  }

  async function assignToProject() {
    setMsg(null); setErr(null);
    const user = users.find((u) => u.id === assign.userId);
    if (!user || !assign.projectId) { setErr("사용자와 프로젝트를 선택하세요."); return; }
    setBusy(true);
    const { error } = await supabase.rpc("add_project_member", { p_project_id: assign.projectId, p_email: user.email, p_role: assign.role });
    setBusy(false);
    if (error) { setErr(`배정 실패: ${error.message}`); return; }
    const pj = projects.find((p) => p.id === assign.projectId);
    setMsg(`${user.full_name ?? user.email} 님을 ‘${pj?.name}’에 ${ROLE_LABELS[assign.role]}(으)로 배정했습니다.`);
  }

  return (
    <main>
      <SiteHeader />
      <div className="page" style={{ maxWidth: 1080 }}>
        <div className="page-head">
          <div>
            <p className="eyebrow">시스템 관리</p>
            <h1 className="page-title">사용자 · 권한</h1>
            <p className="page-sub">가입한 사용자를 관리자로 지정하거나, 프로젝트에 배정(권한 배부)합니다.</p>
          </div>
        </div>

        {allowed === false && <p className="text-[14px]" style={{ color: "var(--muted)" }}>시스템 관리자만 접근할 수 있습니다.</p>}

        {allowed && (
          <div className="space-y-5">
            {/* 프로젝트 배정 패널 */}
            <div className="panel">
              <div className="panel-head"><span className="panel-title">회원가입자 → 프로젝트 배정</span></div>
              <div className="panel-body">
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="field-label">사용자</label>
                    <select className="select w-56" value={assign.userId} onChange={(e) => setAssign({ ...assign, userId: e.target.value })}>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.full_name ? `${u.full_name} · ` : ""}{u.email}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">프로젝트</label>
                    <select className="select w-56" value={assign.projectId} onChange={(e) => setAssign({ ...assign, projectId: e.target.value })}>
                      {projects.length === 0 && <option value="">(프로젝트 없음)</option>}
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">역할(권한)</label>
                    <select className="select w-36" value={assign.role} onChange={(e) => setAssign({ ...assign, role: e.target.value as MemberRole })}>
                      {ASSIGN_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  </div>
                  <button onClick={assignToProject} disabled={busy} className="btn btn-primary">{busy ? "배정 중…" : "프로젝트 배정"}</button>
                </div>
                {msg && <p className="mt-3 rounded-[4px] px-3 py-2 text-[13px]" style={{ background: "var(--ok-soft)", color: "var(--ok)" }}>{msg}</p>}
                {err && <p className="mt-3 rounded-[4px] px-3 py-2 text-[13px]" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>{err}</p>}
                <p className="mt-3 text-[12px]" style={{ color: "var(--faint)" }}>배정하려는 사용자는 먼저 회원가입돼 있어야 합니다. 프로젝트 내 세부 역할 변경·삭제는 각 프로젝트의 <b>멤버</b> 탭에서도 가능합니다.</p>
              </div>
            </div>

            {/* 사용자 목록 + 관리자 토글 */}
            <div className="panel">
              <div className="panel-head"><span className="panel-title">전체 사용자 · 시스템 관리자 지정</span></div>
              <div>
                {users.map((u) => (
                  <div key={u.id} className="flex items-center justify-between border-b px-4 py-3 last:border-b-0" style={{ borderColor: "var(--border)" }}>
                    <div>
                      <div className="text-[14px] font-semibold" style={{ color: "var(--heading)" }}>{u.full_name ?? u.email}</div>
                      <div className="text-[12px]" style={{ color: "var(--muted)" }}>{u.email} · 가입 {u.created_at?.slice(0, 10)}</div>
                    </div>
                    <button
                      onClick={() => toggle(u)}
                      className="rounded-[4px] px-3 py-1.5 text-[13px] font-semibold"
                      style={u.is_admin
                        ? { background: "var(--accent)", color: "#fff" }
                        : { border: "1px solid var(--border-strong)", color: "var(--text)" }}
                      title="클릭하면 관리자↔일반 전환"
                    >
                      {u.is_admin ? "관리자" : "일반"}
                    </button>
                  </div>
                ))}
                {users.length === 0 && <p className="px-4 py-6 text-[14px]" style={{ color: "var(--muted)" }}>사용자가 없습니다.</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
