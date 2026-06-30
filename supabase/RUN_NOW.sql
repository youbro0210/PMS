-- ============================================================
-- RUN_NOW: 0012(EVM·리스크) + 0013(단계 일정·예산) 통합 1회 실행본
--   Supabase SQL Editor에 전체 붙여넣고 Run. 여러 번 실행해도 안전(멱등).
-- ============================================================

-- 0) 기존 객체 정리(멱등) — 테이블 cascade로 정책/트리거 함께 제거
drop table if exists public.evm_snapshots cascade;
drop table if exists public.risk_register cascade;
drop function if exists public.capture_evm_snapshot(uuid);
drop function if exists public.on_risk_created() cascade;
drop function if exists public.touch_risk_updated() cascade;

-- ============================================================
-- A. EVM 성과분석
-- ============================================================
create or replace view public.evm_summary as
with base as (
  select
    p.id as project_id,
    coalesce(
      (select sum(budget_amount) from public.budget_items bi where bi.project_id = p.id),
      (select sum(planned_amount) from public.work_packages wp where wp.project_id = p.id),
      0
    )::numeric as bac,
    coalesce((select sum(amount) from public.cost_entries ce where ce.project_id = p.id), 0)::numeric as ac,
    coalesce((
      select round(sum(wp.weight * wp.planned_progress) / nullif(sum(wp.weight), 0), 2)
      from public.work_packages wp where wp.project_id = p.id
    ), 0)::numeric as planned_pct,
    coalesce((
      select round(sum(wp.weight * wp.actual_progress) / nullif(sum(wp.weight), 0), 2)
      from public.work_packages wp where wp.project_id = p.id
    ), 0)::numeric as actual_pct
  from public.projects p
)
select
  project_id, bac, ac, planned_pct, actual_pct,
  round(bac * planned_pct / 100, 0) as pv,
  round(bac * actual_pct  / 100, 0) as ev,
  round(case when ac > 0 then (bac * actual_pct / 100) / ac else null end, 3) as cpi,
  round(case when planned_pct > 0 then actual_pct / planned_pct else null end, 3) as spi,
  round(case when actual_pct > 0 and ac > 0 then ac * bac / (bac * actual_pct / 100) else bac end, 0) as eac,
  round(case when actual_pct > 0 and ac > 0 then ac * bac / (bac * actual_pct / 100) - ac else bac - ac end, 0) as etc,
  round(bac - (case when actual_pct > 0 and ac > 0 then ac * bac / (bac * actual_pct / 100) else bac end), 0) as vac,
  round(bac * actual_pct / 100 - bac * planned_pct / 100, 0) as sv,
  round(bac * actual_pct / 100 - ac, 0) as cv
from base;
comment on view public.evm_summary is 'EVM 성과분석(BAC=실행예산 또는 단계 계획예산)';

create table public.evm_snapshots (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  snapshot_date date not null default current_date,
  bac numeric not null default 0,
  pv  numeric not null default 0,
  ev  numeric not null default 0,
  ac  numeric not null default 0,
  cpi numeric,
  spi numeric,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (project_id, snapshot_date)
);
create index if not exists idx_evm_snapshots_project on public.evm_snapshots(project_id, snapshot_date);

create or replace function public.capture_evm_snapshot(p_project_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v evm_summary%rowtype;
begin
  if not (public.is_project_member(p_project_id) or public.is_system_admin()) then
    raise exception '권한이 없습니다.';
  end if;
  select * into v from public.evm_summary where project_id = p_project_id;
  insert into public.evm_snapshots (project_id, snapshot_date, bac, pv, ev, ac, cpi, spi, created_by)
  values (p_project_id, current_date, coalesce(v.bac,0), coalesce(v.pv,0), coalesce(v.ev,0), coalesce(v.ac,0), v.cpi, v.spi, auth.uid())
  on conflict (project_id, snapshot_date) do update
    set bac = excluded.bac, pv = excluded.pv, ev = excluded.ev, ac = excluded.ac,
        cpi = excluded.cpi, spi = excluded.spi, created_at = now()
  returning id into v_id;
  return v_id;
end; $$;

alter table public.evm_snapshots enable row level security;
create policy "스냅샷 조회" on public.evm_snapshots for select using (public.is_project_member(project_id) or public.is_system_admin());
create policy "스냅샷 등록" on public.evm_snapshots for insert with check (public.is_system_admin() or public.get_project_role(project_id) not in ('viewer'));
create policy "스냅샷 삭제" on public.evm_snapshots for delete using (public.is_system_admin() or public.get_project_role(project_id) in ('owner','manager'));

-- ============================================================
-- B. 리스크 등록부
-- ============================================================
create table public.risk_register (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  title       text not null,
  category    text not null default 'schedule',
  probability int  not null default 3 check (probability between 1 and 5),
  impact      int  not null default 3 check (impact between 1 and 5),
  score       int  generated always as (probability * impact) stored,
  status      text not null default 'open',
  owner_id    uuid references public.profiles(id),
  mitigation  text,
  due_date    date,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_risk_project on public.risk_register(project_id, status);

alter table public.risk_register enable row level security;
create policy "리스크 조회" on public.risk_register for select using (public.is_project_member(project_id) or public.is_system_admin());
create policy "리스크 등록" on public.risk_register for insert with check (public.is_system_admin() or public.get_project_role(project_id) not in ('viewer'));
create policy "리스크 수정" on public.risk_register for update using (public.is_system_admin() or public.get_project_role(project_id) not in ('viewer'));
create policy "리스크 삭제" on public.risk_register for delete using (public.is_system_admin() or public.get_project_role(project_id) in ('owner','manager'));

create or replace function public.on_risk_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.score >= 15 then
    perform public.notify_members(new.project_id, 'risk', '고위험 리스크 등록',
      new.title || ' (위험도 ' || new.score || ')', '/projects/' || new.project_id || '/risks');
  end if;
  return new;
end; $$;
create trigger trg_risk_notify after insert on public.risk_register
  for each row execute function public.on_risk_created();

create or replace function public.touch_risk_updated()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;
create trigger trg_risk_touch before update on public.risk_register
  for each row execute function public.touch_risk_updated();

-- ============================================================
-- C. 단계 계획(일정·예산) — 시딩 함수 + 예산 폴백 뷰
-- ============================================================
drop function if exists public.seed_standard_phases(uuid);
drop function if exists public.seed_standard_phases(uuid, date, date, numeric);

create or replace function public.seed_standard_phases(
  p_project_id uuid, p_start_date date default null, p_end_date date default null, p_total_budget numeric default null
)
returns int language plpgsql security invoker set search_path = public as $$
declare v_count int;
begin
  insert into public.work_packages (project_id, code, name, weight, planned_progress, actual_progress, status)
  values
    (p_project_id, 'P1', '수주/계약',     5,  0, 0, 'not_started'),
    (p_project_id, 'P2', '기본·상세설계', 20, 0, 0, 'not_started'),
    (p_project_id, 'P3', '구매/자재조달', 15, 0, 0, 'not_started'),
    (p_project_id, 'P4', '제작/가공',     25, 0, 0, 'not_started'),
    (p_project_id, 'P5', '조립/패키징',   15, 0, 0, 'not_started'),
    (p_project_id, 'P6', 'FAT(공장시험)', 10, 0, 0, 'not_started'),
    (p_project_id, 'P7', '출하/납품',     5,  0, 0, 'not_started'),
    (p_project_id, 'P8', '설치/시운전',   5,  0, 0, 'not_started');
  get diagnostics v_count = row_count;

  if p_start_date is not null and p_end_date is not null and p_end_date > p_start_date then
    with w as (
      select id, weight,
        coalesce(sum(weight) over (order by code rows between unbounded preceding and 1 preceding), 0) as prev_w,
        sum(weight) over () as tot_w
      from public.work_packages where project_id = p_project_id
    )
    update public.work_packages wp set
      planned_start  = p_start_date + (((p_end_date - p_start_date) * w.prev_w) / w.tot_w)::int,
      planned_end    = p_start_date + (((p_end_date - p_start_date) * (w.prev_w + w.weight)) / w.tot_w)::int,
      planned_amount = case when p_total_budget is not null then round(p_total_budget * w.weight / w.tot_w) else wp.planned_amount end
    from w where wp.id = w.id;
  elsif p_total_budget is not null then
    update public.work_packages wp set
      planned_amount = round(p_total_budget * weight / nullif((select sum(weight) from public.work_packages where project_id = p_project_id), 0))
    where wp.project_id = p_project_id;
  end if;
  return v_count;
end; $$;
grant execute on function public.seed_standard_phases to authenticated;

create or replace view public.cost_summary as
select
  p.id as project_id,
  coalesce(b.budget_total, wpb.budget_total, 0) as budget_total,
  coalesce(c.cost_total, 0) as cost_total,
  coalesce(b.budget_total, wpb.budget_total, 0) - coalesce(c.cost_total, 0) as remaining,
  round(coalesce(c.cost_total, 0)::numeric / nullif(coalesce(b.budget_total, wpb.budget_total), 0) * 100, 2) as execution_rate
from public.projects p
left join (select project_id, sum(budget_amount) as budget_total from public.budget_items group by project_id) b on b.project_id = p.id
left join (select project_id, sum(planned_amount) as budget_total from public.work_packages group by project_id) wpb on wpb.project_id = p.id
left join (select project_id, sum(amount) as cost_total from public.cost_entries group by project_id) c on c.project_id = p.id;
comment on view public.cost_summary is '실행예산(없으면 단계 계획예산) 대비 원가 집행률';

-- ============================================================
-- 완료
-- ============================================================
