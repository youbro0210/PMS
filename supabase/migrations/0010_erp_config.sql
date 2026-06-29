-- ============================================================
-- 0010: ERP 연동 설정(화면에서 입력·저장) + 매핑 쓰기 권한
--   0009 이후 실행
-- ============================================================

-- 단일 행 설정 테이블 (관리자가 화면에서 편집)
create table public.erp_config (
  id          int primary key default 1,
  adapter     text not null default 'mock',   -- mock | staging | rest
  base_url    text,                            -- rest: 옴니이솔 게이트웨이 URL
  api_key     text,                            -- rest: 인증 토큰
  enabled     boolean not null default false,  -- 연동 사용 여부(off면 동기화 건너뜀)
  auto_sync   boolean not null default false,  -- 자동 동기화(크론) 사용
  updated_at  timestamptz default now(),
  constraint erp_config_single_row check (id = 1)
);
insert into public.erp_config (id) values (1) on conflict (id) do nothing;

alter table public.erp_config enable row level security;
create policy "ERP설정 조회" on public.erp_config for select using (public.is_system_admin());
create policy "ERP설정 수정" on public.erp_config for update using (public.is_system_admin());

-- 코드 매핑: 관리자가 화면에서 추가/수정/삭제
create policy "매핑 추가" on public.erp_mapping for insert with check (public.is_system_admin());
create policy "매핑 수정" on public.erp_mapping for update using (public.is_system_admin());
create policy "매핑 삭제" on public.erp_mapping for delete using (public.is_system_admin());

-- ============================================================
-- 완료
-- ============================================================
