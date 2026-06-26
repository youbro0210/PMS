-- ============================================================
-- 0003: 건설 프로젝트 관리(PMS) 도메인
--   현장별 공정률 · 기성 · 실행예산/원가 · 협력업체 · 안전/품질 관리
--   0001_init.sql, 0002_pgvector.sql 이후 실행
-- ============================================================

-- ============================================================
-- A. ENUM
-- ============================================================
create type work_status as enum (
  'not_started',  -- 미착수
  'in_progress',  -- 진행 중
  'completed',    -- 완료
  'suspended'     -- 중단
);

create type billing_status as enum (
  'draft',        -- 작성 중
  'requested',    -- 기성 청구
  'reviewed',     -- 사정 완료
  'confirmed',    -- 확정
  'paid'          -- 지급 완료
);

create type cost_category as enum (
  'labor',        -- 노무비
  'material',     -- 자재비
  'subcontract',  -- 외주비(하도급)
  'equipment',    -- 장비비
  'expense'       -- 경비
);

create type inspection_type as enum ('safety', 'quality');           -- 안전 / 품질
create type inspection_result as enum ('pass', 'conditional', 'fail'); -- 합격 / 조건부 / 불합격

-- AI 의도 확장 (건설 명령)
alter type ai_intent add value if not exists 'get_progress_summary';
alter type ai_intent add value if not exists 'update_progress';
alter type ai_intent add value if not exists 'get_billing_status';
alter type ai_intent add value if not exists 'record_billing';
alter type ai_intent add value if not exists 'get_cost_summary';
alter type ai_intent add value if not exists 'log_inspection';


-- ============================================================
-- B. projects 확장 — 프로젝트 = 건설 현장
-- ============================================================
alter table public.projects
  add column if not exists client_name      text,            -- 발주처
  add column if not exists contractor_name  text,            -- 원도급사(시공사)
  add column if not exists contract_amount  numeric(16, 0),  -- 총 도급액(원)
  add column if not exists contract_no      text,            -- 계약번호
  add column if not exists site_address     text,            -- 현장 주소
  add column if not exists construction_type text;           -- 공사 종류(건축/토목/플랜트 등)

comment on column public.projects.contract_amount is '총 도급계약 금액(원)';


-- ============================================================
-- C. 협력업체(하도급사)
-- ============================================================
create table public.subcontractors (
  id              uuid primary key default uuid_generate_v4(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  name            text not null,                  -- 업체명
  trade           text,                           -- 공종/업종(철근, 콘크리트, 전기 등)
  business_no     text,                           -- 사업자번호
  contact_name    text,
  contact_phone   text,
  contract_amount numeric(16, 0),                 -- 하도급 계약금액
  contract_start  date,
  contract_end    date,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
comment on table public.subcontractors is '현장 협력업체(하도급사)';


-- ============================================================
-- D. 공종 / WBS (Work Breakdown Structure)
--    계층 구조 + 가중치 기반 공정률 집계
-- ============================================================
create table public.work_packages (
  id                uuid primary key default uuid_generate_v4(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  parent_id         uuid references public.work_packages(id) on delete cascade,
  subcontractor_id  uuid references public.subcontractors(id) on delete set null,

  code              text,                          -- 공종 코드(예: 03-200)
  name              text not null,                 -- 공종명(철근콘크리트, 토공 등)
  weight            numeric(6, 3) default 0,       -- 전체 대비 가중치(%) — 공정률 가중평균용
  planned_amount    numeric(16, 0),                -- 도급내역 금액

  planned_start     date,
  planned_end       date,
  planned_progress  numeric(5, 2) default 0,       -- 계획 공정률(%)
  actual_progress   numeric(5, 2) default 0,       -- 실적 공정률(%)
  status            work_status not null default 'not_started',

  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);
comment on table public.work_packages is '공종/WBS (가중치 기반 공정률 집계)';
comment on column public.work_packages.weight is '전체 공사 대비 비중(%) — 가중 공정률 산정에 사용';


-- ============================================================
-- E. 공정 실적 이력 (기간별 계획 대비 실적)
-- ============================================================
create table public.progress_records (
  id                uuid primary key default uuid_generate_v4(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  work_package_id   uuid not null references public.work_packages(id) on delete cascade,
  record_date       date not null default current_date,
  planned_rate      numeric(5, 2),                 -- 해당 시점 계획 공정률(%)
  actual_rate       numeric(5, 2),                 -- 해당 시점 실적 공정률(%)
  note              text,
  recorded_by       uuid references public.profiles(id) on delete set null,
  created_at        timestamptz default now()
);
comment on table public.progress_records is '공종별 공정률 실적 이력(공정표 추적)';


-- ============================================================
-- F. 기성 (Progress Billing) — 회차별 기성 청구/사정/지급
-- ============================================================
create table public.billings (
  id                uuid primary key default uuid_generate_v4(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  subcontractor_id  uuid references public.subcontractors(id) on delete set null,
  -- subcontractor_id가 null이면 발주처 대상 '원도급 기성', 값이 있으면 협력사 '하도급 기성'

  period_no         int not null,                  -- 기성 회차(1, 2, 3 ...)
  period_start      date,
  period_end        date,
  contract_amount   numeric(16, 0),                -- 기준 도급액
  this_amount       numeric(16, 0) not null default 0,  -- 금회 기성금액
  cumulative_amount numeric(16, 0) not null default 0,  -- 누계 기성금액
  progress_rate     numeric(5, 2),                 -- 기성률(누계/도급액 %)

  status            billing_status not null default 'draft',
  requested_at      timestamptz,
  confirmed_at      timestamptz,
  paid_at           timestamptz,

  note              text,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),

  unique (project_id, subcontractor_id, period_no)
);
comment on table public.billings is '기성 청구/사정/지급 (회차별, 원도급·하도급)';
comment on column public.billings.subcontractor_id is 'null=발주처 대상 원도급 기성, 값 있으면 협력사 하도급 기성';

-- 기성 공종별 명세(선택)
create table public.billing_items (
  id                uuid primary key default uuid_generate_v4(),
  billing_id        uuid not null references public.billings(id) on delete cascade,
  work_package_id   uuid references public.work_packages(id) on delete set null,
  this_amount       numeric(16, 0) not null default 0,
  cumulative_amount numeric(16, 0) not null default 0
);
comment on table public.billing_items is '기성 공종별 명세';


-- ============================================================
-- G. 실행예산 / 원가 집행
-- ============================================================
create table public.budget_items (
  id                uuid primary key default uuid_generate_v4(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  work_package_id   uuid references public.work_packages(id) on delete set null,
  category          cost_category not null,
  description       text,
  budget_amount     numeric(16, 0) not null default 0,   -- 실행예산
  created_at        timestamptz default now()
);
comment on table public.budget_items is '실행예산(공종·원가분류별)';

create table public.cost_entries (
  id                uuid primary key default uuid_generate_v4(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  work_package_id   uuid references public.work_packages(id) on delete set null,
  subcontractor_id  uuid references public.subcontractors(id) on delete set null,
  category          cost_category not null,
  description       text,
  amount            numeric(16, 0) not null default 0,    -- 실제 집행액
  entry_date        date not null default current_date,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz default now()
);
comment on table public.cost_entries is '원가 집행 내역(노무/자재/외주/장비/경비)';


-- ============================================================
-- H. 안전 / 품질 점검
-- ============================================================
create table public.inspections (
  id                uuid primary key default uuid_generate_v4(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  work_package_id   uuid references public.work_packages(id) on delete set null,
  type              inspection_type not null,
  inspector_id      uuid references public.profiles(id) on delete set null,
  inspection_date   date not null default current_date,
  location          text,                          -- 점검 위치
  result            inspection_result not null default 'pass',
  findings          text,                          -- 지적 사항
  corrective_action text,                          -- 시정 조치
  due_date          date,                          -- 조치 기한
  is_closed         boolean default false,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);
comment on table public.inspections is '안전/품질 점검 및 지적·시정 관리';


-- ============================================================
-- I. 인덱스
-- ============================================================
create index idx_subs_project on public.subcontractors(project_id);
create index idx_wp_project on public.work_packages(project_id);
create index idx_wp_parent on public.work_packages(parent_id);
create index idx_wp_sub on public.work_packages(subcontractor_id);
create index idx_prog_project on public.progress_records(project_id);
create index idx_prog_wp on public.progress_records(work_package_id);
create index idx_billing_project on public.billings(project_id);
create index idx_billing_sub on public.billings(subcontractor_id);
create index idx_budget_project on public.budget_items(project_id);
create index idx_cost_project on public.cost_entries(project_id);
create index idx_cost_date on public.cost_entries(entry_date desc);
create index idx_insp_project on public.inspections(project_id);
create index idx_insp_open on public.inspections(project_id) where is_closed = false;


-- ============================================================
-- J. updated_at 트리거 재사용
-- ============================================================
create trigger trg_subs_updated_at before update on public.subcontractors
  for each row execute function public.handle_updated_at();
create trigger trg_wp_updated_at before update on public.work_packages
  for each row execute function public.handle_updated_at();
create trigger trg_billing_updated_at before update on public.billings
  for each row execute function public.handle_updated_at();
create trigger trg_insp_updated_at before update on public.inspections
  for each row execute function public.handle_updated_at();


-- ============================================================
-- K. RLS — 기존 헬퍼(is_project_member / get_project_role) 재사용
-- ============================================================
alter table public.subcontractors   enable row level security;
alter table public.work_packages    enable row level security;
alter table public.progress_records enable row level security;
alter table public.billings         enable row level security;
alter table public.billing_items    enable row level security;
alter table public.budget_items     enable row level security;
alter table public.cost_entries     enable row level security;
alter table public.inspections      enable row level security;

-- 멤버면 조회, viewer 제외 생성/수정 (공통 패턴)
do $$
declare
  t text;
  member_tables text[] := array[
    'subcontractors','work_packages','progress_records',
    'billings','budget_items','cost_entries','inspections'
  ];
begin
  foreach t in array member_tables loop
    execute format($f$
      create policy "%1$s 조회" on public.%1$I for select
        using (public.is_project_member(project_id));
      create policy "%1$s 생성" on public.%1$I for insert
        with check (public.get_project_role(project_id) not in ('viewer'));
      create policy "%1$s 수정" on public.%1$I for update
        using (public.get_project_role(project_id) not in ('viewer'));
      create policy "%1$s 삭제" on public.%1$I for delete
        using (public.get_project_role(project_id) in ('owner','manager'));
    $f$, t);
  end loop;
end $$;

-- billing_items: 상위 기성의 프로젝트 멤버 기준
create policy "billing_items 조회" on public.billing_items for select
  using (exists (select 1 from public.billings b
    where b.id = billing_id and public.is_project_member(b.project_id)));
create policy "billing_items 변경" on public.billing_items for all
  using (exists (select 1 from public.billings b
    where b.id = billing_id and public.get_project_role(b.project_id) not in ('viewer')));


-- ============================================================
-- L. 집계 뷰 (AI 요약·보고서가 수치 출처로 사용 — 환각 방지)
-- ============================================================

-- 현장 전체 공정률: 공종 가중치 기반 가중평균
create or replace view public.project_progress_summary as
select
  p.id as project_id,
  p.name as project_name,
  round(
    sum(wp.weight * wp.actual_progress) / nullif(sum(wp.weight), 0), 2
  ) as actual_progress,
  round(
    sum(wp.weight * wp.planned_progress) / nullif(sum(wp.weight), 0), 2
  ) as planned_progress,
  round(
    sum(wp.weight * wp.actual_progress) / nullif(sum(wp.weight), 0)
    - sum(wp.weight * wp.planned_progress) / nullif(sum(wp.weight), 0), 2
  ) as variance  -- 양수=선행, 음수=지연
from public.projects p
left join public.work_packages wp on wp.project_id = p.id
group by p.id, p.name;
comment on view public.project_progress_summary is '현장 가중 공정률(계획 대비 실적·편차)';

-- 기성 현황: 누계 기성 / 도급액
create or replace view public.billing_summary as
select
  b.project_id,
  count(*) as billing_count,
  max(b.period_no) as latest_period,
  max(b.cumulative_amount) as cumulative_billed,
  max(b.contract_amount) as contract_amount,
  round(
    max(b.cumulative_amount)::numeric / nullif(max(b.contract_amount), 0) * 100, 2
  ) as billed_rate,
  sum(b.this_amount) filter (where b.status = 'paid') as paid_total
from public.billings b
where b.subcontractor_id is null  -- 원도급(발주처 대상) 기성 기준
group by b.project_id;
comment on view public.billing_summary is '원도급 기성 현황(누계 기성률·지급액)';

-- 실행예산 대비 원가 집행
create or replace view public.cost_summary as
select
  p.id as project_id,
  coalesce(b.budget_total, 0) as budget_total,
  coalesce(c.cost_total, 0) as cost_total,
  coalesce(b.budget_total, 0) - coalesce(c.cost_total, 0) as remaining,
  round(
    coalesce(c.cost_total, 0)::numeric / nullif(b.budget_total, 0) * 100, 2
  ) as execution_rate
from public.projects p
left join (
  select project_id, sum(budget_amount) as budget_total
  from public.budget_items group by project_id
) b on b.project_id = p.id
left join (
  select project_id, sum(amount) as cost_total
  from public.cost_entries group by project_id
) c on c.project_id = p.id;
comment on view public.cost_summary is '실행예산 대비 원가 집행률';

-- 원가 분류별 집행
create or replace view public.cost_by_category as
select project_id, category, sum(amount) as total
from public.cost_entries
group by project_id, category;


-- ============================================================
-- 완료
-- ============================================================
