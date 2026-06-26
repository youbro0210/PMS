import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { runCommand } from "@/lib/ai/orchestrator";

const Body = z.object({
  projectId: z.string().uuid(),
  text: z.string().min(1).max(2000),
  confirmed: z.boolean().optional(),
});

/**
 * POST /api/ai/command
 * 자연어 명령 처리 엔드포인트.
 * 사용자 세션(RLS)으로 DB를 조작하므로 권한이 안전하게 강제된다.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", detail: parsed.error.flatten() }, { status: 400 });
  }
  const { projectId, text, confirmed } = parsed.data;

  // 프로젝트 컨텍스트 로드 (RLS가 멤버가 아니면 막아줌)
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", projectId)
    .single();
  if (projErr || !project) {
    return NextResponse.json({ error: "project_not_found_or_forbidden" }, { status: 403 });
  }

  // 현장 컨텍스트: 공종·협력사 목록 (RLS로 멤버 현장만 조회됨)
  const [{ data: workRows }, { data: subRows }] = await Promise.all([
    supabase.from("work_packages").select("name").eq("project_id", projectId),
    supabase.from("subcontractors").select("name").eq("project_id", projectId),
  ]);

  const result = await runCommand({
    db: supabase,
    userId: user.id,
    projectId,
    projectName: project.name,
    works: (workRows ?? []).map((w) => w.name),
    subcontractors: (subRows ?? []).map((s) => s.name),
    text,
    confirmed,
  });

  return NextResponse.json(result);
}
