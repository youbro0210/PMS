-- ============================================================
-- LLM 기반 PMS - Supabase 전체 DB 스키마
-- 실행 순서: 위에서 아래로 순차 실행
-- ============================================================

-- ============================================================
-- 0. 확장 기능 활성화
-- ============================================================
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm"; -- 자연어 검색용


-- ============================================================
-- 1. ENUM 타입 정의
-- ============================================================

create type project_status as enum (
  'planning',     -- 기획 중
  'active',       -- 진행 중
  'on_hold',      -- 보류
  'completed',    -- 완료
  'cancelled'     -- 취소
);

create type task_status as enum (
  'backlog',      -- 백로그
  'todo',         -- 예정
  'in_progress',  -- 진행 중
  'in_review',    -- 리뷰 중
  'done',         -- 완료
  'cancelled'     -- 취소
);

create type task_priority as enum (
  'low',
  'medium',
  'high',
  'urgent'
);

create type member_role as enum (
  'owner',        -- 프로젝트 소유자
  'manager',      -- 관리자
  'developer',    -- 개발자
  'designer',     -- 디자이너
  'tester',       -- QA
  'viewer'        -- 읽기 전용
);

create type report_type as enum (
  'weekly',
  'monthly',
  'milestone',
  'custom'
);

create type ai_intent as enum (
  'create_task',
  'update_task',
  'delete_task',
  'assign_task',
  'get_summary',
  'generate_report',
  'suggest_schedule',
  'search_tasks',
  'update_project',
  'unknown'
);


-- ============================================================
-- 2. 사용자 프로필 (auth.users 확장)
-- ============================================================
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  full_name     text,
  avatar_url    text,
  timezone      text default 'Asia/Seoul',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

comment on table public.profiles is '사용자 프로필 (auth.users 확장)';


-- ============================================================
-- 3. 프로젝트
-- ============================================================
create table public.projects (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  description   text,
  status        project_status not null default 'planning',
  owner_id      uuid not null references public.profiles(id) on delete restrict,
  start_date    date,
  end_date      date,
  color         text default '#6366f1',           -- UI 표시용 색상
  icon          text default '📁',                -- 이모지 아이콘
  metadata      jsonb default '{}',               -- 확장 데이터 (예: GitHub repo, Jira 연동 등)
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),

  constraint end_after_start check (end_date is null or end_date >= start_date)
);

comment on table public.projects is '프로젝트';
comment on column public.projects.metadata is 'GitHub repo URL, 외부 서비스 연동 ID 등 확장 데이터';


-- ============================================================
-- 4. 프로젝트 멤버
-- ============================================================
create table public.project_members (
  id            uuid primary key default uuid_generate_v4(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  role          member_role not null default 'developer',
  joined_at     timestamptz default now(),

  unique (project_id, user_id)
);

comment on table public.project_members is '프로젝트 멤버 및 역할';


-- ============================================================
-- 5. 마일스톤
-- ============================================================
create table public.milestones (
  id            uuid primary key default uuid_generate_v4(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  name          text not null,
  description   text,
  due_date      date,
  is_completed  boolean default false,
  completed_at  timestamptz,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

comment on table public.milestones is '프로젝트 마일스톤';


-- ============================================================
-- 6. 태스크 (계층 구조 지원: 서브태스크)
-- ============================================================
create table public.tasks (
  id                uuid primary key default uuid_generate_v4(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  milestone_id      uuid references public.milestones(id) on delete set null,
  parent_task_id    uuid references public.tasks(id) on delete cascade,  -- 서브태스크

  title             text not null,
  description       text,
  status            task_status not null default 'backlog',
  priority          task_priority not null default 'medium',

  assignee_id       uuid references public.profiles(id) on delete set null,
  reporter_id       uuid references public.profiles(id) on delete set null,

  due_date          date,
  started_at        timestamptz,
  completed_at      timestamptz,
  estimated_hours   numeric(6, 2),               -- 예상 소요 시간
  actual_hours      numeric(6, 2),               -- 실제 소요 시간

  tags              text[] default '{}',          -- 태그 배열
  metadata          jsonb default '{}',           -- AI가 생성한 추가 정보 등

  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

comment on table public.tasks is '태스크 및 이슈 (서브태스크 계층 지원)';
comment on column public.tasks.parent_task_id is 'null이면 루트 태스크, 값이 있으면 서브태스크';
comment on column public.tasks.tags is '검색/필터용 태그 배열';


-- ============================================================
-- 7. 태스크 댓글
-- ============================================================
create table public.task_comments (
  id            uuid primary key default uuid_generate_v4(),
  task_id       uuid not null references public.tasks(id) on delete cascade,
  author_id     uuid not null references public.profiles(id) on delete cascade,
  content       text not null,
  is_ai_generated boolean default false,          -- AI가 생성한 댓글 여부
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

comment on table public.task_comments is '태스크 댓글';


-- ============================================================
-- 8. 태스크 변경 이력 (Activity Log)
-- ============================================================
create table public.task_activities (
  id            uuid primary key default uuid_generate_v4(),
  task_id       uuid not null references public.tasks(id) on delete cascade,
  actor_id      uuid references public.profiles(id) on delete set null,
  action        text not null,                    -- 'status_changed', 'assigned', 'due_date_updated' 등
  old_value     jsonb,
  new_value     jsonb,
  created_at    timestamptz default now()
);

comment on table public.task_activities is '태스크 필드 변경 이력';


-- ============================================================
-- 9. 파일 첨부
-- ============================================================
create table public.attachments (
  id            uuid primary key default uuid_generate_v4(),
  task_id       uuid references public.tasks(id) on delete cascade,
  project_id    uuid references public.projects(id) on delete cascade,
  uploaded_by   uuid references public.profiles(id) on delete set null,
  file_name     text not null,
  file_size     bigint,                           -- bytes
  mime_type     text,
  storage_path  text not null,                    -- Supabase Storage 경로
  created_at    timestamptz default now(),

  constraint attachment_has_parent check (
    (task_id is not null) or (project_id is not null)
  )
);

comment on table public.attachments is '태스크/프로젝트 파일 첨부';


-- ============================================================
-- 10. AI 보고서
-- ============================================================
create table public.reports (
  id            uuid primary key default uuid_generate_v4(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  type          report_type not null default 'weekly',
  title         text not null,
  content_md    text not null,                    -- Markdown 형식 보고서 본문
  period_start  date,
  period_end    date,
  generated_by  uuid references public.profiles(id) on delete set null,
  ai_model      text default 'claude-sonnet-4-6', -- 생성에 사용한 모델
  prompt_tokens int,
  created_at    timestamptz default now()
);

comment on table public.reports is 'AI가 생성한 프로젝트 보고서';


-- ============================================================
-- 11. AI 액션 로그 (감사 추적)
-- ============================================================
create table public.ai_action_logs (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references public.profiles(id) on delete set null,
  project_id      uuid references public.projects(id) on delete set null,
  input_text      text not null,                  -- 사용자 자연어 입력
  intent          ai_intent not null default 'unknown',
  tool_called     text,                           -- Claude tool use name
  tool_input      jsonb,                          -- tool에 전달된 파라미터
  tool_result     jsonb,                          -- tool 실행 결과
  ai_response     text,                           -- Claude 최종 응답
  success         boolean default true,
  error_message   text,
  latency_ms      int,                            -- 응답 시간 (ms)
  input_tokens    int,
  output_tokens   int,
  created_at      timestamptz default now()
);

comment on table public.ai_action_logs is 'AI 자연어 명령 실행 감사 로그';


-- ============================================================
-- 12. AI 일정 추천 이력
-- ============================================================
create table public.schedule_suggestions (
  id              uuid primary key default uuid_generate_v4(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  requested_by    uuid references public.profiles(id) on delete set null,
  suggestion      jsonb not null,                 -- AI가 추천한 일정 데이터
  is_applied      boolean default false,          -- 실제 적용 여부
  applied_at      timestamptz,
  created_at      timestamptz default now()
);

comment on table public.schedule_suggestions is 'AI 일정/리소스 추천 이력';


-- ============================================================
-- 13. 인덱스
-- ============================================================

-- projects
create index idx_projects_owner on public.projects(owner_id);
create index idx_projects_status on public.projects(status);

-- project_members
create index idx_members_project on public.project_members(project_id);
create index idx_members_user on public.project_members(user_id);

-- tasks
create index idx_tasks_project on public.tasks(project_id);
create index idx_tasks_assignee on public.tasks(assignee_id);
create index idx_tasks_status on public.tasks(status);
create index idx_tasks_priority on public.tasks(priority);
create index idx_tasks_parent on public.tasks(parent_task_id);
create index idx_tasks_milestone on public.tasks(milestone_id);
create index idx_tasks_due_date on public.tasks(due_date);
create index idx_tasks_tags on public.tasks using gin(tags);        -- 태그 배열 검색
create index idx_tasks_metadata on public.tasks using gin(metadata); -- JSONB 검색
create index idx_tasks_title_trgm on public.tasks using gin(title gin_trgm_ops); -- 자연어 검색

-- task_activities
create index idx_activities_task on public.task_activities(task_id);
create index idx_activities_created on public.task_activities(created_at desc);

-- ai_action_logs
create index idx_ai_logs_user on public.ai_action_logs(user_id);
create index idx_ai_logs_project on public.ai_action_logs(project_id);
create index idx_ai_logs_created on public.ai_action_logs(created_at desc);

-- reports
create index idx_reports_project on public.reports(project_id);


-- ============================================================
-- 14. updated_at 자동 갱신 트리거
-- ============================================================
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

create trigger trg_projects_updated_at
  before update on public.projects
  for each row execute function public.handle_updated_at();

create trigger trg_milestones_updated_at
  before update on public.milestones
  for each row execute function public.handle_updated_at();

create trigger trg_tasks_updated_at
  before update on public.tasks
  for each row execute function public.handle_updated_at();

create trigger trg_task_comments_updated_at
  before update on public.task_comments
  for each row execute function public.handle_updated_at();


-- ============================================================
-- 15. 태스크 상태 변경 시 자동 Activity 기록 트리거
-- ============================================================
create or replace function public.log_task_status_change()
returns trigger as $$
begin
  if old.status is distinct from new.status then
    insert into public.task_activities (task_id, actor_id, action, old_value, new_value)
    values (
      new.id,
      auth.uid(),
      'status_changed',
      jsonb_build_object('status', old.status),
      jsonb_build_object('status', new.status)
    );
  end if;

  if old.assignee_id is distinct from new.assignee_id then
    insert into public.task_activities (task_id, actor_id, action, old_value, new_value)
    values (
      new.id,
      auth.uid(),
      'assignee_changed',
      jsonb_build_object('assignee_id', old.assignee_id),
      jsonb_build_object('assignee_id', new.assignee_id)
    );
  end if;

  -- 완료 처리 시 completed_at 자동 기록
  if new.status = 'done' and old.status != 'done' then
    new.completed_at = now();
  end if;

  -- 진행 시작 시 started_at 자동 기록
  if new.status = 'in_progress' and old.started_at is null then
    new.started_at = now();
  end if;

  return new;
end;
$$ language plpgsql security definer;

create trigger trg_task_activity_log
  before update on public.tasks
  for each row execute function public.log_task_status_change();


-- ============================================================
-- 16. 신규 사용자 프로필 자동 생성 트리거
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================
-- 17. RLS (Row Level Security) 활성화
-- ============================================================
alter table public.profiles          enable row level security;
alter table public.projects          enable row level security;
alter table public.project_members   enable row level security;
alter table public.milestones        enable row level security;
alter table public.tasks             enable row level security;
alter table public.task_comments     enable row level security;
alter table public.task_activities   enable row level security;
alter table public.attachments       enable row level security;
alter table public.reports           enable row level security;
alter table public.ai_action_logs    enable row level security;
alter table public.schedule_suggestions enable row level security;


-- ============================================================
-- 18. RLS 정책 - 헬퍼 함수
-- ============================================================

-- 현재 유저가 해당 프로젝트 멤버인지 확인
create or replace function public.is_project_member(p_project_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.project_members
    where project_id = p_project_id
      and user_id = auth.uid()
  );
$$ language sql security definer stable;

-- 현재 유저의 프로젝트 역할 반환
create or replace function public.get_project_role(p_project_id uuid)
returns member_role as $$
  select role from public.project_members
  where project_id = p_project_id
    and user_id = auth.uid()
  limit 1;
$$ language sql security definer stable;


-- ============================================================
-- 19. RLS 정책 - profiles
-- ============================================================
create policy "본인 프로필 조회"
  on public.profiles for select
  using (id = auth.uid());

create policy "같은 프로젝트 멤버 프로필 조회"
  on public.profiles for select
  using (
    exists (
      select 1 from public.project_members pm1
      join public.project_members pm2 on pm1.project_id = pm2.project_id
      where pm1.user_id = auth.uid()
        and pm2.user_id = profiles.id
    )
  );

create policy "본인 프로필 수정"
  on public.profiles for update
  using (id = auth.uid());


-- ============================================================
-- 20. RLS 정책 - projects
-- ============================================================
create policy "프로젝트 멤버만 조회"
  on public.projects for select
  using (public.is_project_member(id));

create policy "인증 유저 프로젝트 생성"
  on public.projects for insert
  with check (auth.uid() = owner_id);

create policy "owner/manager만 수정"
  on public.projects for update
  using (
    public.get_project_role(id) in ('owner', 'manager')
  );

create policy "owner만 삭제"
  on public.projects for delete
  using (owner_id = auth.uid());


-- ============================================================
-- 21. RLS 정책 - project_members
-- ============================================================
create policy "프로젝트 멤버 목록 조회"
  on public.project_members for select
  using (public.is_project_member(project_id));

create policy "owner/manager가 멤버 추가"
  on public.project_members for insert
  with check (
    public.get_project_role(project_id) in ('owner', 'manager')
  );

create policy "owner/manager가 멤버 수정"
  on public.project_members for update
  using (
    public.get_project_role(project_id) in ('owner', 'manager')
  );

create policy "owner/manager가 멤버 삭제"
  on public.project_members for delete
  using (
    public.get_project_role(project_id) in ('owner', 'manager')
  );


-- ============================================================
-- 22. RLS 정책 - milestones / tasks / comments
-- ============================================================

-- milestones: 프로젝트 멤버면 조회, manager 이상만 생성/수정/삭제
create policy "마일스톤 조회" on public.milestones for select
  using (public.is_project_member(project_id));
create policy "마일스톤 생성" on public.milestones for insert
  with check (public.get_project_role(project_id) in ('owner', 'manager'));
create policy "마일스톤 수정" on public.milestones for update
  using (public.get_project_role(project_id) in ('owner', 'manager'));
create policy "마일스톤 삭제" on public.milestones for delete
  using (public.get_project_role(project_id) in ('owner', 'manager'));

-- tasks: 프로젝트 멤버 전체 CRUD (viewer 제외 생성/수정)
create policy "태스크 조회" on public.tasks for select
  using (public.is_project_member(project_id));
create policy "태스크 생성" on public.tasks for insert
  with check (
    public.get_project_role(project_id) not in ('viewer')
  );
create policy "태스크 수정" on public.tasks for update
  using (
    public.get_project_role(project_id) not in ('viewer')
  );
create policy "태스크 삭제" on public.tasks for delete
  using (
    public.get_project_role(project_id) in ('owner', 'manager')
    or created_by = auth.uid()
  );

-- task_comments
create policy "댓글 조회" on public.task_comments for select
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_id and public.is_project_member(t.project_id)
    )
  );
create policy "댓글 작성" on public.task_comments for insert
  with check (author_id = auth.uid());
create policy "본인 댓글 수정" on public.task_comments for update
  using (author_id = auth.uid());
create policy "본인 댓글 삭제" on public.task_comments for delete
  using (author_id = auth.uid());

-- task_activities: 조회만 허용 (쓰기는 트리거가 담당)
create policy "활동 이력 조회" on public.task_activities for select
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_id and public.is_project_member(t.project_id)
    )
  );

-- reports
create policy "보고서 조회" on public.reports for select
  using (public.is_project_member(project_id));
create policy "보고서 생성" on public.reports for insert
  with check (public.get_project_role(project_id) not in ('viewer'));

-- ai_action_logs: 본인 로그만 조회
create policy "AI 로그 본인 조회" on public.ai_action_logs for select
  using (user_id = auth.uid());
create policy "AI 로그 생성" on public.ai_action_logs for insert
  with check (user_id = auth.uid());

-- schedule_suggestions
create policy "일정 추천 조회" on public.schedule_suggestions for select
  using (public.is_project_member(project_id));
create policy "일정 추천 생성" on public.schedule_suggestions for insert
  with check (public.get_project_role(project_id) not in ('viewer'));


-- ============================================================
-- 23. 유용한 뷰 (Views)
-- ============================================================

-- 프로젝트별 태스크 통계
create or replace view public.project_task_stats as
select
  p.id as project_id,
  p.name as project_name,
  count(t.id) as total_tasks,
  count(t.id) filter (where t.status = 'done') as completed_tasks,
  count(t.id) filter (where t.status = 'in_progress') as in_progress_tasks,
  count(t.id) filter (where t.status in ('backlog', 'todo')) as pending_tasks,
  count(t.id) filter (where t.due_date < current_date and t.status != 'done') as overdue_tasks,
  round(
    count(t.id) filter (where t.status = 'done')::numeric
    / nullif(count(t.id), 0) * 100, 1
  ) as completion_rate
from public.projects p
left join public.tasks t on t.project_id = p.id and t.parent_task_id is null
group by p.id, p.name;

comment on view public.project_task_stats is '프로젝트별 태스크 통계 (AI 보고서 생성에 활용)';

-- 멤버별 워크로드
create or replace view public.member_workload as
select
  pr.id as user_id,
  pr.full_name,
  pr.email,
  pm.project_id,
  count(t.id) as assigned_tasks,
  count(t.id) filter (where t.status = 'in_progress') as active_tasks,
  count(t.id) filter (where t.due_date < current_date and t.status != 'done') as overdue_tasks,
  sum(t.estimated_hours) as total_estimated_hours,
  sum(t.actual_hours) as total_actual_hours
from public.profiles pr
join public.project_members pm on pm.user_id = pr.id
left join public.tasks t on t.assignee_id = pr.id and t.project_id = pm.project_id
group by pr.id, pr.full_name, pr.email, pm.project_id;

comment on view public.member_workload is '멤버별 워크로드 현황 (AI 일정 추천에 활용)';


-- ============================================================
-- 완료
-- ============================================================
