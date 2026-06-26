-- ============================================================
-- 0005: 현장(프로젝트) 신규 등록 프로비저닝
--   생성자를 소유자 멤버로 원자적 등록 (RLS 닭-달걀 문제 해결)
--   0004 이후 실행
-- ============================================================

-- 프로젝트 insert 정책은 owner_id=auth.uid()을 요구하고, project_members
-- insert 정책은 이미 멤버(owner/manager)여야 한다. 신규 생성 시 둘을 동시에
-- 충족할 수 없으므로 security definer 함수로 한 트랜잭션에서 처리한다.

create or replace function public.create_project(
  p_name                  text,
  p_construction_type     text    default null,
  p_client_name           text    default null,
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
  p_icon                  text    default '🏗️'
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
  if v_uid is null then
    raise exception '인증되지 않은 요청입니다.';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception '현장명(공사명)은 필수입니다.';
  end if;

  insert into public.projects (
    name, construction_type, client_name, contractor_name, contract_no,
    contract_amount, start_date, end_date, site_address,
    advance_payment, advance_recovery_rate, retention_rate,
    description, icon, status, owner_id
  ) values (
    p_name, p_construction_type, p_client_name, p_contractor_name, p_contract_no,
    p_contract_amount, p_start_date, p_end_date, p_site_address,
    coalesce(p_advance_payment, 0), coalesce(p_advance_recovery_rate, 0), coalesce(p_retention_rate, 0),
    p_description, coalesce(p_icon, '🏗️'), 'planning', v_uid
  )
  returning id into v_id;

  -- 생성자를 소유자 멤버로 등록
  insert into public.project_members (project_id, user_id, role)
  values (v_id, v_uid, 'owner');

  return v_id;
end;
$$;

grant execute on function public.create_project to authenticated;

comment on function public.create_project is '현장 신규 등록 + 생성자 소유자 멤버 자동 등록';


-- 표준 공종(WBS) 일괄 생성 — 신규 현장에 기본 공정 체계를 깔고 싶을 때 호출
create or replace function public.seed_standard_works(p_project_id uuid)
returns int
language plpgsql
security invoker  -- 호출자 RLS 적용(멤버·non-viewer만)
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.work_packages (project_id, code, name, weight, planned_progress, actual_progress, status)
  values
    (p_project_id, '01-000', '가설공사',        5,  0, 0, 'not_started'),
    (p_project_id, '02-100', '토공사',          8,  0, 0, 'not_started'),
    (p_project_id, '03-200', '철근콘크리트(골조)', 30, 0, 0, 'not_started'),
    (p_project_id, '04-300', '조적/미장',        8,  0, 0, 'not_started'),
    (p_project_id, '05-400', '방수공사',         5,  0, 0, 'not_started'),
    (p_project_id, '06-450', '단열/창호',        8,  0, 0, 'not_started'),
    (p_project_id, '08-600', '마감/인테리어',     16, 0, 0, 'not_started'),
    (p_project_id, '09-700', '기계설비',         10, 0, 0, 'not_started'),
    (p_project_id, '10-800', '전기/통신',        10, 0, 0, 'not_started');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.seed_standard_works to authenticated;

comment on function public.seed_standard_works is '신규 현장에 표준 공종(WBS) 9종 생성(가중치 합 100)';

-- ============================================================
-- 완료
-- ============================================================
