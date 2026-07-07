"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Notification } from "@/lib/db/types";

interface Alert { key: string; text: string; severity: "warn" | "danger" }

/** 헤더 알림 벨 — 저장된 알림 + 납기/롱리드 임박(계산) */
export function NotificationBell() {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Notification[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: n } = await supabase
      .from("notifications").select("*")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(20);
    setNotes((n as Notification[]) ?? []);

    // 임박 알림 계산 (RLS 적용된 기본 테이블 조회)
    const soon = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const todayStr = new Date().toISOString().slice(0, 10);
    const [{ data: projs }, { data: procs }] = await Promise.all([
      supabase.from("projects").select("id, name, delivery_date, status").not("delivery_date", "is", null).lte("delivery_date", soon),
      supabase.from("procurement_items").select("name, eta, status, is_long_lead, project_id").eq("is_long_lead", true).not("status", "in", "(received,inspected)"),
    ]);
    const a: Alert[] = [];
    (projs ?? []).forEach((p) => {
      if (p.status === "completed" || p.status === "cancelled") return;
      const overdue = (p.delivery_date as string) < todayStr;
      a.push({ key: "d" + p.id, severity: overdue ? "danger" : "warn", text: `납기 ${overdue ? "초과" : "임박"} · ${p.name} (${p.delivery_date})` });
    });
    (procs ?? []).forEach((p, i) => {
      if (!p.eta) return;
      const overdue = (p.eta as string) < todayStr;
      if (overdue || (p.eta as string) <= soon)
        a.push({ key: "l" + i, severity: overdue ? "danger" : "warn", text: `롱리드 ${overdue ? "지연" : "임박"} · ${p.name} (ETA ${p.eta})` });
    });
    setAlerts(a);
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  const unread = notes.filter((n) => !n.is_read).length;
  const total = unread + alerts.length;

  async function markAllRead() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    void load();
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative rounded-[4px] border px-2.5 py-1 text-[12px] font-medium" style={{ borderColor: "rgba(255,255,255,.24)", color: "rgba(255,255,255,.9)" }}>
        알림
        {total > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium text-white" style={{ background: "var(--danger, #d93a3a)" }}>
            {total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-[6px] border shadow-lg" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between border-b px-3 py-2 text-sm font-medium" style={{ borderColor: "var(--border)", color: "var(--navy)" }}>
            알림
            {unread > 0 && <button onClick={markAllRead} className="text-xs" style={{ color: "var(--accent)" }}>모두 읽음</button>}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {alerts.map((a) => (
              <div key={a.key} className="border-b px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
                <span style={{ color: a.severity === "danger" ? "var(--danger, #d93a3a)" : "var(--warn, #e09017)" }}>● </span>{a.text}
              </div>
            ))}
            {notes.map((n) => (
              <a key={n.id} href={n.link ?? "#"} className="block border-b px-3 py-2 last:border-b-0" style={{ borderColor: "var(--border)", background: n.is_read ? "transparent" : "var(--accent-soft)" }}>
                <div className="text-sm font-medium">{n.title}</div>
                {n.body && <div className="text-xs" style={{ color: "var(--muted)" }}>{n.body}</div>}
              </a>
            ))}
            {total === 0 && notes.length === 0 && <p className="px-3 py-6 text-center text-sm" style={{ color: "var(--muted)" }}>새 알림이 없습니다.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
