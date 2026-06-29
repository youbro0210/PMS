-- ============================================================
-- 0011: ERP 모듈별 연동 설정
--   모듈(수주/대금/구매/원가/품질)마다 DB-to-DB 또는 API를 각각 설정
--   0010 이후 실행
-- ============================================================

-- ------------------------------------------------------------
-- A. 모듈별 연동 설정 — 각 모듈이 독립적으로 방식·방향·엔드포인트·키를 가짐
-- ------------------------------------------------------------
create table public.erp_module_config (
  module      text primary key,                 -- project|billing|procurement|cost|inspection
  label       text not null,
  method      text not null default 'none',     -- none(미사용) | mock(테스트) | db(인터페이스 테이블) | api(REST)
  direction   text not null default 'out',      -- out(PMS→ERP) | in(ERP→PMS) | both
  enabled     boolean not null default false,
  endpoint    text,                             -- API 방식: URL / DB 방식: 인터페이스 테이블명
  auth_key    text,                             -- (선택) 모듈별 인증키. 없으면 전역(erp_config) 사용
  field_map   jsonb not null default '{}',      -- 모듈별 필드 매핑(옴니이솔 규격)
  updated_at  timestamptz default now()
);

insert into public.erp_module_config (module, label) values
  ('project',     '수주(영업·수주등록)'),
  ('billing',     '대금/기성(매출·세금계산서·수금)'),
  ('procurement', '구매발주(구매·발주·입고)'),
  ('cost',        '원가(원가전표)'),
  ('inspection',  '품질/FAT(검사)')
on conflict (module) do nothing;

comment on table public.erp_module_config is '모듈별 ERP 연동 설정(방식·방향·엔드포인트·키 개별 관리)';

alter table public.erp_module_config enable row level security;
create policy "모듈설정 조회" on public.erp_module_config for select using (public.is_system_admin());
create policy "모듈설정 수정" on public.erp_module_config for update using (public.is_system_admin());
create policy "모듈설정 추가" on public.erp_module_config for insert with check (public.is_system_admin());

-- ------------------------------------------------------------
-- B. 원가·품질 모듈도 저장 시 아웃박스에 적재(트리거 추가)
--    (수주/대금/구매는 0009에서 이미 적재됨)
-- ------------------------------------------------------------
create trigger trg_erp_sync_cost
  after insert or update or delete on public.cost_entries
  for each row execute function public.enqueue_erp_sync('cost');

create trigger trg_erp_sync_inspection
  after insert or update or delete on public.inspections
  for each row execute function public.enqueue_erp_sync('inspection');

-- ============================================================
-- 완료
-- ============================================================
