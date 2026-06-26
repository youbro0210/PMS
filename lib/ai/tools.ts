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
    description: "현장의 공정률 현황(계획 대비 실적, 지연 공종)을 조회한다.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "update_progress",
    description: "특정 공종의 실적 공정률을 갱신한다. work_query로 공종을 지정.",
    input_schema: {
      type: "object",
      properties: {
        work_query: { type: "string", description: "공정률을 갱신할 공종에 대한 자연어 설명(예: 철근콘크리트)" },
        actual_progress: { type: "number", description: "실적 공정률(%) 0~100" },
        note: { type: "string", description: "비고(선택)" },
      },
      required: ["work_query", "actual_progress"],
    },
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
  search: "search",
};
