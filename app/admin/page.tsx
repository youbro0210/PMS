"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { ROLE_LABELS, type MemberRole } from "@/lib/db/types";

interface UserRow { id: string; email: string; full_name: string | null; is_admin: boolean; created_at: string; last_sign_in_at: string | null }
interface ProjectRow { id: string; name: string }

const ASSIGN_ROLES: MemberRole[] = ["manager", "developer", "designer", "tester", "viewer"];

// 한국시간(KST) 포맷
const kst = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "―";

/** 시스템 관리자 페이지 — 사용자 관리(관리자 토글) + 회원가입자 프로젝트 배정 */
export default function AdminPage() {
  const supabase = createClient();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [assign, setAssign] = useState({ userId: "", projectId: "", role: "developer" as MemberRole });
  const [memberships, setMemberships] = useState<{ id: string; project_id: string; project_name: string; role: MemberRole }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);

  const loadMemberships = useCallback(async (userId: string) => {
    if (!userId) { setMemberships([]); return; }
    const { data } = await supabase
      .from("project_members")
      .select("id, role, project_id, projects(name)")
      .eq("user_id", userId);
    setMemberships(((data as unknown as { id: string; role: MemberRole; project_id: string; projects: { name: string } | null }[]) ?? [])
      .map((m) => ({ id: m.id, project_id: m.project_id, project_name: m.projects?.name ?? "(프로젝트)", role: m.role })));
  }, [supabase]);

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
  useEffect(() => { void loadMemberships(assign.userId); }, [assign.userId, loadMemberships]);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setMeId(data.user?.id ?? null)); }, [supabase]);

  async function toggle(u: UserRow) {
    await supabase.rpc("admin_set_user_admin", { p_user_id: u.id, p_is_admin: !u.is_admin });
    void load();
  }

  async function removeUser(u: UserRow) {
    setMsg(null); setErr(null);
    if (!confirm(`${u.full_name ?? u.email} 사용자를 완전히 삭제할까요?\n계정·프로필·모든 프로젝트 배정이 함께 삭제되며 되돌릴 수 없습니다.`)) return;
    const { error } = await supabase.rpc("admin_delete_user", { p_user_id: u.id });
    if (error) { setErr(`삭제 실패: ${error.message}`); return; }
    setMsg(`${u.full_name ?? u.email} 사용자를 삭제했습니다.`);
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
    void loadMemberships(assign.userId);
  }

  async function changeMembershipRole(id: string, role: MemberRole) {
    setMemberships((p) => p.map((m) => (m.id === id ? { ...m, role } : m)));
    const { error } = await supabase.from("project_members").update({ role }).eq("id", id);
    if (error) { setErr(`역할 변경 실패: ${error.message}`); void loadMemberships(assign.userId); return; }
    setMsg("역할을 변경했습니다.");
  }
  async function removeMembership(id: string, projectName: string) {
    if (!confirm(`이 사용자의 ‘${projectName}’ 배정을 삭제할까요?`)) return;
    const { error } = await supabase.from("project_members").delete().eq("id", id);
    if (error) { setErr(`삭제 실패: ${error.message}`); return; }
    setMsg(`‘${projectName}’ 배정을 삭제했습니다.`);
    void loadMemberships(assign.userId);
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

                {/* 선택 사용자의 현재 배정(중복 포함) — 수정·삭제 */}
                <div className="mt-4">
                  <div className="mb-2 text-[13px] font-bold" style={{ color: "var(--heading)" }}>
                    {(users.find((u) => u.id === assign.userId)?.full_name) ?? "선택 사용자"} 님의 현재 배정 · {memberships.length}건
                  </div>
                  {memberships.length === 0 ? (
                    <p className="text-[13px]" style={{ color: "var(--muted)" }}>아직 배정된 프로젝트가 없습니다. 위에서 배정하세요. (한 사람을 여러 프로젝트에 중복 배정할 수 있습니다.)</p>
                  ) : (
                    <div className="grid-wrap overflow-x-auto">
                      <table className="data-table">
                        <thead><tr><th>프로젝트</th><th style={{ width: 160 }}>역할(권한)</th><th style={{ width: 90 }}>관리</th></tr></thead>
                        <tbody>
                          {memberships.map((m) => (
                            <tr key={m.id}>
                              <td className="font-semibold" style={{ color: "var(--heading)" }}>{m.project_name}</td>
                              <td>
                                {m.role === "owner" ? (
                                  <span className="badge badge-info">{ROLE_LABELS.owner}</span>
                                ) : (
                                  <select className="select input-sm w-36" value={m.role} onChange={(e) => changeMembershipRole(m.id, e.target.value as MemberRole)}>
                                    {ASSIGN_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                                  </select>
                                )}
                              </td>
                              <td>
                                {m.role === "owner"
                                  ? <span className="text-[12px]" style={{ color: "var(--faint)" }}>소유자</span>
                                  : <button onClick={() => removeMembership(m.id, m.project_name)} className="btn btn-danger btn-sm">삭제</button>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <p className="mt-3 text-[12px]" style={{ color: "var(--faint)" }}>배정하려는 사용자는 먼저 회원가입돼 있어야 합니다. 한 사람을 여러 프로젝트에 중복 배정할 수 있고, 위 목록에서 역할 변경·삭제가 가능합니다. (소유자 권한은 각 프로젝트의 <b>멤버</b> 탭에서 관리)</p>
              </div>
            </div>

            {/* 사용자 목록 + 관리자 토글 + 로그인 이력 + 삭제 */}
            <div className="panel">
              <div className="panel-head"><span className="panel-title">전체 사용자 · 시스템 관리자 · 로그인 이력</span><span className="text-[12px]" style={{ color: "var(--faint)" }}>시각: 한국시간(KST)</span></div>
              <div className="grid-wrap overflow-x-auto" style={{ border: "none", borderRadius: 0, boxShadow: "none" }}>
                <table className="data-table">
                  <thead><tr>
                    <th>사용자</th>
                    <th style={{ width: 170 }}>가입일(KST)</th>
                    <th style={{ width: 170 }}>최근 로그인(KST)</th>
                    <th style={{ width: 90 }}>권한</th>
                    <th style={{ width: 80 }}>관리</th>
                  </tr></thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <div className="text-[14px] font-semibold" style={{ color: "var(--heading)" }}>{u.full_name ?? u.email}{u.id === meId && <span className="ml-1 text-[11px]" style={{ color: "var(--faint)" }}>(나)</span>}</div>
                          <div className="text-[12px]" style={{ color: "var(--muted)" }}>{u.email}</div>
                        </td>
                        <td className="num" style={{ color: "var(--muted)" }}>{kst(u.created_at)}</td>
                        <td className="num" style={{ color: u.last_sign_in_at ? "var(--text)" : "var(--faint)" }}>{u.last_sign_in_at ? kst(u.last_sign_in_at) : "로그인 이력 없음"}</td>
                        <td>
                          <button onClick={() => toggle(u)} className="rounded-[4px] px-3 py-1.5 text-[13px] font-semibold"
                            style={u.is_admin ? { background: "var(--accent)", color: "#fff" } : { border: "1px solid var(--border-strong)", color: "var(--text)" }}
                            title="클릭하면 관리자↔일반 전환">
                            {u.is_admin ? "관리자" : "일반"}
                          </button>
                        </td>
                        <td>
                          {u.id === meId
                            ? <span className="text-[12px]" style={{ color: "var(--faint)" }}>본인</span>
                            : <button onClick={() => removeUser(u)} className="btn btn-danger btn-sm">삭제</button>}
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-[14px]" style={{ color: "var(--muted)" }}>사용자가 없습니다.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
