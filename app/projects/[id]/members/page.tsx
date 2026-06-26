"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { SiteHeader } from "@/components/layout/SiteHeader";
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
  const supabase = createClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [myRole, setMyRole] = useState<MemberRole | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("developer");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canManage = myRole === "owner" || myRole === "manager";

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase
      .from("project_members")
      .select("id, role, user_id, profiles(full_name, email)")
      .eq("project_id", id);
    const list = (data as unknown as Row[]) ?? [];
    setRows(list);
    setMyRole(list.find((r) => r.user_id === user?.id)?.role ?? null);
  }, [supabase, id]);

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
      </div>
    </main>
  );
}
