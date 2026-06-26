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
