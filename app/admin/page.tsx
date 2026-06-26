"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SiteHeader } from "@/components/layout/SiteHeader";

interface UserRow { id: string; email: string; full_name: string | null; is_admin: boolean; created_at: string }

/** 시스템 관리자 페이지 — 전체 사용자 목록 + 관리자 권한 토글 */
export default function AdminPage() {
  const supabase = createClient();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("admin_list_users");
    if (error) { setAllowed(false); return; }
    setAllowed(true);
    setUsers((data as UserRow[]) ?? []);
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  async function toggle(u: UserRow) {
    await supabase.rpc("admin_set_user_admin", { p_user_id: u.id, p_is_admin: !u.is_admin });
    void load();
  }

  return (
    <main>
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-6 text-xl font-semibold" style={{ color: "var(--navy)" }}>시스템 관리 · 사용자</h1>

        {allowed === false && <p className="text-sm" style={{ color: "var(--muted)" }}>시스템 관리자만 접근할 수 있습니다.</p>}

        {allowed && (
          <div className="overflow-hidden rounded-xl border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between border-b px-4 py-3 last:border-b-0" style={{ borderColor: "var(--border)" }}>
                <div>
                  <div className="text-sm font-medium">{u.full_name ?? u.email}</div>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>{u.email} · 가입 {u.created_at?.slice(0, 10)}</div>
                </div>
                <button
                  onClick={() => toggle(u)}
                  className="rounded-md px-3 py-1 text-xs font-medium"
                  style={u.is_admin
                    ? { background: "var(--accent)", color: "#fff" }
                    : { border: "1px solid var(--border)", color: "var(--text)" }}
                >
                  {u.is_admin ? "관리자" : "일반"}
                </button>
              </div>
            ))}
            {users.length === 0 && <p className="px-4 py-6 text-sm" style={{ color: "var(--muted)" }}>사용자가 없습니다.</p>}
          </div>
        )}
      </div>
    </main>
  );
}
