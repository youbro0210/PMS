import { createAdminClient } from "@/lib/supabase/admin";
import { getErpAdapter, type ErpEntity, type ErpOp } from "@/lib/erp/adapter";

/**
 * 아웃박스 처리 루프.
 * erp_sync_outbox 의 pending 건을 어댑터로 전송하고 상태/문서번호를 갱신한다.
 * 멱등성: external_ref를 어댑터에 전달(중복 전표 방지).
 * RLS와 무관한 시스템 작업이므로 service_role(admin) 사용.
 */
export async function processErpOutbox(limit = 50) {
  const db = createAdminClient();
  const adapter = getErpAdapter();

  const { data: rows, error } = await db
    .from("erp_sync_outbox")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  if (!rows || rows.length === 0) return { processed: 0, adapter: adapter.name };

  let ok = 0, failed = 0, skipped = 0;

  for (const r of rows as ErpOutboxRow[]) {
    const result = await adapter.send({
      entity: r.entity as ErpEntity,
      entityId: r.entity_id,
      op: r.op as ErpOp,
      payload: r.payload ?? {},
      externalRef: r.external_ref ?? `${r.entity}:${r.entity_id}:${r.op}`,
    });

    const patch: Record<string, unknown> = {
      attempts: r.attempts + 1,
      processed_at: new Date().toISOString(),
    };
    if (result.skipped) { patch.status = "skipped"; skipped++; }
    else if (result.ok) {
      patch.status = "confirmed";
      patch.erp_doc_no = result.erpDocNo ?? null;
      patch.error = null;
      ok++;
      // 원본 레코드에 문서번호 역기록 (billing/procurement/project)
      if (result.erpDocNo && ["billing", "procurement", "project"].includes(r.entity)) {
        const table = r.entity === "billing" ? "billings" : r.entity === "procurement" ? "procurement_items" : "projects";
        await db.from(table).update({ erp_doc_no: result.erpDocNo, erp_synced_at: new Date().toISOString() }).eq("id", r.entity_id);
      }
    } else { patch.status = "failed"; patch.error = result.error ?? "unknown"; failed++; }

    await db.from("erp_sync_outbox").update(patch).eq("id", r.id);
  }

  return { processed: rows.length, ok, failed, skipped, adapter: adapter.name };
}

interface ErpOutboxRow {
  id: string;
  entity: string;
  entity_id: string;
  op: string;
  payload: Record<string, unknown> | null;
  external_ref: string | null;
  attempts: number;
}
