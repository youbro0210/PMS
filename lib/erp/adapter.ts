/**
 * ERP 연동 어댑터.
 *
 * 더존 ERP-iU 연동은 회사·옴니이솔 합의에 따라 ① 인터페이스(스테이징) 테이블,
 * ② 에이전트, ③ 커스텀 REST 중 하나로 진행된다(docs/ERP_INTEGRATION.md).
 * PMS 코드는 그 방식과 무관하게 동작하도록 어댑터 인터페이스로 추상화한다.
 *
 * 환경변수 ERP_ADAPTER 로 구현체를 선택: mock | staging | rest
 */

export type ErpEntity = "billing" | "procurement" | "project";
export type ErpOp = "create" | "update" | "delete";

export interface ErpSyncInput {
  entity: ErpEntity;
  entityId: string;
  op: ErpOp;
  payload: Record<string, unknown>;
  externalRef: string; // 멱등성 키
}

export interface ErpSyncResult {
  ok: boolean;
  /** ERP가 생성/갱신한 전표·문서번호 */
  erpDocNo?: string;
  /** 처리하지 않고 건너뜀(예: 마감기간) */
  skipped?: boolean;
  error?: string;
}

export interface ErpConfig {
  adapter: string;        // mock | staging | rest
  baseUrl?: string | null;
  apiKey?: string | null;
  enabled?: boolean;
}

export interface ErpAdapter {
  name: string;
  send(input: ErpSyncInput): Promise<ErpSyncResult>;
}

/** 개발/미연동용 — 실제 전송 없이 성공 처리하고 가짜 문서번호 회신 */
class MockAdapter implements ErpAdapter {
  name = "mock";
  async send(input: ErpSyncInput): Promise<ErpSyncResult> {
    if (input.op === "delete") return { ok: true };
    return { ok: true, erpDocNo: `MOCK-${input.entity}-${input.entityId.slice(0, 8)}` };
  }
}

/**
 * 인터페이스(스테이징) 테이블 방식 스켈레톤.
 * 옴니이솔이 ERP DB에 약속한 연동 테이블을 둔 경우, 여기서 그 테이블에 적재한다.
 * (온프레미스 ERP면 클라우드에서 직접 접근 불가 → 에이전트 경유. 망 구성 합의 필요)
 */
class StagingAdapter implements ErpAdapter {
  name = "staging";
  async send(input: ErpSyncInput): Promise<ErpSyncResult> {
    // TODO(옴니이솔 합의 후): ERP 연동 테이블 스키마에 맞춰 INSERT.
    //   - 전표 종류·계정·거래처/품목 코드는 erp_mapping에서 해소
    //   - external_ref로 멱등성 보장(중복 전표 방지)
    return { ok: false, error: "staging 어댑터 미구현: 옴니이솔 인터페이스 규격 확정 후 작성" };
  }
}

/**
 * 커스텀 REST 방식 스켈레톤.
 * 옴니이솔이 ERP 위에 REST 게이트웨이를 제공하는 경우(클라우드 PMS에 권장).
 */
class RestAdapter implements ErpAdapter {
  name = "rest";
  private cfg: ErpConfig;
  constructor(cfg: ErpConfig) { this.cfg = cfg; }
  async send(input: ErpSyncInput): Promise<ErpSyncResult> {
    const base = this.cfg.baseUrl || process.env.ERP_BASE_URL;
    const key = this.cfg.apiKey || process.env.ERP_API_KEY;
    if (!base || !key) return { ok: false, error: "ERP 주소/키 미설정(설정 화면에서 입력)" };

    // TODO(옴니이솔 규격 확정 후): 엔드포인트·바디·인증 헤더를 규격에 맞게.
    const res = await fetch(`${base.replace(/\/$/, "")}/${input.entity}`, {
      method: input.op === "delete" ? "DELETE" : input.op === "create" ? "POST" : "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "Idempotency-Key": input.externalRef, // 멱등성
      },
      body: JSON.stringify(input.payload),
    });
    if (!res.ok) return { ok: false, error: `ERP ${res.status}: ${(await res.text()).slice(0, 300)}` };
    const json = (await res.json().catch(() => ({}))) as { docNo?: string; doc_no?: string };
    return { ok: true, erpDocNo: json.docNo ?? json.doc_no };
  }
}

/** DB 설정(erp_config)을 우선 적용해 어댑터를 생성. 없으면 환경변수 폴백. */
export function getErpAdapter(cfg?: ErpConfig): ErpAdapter {
  const mode = cfg?.adapter ?? process.env.ERP_ADAPTER ?? "mock";
  switch (mode) {
    case "staging": return new StagingAdapter();
    case "rest": return new RestAdapter(cfg ?? { adapter: "rest" });
    default: return new MockAdapter();
  }
}
