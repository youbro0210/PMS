-- ============================================================
-- 0019: 인력(자원) 배부·관리
--   resources: 전사 인력 풀(직종·월단가·가동률)
--   project_assignments: 프로젝트(및 단계)별 인력 배정(배정률·기간·계획 M/M)
--   계획 노무비 = 월단가 × 계획 M/M,  과배정 = 동시 배정률 합 > 100%
--   0018 이후 실행. 멱등.
-- ============================================================

-- 전사 인력 풀
create table if not exists public.resources (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  trade        text,                          -- 직종(설계·용접·기계·전장·PM 등)
  monthly_rate numeric not null default 0,    -- 월 단가(원)
  capacity_pct int not null default 100,      -- 가동 가능률(%)
  is_active    boolean not null default true,
  note         text,
  created_at   timestamptz not null default now()
);

alter table public.resources enable row level security;
drop policy if exists "인력 조회" on public.resources;
drop policy if exists "인력 관리" on public.resources;
create policy "인력 조회" on public.resources for select using (auth.uid() is not null);
create policy "인력 관리" on public.resources for all using (public.is_system_admin()) with check (public.is_system_admin());

-- 프로젝트·단계 배정
create table if not exists public.project_assignments (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  resource_id     uuid not null references public.resources(id) on delete cascade,
  work_package_id uuid references public.work_packages(id) on delete set null,
  role            text,
  allocation_pct  int not null default 100,   -- 이 프로젝트 배정률(%)
  start_date      date,
  end_date        date,
  planned_mm      numeric not null default 0, -- 계획 투입 M/M(man-month)
  actual_mm       numeric,                    -- 실적 M/M(선택)
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_assign_project on public.project_assignments(project_id);
create index if not exists idx_assign_resource on public.project_assignments(resource_id);

alter table public.project_assignments enable row level security;
drop policy if exists "배정 조회" on public.project_assignments;
drop policy if exists "배정 등록" on public.project_assignments;
drop policy if exists "배정 수정" on public.project_assignments;
drop policy if exists "배정 삭제" on public.project_assignments;
create policy "배정 조회" on public.project_assignments for select using (public.is_project_member(project_id) or public.is_system_admin());
create policy "배정 등록" on public.project_assignments for insert with check (public.is_system_admin() or public.get_project_role(project_id) not in ('viewer'));
create policy "배정 수정" on public.project_assignments for update using (public.is_system_admin() or public.get_project_role(project_id) not in ('viewer'));
create policy "배정 삭제" on public.project_assignments for delete using (public.is_system_admin() or public.get_project_role(project_id) in ('owner','manager'));

create or replace function public.touch_assign_updated()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;
drop trigger if exists trg_assign_touch on public.project_assignments;
create trigger trg_assign_touch before update on public.project_assignments
  for each row execute function public.touch_assign_updated();

-- 프로젝트 인력·노무비 집계
create or replace view public.project_labor_summary as
select a.project_id,
  count(distinct a.resource_id) as headcount,
  sum(a.planned_mm) as planned_mm_total,
  sum(a.planned_mm * r.monthly_rate) as planned_labor_cost
from public.project_assignments a
join public.resources r on r.id = a.resource_id
group by a.project_id;
comment on view public.project_labor_summary is '프로젝트 투입 인원·계획 M/M·계획 노무비';

-- 인력별 현재 배정률 합(과배정 감지: >100)
create or replace view public.resource_utilization as
select r.id as resource_id, r.name, r.trade, r.capacity_pct,
  coalesce(sum(case when current_date between coalesce(a.start_date, current_date) and coalesce(a.end_date, current_date)
                    then a.allocation_pct else 0 end), 0) as current_allocation_pct,
  count(a.id) filter (where current_date between coalesce(a.start_date, current_date) and coalesce(a.end_date, current_date)) as active_assignments
from public.resources r
left join public.project_assignments a on a.resource_id = r.id
group by r.id, r.name, r.trade, r.capacity_pct;
comment on view public.resource_utilization is '인력별 현재 배정률 합계(과배정 감지)';

-- ============================================================
-- 완료
-- ============================================================
