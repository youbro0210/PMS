import { NextResponse, type NextRequest } from "next/server";
import { processErpOutbox } from "@/lib/erp/sync";

/**
 * POST /api/erp/sync
 * 아웃박스의 미처리 변경분을 ERP로 전송한다.
 * 보호: Authorization: Bearer <ERP_SYNC_SECRET> (Vercel Cron 또는 운영 트리거용).
 */
export async function POST(request: NextRequest) {
  const secret = process.env.ERP_SYNC_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await processErpOutbox();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
