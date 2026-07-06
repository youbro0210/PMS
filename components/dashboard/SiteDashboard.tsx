import type { WorkPackage } from "@/lib/db/types";

interface ProgressRow { actual_progress: number | null; planned_progress: number | null; variance: number | null }
interface BillingRow { latest_period: number | null; cumulative_billed: number | null; contract_amount: number | null; billed_rate: number | null; retention_held: number | null; advance_balance: number | null; net_paid_total: number | null }
interface CostRow { budget_total: number; cost_total: number; execution_rate: number | null }
interface ProcRow { item_count: number; received_count: number; received_rate: number | null; long_lead_count: number; long_lead_overdue: number }

const won = (n: number | null | undefined) =>
  n == null ? "-" : new Intl.NumberFormat("ko-KR").format(n) + "원";

const WORK_STATUS: Record<string, string> = {
  not_started: "미착수", in_progress: "진행 중", completed: "완료", suspended: "중단",
};

/**
 * 수주 프로젝트 대시보드 — 단계 진척 · 대금 · 원가 · 기자재 구매 핵심 지표 + 단계별 진행.
 * 수치는 모두 서버(집계 뷰)에서 전달받는다.
 */
const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  planning: { label: "계획", cls: "badge-neutral" },
  active: { label: "진행", cls: "badge-info" },
  in_progress: { label: "진행", cls: "badge-info" },
  on_hold: { label: "보류", cls: "badge-warn" },
  completed: { label: "완료", cls: "badge-ok" },
  cancelled: { label: "취소", cls: "badge-danger" },
};

function fmtDate(d: string | null) { return d ?? "-"; }
function monthsBetween(a: string | null, b: string | null) {
  if (!a || !b) return null;
  const s = new Date(a).getTime(), e = new Date(b).getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return null;
  return Math.round(((e - s) / (1000 * 60 * 60 * 24 * 30.44)) * 10) / 10;
}
function daysTo(d: string | null) {
  if (!d) return null;
  const t = new Date(d).getTime(); if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / (1000 * 60 * 60 * 24));
}

export function SiteDashboard({
  works,
  progress,
  billing,
  cost,
  procurement,
  contractAmount,
  info,
}: {
  works: WorkPackage[];
  progress: ProgressRow | null;
  billing: BillingRow | null;
  cost: CostRow | null;
  procurement: ProcRow | null;
  contractAmount: number | null;
  info?: {
    name: string; client_name: string | null; end_user: string | null; status: string;
    contract_amount: number | null; start_date: string | null; end_date: string | null;
    delivery_date: string | null; retention_rate: number | null; description: string | null;
  };
}) {
  const end = info?.delivery_date ?? info?.end_date ?? null;
  const dur = monthsBetween(info?.start_date ?? null, end);
  const dday = daysTo(info?.delivery_date ?? info?.end_date ?? null);
  const st = info ? (STATUS_LABEL[info.status] ?? { label: info.status, cls: "badge-neutral" }) : null;
  return (
    <div className="min-h-0 flex-1 space-y-6 p-4 sm:p-6 overflow-visible lg:overflow-y-auto">
      {info && (
        <section className="panel">
          <div className="panel-head">
            <span className="panel-title">수주 정보</span>
            {st && <span className={`badge ${st.cls}`}>{st.label}</span>}
          </div>
          <div className="panel-body grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
            <Info label="발주처" value={info.client_name ?? "미지정"} />
            <Info label="최종 수요처" value={info.end_user ?? "미지정"} />
            <Info label="계약금액" value={won(info.contract_amount)} strong />
            <Info label="실행예산(BAC)" value={won(cost?.budget_total ?? null)} />
            <Info label="착수일" value={fmtDate(info.start_date)} />
            <Info label="납기일" value={fmtDate(info.delivery_date ?? info.end_date)} />
            <Info label="전체 기간" value={dur != null ? `${dur}개월` : "-"} />
            <Info label="납기까지" value={dday == null ? "-" : dday >= 0 ? `D-${dday}` : `D+${-dday} (경과)`}
              valueColor={dday != null && dday < 0 ? "var(--danger)" : undefined} />
            {info.retention_rate != null && <Info label="유보율" value={`${info.retention_rate}%`} />}
          </div>
          {/* 전체 일정 바 */}
          {info.start_date && end && (
            <div className="px-4 pb-4">
              <ScheduleBar start={info.start_date} end={end} />
            </div>
          )}
        </section>
      )}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric label="단계 진척 (실적 / 계획)" value={`${progress?.actual_progress ?? 0}% / ${progress?.planned_progress ?? 0}%`}
          sub={progress?.variance != null ? (progress.variance >= 0 ? `+${progress.variance}%p 선행` : `${progress.variance}%p 지연`) : ""}
          subColor={(progress?.variance ?? 0) >= 0 ? "#5dcaa5" : "#ef4444"} />
        <Metric label="누계 대금률" value={`${billing?.billed_rate ?? 0}%`}
          sub={`${billing?.latest_period ?? 0}회차 · 실수금 ${won(billing?.net_paid_total)}`} />
        <Metric label="기자재 입고율" value={`${procurement?.received_rate ?? 0}%`}
          sub={`${procurement?.received_count ?? 0}/${procurement?.item_count ?? 0}건 · 롱리드 지연 ${procurement?.long_lead_overdue ?? 0}`}
          subColor={(procurement?.long_lead_overdue ?? 0) > 0 ? "#ef4444" : undefined} />
        <Metric label="원가 집행률" value={`${cost?.execution_rate ?? 0}%`}
          sub={`${won(cost?.cost_total)} / ${won(cost?.budget_total)}`} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium">핵심 지표 차트</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <ChartCard title="종합 진척">
            <Gauge value={progress?.actual_progress ?? 0} ref2={progress?.planned_progress ?? 0}
              color={(progress?.variance ?? 0) >= 0 ? "#1d9e75" : "#f59e0b"} caption={`계획 ${progress?.planned_progress ?? 0}%`} />
          </ChartCard>
          <ChartCard title="원가 집행률">
            <Gauge value={cost?.execution_rate ?? 0} color={(cost?.execution_rate ?? 0) > 100 ? "#ef4444" : "var(--accent)"}
              caption={won(cost?.cost_total)} />
          </ChartCard>
          <ChartCard title="기자재 입고율">
            <Gauge value={procurement?.received_rate ?? 0} color={(procurement?.long_lead_overdue ?? 0) > 0 ? "#f59e0b" : "#1d9e75"}
              caption={`${procurement?.received_count ?? 0}/${procurement?.item_count ?? 0}건`} />
          </ChartCard>
          <ChartCard title="누계 대금률">
            <Gauge value={billing?.billed_rate ?? 0} color="#3b4658" caption={`${billing?.latest_period ?? 0}회차`} />
          </ChartCard>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium">단계별 진척</h2>
        <div className="space-y-2">
          {works.length === 0 && <p className="text-sm" style={{ color: "var(--muted)" }}>등록된 공종이 없습니다.</p>}
          {works.map((w) => (
            <div key={w.id} className="rounded-lg border p-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span>
                  {w.code && <span style={{ color: "var(--muted)" }} className="mr-2">{w.code}</span>}
                  {w.name}
                </span>
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  {WORK_STATUS[w.status]} · 가중 {w.weight}%
                </span>
              </div>
              <Bar planned={w.planned_progress} actual={w.actual_progress} />
              <div className="mt-1 flex justify-between text-[11px]" style={{ color: "var(--muted)" }}>
                <span>실적 {w.actual_progress}%</span>
                <span>계획 {w.planned_progress}%</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Info({ label, value, strong, valueColor }: { label: string; value: string; strong?: boolean; valueColor?: string }) {
  return (
    <div>
      <div className="text-[12px]" style={{ color: "var(--muted)" }}>{label}</div>
      <div className={`mt-0.5 leading-tight ${strong ? "text-[15px] font-bold sm:text-[17px]" : "text-[14px] font-semibold sm:text-[15px]"}`} style={{ color: valueColor ?? "var(--heading)", fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}>{value}</div>
    </div>
  );
}

function ScheduleBar({ start, end }: { start: string; end: string }) {
  const s = new Date(start).getTime(), e = new Date(end).getTime(), now = Date.now();
  const span = e - s;
  const frac = span > 0 ? Math.min(1, Math.max(0, (now - s) / span)) : 0;
  const pct = Math.round(frac * 100);
  const before = now < s, after = now > e;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]" style={{ color: "var(--faint)" }}>
        <span>착수 {start}</span>
        <span>납기 {end}</span>
      </div>
      <div className="relative h-2.5 rounded-full" style={{ background: "var(--surface-3)" }}>
        <div className="absolute left-0 top-0 h-2.5 rounded-full" style={{ width: `${pct}%`, background: after ? "var(--danger)" : "var(--accent)" }} />
        {!before && !after && (
          <div className="absolute -top-1 flex flex-col items-center" style={{ left: `calc(${pct}% - 1px)` }}>
            <div style={{ width: 2, height: 18, background: "var(--navy)" }} />
          </div>
        )}
      </div>
      <div className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
        {before ? "착수 전" : after ? "납기 경과" : `일정 경과 ${pct}% · 오늘`}
      </div>
    </div>
  );
}

function Metric({ label, value, sub, subColor }: { label: string; value: string; sub?: string; subColor?: string }) {
  return (
    <div className="min-w-0 rounded-xl p-4" style={{ background: "var(--surface)" }}>
      <div className="text-[12px] sm:text-xs" style={{ color: "var(--muted)" }}>{label}</div>
      <div className="mt-1 text-[18px] font-semibold leading-tight sm:text-2xl" style={{ overflowWrap: "anywhere", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div className="mt-1 text-[11px] sm:text-xs" style={{ color: subColor ?? "var(--muted)", overflowWrap: "anywhere" }}>{sub}</div>}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl p-4" style={{ background: "var(--surface)" }}>
      <div className="mb-2 self-start text-xs" style={{ color: "var(--muted)" }}>{title}</div>
      {children}
    </div>
  );
}

/** 도넛 게이지 — value(%) 진행, ref2=계획 마커(선택) */
function Gauge({ value, ref2, color, caption }: { value: number; ref2?: number; color: string; caption?: string }) {
  const R = 34, C = 2 * Math.PI * R;
  const pct = Math.max(0, Math.min(100, value));
  const off = C * (1 - pct / 100);
  const refAngle = ref2 != null ? (Math.min(100, Math.max(0, ref2)) / 100) * 360 - 90 : null;
  const rx = refAngle != null ? 50 + R * Math.cos((refAngle * Math.PI) / 180) : 0;
  const ry = refAngle != null ? 50 + R * Math.sin((refAngle * Math.PI) / 180) : 0;
  return (
    <svg viewBox="0 0 100 100" className="h-24 w-24">
      <circle cx="50" cy="50" r={R} fill="none" stroke="var(--border)" strokeWidth="9" />
      <circle cx="50" cy="50" r={R} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
        strokeDasharray={C} strokeDashoffset={off} transform="rotate(-90 50 50)" />
      {refAngle != null && <circle cx={rx} cy={ry} r="3" fill="#3b4658" />}
      <text x="50" y="48" textAnchor="middle" fontSize="19" fontWeight="600" fill="var(--text)">{Math.round(pct)}%</text>
      {caption && <text x="50" y="63" textAnchor="middle" fontSize="8" fill="var(--muted)">{caption.length > 14 ? caption.slice(0, 13) + "…" : caption}</text>}
    </svg>
  );
}

function Bar({ planned, actual }: { planned: number; actual: number }) {
  return (
    <div className="relative h-2 w-full rounded-full" style={{ background: "var(--border)" }}>
      <div className="absolute h-2 rounded-full" style={{ width: `${Math.min(100, planned)}%`, background: "#3b4658" }} />
      <div className="absolute h-2 rounded-full" style={{ width: `${Math.min(100, actual)}%`, background: actual >= planned ? "#1d9e75" : "#f59e0b" }} />
    </div>
  );
}
