-- ============================================================
-- 0013: 단계 계획(일정·예산) 입력 지원
--   - seed_standard_phases 확장: 착수~납기·총예산을 단계 가중치로 자동 배분
--   - cost_summary / evm_summary: 실행예산이 없으면 단계 계획예산(planned_amount) 사용
--   0012 이후 실행
-- ============================================================

-- ------------------------------------------------------------
-- A. 표준 단계 생성 + (선택) 일정·예산 자동 배분
--    기존 1인자 호출과 호환되도록 추가 인자에 기본값 부여
-- ------------------------------------------------------------
drop function if exists public.seed_standard_phases(uuid);

create or replace function public.seed_standard_phases(
  p_project_id   uuid,
  p_start_date   date    default null,
  p_end_date     date    default null,
  p_total_budget numeric default null
)
returns int
language plpgsql
security invoker
set search_path = public
as $$
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

  -- 일정 배분: 착수~납기 구간을 가중치 누계 비율로 단계별 계획 시작/종료 산정
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
end;
$$;
grant execute on function public.seed_standard_phases to authenticated;
comment on function public.seed_standard_phases is '표준 단계 8종 생성 + (선택) 착수~납기·총예산을 가중치로 자동 배분';

-- ------------------------------------------------------------
-- B. 실행예산이 없으면 단계 계획예산(planned_amount) 합계를 예산으로 사용
-- ------------------------------------------------------------
create or replace view public.cost_summary as
select
  p.id as project_id,
  coalesce(b.budget_total, wpb.budget_total, 0) as budget_total,
  coalesce(c.cost_total, 0) as cost_total,
  coalesce(b.budget_total, wpb.budget_total, 0) - coalesce(c.cost_total, 0) as remaining,
  round(
    coalesce(c.cost_total, 0)::numeric / nullif(coalesce(b.budget_total, wpb.budget_total), 0) * 100, 2
  ) as execution_rate
from public.projects p
left join (
  select project_id, sum(budget_amount) as budget_total
  from public.budget_items group by project_id
) b on b.project_id = p.id
left join (
  select project_id, sum(planned_amount) as budget_total
  from public.work_packages group by project_id
) wpb on wpb.project_id = p.id
left join (
  select project_id, sum(amount) as cost_total
  from public.cost_entries group by project_id
) c on c.project_id = p.id;
comment on view public.cost_summary is '실행예산(없으면 단계 계획예산) 대비 원가 집행률';

-- evm_summary: BAC를 실행예산 → 없으면 단계 계획예산 합계로
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

-- ============================================================
-- 완료
-- ============================================================
