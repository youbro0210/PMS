-- ============================================================
-- 0025: 관리자 사용자 삭제 + 마지막 로그인(로그인 이력)
--   admin_list_users에 last_sign_in_at 추가, admin_delete_user 신설.
--   시각은 timestamptz(UTC) 저장, 화면에서 KST로 표시.
-- ============================================================

-- 사용자 목록(마지막 로그인 포함) — 관리자 전용
drop function if exists public.admin_list_users();
create or replace function public.admin_list_users()
returns table(id uuid, email text, full_name text, is_admin boolean, created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_system_admin() then raise exception '권한이 없습니다.'; end if;
  return query
    select p.id, coalesce(p.email, u.email) as email, p.full_name, p.is_admin, u.created_at, u.last_sign_in_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by u.last_sign_in_at desc nulls last, u.created_at desc;
end; $$;
grant execute on function public.admin_list_users() to authenticated;

-- 사용자 삭제(관리자 전용, 본인 제외). auth.users 삭제 → profiles·멤버십 캐스케이드
create or replace function public.admin_delete_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_system_admin() then raise exception '권한이 없습니다.'; end if;
  if p_user_id = auth.uid() then raise exception '본인 계정은 삭제할 수 없습니다.'; end if;
  delete from auth.users where id = p_user_id;
end; $$;
grant execute on function public.admin_delete_user(uuid) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================
-- 완료
-- ============================================================
