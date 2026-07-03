-- ============================================================
-- 0022: 인력(resources) 인사 정보 컬럼 추가
--   사번(employee_no)·직급(rank)·부서(department)·이메일·연락처
--   엑셀(CSV) 업로드 upsert 기준키로 employee_no 사용.
--   0019 이후 실행. 멱등.
-- ============================================================

alter table public.resources add column if not exists employee_no text;
alter table public.resources add column if not exists rank        text;
alter table public.resources add column if not exists department  text;
alter table public.resources add column if not exists email       text;
alter table public.resources add column if not exists phone       text;

-- 사번 유니크(있을 때만) — 엑셀 업로드 upsert 충돌키
create unique index if not exists uq_resources_empno
  on public.resources(employee_no) where employee_no is not null;

comment on column public.resources.employee_no is '사번(엑셀 upsert 기준)';
comment on column public.resources.rank is '직급';
comment on column public.resources.department is '부서';

notify pgrst, 'reload schema';

-- ============================================================
-- 완료
-- ============================================================
