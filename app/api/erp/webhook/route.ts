import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/erp/webhook
 * ERP(또는 옴니이솔 미들웨어)가 마스터/전표 상태 변경을 PMS로 통지하는 인바운드.
 * 보호: X-Erp-Signature 헤더를 ERP_WEBHOOK_SECRET 으로 검증.
 *
 * 페이로드 규격은 옴니이솔과 합의 후 확정. 예시 처리:
 *   - kind=mapping : erp_mapping 갱신(거래처/품목/계정 코드)
 *   - kind=doc_status : 전표 상태 회신(문서번호→원본 erp_doc_no 등)
 */
export async function POST(request: NextRequest) {
  const secret = process.env.ERP_WEBHOOK_SECRET;
  const sig = request.headers.get("x-erp-signature");
  if (!secret || sig !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { kind?: string; items?: { pms_id: string; erp_code: string; map_kind: string }[]; entity?: string; entity_id?: string; erp_doc_no?: string }
    | null;
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const db = createAdminClient();

  try {
    if (body.kind === "mapping" && Array.isArray(body.items)) {
      // 마스터 코드 매핑 일괄 upsert
      for (const it of body.items) {
        await db.from("erp_mapping").upsert(
          { kind: it.map_kind, pms_id: it.pms_id, erp_code: it.erp_code, updated_at: new Date().toISOString() },
          { onConflict: "kind,pms_id" },
        );
      }
      return NextResponse.json({ ok: true, upserted: body.items.length });
    }

    if (body.kind === "doc_status" && body.entity && body.entity_id) {
      const table = body.entity === "billing" ? "billings" : body.entity === "procurement" ? "procurement_items" : "projects";
      await db.from(table).update({ erp_doc_no: body.erp_doc_no ?? null, erp_synced_at: new Date().toISOString() }).eq("id", body.entity_id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true, note: "no handler for kind" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
