-- ============================================================
-- 0006: 수주형 제조(ETO) 도메인 — MnSi(압축기·모듈 패키지) 맞춤
--   수소·가스 압축기 패키지, 디젤/마린 모듈 등 수주 프로젝트 관리
--   설계→구매→제작→FAT→출하→시운전 단계, 롱리드 기자재 추적, 마일스톤 대금
--   0005 이후 실행
-- ============================================================

-- ------------------------------------------------------------
-- A. ENUM
-- ------------------------------------------------------------
-- 제품 유형 (MnSi 라인업)
create type product_type as enum (
  'compressor',     -- 압축기 유닛(수소·가스)
  'booster',        -- 부스터 유닛
  'purifier',       -- 퓨리파이어 유닛
  'diesel_power',   -- 디젤 발전 유닛
  'electric_heater',-- 전기 히터
  'filter_valve',   -- 필터·특수밸브
  'module',         -- 마린/오프쇼어/파워 모듈
  'other'
);

-- 구매(기자재) 상태
create type procurement_status as enum (
  'planned',     -- 발주 예정
  'ordered',     -- 발주(PO)
  'in_transit',  -- 운송 중
  'received',    -- 입고
  'inspected'    -- 입고검사 완료
);

-- 점검 유형에 FAT(공장수락시험) 추가
alter type inspection_type add value if not exists 'fat';

-- AI 의도 확장
alter type ai_intent add value if not exists 'record_procurement';
alter type ai_intent add value if not exists 'get_procurement_status';


-- ------------------------------------------------------------
-- B. projects 확장 — 프로젝트 = 수주 건
-- ------------------------------------------------------------
alter table public.projects
  add column if not exists order_no       text,            -- 수주번호
  add column if not exists product_type   product_type,    -- 제품 유형
  add column if not exists end_user        text,           -- 최종 납품처(예: ○○ 수소충전소)
  add column if not exists delivery_date   date,           -- 납기(출하 예정일)
  add column if not exists serial_no       text;           -- 제품 시리얼/패키지 번호

comment on column public.projects.end_user is '최종 사용처(충전소/선사/발전소 등)';
comment on column public.projects.delivery_date is '계약 납기(출하 예정일)';


-- ------------------------------------------------------------
-- C. 기자재 구매(BOM/Procurement) — ETO 핵심: 롱리드 수입품 납기 추적
--    (예: 독일 NEA 압축기 본체는 리드타임이 길어 전체 일정의 임계경로)
-- ------------------------------------------------------------
create table public.procurement_items (
  id               uuid primary key default uuid_generate_v4(),
  project_id       uuid not null references public.projects(id) on delete cascade,
  vendor_id        uuid references public.subcontractors(id) on delete set null,  -- 공급사(협력사 재사용)
  work_package_id  uuid references public.work_packages(id) on delete set null,   -- 관련 단계

  name             text not null,                 -- 품목명(예: NEA 다이어프램 압축기 본체)
  spec             text,                          -- 사양
  qty              numeric(12, 2) default 1,
  unit             text default 'EA',
  amount           numeric(16, 0) default 0,      -- 발주 금액

  po_no            text,                          -- 발주번호(PO)
  order_date       date,                          -- 발주일
  lead_time_weeks  int,                           -- 리드타임(주)
  eta              date,                          -- 입고 예정일
  received_date    date,                          -- 실제 입고일
  is_long_lead     boolean default false,         -- 롱리드(임계경로) 품목
  status           procurement_status not null default 'planned',

  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);
comment on table public.procurement_items is '기자재 구매/입고 추적(롱리드 수입품 임계경로 관리)';

create index idx_proc_project on public.procurement_items(project_id);
create index idx_proc_vendor on public.procurement_items(vendor_id);
create index idx_proc_longlead on public.procurement_items(project_id) where is_long_lead = true;

create trigger trg_proc_updated_at before update on public.procurement_items
  for each row execute function public.handle_updated_at();


-- ------------------------------------------------------------
-- D. RLS — 멤버 조회, viewer 제외 변경
-- ------------------------------------------------------------
alter table public.procurement_items enable row level security;

create policy "구매 조회" on public.procurement_items for select
  using (public.is_project_member(project_id));
create policy "구매 생성" on public.procurement_items for insert
  with check (public.get_project_role(project_id) not in ('viewer'));
create policy "구매 수정" on public.procurement_items for update
  using (public.get_project_role(project_id) not in ('viewer'));
create policy "구매 삭제" on public.procurement_items for delete
  using (public.get_project_role(project_id) in ('owner', 'manager'));


-- ------------------------------------------------------------
-- E. 구매 현황 뷰 (입고율·롱리드 지연 위험)
-- ------------------------------------------------------------
create or replace view public.procurement_summary as
select
  pi.project_id,
  count(*)                                                          as item_count,
  count(*) filter (where pi.status in ('received', 'inspected'))    as received_count,
  count(*) filter (where pi.is_long_lead)                           as long_lead_count,
  count(*) filter (
    where pi.is_long_lead
      and pi.status not in ('received', 'inspected')
      and pi.eta < current_date
  )                                                                 as long_lead_overdue,
  round(
    count(*) filter (where pi.status in ('received', 'inspected'))::numeric
    / nullif(count(*), 0) * 100, 1
  )                                                                 as received_rate,
  sum(pi.amount)                                                    as procurement_total
from public.procurement_items pi
group by pi.project_id;
comment on view public.procurement_summary is '기자재 입고율·롱리드 지연 현황';


-- ------------------------------------------------------------
-- F. 표준 ETO 단계(Phase) 시드 — 공종 대신 수주 제조 단계
--    work_packages를 단계로 사용(가중치 합 100)
-- ------------------------------------------------------------
create or replace function public.seed_standard_phases(p_project_id uuid)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare v_count int;
begin
  insert into public.work_packages (project_id, code, name, weight, planned_progress, actual_progress, status)
  values
    (p_project_id, 'P1', '수주/계약',        5,  0, 0, 'not_started'),
    (p_project_id, 'P2', '기본·상세설계',     20, 0, 0, 'not_started'),
    (p_project_id, 'P3', '구매/자재조달',     15, 0, 0, 'not_started'),
    (p_project_id, 'P4', '제작/가공',        25, 0, 0, 'not_started'),
    (p_project_id, 'P5', '조립/패키징',       15, 0, 0, 'not_started'),
    (p_project_id, 'P6', 'FAT(공장시험)',     10, 0, 0, 'not_started'),
    (p_project_id, 'P7', '출하/납품',         5,  0, 0, 'not_started'),
    (p_project_id, 'P8', '설치/시운전',       5,  0, 0, 'not_started');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
grant execute on function public.seed_standard_phases to authenticated;
comment on function public.seed_standard_phases is '수주 제조 표준 단계 8종 생성(설계→구매→제작→FAT→출하→시운전)';


-- ------------------------------------------------------------
-- G. create_project 확장 — 제품유형·납품처·납기·수주번호 포함
-- ------------------------------------------------------------
create or replace function public.create_project(
  p_name                  text,
  p_construction_type     text    default null,   -- (호환) 사업부문/구분
  p_client_name           text    default null,   -- 발주처/고객
  p_contractor_name       text    default null,
  p_contract_no           text    default null,
  p_contract_amount       numeric default null,
  p_start_date            date    default null,
  p_end_date              date    default null,
  p_site_address          text    default null,
  p_advance_payment       numeric default 0,
  p_advance_recovery_rate numeric default 0,
  p_retention_rate        numeric default 0,
  p_description           text    default null,
  p_icon                  text    default '🏭',
  p_order_no              text    default null,
  p_product_type          text    default null,
  p_end_user              text    default null,
  p_delivery_date         date    default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id  uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception '인증되지 않은 요청입니다.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception '프로젝트명은 필수입니다.'; end if;

  insert into public.projects (
    name, construction_type, client_name, contractor_name, contract_no,
    contract_amount, start_date, end_date, site_address,
    advance_payment, advance_recovery_rate, retention_rate,
    description, icon, status, owner_id,
    order_no, product_type, end_user, delivery_date
  ) values (
    p_name, p_construction_type, p_client_name, p_contractor_name, p_contract_no,
    p_contract_amount, p_start_date, p_end_date, p_site_address,
    coalesce(p_advance_payment, 0), coalesce(p_advance_recovery_rate, 0), coalesce(p_retention_rate, 0),
    p_description, coalesce(p_icon, '🏭'), 'planning', v_uid,
    p_order_no, p_product_type::product_type, p_end_user, p_delivery_date
  )
  returning id into v_id;

  insert into public.project_members (project_id, user_id, role)
  values (v_id, v_uid, 'owner');

  return v_id;
end;
$$;
grant execute on function public.create_project to authenticated;

-- ============================================================
-- 완료
-- ============================================================
