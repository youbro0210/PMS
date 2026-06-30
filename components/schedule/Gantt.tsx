"use client";

import { useMemo } from "react";
import type { WorkPackage } from "@/lib/db/types";

const DAY = 86400000;

const WORK_STATUS: Record<string, string> = {
  not_started: "미착수", in_progress: "진행 중", completed: "완료", suspended: "중단",
};

function d(v: string | null): number | null {
  if (!v) return null;
  const t = new Date(v + "T00:00:00").getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * 단계별 일정 간트차트 — 계획 구간(planned_start~planned_end) 위에 실적 진척률을 오버레이.
 * 오늘 위치, 월 격자, 지연(실적<계획 시점기준) 색 구분을 한눈에 표시.
 */
export function Gantt({ works }: { works: WorkPackage[] }) {
  const dated = useMemo(
    () => works.filter((w) => d(w.planned_start) != null && d(w.planned_end) != null),
    [works],
  );

  const range = useMemo(() => {
    const starts = dated.map((w) => d(w.planned_start)!);
    const ends = dated.map((w) => d(w.planned_end)!);
    if (starts.length === 0) return null;
    let min = Math.min(...starts);
    let max = Math.max(...ends);
    // 양쪽 여백
    min -= 7 * DAY;
    max += 7 * DAY;
    return { min, max, span: Math.max(max - min, DAY) };
  }, [dated]);

  const months = useMemo(() => {
    if (!range) return [];
    const out: { label: string; left: number }[] = [];
    const cur = new Date(range.min);
    cur.setDate(1);
    while (cur.getTime() <= range.max) {
      const t = cur.getTime();
      if (t >= range.min) out.push({ label: `${cur.getFullYear()}.${String(cur.getMonth() + 1).padStart(2, "0")}`, left: ((t - range.min) / range.span) * 100 });
      cur.setMonth(cur.getMonth() + 1);
    }
    return out;
  }, [range]);

  if (!range) {
    return (
      <p className="rounded-xl border p-6 text-sm" style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--muted)" }}>
        계획 시작일·종료일이 입력된 단계가 없습니다. 단계에 계획 일정을 입력하면 간트차트가 표시됩니다.
      </p>
    );
  }

  const now = Date.now();
  const todayLeft = now >= range.min && now <= range.max ? ((now - range.min) / range.span) * 100 : null;

  return (
    <div className="overflow-x-auto rounded-xl border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <div className="min-w-[720px]">
        {/* 월 헤더 */}
        <div className="relative h-7 border-b" style={{ borderColor: "var(--border)" }}>
          {months.map((m, i) => (
            <div key={i} className="absolute top-0 h-7 border-l pl-1 text-[11px]" style={{ left: `${m.left}%`, borderColor: "var(--border)", color: "var(--muted)" }}>
              {m.label}
            </div>
          ))}
          {todayLeft != null && <div className="absolute top-0 h-7 w-px" style={{ left: `${todayLeft}%`, background: "var(--accent)" }} />}
        </div>

        {/* 행 */}
        <div className="relative">
          {todayLeft != null && <div className="pointer-events-none absolute bottom-0 top-0 w-px" style={{ left: `${todayLeft}%`, background: "var(--accent)", opacity: 0.5 }} />}
          {dated.map((w) => {
            const s = d(w.planned_start)!;
            const e = d(w.planned_end)!;
            const left = ((s - range.min) / range.span) * 100;
            const width = Math.max(((e - s) / range.span) * 100, 0.8);
            // 시점 기준 기대 진척: 오늘이 구간 내면 경과비율, 지났으면 100
            const expected = now <= s ? 0 : now >= e ? 100 : ((now - s) / (e - s)) * 100;
            const behind = w.actual_progress + 0.01 < expected && w.status !== "completed";
            const barColor = w.status === "completed" ? "#1d9e75" : behind ? "#f59e0b" : "var(--accent)";
            return (
              <div key={w.id} className="relative flex items-center border-t" style={{ borderColor: "var(--border)", height: 38 }}>
                <div className="sticky left-0 z-10 w-44 shrink-0 truncate px-3 text-xs" style={{ background: "var(--surface)" }} title={w.name}>
                  {w.code && <span style={{ color: "var(--muted)" }} className="mr-1">{w.code}</span>}
                  {w.name}
                </div>
                <div className="relative flex-1" style={{ height: 38 }}>
                  <div className="absolute top-1/2 -translate-y-1/2 rounded" style={{ left: `${left}%`, width: `${width}%`, height: 16, background: "var(--border)" }} title={`${w.planned_start} ~ ${w.planned_end}`}>
                    <div className="h-full rounded" style={{ width: `${Math.min(100, w.actual_progress)}%`, background: barColor }} />
                    <span className="absolute -right-0 top-1/2 ml-1 -translate-y-1/2 translate-x-full whitespace-nowrap pl-1 text-[10px]" style={{ color: "var(--muted)" }}>
                      {w.actual_progress}% · {WORK_STATUS[w.status]}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-4 border-t px-3 py-2 text-[11px]" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
        <Legend color="var(--accent)" label="정상 진행" />
        <Legend color="#f59e0b" label="지연(시점 대비 미달)" />
        <Legend color="#1d9e75" label="완료" />
        <span>· 세로선 = 오늘</span>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="inline-block h-2 w-4 rounded" style={{ background: color }} /> {label}
    </span>
  );
}
