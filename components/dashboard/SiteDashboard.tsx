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
export function SiteDashboard({
  works,
  progress,
  billing,
  cost,
  procurement,
  contractAmount,
}: {
  works: WorkPackage[];
  progress: ProgressRow | null;
  billing: BillingRow | null;
  cost: CostRow | null;
  procurement: ProcRow | null;
  contractAmount: number | null;
}) {
  return (
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
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

function Metric({ label, value, sub, subColor }: { label: string; value: string; sub?: string; subColor?: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--surface)" }}>
      <div className="text-xs" style={{ color: "var(--muted)" }}>{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-1 text-xs" style={{ color: subColor ?? "var(--muted)" }}>{sub}</div>}
    </div>
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
