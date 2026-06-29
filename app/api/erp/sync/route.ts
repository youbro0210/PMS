import { NextResponse, type NextRequest } from "next/server";
import { processErpOutbox } from "@/lib/erp/sync";
import { createClient } from "@/lib/supabase/server";

/** 호출자가 시스템 관리자이거나 크론 시크릿을 가졌는지 */
async function authorized(request: NextRequest): Promise<boolean> {
  const secret = process.env.ERP_SYNC_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth === `Bearer ${secret}`) return true; // Vercel Cron / 운영 트리거

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  return Boolean(data?.is_admin); // 관리자 세션(설정 화면 버튼)
}

/** GET: 연동 상태(어댑터·큐 건수) */
export async function GET(request: NextRequest) {
  if (!(await authorized(request))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = await createClient();
  const { data } = await supabase.from("erp_sync_outbox").select("status");
  const counts: Record<string, number> = { pending: 0, sent: 0, confirmed: 0, failed: 0, skipped: 0 };
  for (const r of data ?? []) counts[(r as { status: string }).status] = (counts[(r as { status: string }).status] ?? 0) + 1;
  return NextResponse.json({ adapter: process.env.ERP_ADAPTER ?? "mock", counts });
}

/** POST: 아웃박스의 미처리 변경분을 ERP로 전송 */
export async function POST(request: NextRequest) {
  if (!(await authorized(request))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await processErpOutbox();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
