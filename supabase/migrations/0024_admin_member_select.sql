-- ============================================================
-- 0024: 시스템 관리자의 프로젝트 멤버 조회 허용
--   관리자 화면에서 특정 사용자의 프로젝트 배정 목록을 조회·수정·삭제하려면
--   project_members SELECT가 관리자에게 허용돼야 한다. (0023의 UPDATE/DELETE와 짝)
--   한 사용자를 여러 프로젝트에 중복 배정하는 것은 unique(project_id,user_id)로 이미 허용됨.
-- ============================================================

drop policy if exists "관리자 멤버 조회" on public.project_members;
create policy "관리자 멤버 조회" on public.project_members
  for select using (public.is_system_admin());

notify pgrst, 'reload schema';

-- ============================================================
-- 완료
-- ============================================================
