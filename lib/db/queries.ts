import { createClient } from "@/lib/supabase/server";

/**
 * 직접 경로 데이터 접근 (Server Component).
 * 모든 호출은 사용자 RLS 컨텍스트에서 실행된다.
 */

export async function getMyProjects() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getProject(projectId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("projects").select("*").eq("id", projectId).single();
  if (error) throw error;
  return data;
}

export async function getWorkPackages(projectId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_packages")
    .select("*")
    .eq("project_id", projectId)
    .order("code", { ascending: true });
  if (error) throw error;
  return data;
}

export async function getProgressSummary(projectId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("project_progress_summary")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  return data;
}

export async function getBillingSummary(projectId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("billing_summary")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  return data;
}

export async function getCostSummary(projectId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cost_summary")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  return data;
}

export async function getProcurementSummary(projectId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("procurement_summary")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  return data;
}

export async function getEvmSummary(projectId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("evm_summary")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  return data;
}

export async function getEvmSnapshots(projectId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("evm_snapshots")
    .select("*")
    .eq("project_id", projectId)
    .order("snapshot_date", { ascending: true });
  return data ?? [];
}

export async function getBomItems(projectId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bom_items")
    .select("*")
    .eq("project_id", projectId)
    .order("item_no", { ascending: true });
  return data ?? [];
}

export async function getResources() {
  const supabase = await createClient();
  const { data } = await supabase.from("resources").select("*").order("is_active", { ascending: false }).order("name");
  return data ?? [];
}

export async function getResourceUtilization() {
  const supabase = await createClient();
  const { data } = await supabase.from("resource_utilization").select("*").order("current_allocation_pct", { ascending: false });
  return data ?? [];
}

export async function getProjectAssignments(projectId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("project_assignments")
    .select("*, resources(employee_no, name, rank, trade, monthly_rate)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function getProjectLaborSummary(projectId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("project_labor_summary").select("*").eq("project_id", projectId).maybeSingle();
  return data;
}

export async function getRisks(projectId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("risk_register")
    .select("*")
    .eq("project_id", projectId)
    .order("score", { ascending: false });
  return data ?? [];
}

export async function getVouchers(projectId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("journal_vouchers")
    .select("*, journal_lines(*)")
    .eq("project_id", projectId)
    .order("voucher_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  return data ?? [];
}

export async function getAccountSummary(projectId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("account_summary")
    .select("*")
    .eq("project_id", projectId);
  return data ?? [];
}

export async function getAccountCodes() {
  const supabase = await createClient();
  const { data } = await supabase.from("account_codes").select("*").order("code");
  return data ?? [];
}
