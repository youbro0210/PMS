"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { ProjectNav } from "@/components/layout/ProjectNav";
import { ROLE_LABELS, type MemberRole } from "@/lib/db/types";

interface Row {
  id: string;
  role: MemberRole;
  user_id: string;
  profiles: { full_name: string | null; email: string } | null;
}

const ROLES: MemberRole[] = ["owner", "manager", "developer", "designer", "tester", "viewer"];

export default function MembersPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();
  const [projectName, setProjectName] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [myRole, setMyRole] = useState<MemberRole | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("developer");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canManage = myRole === "owner" || myRole === "manager";

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const [{ data }, { data: proj }] = await Promise.all([
      supabase.from("project_members").select("id, role, user_id, profiles(full_name, email)").eq("project_id", id),
      supabase.from("projects").select("name").eq("id", id).maybeSingle(),
    ]);
    const list = (data as unknown as Row[]) ?? [];
    setRows(list);
    setMyRole(list.find((r) => r.user_id === user?.id)?.role ?? null);
    setProjectName(proj?.name ?? "");
  }, [supabase, id]);

  async function deleteProject() {
    setErr(null);
    if (confirmName.trim() !== projectName.trim()) { setErr("삭제하려면 프로젝트명을 정확히 입력하세요."); return; }
    setDeleting(true);
    const { error } = await supabase.rpc("admin_delete_project", { p_project_id: id });
    setDeleting(false);
    if (error) { setErr(error.message); return; }
    router.push("/");
  }

  useEffect(() => { void load(); }, [load]);

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null); setErr(null);
    const { error } = await supabase.rpc("add_project_member", { p_project_id: id, p_email: email, p_role: role });
    if (error) { setErr(error.message); return; }
    setEmail(""); setMsg("멤버를 추가했습니다.");
    void load();
  }

  async function changeRole(rowId: string, newRole: MemberRole) {
    await supabase.from("project_members").update({ role: newRole }).eq("id", rowId);
    void load();
  }

  async function remove(rowId: string) {
    await supabase.from("project_members").delete().eq("id", rowId);
    void load();
  }

  const input = "rounded-md border bg-transparent px-3 py-2 text-sm";
  const style = { borderColor: "var(--border)" };

  return (
    <main>
      <SiteHeader />
      <ProjectNav projectId={id} />
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold" style={{ color: "var(--navy)" }}>멤버 · 권한 관리</h1>
          <Link href={`/projects/${id}/board`} className="text-sm" style={{ color: "var(--accent)" }}>← 대시보드</Link>
        </div>

        {canManage && (
          <form onSubmit={addMember} className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium">이메일로 멤버 추가</label>
              <input className={`${input} w-full`} style={style} type="email" placeholder="가입된 사용자의 이메일" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <select className={input} style={style} value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
              {ROLES.filter((r) => r !== "owner").map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
            <button type="submit" className="rounded-md px-4 py-2 text-sm font-medium text-white" style={{ background: "var(--accent)" }}>추가</button>
          </form>
        )}
        {msg && <p className="mb-3 text-sm" style={{ color: "var(--ok, #1d9e75)" }}>{msg}</p>}
        {err && <p className="mb-3 text-sm text-red-500">{err}</p>}

        <div className="overflow-hidden rounded-xl border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between border-b px-4 py-3 last:border-b-0" style={{ borderColor: "var(--border)" }}>
              <div>
                <div className="text-sm font-medium">{r.profiles?.full_name ?? r.profiles?.email}</div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>{r.profiles?.email}</div>
              </div>
              <div className="flex items-center gap-3">
                {canManage && r.role !== "owner" ? (
                  <select className="rounded-md border bg-transparent px-2 py-1 text-xs" style={style} value={r.role} onChange={(e) => changeRole(r.id, e.target.value as MemberRole)}>
                    {ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
                  </select>
                ) : (
                  <span className="rounded px-2 py-0.5 text-xs" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>{ROLE_LABELS[r.role]}</span>
                )}
                {canManage && r.role !== "owner" && (
                  <button onClick={() => remove(r.id)} className="text-xs text-red-500">삭제</button>
                )}
              </div>
            </div>
          ))}
          {rows.length === 0 && <p className="px-4 py-6 text-sm" style={{ color: "var(--muted)" }}>멤버가 없습니다.</p>}
        </div>

        {!canManage && <p className="mt-4 text-xs" style={{ color: "var(--muted)" }}>멤버 추가·역할 변경은 소유자/관리자(PM)만 가능합니다.</p>}

        {(myRole === "owner") && (
          <div className="mt-10 rounded-xl border p-4" style={{ borderColor: "#ef4444", background: "var(--surface)" }}>
            <h2 className="text-sm font-semibold" style={{ color: "#ef4444" }}>위험구역 · 프로젝트 삭제</h2>
            <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
              이 프로젝트와 관련된 모든 데이터(단계·기성·원가·구매·BOM·회계·리스크 등)가 함께 영구 삭제됩니다. 되돌릴 수 없습니다.
              삭제하려면 아래에 프로젝트명 <b>{projectName}</b> 을 정확히 입력하세요.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input className={`${input}`} style={style} placeholder="프로젝트명 입력" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
              <button onClick={deleteProject} disabled={deleting || confirmName.trim() !== projectName.trim()} className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-40" style={{ background: "#ef4444" }}>
                {deleting ? "삭제 중…" : "프로젝트 영구 삭제"}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
