-- ============================================================
-- 0023: 시스템 관리자의 프로젝트 권한 배부 허용
--   시스템 관리자(is_admin)는 자신이 owner/manager가 아닌 프로젝트에서도
--   멤버 추가·역할변경·삭제(=프로젝트 권한 배부)를 할 수 있어야 한다.
--   기존 owner/manager 정책과 OR 결합(멱등).
-- ============================================================

-- add_project_member: 시스템 관리자 우회 추가 (반환형 변경 위해 drop 후 재생성)
drop function if exists public.add_project_member(uuid, text, member_role);
create or replace function public.add_project_member(p_project_id uuid, p_email text, p_role member_role)
returns void language plpgsql security definer set search_path = public as $$
declare v_target uuid;
begin
  if not (public.is_system_admin() or public.get_project_role(p_project_id) in ('owner','manager')) then
    raise exception '권한이 없습니다. 소유자/관리자 또는 시스템 관리자만 멤버를 추가할 수 있습니다.';
  end if;
  select id into v_target from public.profiles where lower(email) = lower(p_email);
  if v_target is null then
    raise exception '해당 이메일의 사용자를 찾을 수 없습니다. 먼저 회원가입이 필요합니다.';
  end if;
  if exists (select 1 from public.project_members where project_id = p_project_id and user_id = v_target) then
    update public.project_members set role = p_role where project_id = p_project_id and user_id = v_target;
  else
    insert into public.project_members(project_id, user_id, role) values (p_project_id, v_target, p_role);
  end if;
end; $$;
grant execute on function public.add_project_member(uuid, text, member_role) to authenticated;

-- 시스템 관리자용 project_members 정책(기존 owner/manager 정책과 OR)
drop policy if exists "관리자 멤버 추가" on public.project_members;
create policy "관리자 멤버 추가" on public.project_members for insert with check (public.is_system_admin());
drop policy if exists "관리자 멤버 수정" on public.project_members;
create policy "관리자 멤버 수정" on public.project_members for update using (public.is_system_admin()) with check (public.is_system_admin());
drop policy if exists "관리자 멤버 삭제" on public.project_members;
create policy "관리자 멤버 삭제" on public.project_members for delete using (public.is_system_admin());

notify pgrst, 'reload schema';

-- ============================================================
-- 완료
-- ============================================================
