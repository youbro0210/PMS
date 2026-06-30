import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MemberRole } from "@/lib/db/types";

type DB = SupabaseClient<Database>;

/**
 * Tool executor — Claude가 결정한 건설 명령을 실제 실행한다.
 *
 * 설계 원칙:
 *  - LLM 파라미터를 신뢰하지 않고 권한·소속을 매번 재검증한다.
 *  - 모든 DB 접근은 사용자 RLS 클라이언트(db)로 → RLS가 마지막 방어선.
 *  - 엔티티(공종/협력사) 해소가 모호하면 실행 대신 되묻는다.
 *  - 조회성 수치는 집계 뷰에서 가져온다(LLM 환각 방지).
 */

export interface ExecutorContext {
  db: DB;
  userId: string;
  projectId: string;
  confirmed?: boolean;
}

export type ExecutorResult =
  | { ok: true; data: Record<string, unknown>; message: string }
  | { ok: false; reason: "needs_clarification" | "needs_confirmation" | "not_found" | "forbidden" | "error"; message: string; candidates?: unknown[] };

async function getRole(ctx: ExecutorContext): Promise<MemberRole | null> {
  const { data } = await ctx.db
    .from("project_members")
    .select("role")
    .eq("project_id", ctx.projectId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  return (data?.role as MemberRole) ?? null;
}

async function requireEditor(ctx: ExecutorContext): Promise<ExecutorResult | null> {
  const role = await getRole(ctx);
  if (!role || role === "viewer") {
    return { ok: false, reason: "forbidden", message: "이 작업을 수행할 권한이 없습니다." };
  }
  return null;
}

/** 자연어 → 공종(work_package) 해소. trgm 유사도 기반(공종 수는 적당). */
async function resolveWork(
  ctx: ExecutorContext,
  query: string,
): Promise<{ ok: true; id: string; name: string } | { ok: false; result: ExecutorResult }> {
  const { data } = await ctx.db
    .from("work_packages")
    .select("id, name")
    .eq("project_id", ctx.projectId);

  if (!data || data.length === 0) {
    return { ok: false, result: { ok: false, reason: "not_found", message: "등록된 공종이 없습니다." } };
  }
  const q = query.toLowerCase();
  const matches = data.filter((w) => w.name.toLowerCase().includes(q) || q.includes(w.name.toLowerCase()));
  if (matches.length === 0) {
    return { ok: false, result: { ok: false, reason: "not_found", message: `"${query}"에 해당하는 공종을 찾지 못했습니다.` } };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      result: {
        ok: false,
        reason: "needs_clarification",
        message: "어떤 공종인지 확인이 필요합니다. 아래에서 선택해 주세요.",
        candidates: matches.map((w) => ({ id: w.id, title: w.name })),
      },
    };
  }
  return { ok: true, id: matches[0].id, name: matches[0].name };
}

async function resolveSub(ctx: ExecutorContext, name: string): Promise<{ id: string; name: string } | null> {
  const { data } = await ctx.db
    .from("subcontractors")
    .select("id, name")
    .eq("project_id", ctx.projectId);
  if (!data) return null;
  const q = name.toLowerCase();
  const m = data.find((s) => s.name.toLowerCase().includes(q) || q.includes(s.name.toLowerCase()));
  return m ?? null;
}

// ── 라우팅 ───────────────────────────────────────────
type ToolInput = Record<string, unknown>;

export async function executeTool(name: string, input: ToolInput, ctx: ExecutorContext): Promise<ExecutorResult> {
  switch (name) {
    case "get_progress_summary": return getProgressSummary(ctx);
    case "update_progress": return updateProgress(input, ctx);
    case "get_billing_status": return getBillingStatus(ctx);
    case "record_billing": return recordBilling(input, ctx);
    case "get_cost_summary": return getCostSummary(ctx);
    case "log_inspection": return logInspection(input, ctx);
    case "record_procurement": return recordProcurement(input, ctx);
    case "get_procurement_status": return getProcurementStatus(ctx);
    case "get_evm_summary": return getEvmSummary(ctx);
    case "search": return search(input, ctx);
    default: return { ok: false, reason: "error", message: `알 수 없는 도구: ${name}` };
  }
}

async function getProgressSummary(ctx: ExecutorContext): Promise<ExecutorResult> {
  const { data, error } = await ctx.db
    .from("project_progress_summary")
    .select("*")
    .eq("project_id", ctx.projectId)
    .single();
  if (error) return { ok: false, reason: "error", message: error.message };

  const { data: delayed } = await ctx.db
    .from("work_packages")
    .select("name, planned_progress, actual_progress")
    .eq("project_id", ctx.projectId);
  const behind = (delayed ?? []).filter((w) => w.actual_progress < w.planned_progress);

  return { ok: true, data: { summary: data, delayed: behind }, message: "공정 현황을 조회했습니다." };
}

async function updateProgress(input: ToolInput, ctx: ExecutorContext): Promise<ExecutorResult> {
  const denied = await requireEditor(ctx);
  if (denied) return denied;

  const resolved = await resolveWork(ctx, input.work_query as string);
  if (!resolved.ok) return resolved.result;

  const rate = Math.max(0, Math.min(100, Number(input.actual_progress)));
  const status = rate >= 100 ? "completed" : rate > 0 ? "in_progress" : "not_started";

  const { error: upErr } = await ctx.db
    .from("work_packages")
    .update({ actual_progress: rate, status })
    .eq("id", resolved.id);
  if (upErr) return { ok: false, reason: "error", message: upErr.message };

  // 실적 이력 적재
  await ctx.db.from("progress_records").insert({
    project_id: ctx.projectId,
    work_package_id: resolved.id,
    actual_rate: rate,
    note: (input.note as string) ?? null,
    recorded_by: ctx.userId,
  } as never);

  return { ok: true, data: { work: resolved.name, actual_progress: rate }, message: `'${resolved.name}' 공정률을 ${rate}%로 갱신했습니다.` };
}

async function getBillingStatus(ctx: ExecutorContext): Promise<ExecutorResult> {
  const { data, error } = await ctx.db
    .from("billing_summary")
    .select("*")
    .eq("project_id", ctx.projectId)
    .maybeSingle();
  if (error) return { ok: false, reason: "error", message: error.message };
  return { ok: true, data: { billing: data ?? { billing_count: 0 } }, message: "기성 현황을 조회했습니다." };
}

async function recordBilling(input: ToolInput, ctx: ExecutorContext): Promise<ExecutorResult> {
  const denied = await requireEditor(ctx);
  if (denied) return denied;

  let subId: string | null = null;
  if (typeof input.subcontractor_name === "string") {
    const s = await resolveSub(ctx, input.subcontractor_name);
    if (!s) return { ok: false, reason: "needs_clarification", message: `'${input.subcontractor_name}' 협력사를 찾지 못했습니다.` };
    subId = s.id;
  }

  // 직전 회차 누계 조회 → 새 회차/누계 산정
  const { data: prev } = await ctx.db
    .from("billings")
    .select("period_no, cumulative_amount, contract_amount")
    .eq("project_id", ctx.projectId)
    .is("subcontractor_id", subId as never)
    .order("period_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  const thisAmount = Number(input.this_amount);
  const periodNo = (prev?.period_no ?? 0) + 1;
  const cumulative = (prev?.cumulative_amount ?? 0) + thisAmount;

  // 계약 조건: 도급액·유보율·선급금 정산율 (원도급 기준)
  const { data: proj } = await ctx.db
    .from("projects")
    .select("contract_amount, retention_rate, advance_recovery_rate")
    .eq("id", ctx.projectId)
    .single();

  const contractAmount = prev?.contract_amount ?? proj?.contract_amount ?? null;
  const progressRate = contractAmount ? Math.round((cumulative / contractAmount) * 10000) / 100 : null;

  // 유보·선급금 정산 산정 (협력사 기성에는 미적용)
  const retentionRate = subId == null ? Number(proj?.retention_rate ?? 0) : 0;
  const advanceRate = subId == null ? Number(proj?.advance_recovery_rate ?? 0) : 0;
  const retention = Math.round((thisAmount * retentionRate) / 100);
  const advanceDeduction = Math.round((thisAmount * advanceRate) / 100);
  const net = thisAmount - retention - advanceDeduction;

  const { data, error } = await ctx.db
    .from("billings")
    .insert({
      project_id: ctx.projectId,
      subcontractor_id: subId,
      period_no: periodNo,
      this_amount: thisAmount,
      cumulative_amount: cumulative,
      contract_amount: contractAmount,
      progress_rate: progressRate,
      retention_amount: retention,
      advance_deduction: advanceDeduction,
      net_payment: net,
      period_end: (input.period_end as string) ?? null,
      status: "requested",
      requested_at: new Date().toISOString(),
      created_by: ctx.userId,
    } as never)
    .select()
    .single();
  if (error) return { ok: false, reason: "error", message: error.message };

  const fmt = (n: number) => n.toLocaleString("ko-KR");
  const detail = retention || advanceDeduction
    ? ` 유보 ${fmt(retention)}원·선급금정산 ${fmt(advanceDeduction)}원 차감 → 실지급 ${fmt(net)}원.`
    : "";
  return {
    ok: true,
    data: { billing: data },
    message: `${periodNo}회차 기성 ${fmt(thisAmount)}원을 등록했습니다. 누계 ${fmt(cumulative)}원${progressRate != null ? ` (기성률 ${progressRate}%)` : ""}.${detail}`,
  };
}

async function getCostSummary(ctx: ExecutorContext): Promise<ExecutorResult> {
  const [{ data: summary }, { data: byCat }] = await Promise.all([
    ctx.db.from("cost_summary").select("*").eq("project_id", ctx.projectId).maybeSingle(),
    ctx.db.from("cost_by_category").select("*").eq("project_id", ctx.projectId),
  ]);
  return { ok: true, data: { summary, by_category: byCat ?? [] }, message: "원가 현황을 조회했습니다." };
}

async function logInspection(input: ToolInput, ctx: ExecutorContext): Promise<ExecutorResult> {
  const denied = await requireEditor(ctx);
  if (denied) return denied;

  const { data, error } = await ctx.db
    .from("inspections")
    .insert({
      project_id: ctx.projectId,
      type: input.type as "safety" | "quality",
      result: (input.result as "pass" | "conditional" | "fail") ?? "pass",
      location: (input.location as string) ?? null,
      findings: (input.findings as string) ?? null,
      inspector_id: ctx.userId,
      is_closed: (input.result ?? "pass") === "pass",
    } as never)
    .select()
    .single();
  if (error) return { ok: false, reason: "error", message: error.message };

  const label = input.type === "safety" ? "안전" : "품질";
  return { ok: true, data: { inspection: data }, message: `${label} 점검 결과를 기록했습니다.` };
}

async function recordProcurement(input: ToolInput, ctx: ExecutorContext): Promise<ExecutorResult> {
  const denied = await requireEditor(ctx);
  if (denied) return denied;

  let vendorId: string | null = null;
  if (typeof input.vendor_name === "string") {
    const v = await resolveSub(ctx, input.vendor_name);
    vendorId = v?.id ?? null;
  }

  const status = (input.status as string) ?? "ordered";
  const lead = input.lead_time_weeks != null ? Number(input.lead_time_weeks) : null;
  const eta = lead != null ? new Date(Date.now() + lead * 7 * 86400000).toISOString().slice(0, 10) : null;

  const { data, error } = await ctx.db
    .from("procurement_items")
    .insert({
      project_id: ctx.projectId,
      vendor_id: vendorId,
      name: input.name as string,
      amount: input.amount != null ? Number(input.amount) : 0,
      lead_time_weeks: lead,
      eta,
      is_long_lead: Boolean(input.is_long_lead),
      status: status as "planned" | "ordered" | "in_transit" | "received" | "inspected",
      order_date: status === "ordered" ? new Date().toISOString().slice(0, 10) : null,
      received_date: status === "received" || status === "inspected" ? new Date().toISOString().slice(0, 10) : null,
      created_by: ctx.userId,
    } as never)
    .select()
    .single();
  if (error) return { ok: false, reason: "error", message: error.message };

  return {
    ok: true,
    data: { item: data },
    message: `기자재 '${input.name}'을(를) 등록했습니다.${eta ? ` 입고예정 ${eta}.` : ""}${input.is_long_lead ? " (롱리드 임계경로)" : ""}`,
  };
}

async function getProcurementStatus(ctx: ExecutorContext): Promise<ExecutorResult> {
  const { data, error } = await ctx.db
    .from("procurement_summary")
    .select("*")
    .eq("project_id", ctx.projectId)
    .maybeSingle();
  if (error) return { ok: false, reason: "error", message: error.message };

  const { data: overdue } = await ctx.db
    .from("procurement_items")
    .select("name, eta, status")
    .eq("project_id", ctx.projectId)
    .eq("is_long_lead", true)
    .not("status", "in", "(received,inspected)");

  return { ok: true, data: { summary: data ?? { item_count: 0 }, long_lead: overdue ?? [] }, message: "기자재 구매 현황을 조회했습니다." };
}

async function getEvmSummary(ctx: ExecutorContext): Promise<ExecutorResult> {
  const { data, error } = await ctx.db
    .from("evm_summary")
    .select("*")
    .eq("project_id", ctx.projectId)
    .maybeSingle();
  if (error) return { ok: false, reason: "error", message: error.message };
  if (!data) return { ok: true, data: { evm: null }, message: "EVM 데이터가 없습니다." };

  const fmt = (n: number | null | undefined) => (n == null ? "-" : Math.round(n).toLocaleString("ko-KR") + "원");
  const cpi = data.cpi, spi = data.spi;
  const note = `CPI ${cpi != null ? cpi.toFixed(2) : "-"}(${(cpi ?? 0) >= 1 ? "원가효율 양호" : "원가초과"}) · SPI ${spi != null ? spi.toFixed(2) : "-"}(${(spi ?? 0) >= 1 ? "일정 정상/선행" : "일정지연"}) · EAC ${fmt(data.eac)} · VAC ${fmt(data.vac)}(${(data.vac ?? 0) >= 0 ? "예산 내" : "초과 예상"})`;
  return { ok: true, data: { evm: data }, message: `EVM 성과: PV ${fmt(data.pv)}, EV ${fmt(data.ev)}, AC ${fmt(data.ac)}. ${note}` };
}

async function search(input: ToolInput, ctx: ExecutorContext): Promise<ExecutorResult> {
  const q = (input.query as string).toLowerCase();
  const [{ data: works }, { data: subs }] = await Promise.all([
    ctx.db.from("work_packages").select("id, name, actual_progress").eq("project_id", ctx.projectId),
    ctx.db.from("subcontractors").select("id, name, trade").eq("project_id", ctx.projectId),
  ]);
  const w = (works ?? []).filter((x) => x.name.toLowerCase().includes(q));
  const s = (subs ?? []).filter((x) => x.name.toLowerCase().includes(q) || (x.trade ?? "").toLowerCase().includes(q));
  return { ok: true, data: { works: w, subcontractors: s }, message: `공종 ${w.length}건, 협력사 ${s.length}건을 찾았습니다.` };
}
