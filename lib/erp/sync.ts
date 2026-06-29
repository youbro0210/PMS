import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchToErp, type ErpOp, type ModuleConfig } from "@/lib/erp/adapter";

/**
 * 아웃박스 처리 루프 — 모듈별 설정에 따라 각 변경분을 ERP로 보낸다.
 * 각 outbox 행의 entity(모듈)에 해당하는 erp_module_config를 찾아 디스패치.
 * RLS와 무관한 시스템 작업이므로 service_role(admin) 사용.
 */
export async function processErpOutbox(limit = 50) {
  const db = createAdminClient();

  // 모듈별 설정 로드
  const { data: mods } = await db.from("erp_module_config").select("*");
  const moduleMap = new Map<string, ModuleConfig>();
  for (const m of (mods ?? []) as ModuleConfig[]) moduleMap.set(m.module, m);

  // 전역 폴백 키(erp_config)
  const { data: gcfg } = await db.from("erp_config").select("api_key").eq("id", 1).maybeSingle();
  const fallbackKey = (gcfg?.api_key as string | null) ?? null;

  const { data: rows, error } = await db
    .from("erp_sync_outbox")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  if (!rows || rows.length === 0) return { processed: 0 };

  let ok = 0, failed = 0, skipped = 0;

  for (const r of rows as ErpOutboxRow[]) {
    const cfg = moduleMap.get(r.entity);
    const result = await dispatchToErp(
      cfg,
      {
        entity: r.entity,
        entityId: r.entity_id,
        op: r.op as ErpOp,
        payload: r.payload ?? {},
        externalRef: r.external_ref ?? `${r.entity}:${r.entity_id}:${r.op}`,
      },
      fallbackKey,
    );

    const patch: Record<string, unknown> = { attempts: r.attempts + 1, processed_at: new Date().toISOString() };
    if (result.skipped) { patch.status = "skipped"; skipped++; }
    else if (result.ok) {
      patch.status = "confirmed";
      patch.erp_doc_no = result.erpDocNo ?? null;
      patch.error = null;
      ok++;
      if (result.erpDocNo && ["billing", "procurement", "project"].includes(r.entity)) {
        const table = r.entity === "billing" ? "billings" : r.entity === "procurement" ? "procurement_items" : "projects";
        await db.from(table).update({ erp_doc_no: result.erpDocNo, erp_synced_at: new Date().toISOString() }).eq("id", r.entity_id);
      }
    } else { patch.status = "failed"; patch.error = result.error ?? "unknown"; failed++; }

    await db.from("erp_sync_outbox").update(patch).eq("id", r.id);
  }

  return { processed: rows.length, ok, failed, skipped };
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
