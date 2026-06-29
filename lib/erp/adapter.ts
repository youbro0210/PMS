/**
 * ERP 연동 — 모듈별 디스패치.
 *
 * 각 모듈(수주/대금/구매/원가/품질)은 erp_module_config에서 독립적으로
 * 연동 방식(none/mock/db/api)·방향·엔드포인트·키를 가진다. 저장 변경분(아웃박스)을
 * 처리할 때, 그 모듈의 설정에 따라 DB-to-DB 또는 API로 보낸다.
 * 규격은 옴니이솔과 합의 후 db/api 구현 TODO를 채운다(docs/ERP_INTEGRATION.md).
 */

export type ErpOp = "create" | "update" | "delete";

export interface ErpSyncInput {
  entity: string;      // 모듈명(project|billing|procurement|cost|inspection)
  entityId: string;
  op: ErpOp;
  payload: Record<string, unknown>;
  externalRef: string; // 멱등성 키
}

export interface ErpSyncResult {
  ok: boolean;
  erpDocNo?: string;
  skipped?: boolean;
  error?: string;
}

export interface ModuleConfig {
  module: string;
  label: string;
  method: "none" | "mock" | "db" | "api";
  direction: "out" | "in" | "both";
  enabled: boolean;
  endpoint: string | null;
  auth_key: string | null;
  field_map?: Record<string, unknown>;
}

/** 모듈 설정에 따라 한 건을 ERP로 보낸다 */
export async function dispatchToErp(
  cfg: ModuleConfig | undefined,
  input: ErpSyncInput,
  fallbackKey?: string | null,
): Promise<ErpSyncResult> {
  // 미설정/미사용/수신전용이면 전송하지 않음(건너뜀)
  if (!cfg || !cfg.enabled || cfg.method === "none" || cfg.direction === "in") {
    return { ok: false, skipped: true };
  }

  switch (cfg.method) {
    case "mock":
      // 테스트: 실제 전송 없이 가짜 문서번호
      return input.op === "delete"
        ? { ok: true }
        : { ok: true, erpDocNo: `MOCK-${input.entity}-${input.entityId.slice(0, 8)}` };

    case "api":
      return apiSend(cfg, input, fallbackKey);

    case "db":
      // 인터페이스(스테이징) 테이블 방식. 온프레미스 ERP면 클라우드에서 직접 접근 불가 →
      // 에이전트/게이트웨이 필요. 옴니이솔 인터페이스 테이블 규격 확정 후 구현.
      return { ok: false, error: `DB 연동 미구현(${cfg.label}): 옴니이솔 인터페이스 테이블 규격 확정 후 작성` };

    default:
      return { ok: false, skipped: true };
  }
}

async function apiSend(cfg: ModuleConfig, input: ErpSyncInput, fallbackKey?: string | null): Promise<ErpSyncResult> {
  const base = cfg.endpoint;
  const key = cfg.auth_key || fallbackKey;
  if (!base) return { ok: false, error: `${cfg.label}: API 엔드포인트(주소) 미설정` };
  if (!key) return { ok: false, error: `${cfg.label}: 인증키 미설정` };

  // TODO(옴니이솔 규격 확정 후): 전표 필드 구성·인증 헤더를 규격에 맞게.
  const res = await fetch(base.replace(/\/$/, ""), {
    method: input.op === "delete" ? "DELETE" : input.op === "create" ? "POST" : "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "Idempotency-Key": input.externalRef,
    },
    body: JSON.stringify({ module: cfg.module, op: input.op, data: input.payload, map: cfg.field_map ?? {} }),
  });
  if (!res.ok) return { ok: false, error: `ERP ${res.status}: ${(await res.text()).slice(0, 300)}` };
  const json = (await res.json().catch(() => ({}))) as { docNo?: string; doc_no?: string };
  return { ok: true, erpDocNo: json.docNo ?? json.doc_no };
}
