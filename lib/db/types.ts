/**
 * DB 타입 정의 — 건설 프로젝트 관리(PMS) 도메인.
 *
 * 운영에서는 자동 생성 권장:
 *   npx supabase gen types typescript --project-id <id> > lib/db/types.ts
 *
 * 여기서는 스키마(0001~0003)에 맞춰 손으로 작성한 최소 버전.
 */

export type ProjectStatus =
  | "planning" | "active" | "on_hold" | "completed" | "cancelled";

export type MemberRole =
  | "owner" | "manager" | "developer" | "designer" | "tester" | "viewer";

export type WorkStatus = "not_started" | "in_progress" | "completed" | "suspended";

export type BillingStatus = "draft" | "requested" | "reviewed" | "confirmed" | "paid";

export type CostCategory = "labor" | "material" | "subcontract" | "equipment" | "expense";

export type InspectionType = "safety" | "quality" | "fat";
export type InspectionResult = "pass" | "conditional" | "fail";

export type ProductType =
  | "compressor" | "booster" | "purifier" | "diesel_power"
  | "electric_heater" | "filter_valve" | "module" | "other";

export type ProcurementStatus =
  | "planned" | "ordered" | "in_transit" | "received" | "inspected";

export type AiIntent =
  | "get_progress_summary" | "update_progress"
  | "get_billing_status" | "record_billing"
  | "get_cost_summary" | "log_inspection"
  | "record_procurement" | "get_procurement_status"
  | "search" | "unknown";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  timezone: string;
  is_admin: boolean;
  created_at: string;
}

/** 역할 한글 라벨 (UI 표시용) */
export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "소유자",
  manager: "관리자(PM)",
  developer: "실무 담당",
  designer: "설계",
  tester: "품질/QA",
  viewer: "열람 전용",
};

/** 프로젝트 = 건설 현장 */
export interface Project {
  id: string;
  name: string;                       // 현장명
  description: string | null;
  status: ProjectStatus;
  owner_id: string;
  start_date: string | null;          // 착공일
  end_date: string | null;            // 준공(예정)일
  client_name: string | null;         // 발주처
  contractor_name: string | null;     // 원도급사
  contract_amount: number | null;     // 총 도급액(원)
  contract_no: string | null;
  site_address: string | null;
  construction_type: string | null;   // 건축/토목/플랜트 등
  advance_payment: number;            // 선급금 총액
  advance_recovery_rate: number;      // 선급금 정산율(%)
  retention_rate: number;             // 기성 유보율(%)
  order_no: string | null;            // 수주번호
  product_type: ProductType | null;   // 제품 유형
  end_user: string | null;            // 최종 납품처
  delivery_date: string | null;       // 납기(출하 예정일)
  serial_no: string | null;
  color: string;
  icon: string;
  created_at: string;
  updated_at: string;
}

export interface Subcontractor {
  id: string;
  project_id: string;
  name: string;
  trade: string | null;               // 공종/업종
  business_no: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contract_amount: number | null;
  contract_start: string | null;
  contract_end: string | null;
}

/** 공종 / WBS */
export interface WorkPackage {
  id: string;
  project_id: string;
  parent_id: string | null;
  subcontractor_id: string | null;
  code: string | null;
  name: string;
  weight: number;                     // 전체 대비 비중(%)
  planned_amount: number | null;
  planned_start: string | null;
  planned_end: string | null;
  planned_progress: number;           // 계획 공정률(%)
  actual_progress: number;            // 실적 공정률(%)
  status: WorkStatus;
}

export interface Billing {
  id: string;
  project_id: string;
  subcontractor_id: string | null;    // null=원도급 기성
  period_no: number;                  // 기성 회차
  period_start: string | null;
  period_end: string | null;
  contract_amount: number | null;
  this_amount: number;                // 금회 기성액
  cumulative_amount: number;          // 누계 기성액
  progress_rate: number | null;       // 기성률(%)
  retention_amount: number;           // 금회 유보액
  advance_deduction: number;          // 금회 선급금 정산액
  net_payment: number;                // 실지급액
  status: BillingStatus;
  requested_at: string | null;
  confirmed_at: string | null;
  paid_at: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CostEntry {
  id: string;
  project_id: string;
  work_package_id: string | null;
  subcontractor_id: string | null;
  category: CostCategory;
  description: string | null;
  amount: number;
  entry_date: string;
}

export interface Inspection {
  id: string;
  project_id: string;
  work_package_id: string | null;
  type: InspectionType;
  inspector_id: string | null;
  inspection_date: string;
  location: string | null;
  result: InspectionResult;
  findings: string | null;
  corrective_action: string | null;
  due_date: string | null;
  is_closed: boolean;
}

export interface ProcurementItem {
  id: string;
  project_id: string;
  vendor_id: string | null;
  work_package_id: string | null;
  name: string;
  spec: string | null;
  qty: number;
  unit: string;
  amount: number;
  po_no: string | null;
  order_date: string | null;
  lead_time_weeks: number | null;
  eta: string | null;
  received_date: string | null;
  is_long_lead: boolean;
  status: ProcurementStatus;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  project_id: string | null;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  project_id: string | null;
  actor_id: string | null;
  entity: string;
  action: string;
  summary: string | null;
  created_at: string;
}

export interface AiActionLog {
  id: string;
  user_id: string | null;
  project_id: string | null;
  input_text: string;
  intent: AiIntent;
  tool_called: string | null;
  tool_input: Record<string, unknown> | null;
  tool_result: Record<string, unknown> | null;
  ai_response: string | null;
  success: boolean;
  error_message: string | null;
  latency_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
}

type Insertable<T, Required extends keyof T> =
  Pick<T, Required> & Partial<Omit<T, Required>>;

export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Insertable<Profile, "id" | "email">; Update: Partial<Profile> };
      projects: { Row: Project; Insert: Insertable<Project, "name" | "owner_id">; Update: Partial<Project> };
      subcontractors: { Row: Subcontractor; Insert: Insertable<Subcontractor, "project_id" | "name">; Update: Partial<Subcontractor> };
      work_packages: { Row: WorkPackage; Insert: Insertable<WorkPackage, "project_id" | "name">; Update: Partial<WorkPackage> };
      billings: { Row: Billing; Insert: Insertable<Billing, "project_id" | "period_no">; Update: Partial<Billing> };
      cost_entries: { Row: CostEntry; Insert: Insertable<CostEntry, "project_id" | "category" | "amount">; Update: Partial<CostEntry> };
      inspections: { Row: Inspection; Insert: Insertable<Inspection, "project_id" | "type">; Update: Partial<Inspection> };
      erp_sync_outbox: {
        Row: { id: string; project_id: string | null; entity: string; entity_id: string; op: string; payload: Record<string, unknown> | null; external_ref: string | null; status: string; attempts: number; erp_doc_no: string | null; error: string | null; created_at: string; processed_at: string | null };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      erp_mapping: {
        Row: { id: string; kind: string; pms_id: string; erp_code: string; note: string | null; updated_at: string };
        Insert: { kind: string; pms_id: string; erp_code: string; note?: string | null; updated_at?: string };
        Update: Record<string, unknown>;
      };
      procurement_items: { Row: ProcurementItem; Insert: Insertable<ProcurementItem, "project_id" | "name">; Update: Partial<ProcurementItem> };
      notifications: { Row: Notification; Insert: Insertable<Notification, "user_id" | "type" | "title">; Update: Partial<Notification> };
      activity_log: { Row: ActivityLog; Insert: Insertable<ActivityLog, "entity" | "action">; Update: Partial<ActivityLog> };
      ai_action_logs: { Row: AiActionLog; Insert: Insertable<AiActionLog, "input_text">; Update: Partial<AiActionLog> };
    };
    Views: {
      project_progress_summary: {
        Row: { project_id: string; project_name: string; actual_progress: number | null; planned_progress: number | null; variance: number | null };
      };
      billing_summary: {
        Row: { project_id: string; billing_count: number; latest_period: number | null; cumulative_billed: number | null; contract_amount: number | null; billed_rate: number | null; retention_held: number | null; advance_recovered: number | null; net_paid_total: number | null; advance_balance: number | null };
      };
      cost_summary: {
        Row: { project_id: string; budget_total: number; cost_total: number; remaining: number; execution_rate: number | null };
      };
      cost_by_category: {
        Row: { project_id: string; category: CostCategory; total: number };
      };
      procurement_summary: {
        Row: { project_id: string; item_count: number; received_count: number; long_lead_count: number; long_lead_overdue: number; received_rate: number | null; procurement_total: number | null };
      };
    };
    Functions: {
      create_project: {
        Args: {
          p_name: string;
          p_construction_type?: string | null;
          p_client_name?: string | null;
          p_contractor_name?: string | null;
          p_contract_no?: string | null;
          p_contract_amount?: number | null;
          p_start_date?: string | null;
          p_end_date?: string | null;
          p_site_address?: string | null;
          p_advance_payment?: number | null;
          p_advance_recovery_rate?: number | null;
          p_retention_rate?: number | null;
          p_description?: string | null;
          p_icon?: string | null;
          p_order_no?: string | null;
          p_product_type?: string | null;
          p_end_user?: string | null;
          p_delivery_date?: string | null;
        };
        Returns: string; // 생성된 project id
      };
      seed_standard_works: {
        Args: { p_project_id: string };
        Returns: number;
      };
      seed_standard_phases: {
        Args: { p_project_id: string };
        Returns: number;
      };
      find_user_by_email: {
        Args: { p_email: string };
        Returns: { id: string; email: string; full_name: string | null }[];
      };
      add_project_member: {
        Args: { p_project_id: string; p_email: string; p_role?: MemberRole };
        Returns: string;
      };
      admin_list_users: {
        Args: Record<string, never>;
        Returns: { id: string; email: string; full_name: string | null; is_admin: boolean; created_at: string }[];
      };
      admin_set_user_admin: {
        Args: { p_user_id: string; p_is_admin: boolean };
        Returns: undefined;
      };
    };
  };
}
