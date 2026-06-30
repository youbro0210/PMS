"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { EvmSummary, EvmSnapshot, WorkPackage } from "@/lib/db/types";

const won = (n: number | null | undefined) =>
  n == null ? "-" : new Intl.NumberFormat("ko-KR").format(Math.round(n)) + "원";
const eok = (n: number) => (n / 1e8).toFixed(n >= 1e8 ? 1 : 2);

const DAY = 86400000;
const dnum = (v: string | null) => {
  if (!v) return null;
  const t = new Date(v + "T00:00:00").getTime();
  return Number.isNaN(t) ? null : t;
};

/**
 * EVM 성과분석 화면 — 지표 카드 + S-curve.
 * 지표값은 DB(evm_summary)에서 산출된 값을 그대로 표시한다.
 */
export function EvmView({
  projectId, summary, snapshots, works,
}: {
  projectId: string;
  summary: EvmSummary | null;
  snapshots: EvmSnapshot[];
  works: WorkPackage[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function snapshot() {
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("capture_evm_snapshot", { p_project_id: projectId });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    router.refresh();
  }

  const s = summary;
  const bac = s?.bac ?? 0;

  // 계획 S-curve(PV 누계): 단계별 계획금액(없으면 weight×BAC)을 계획구간에 선형 배분
  const plannedCurve = useMemo(() => buildPlannedCurve(works, bac), [works, bac]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          BAC(완료시점예산) {won(bac)} · 실행예산·진척·원가 기준 자동 산출
        </p>
        <button onClick={snapshot} disabled={busy} className="rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>
          {busy ? "기록 중…" : "오늘 스냅샷 기록"}
        </button>
      </div>
      {err && <p className="text-sm text-red-500">{err}</p>}

      {/* 핵심 지표 */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label="PV 계획가치" value={won(s?.pv)} sub={`계획 ${s?.planned_pct ?? 0}%`} />
        <Card label="EV 획득가치" value={won(s?.ev)} sub={`실적 ${s?.actual_pct ?? 0}%`} />
        <Card label="AC 실제원가" value={won(s?.ac)} sub="원가 집행 누계" />
        <Card label="BAC 총예산" value={won(bac)} sub="실행예산 합계" />
        <Card label="CPI 원가효율" value={s?.cpi != null ? s.cpi.toFixed(2) : "-"}
          sub={cpiNote(s?.cpi)} color={idxColor(s?.cpi)} />
        <Card label="SPI 일정효율" value={s?.spi != null ? s.spi.toFixed(2) : "-"}
          sub={spiNote(s?.spi)} color={idxColor(s?.spi)} />
        <Card label="EAC 완료예상원가" value={won(s?.eac)} sub={`잔여 ETC ${won(s?.etc)}`} />
        <Card label="VAC 완료차이" value={won(s?.vac)}
          sub={(s?.vac ?? 0) >= 0 ? "예산 내 예상" : "예산 초과 예상"} color={(s?.vac ?? 0) >= 0 ? "#1d9e75" : "#ef4444"} />
      </section>

      {/* 차이 요약 */}
      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="text-xs" style={{ color: "var(--muted)" }}>SV 일정차이 (EV−PV)</div>
          <div className="mt-1 text-lg font-semibold" style={{ color: (s?.sv ?? 0) >= 0 ? "#1d9e75" : "#ef4444" }}>
            {(s?.sv ?? 0) >= 0 ? "+" : ""}{won(s?.sv)} {(s?.sv ?? 0) >= 0 ? "선행" : "지연"}
          </div>
        </div>
        <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="text-xs" style={{ color: "var(--muted)" }}>CV 원가차이 (EV−AC)</div>
          <div className="mt-1 text-lg font-semibold" style={{ color: (s?.cv ?? 0) >= 0 ? "#1d9e75" : "#ef4444" }}>
            {(s?.cv ?? 0) >= 0 ? "+" : ""}{won(s?.cv)} {(s?.cv ?? 0) >= 0 ? "절감" : "초과"}
          </div>
        </div>
      </section>

      {/* S-curve */}
      <section>
        <h2 className="mb-2 text-sm font-medium">S-curve · 계획(PV) 대비 획득(EV)·실제원가(AC)</h2>
        <SCurve plannedCurve={plannedCurve} snapshots={snapshots} summary={s} />
        <p className="mt-2 text-[11px]" style={{ color: "var(--muted)" }}>
          EV·AC 추세선은 &ldquo;오늘 스냅샷 기록&rdquo;을 눌러 시점별로 적재됩니다. 스냅샷이 쌓일수록 추세가 정밀해집니다.
        </p>
      </section>
    </div>
  );
}

function Card({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--surface)" }}>
      <div className="text-xs" style={{ color: "var(--muted)" }}>{label}</div>
      <div className="mt-1 text-xl font-semibold" style={{ color }}>{value}</div>
      {sub && <div className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>{sub}</div>}
    </div>
  );
}

function idxColor(v: number | null | undefined) {
  if (v == null) return undefined;
  return v >= 1 ? "#1d9e75" : v >= 0.9 ? "#f59e0b" : "#ef4444";
}
function cpiNote(v: number | null | undefined) {
  if (v == null) return "원가 데이터 없음";
  return v >= 1 ? "예산 대비 효율적" : "예산 초과 진행";
}
function spiNote(v: number | null | undefined) {
  if (v == null) return "계획 데이터 없음";
  return v >= 1 ? "일정 선행/정상" : "일정 지연";
}

interface CurvePoint { t: number; v: number }

function buildPlannedCurve(works: WorkPackage[], bac: number): CurvePoint[] {
  const items = works
    .map((w) => ({ s: dnum(w.planned_start), e: dnum(w.planned_end), amt: w.planned_amount ?? (bac > 0 ? (w.weight / 100) * bac : 0) }))
    .filter((x) => x.s != null && x.e != null && x.e! >= x.s!) as { s: number; e: number; amt: number }[];
  if (items.length === 0) return [];
  const min = Math.min(...items.map((x) => x.s));
  const max = Math.max(...items.map((x) => x.e));
  // 월 경계마다 누적 계획가치 계산
  const points: CurvePoint[] = [];
  const cur = new Date(min); cur.setDate(1);
  const end = new Date(max);
  const bounds: number[] = [min];
  while (cur.getTime() <= end.getTime()) {
    if (cur.getTime() > min) bounds.push(cur.getTime());
    cur.setMonth(cur.getMonth() + 1);
  }
  bounds.push(max);
  for (const t of bounds) {
    let acc = 0;
    for (const it of items) {
      if (t <= it.s) continue;
      if (t >= it.e) { acc += it.amt; continue; }
      acc += it.amt * ((t - it.s) / (it.e - it.s));
    }
    points.push({ t, v: acc });
  }
  return points;
}

function SCurve({ plannedCurve, snapshots, summary }: { plannedCurve: CurvePoint[]; snapshots: EvmSnapshot[]; summary: EvmSummary | null }) {
  const W = 820, H = 340, PL = 56, PR = 16, PT = 14, PB = 34;

  const evPts: CurvePoint[] = snapshots.map((s) => ({ t: dnum(s.snapshot_date)!, v: Number(s.ev) })).filter((p) => p.t);
  const acPts: CurvePoint[] = snapshots.map((s) => ({ t: dnum(s.snapshot_date)!, v: Number(s.ac) })).filter((p) => p.t);
  // 스냅샷이 없으면 현재 요약값을 오늘 점으로 표시
  if (evPts.length === 0 && summary) { evPts.push({ t: Date.now(), v: summary.ev }); acPts.push({ t: Date.now(), v: summary.ac }); }

  const allT = [...plannedCurve, ...evPts, ...acPts].map((p) => p.t);
  const allV = [...plannedCurve, ...evPts, ...acPts].map((p) => p.v);
  if (allT.length === 0) {
    return <p className="rounded-xl border p-6 text-sm" style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--muted)" }}>계획 일정·예산 데이터가 없어 S-curve를 그릴 수 없습니다.</p>;
  }
  const minT = Math.min(...allT), maxT = Math.max(...allT, Date.now());
  const spanT = Math.max(maxT - minT, DAY);
  const maxV = Math.max(...allV, summary?.bac ?? 0, 1);

  const x = (t: number) => PL + ((t - minT) / spanT) * (W - PL - PR);
  const y = (v: number) => H - PB - (v / maxV) * (H - PT - PB);

  const line = (pts: CurvePoint[]) => pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");

  // y 격자(4구간)
  const yticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ v: maxV * f, yy: y(maxV * f) }));
  // 월 x 격자
  const xticks: { label: string; xx: number }[] = [];
  const cur = new Date(minT); cur.setDate(1);
  while (cur.getTime() <= maxT) {
    if (cur.getTime() >= minT) xticks.push({ label: `${String(cur.getFullYear()).slice(2)}.${String(cur.getMonth() + 1).padStart(2, "0")}`, xx: x(cur.getTime()) });
    cur.setMonth(cur.getMonth() + 1);
  }
  const todayX = Date.now() >= minT && Date.now() <= maxT ? x(Date.now()) : null;

  return (
    <div className="overflow-x-auto rounded-xl border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 560 }}>
        {yticks.map((t, i) => (
          <g key={i}>
            <line x1={PL} y1={t.yy} x2={W - PR} y2={t.yy} stroke="var(--border)" strokeWidth="1" />
            <text x={PL - 6} y={t.yy + 3} textAnchor="end" fontSize="10" fill="var(--muted)">{eok(t.v)}억</text>
          </g>
        ))}
        {xticks.map((t, i) => (
          <text key={i} x={t.xx} y={H - PB + 14} textAnchor="middle" fontSize="10" fill="var(--muted)">{t.label}</text>
        ))}
        {todayX != null && (
          <>
            <line x1={todayX} y1={PT} x2={todayX} y2={H - PB} stroke="var(--accent)" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
            <text x={todayX} y={PT + 8} textAnchor="middle" fontSize="9" fill="var(--accent)">오늘</text>
          </>
        )}

        {plannedCurve.length > 0 && <path d={line(plannedCurve)} fill="none" stroke="#3b4658" strokeWidth="2" />}
        {acPts.length > 0 && <path d={line(acPts)} fill="none" stroke="#ef4444" strokeWidth="2" />}
        {evPts.length > 0 && <path d={line(evPts)} fill="none" stroke="#1d9e75" strokeWidth="2" />}
        {evPts.map((p, i) => <circle key={`e${i}`} cx={x(p.t)} cy={y(p.v)} r="3" fill="#1d9e75" />)}
        {acPts.map((p, i) => <circle key={`a${i}`} cx={x(p.t)} cy={y(p.v)} r="3" fill="#ef4444" />)}
      </svg>
      <div className="flex flex-wrap gap-4 border-t px-3 py-2 text-[11px]" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
        <Legend color="#3b4658" label="PV 계획가치" />
        <Legend color="#1d9e75" label="EV 획득가치" />
        <Legend color="#ef4444" label="AC 실제원가" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded" style={{ background: color }} /> {label}</span>;
}
