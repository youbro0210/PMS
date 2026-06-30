import type Anthropic from "@anthropic-ai/sdk";

/**
 * Claude tool 카탈로그 — 건설 현장 관리 명령.
 * 스키마의 ai_intent ENUM(0003 확장)과 대응한다.
 *
 * 규약:
 *  - 공종/협력사는 자연어(query/name)로 받고 실제 식별은 서버 executor가 한다.
 *  - 수치 조회(공정률/기성/원가)는 DB 집계 뷰에서 가져온다(환각 방지).
 */
export const tools: Anthropic.Tool[] = [
  {
    name: "get_progress_summary",
    description: "수주 프로젝트의 단계별 진척 현황(계획 대비 실적, 지연 단계)과 각 단계의 계획 일정(시작일 planned_start·완료예정일 planned_end)을 조회한다. 설계·제작 등 특정 단계의 일정·시작일·완료예정일 질문에도 이 도구를 사용한다.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "update_progress",
    description: "특정 단계(설계·구매·제작·FAT 등)의 실적 진척률을 갱신한다. work_query로 단계를 지정.",
    input_schema: {
      type: "object",
      properties: {
        work_query: { type: "string", description: "진척을 갱신할 단계에 대한 자연어 설명(예: 상세설계, 제작)" },
        actual_progress: { type: "number", description: "실적 진척률(%) 0~100" },
        note: { type: "string", description: "비고(선택)" },
      },
      required: ["work_query", "actual_progress"],
    },
  },
  {
    name: "record_procurement",
    description: "기자재 발주/입고를 기록한다. 롱리드 수입품(예: NEA 압축기 본체) 납기 추적에 사용.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "품목명(예: NEA 다이어프램 압축기 본체)" },
        vendor_name: { type: "string", description: "공급사(선택)" },
        amount: { type: "number", description: "발주 금액(원, 선택)" },
        lead_time_weeks: { type: "number", description: "리드타임(주, 선택)" },
        status: { type: "string", enum: ["planned", "ordered", "in_transit", "received", "inspected"] },
        is_long_lead: { type: "boolean", description: "롱리드(임계경로) 품목 여부" },
      },
      required: ["name"],
    },
  },
  {
    name: "get_procurement_status",
    description: "기자재 입고율과 롱리드 품목 지연 현황을 조회한다.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_billing_status",
    description: "현장 기성 현황(누계 기성률, 최근 회차, 지급액)을 조회한다.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "record_billing",
    description: "새 회차 기성을 등록한다(원도급 또는 협력사 하도급 기성).",
    input_schema: {
      type: "object",
      properties: {
        subcontractor_name: { type: "string", description: "협력사명(생략 시 발주처 대상 원도급 기성)" },
        this_amount: { type: "number", description: "금회 기성금액(원)" },
        period_end: { type: "string", description: "기성 기준일 YYYY-MM-DD(선택)" },
      },
      required: ["this_amount"],
    },
  },
  {
    name: "get_cost_summary",
    description: "실행예산 대비 원가 집행 현황(집행률, 원가분류별 집행액)을 조회한다.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "log_inspection",
    description: "안전/품질 점검 결과와 지적사항을 기록한다.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["safety", "quality"], description: "안전 또는 품질" },
        location: { type: "string", description: "점검 위치/공종" },
        result: { type: "string", enum: ["pass", "conditional", "fail"], description: "합격/조건부/불합격" },
        findings: { type: "string", description: "지적 사항(선택)" },
      },
      required: ["type", "result"],
    },
  },
  {
    name: "get_accounting_summary",
    description: "회계 전표·분개·증빙과 계정별 잔액(시산표), 기성·수금 회계 내역을 조회한다. '회계전표', '분개', '증빙', '계정 잔액', '시산표', '외상매출금/현금/공사매출 잔액', '회계 세부내역' 질문에 사용. 이 시스템 자체가 회계 전표를 보유하므로 외부 재무·회계 시스템으로 안내하지 말 것.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_evm_summary",
    description: "EVM 성과분석(PV/EV/AC, CPI 원가효율, SPI 일정효율, EAC 완료시점 예상원가, VAC 예산차이)을 조회한다. '성과', '원가효율', 'EVM', '완료 예상비용', 'SPI/CPI' 질문에 사용.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "search",
    description: "공종 또는 협력사를 키워드로 검색한다.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "검색어" } },
      required: ["query"],
    },
  },
];

/** tool name → ai_intent ENUM 매핑(로그용) */
export const TOOL_TO_INTENT: Record<string, string> = {
  get_progress_summary: "get_progress_summary",
  update_progress: "update_progress",
  get_billing_status: "get_billing_status",
  record_billing: "record_billing",
  get_cost_summary: "get_cost_summary",
  log_inspection: "log_inspection",
  record_procurement: "record_procurement",
  get_procurement_status: "get_procurement_status",
  get_evm_summary: "get_evm_summary",
  get_accounting_summary: "get_accounting_summary",
  search: "search",
};
