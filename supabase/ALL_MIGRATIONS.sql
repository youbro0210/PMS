-- MnSi PMS 전체 스키마 (0001~0008 통합).

-- ===== 0001_init.sql =====
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

-- ===== 0002_pgvector.sql =====
-- ============================================================
-- 0002: pgvector 의미 검색 추가
-- 0001_init.sql 이후 실행
-- ============================================================

-- 1. pgvector 확장
create extension if not exists vector;

-- 2. tasks 임베딩 컬럼 (title + description 결합 임베딩)
--    차원수는 사용하는 임베딩 모델에 맞춤 (text-embedding-3-small = 1536)
alter table public.tasks
  add column if not exists embedding vector(1536),
  add column if not exists embedding_updated_at timestamptz;

comment on column public.tasks.embedding is '의미 검색용 임베딩 (title+description)';
comment on column public.tasks.embedding_updated_at is 'null이면 재생성 대상';

-- 3. HNSW 인덱스 (코사인 거리, 정확도/속도 균형)
create index if not exists idx_tasks_embedding on public.tasks
  using hnsw (embedding vector_cosine_ops);

-- 4. 내용 변경 시 임베딩을 stale로 표시하는 트리거
create or replace function public.mark_embedding_stale()
returns trigger as $$
begin
  if (new.title is distinct from old.title)
     or (new.description is distinct from old.description) then
    new.embedding_updated_at = null;  -- null = 재생성 필요
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_tasks_embedding_stale on public.tasks;
create trigger trg_tasks_embedding_stale
  before update on public.tasks
  for each row execute function public.mark_embedding_stale();

-- 5. 하이브리드 검색 RPC (trgm + vector 가중 결합)
--    security invoker → 호출자 RLS 적용 (멤버 프로젝트만 검색됨)
create or replace function public.search_tasks_hybrid(
  p_project_id uuid,
  p_query      text,
  p_embedding  vector(1536),
  p_limit      int default 5
)
returns table (
  id uuid,
  title text,
  status task_status,
  trgm_score real,
  vector_score real,
  hybrid_score real
)
language sql stable security invoker
as $$
  select
    t.id,
    t.title,
    t.status,
    similarity(t.title, p_query)                  as trgm_score,
    (1 - (t.embedding <=> p_embedding))::real      as vector_score,
    (0.4 * similarity(t.title, p_query)
     + 0.6 * (1 - (t.embedding <=> p_embedding)))::real as hybrid_score
  from public.tasks t
  where t.project_id = p_project_id
    and t.embedding is not null
  order by hybrid_score desc
  limit p_limit;
$$;

comment on function public.search_tasks_hybrid is 'trgm+벡터 하이브리드 태스크 검색 (엔티티 해소·검색용)';

-- ===== 0003_construction.sql =====
-- ============================================================
-- 0003: 건설 프로젝트 관리(PMS) 도메인
--   현장별 공정률 · 기성 · 실행예산/원가 · 협력업체 · 안전/품질 관리
--   0001_init.sql, 0002_pgvector.sql 이후 실행
-- ============================================================

-- ============================================================
-- A. ENUM
-- ============================================================
create type work_status as enum (
  'not_started',  -- 미착수
  'in_progress',  -- 진행 중
  'completed',    -- 완료
  'suspended'     -- 중단
);

create type billing_status as enum (
  'draft',        -- 작성 중
  'requested',    -- 기성 청구
  'reviewed',     -- 사정 완료
  'confirmed',    -- 확정
  'paid'          -- 지급 완료
);

create type cost_category as enum (
  'labor',        -- 노무비
  'material',     -- 자재비
  'subcontract',  -- 외주비(하도급)
  'equipment',    -- 장비비
  'expense'       -- 경비
);

create type inspection_type as enum ('safety', 'quality');           -- 안전 / 품질
create type inspection_result as enum ('pass', 'conditional', 'fail'); -- 합격 / 조건부 / 불합격

-- AI 의도 확장 (건설 명령)
alter type ai_intent add value if not exists 'get_progress_summary';
alter type ai_intent add value if not exists 'update_progress';
alter type ai_intent add value if not exists 'get_billing_status';
alter type ai_intent add value if not exists 'record_billing';
alter type ai_intent add value if not exists 'get_cost_summary';
alter type ai_intent add value if not exists 'log_inspection';


-- ============================================================
-- B. projects 확장 — 프로젝트 = 건설 현장
-- ============================================================
alter table public.projects
  add column if not exists client_name      text,            -- 발주처
  add column if not exists contractor_name  text,            -- 원도급사(시공사)
  add column if not exists contract_amount  numeric(16, 0),  -- 총 도급액(원)
  add column if not exists contract_no      text,            -- 계약번호
  add column if not exists site_address     text,            -- 현장 주소
  add column if not exists construction_type text;           -- 공사 종류(건축/토목/플랜트 등)

comment on column public.projects.contract_amount is '총 도급계약 금액(원)';


-- ============================================================
-- C. 협력업체(하도급사)
-- ============================================================
create table public.subcontractors (
  id              uuid primary key default uuid_generate_v4(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  name            text not null,                  -- 업체명
  trade           text,                           -- 공종/업종(철근, 콘크리트, 전기 등)
  business_no     text,                           -- 사업자번호
  contact_name    text,
  contact_phone   text,
  contract_amount numeric(16, 0),                 -- 하도급 계약금액
  contract_start  date,
  contract_end    date,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
comment on table public.subcontractors is '현장 협력업체(하도급사)';


-- ============================================================
-- D. 공종 / WBS (Work Breakdown Structure)
--    계층 구조 + 가중치 기반 공정률 집계
-- ============================================================
create table public.work_packages (
  id                uuid primary key default uuid_generate_v4(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  parent_id         uuid references public.work_packages(id) on delete cascade,
  subcontractor_id  uuid references public.subcontractors(id) on delete set null,

  code              text,                          -- 공종 코드(예: 03-200)
  name              text not null,                 -- 공종명(철근콘크리트, 토공 등)
  weight            numeric(6, 3) default 0,       -- 전체 대비 가중치(%) — 공정률 가중평균용
  planned_amount    numeric(16, 0),                -- 도급내역 금액

  planned_start     date,
  planned_end       date,
  planned_progress  numeric(5, 2) default 0,       -- 계획 공정률(%)
  actual_progress   numeric(5, 2) default 0,       -- 실적 공정률(%)
  status            work_status not null default 'not_started',

  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);
comment on table public.work_packages is '공종/WBS (가중치 기반 공정률 집계)';
comment on column public.work_packages.weight is '전체 공사 대비 비중(%) — 가중 공정률 산정에 사용';


-- ============================================================
-- E. 공정 실적 이력 (기간별 계획 대비 실적)
-- ============================================================
create table public.progress_records (
  id                uuid primary key default uuid_generate_v4(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  work_package_id   uuid not null references public.work_packages(id) on delete cascade,
  record_date       date not null default current_date,
  planned_rate      numeric(5, 2),                 -- 해당 시점 계획 공정률(%)
  actual_rate       numeric(5, 2),                 -- 해당 시점 실적 공정률(%)
  note              text,
  recorded_by       uuid references public.profiles(id) on delete set null,
  created_at        timestamptz default now()
);
comment on table public.progress_records is '공종별 공정률 실적 이력(공정표 추적)';


-- ============================================================
-- F. 기성 (Progress Billing) — 회차별 기성 청구/사정/지급
-- ============================================================
create table public.billings (
  id                uuid primary key default uuid_generate_v4(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  subcontractor_id  uuid references public.subcontractors(id) on delete set null,
  -- subcontractor_id가 null이면 발주처 대상 '원도급 기성', 값이 있으면 협력사 '하도급 기성'

  period_no         int not null,                  -- 기성 회차(1, 2, 3 ...)
  period_start      date,
  period_end        date,
  contract_amount   numeric(16, 0),                -- 기준 도급액
  this_amount       numeric(16, 0) not null default 0,  -- 금회 기성금액
  cumulative_amount numeric(16, 0) not null default 0,  -- 누계 기성금액
  progress_rate     numeric(5, 2),                 -- 기성률(누계/도급액 %)

  status            billing_status not null default 'draft',
  requested_at      timestamptz,
  confirmed_at      timestamptz,
  paid_at           timestamptz,

  note              text,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),

  unique (project_id, subcontractor_id, period_no)
);
comment on table public.billings is '기성 청구/사정/지급 (회차별, 원도급·하도급)';
comment on column public.billings.subcontractor_id is 'null=발주처 대상 원도급 기성, 값 있으면 협력사 하도급 기성';

-- 기성 공종별 명세(선택)
create table public.billing_items (
  id                uuid primary key default uuid_generate_v4(),
  billing_id        uuid not null references public.billings(id) on delete cascade,
  work_package_id   uuid references public.work_packages(id) on delete set null,
  this_amount       numeric(16, 0) not null default 0,
  cumulative_amount numeric(16, 0) not null default 0
);
comment on table public.billing_items is '기성 공종별 명세';


-- ============================================================
-- G. 실행예산 / 원가 집행
-- ============================================================
create table public.budget_items (
  id                uuid primary key default uuid_generate_v4(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  work_package_id   uuid references public.work_packages(id) on delete set null,
  category          cost_category not null,
  description       text,
  budget_amount     numeric(16, 0) not null default 0,   -- 실행예산
  created_at        timestamptz default now()
);
comment on table public.budget_items is '실행예산(공종·원가분류별)';

create table public.cost_entries (
  id                uuid primary key default uuid_generate_v4(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  work_package_id   uuid references public.work_packages(id) on delete set null,
  subcontractor_id  uuid references public.subcontractors(id) on delete set null,
  category          cost_category not null,
  description       text,
  amount            numeric(16, 0) not null default 0,    -- 실제 집행액
  entry_date        date not null default current_date,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz default now()
);
comment on table public.cost_entries is '원가 집행 내역(노무/자재/외주/장비/경비)';


-- ============================================================
-- H. 안전 / 품질 점검
-- ============================================================
create table public.inspections (
  id                uuid primary key default uuid_generate_v4(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  work_package_id   uuid references public.work_packages(id) on delete set null,
  type              inspection_type not null,
  inspector_id      uuid references public.profiles(id) on delete set null,
  inspection_date   date not null default current_date,
  location          text,                          -- 점검 위치
  result            inspection_result not null default 'pass',
  findings          text,                          -- 지적 사항
  corrective_action text,                          -- 시정 조치
  due_date          date,                          -- 조치 기한
  is_closed         boolean default false,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);
comment on table public.inspections is '안전/품질 점검 및 지적·시정 관리';


-- ============================================================
-- I. 인덱스
-- ============================================================
create index idx_subs_project on public.subcontractors(project_id);
create index idx_wp_project on public.work_packages(project_id);
create index idx_wp_parent on public.work_packages(parent_id);
create index idx_wp_sub on public.work_packages(subcontractor_id);
create index idx_prog_project on public.progress_records(project_id);
create index idx_prog_wp on public.progress_records(work_package_id);
create index idx_billing_project on public.billings(project_id);
create index idx_billing_sub on public.billings(subcontractor_id);
create index idx_budget_project on public.budget_items(project_id);
create index idx_cost_project on public.cost_entries(project_id);
create index idx_cost_date on public.cost_entries(entry_date desc);
create index idx_insp_project on public.inspections(project_id);
create index idx_insp_open on public.inspections(project_id) where is_closed = false;


-- ============================================================
-- J. updated_at 트리거 재사용
-- ============================================================
create trigger trg_subs_updated_at before update on public.subcontractors
  for each row execute function public.handle_updated_at();
create trigger trg_wp_updated_at before update on public.work_packages
  for each row execute function public.handle_updated_at();
create trigger trg_billing_updated_at before update on public.billings
  for each row execute function public.handle_updated_at();
create trigger trg_insp_updated_at before update on public.inspections
  for each row execute function public.handle_updated_at();


-- ============================================================
-- K. RLS — 기존 헬퍼(is_project_member / get_project_role) 재사용
-- ============================================================
alter table public.subcontractors   enable row level security;
alter table public.work_packages    enable row level security;
alter table public.progress_records enable row level security;
alter table public.billings         enable row level security;
alter table public.billing_items    enable row level security;
alter table public.budget_items     enable row level security;
alter table public.cost_entries     enable row level security;
alter table public.inspections      enable row level security;

-- 멤버면 조회, viewer 제외 생성/수정 (공통 패턴)
do $$
declare
  t text;
  member_tables text[] := array[
    'subcontractors','work_packages','progress_records',
    'billings','budget_items','cost_entries','inspections'
  ];
begin
  foreach t in array member_tables loop
    execute format($f$
      create policy "%1$s 조회" on public.%1$I for select
        using (public.is_project_member(project_id));
      create policy "%1$s 생성" on public.%1$I for insert
        with check (public.get_project_role(project_id) not in ('viewer'));
      create policy "%1$s 수정" on public.%1$I for update
        using (public.get_project_role(project_id) not in ('viewer'));
      create policy "%1$s 삭제" on public.%1$I for delete
        using (public.get_project_role(project_id) in ('owner','manager'));
    $f$, t);
  end loop;
end $$;

-- billing_items: 상위 기성의 프로젝트 멤버 기준
create policy "billing_items 조회" on public.billing_items for select
  using (exists (select 1 from public.billings b
    where b.id = billing_id and public.is_project_member(b.project_id)));
create policy "billing_items 변경" on public.billing_items for all
  using (exists (select 1 from public.billings b
    where b.id = billing_id and public.get_project_role(b.project_id) not in ('viewer')));


-- ============================================================
-- L. 집계 뷰 (AI 요약·보고서가 수치 출처로 사용 — 환각 방지)
-- ============================================================

-- 현장 전체 공정률: 공종 가중치 기반 가중평균
create or replace view public.project_progress_summary as
select
  p.id as project_id,
  p.name as project_name,
  round(
    sum(wp.weight * wp.actual_progress) / nullif(sum(wp.weight), 0), 2
  ) as actual_progress,
  round(
    sum(wp.weight * wp.planned_progress) / nullif(sum(wp.weight), 0), 2
  ) as planned_progress,
  round(
    sum(wp.weight * wp.actual_progress) / nullif(sum(wp.weight), 0)
    - sum(wp.weight * wp.planned_progress) / nullif(sum(wp.weight), 0), 2
  ) as variance  -- 양수=선행, 음수=지연
from public.projects p
left join public.work_packages wp on wp.project_id = p.id
group by p.id, p.name;
comment on view public.project_progress_summary is '현장 가중 공정률(계획 대비 실적·편차)';

-- 기성 현황: 누계 기성 / 도급액
create or replace view public.billing_summary as
select
  b.project_id,
  count(*) as billing_count,
  max(b.period_no) as latest_period,
  max(b.cumulative_amount) as cumulative_billed,
  max(b.contract_amount) as contract_amount,
  round(
    max(b.cumulative_amount)::numeric / nullif(max(b.contract_amount), 0) * 100, 2
  ) as billed_rate,
  sum(b.this_amount) filter (where b.status = 'paid') as paid_total
from public.billings b
where b.subcontractor_id is null  -- 원도급(발주처 대상) 기성 기준
group by b.project_id;
comment on view public.billing_summary is '원도급 기성 현황(누계 기성률·지급액)';

-- 실행예산 대비 원가 집행
create or replace view public.cost_summary as
select
  p.id as project_id,
  coalesce(b.budget_total, 0) as budget_total,
  coalesce(c.cost_total, 0) as cost_total,
  coalesce(b.budget_total, 0) - coalesce(c.cost_total, 0) as remaining,
  round(
    coalesce(c.cost_total, 0)::numeric / nullif(b.budget_total, 0) * 100, 2
  ) as execution_rate
from public.projects p
left join (
  select project_id, sum(budget_amount) as budget_total
  from public.budget_items group by project_id
) b on b.project_id = p.id
left join (
  select project_id, sum(amount) as cost_total
  from public.cost_entries group by project_id
) c on c.project_id = p.id;
comment on view public.cost_summary is '실행예산 대비 원가 집행률';

-- 원가 분류별 집행
create or replace view public.cost_by_category as
select project_id, category, sum(amount) as total
from public.cost_entries
group by project_id, category;


-- ============================================================
-- 완료
-- ============================================================

-- ===== 0004_billing_advance_retention.sql =====
-- ============================================================
-- 0004: 선급금(Advance) · 기성 유보(Retention) 정산
--   0003_construction.sql 이후 실행
-- ============================================================

-- ------------------------------------------------------------
-- A. 프로젝트(현장) 계약 조건
-- ------------------------------------------------------------
alter table public.projects
  add column if not exists advance_payment      numeric(16, 0) default 0,  -- 선급금 총액
  add column if not exists advance_recovery_rate numeric(5, 2) default 0,  -- 기성당 선급금 정산율(%)
  add column if not exists retention_rate        numeric(5, 2) default 0;  -- 기성 유보율(%)

comment on column public.projects.advance_payment is '계약 선급금 총액(원)';
comment on column public.projects.advance_recovery_rate is '기성 발생 시 선급금 정산 비율(%) — 금회 기성액에 곱해 차감';
comment on column public.projects.retention_rate is '기성 유보율(%) — 금회 기성액에서 유보(준공/하자담보 시 정산)';


-- ------------------------------------------------------------
-- B. 기성 정산 컬럼
-- ------------------------------------------------------------
alter table public.billings
  add column if not exists retention_amount   numeric(16, 0) default 0,  -- 금회 유보액
  add column if not exists advance_deduction  numeric(16, 0) default 0,  -- 금회 선급금 정산액
  add column if not exists net_payment        numeric(16, 0) default 0;  -- 실지급액

comment on column public.billings.retention_amount is '금회 기성액 × 유보율';
comment on column public.billings.advance_deduction is '금회 기성액 × 선급금 정산율';
comment on column public.billings.net_payment is '실지급액 = 금회 기성액 − 유보액 − 선급금 정산액';

-- 실지급액 자동 산정 트리거 (입력 누락 시 보정)
create or replace function public.calc_billing_net()
returns trigger as $$
begin
  new.net_payment :=
    coalesce(new.this_amount, 0)
    - coalesce(new.retention_amount, 0)
    - coalesce(new.advance_deduction, 0);
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_billing_net on public.billings;
create trigger trg_billing_net
  before insert or update on public.billings
  for each row execute function public.calc_billing_net();


-- ------------------------------------------------------------
-- C. 기성 현황 뷰 보강 — 유보 누계·선급금 잔액·실지급 누계
-- ------------------------------------------------------------
drop view if exists public.billing_summary;
create view public.billing_summary as
select
  b.project_id,
  count(*)                          as billing_count,
  max(b.period_no)                  as latest_period,
  max(b.cumulative_amount)          as cumulative_billed,   -- 누계 기성액
  max(b.contract_amount)            as contract_amount,
  round(
    max(b.cumulative_amount)::numeric / nullif(max(b.contract_amount), 0) * 100, 2
  )                                 as billed_rate,          -- 기성률(%)
  sum(b.retention_amount)           as retention_held,       -- 누계 유보액
  sum(b.advance_deduction)          as advance_recovered,    -- 누계 선급금 정산액
  sum(b.net_payment)                as net_paid_total,       -- 누계 실지급액
  (p.advance_payment - coalesce(sum(b.advance_deduction), 0)) as advance_balance  -- 선급금 잔액
from public.billings b
join public.projects p on p.id = b.project_id
where b.subcontractor_id is null   -- 원도급(발주처 대상) 기성 기준
group by b.project_id, p.advance_payment;

comment on view public.billing_summary is '원도급 기성 현황(기성률·유보 누계·선급금 잔액·실지급 누계)';


-- ============================================================
-- 완료
-- ============================================================

-- ===== 0005_project_provisioning.sql =====
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

-- ===== 0006_mnsi_eto.sql =====
-- ============================================================
-- 0006: 수주형 제조(ETO) 도메인 — MnSi(압축기·모듈 패키지) 맞춤
--   수소·가스 압축기 패키지, 디젤/마린 모듈 등 수주 프로젝트 관리
--   설계→구매→제작→FAT→출하→시운전 단계, 롱리드 기자재 추적, 마일스톤 대금
--   0005 이후 실행
-- ============================================================

-- ------------------------------------------------------------
-- A. ENUM
-- ------------------------------------------------------------
-- 제품 유형 (MnSi 라인업)
create type product_type as enum (
  'compressor',     -- 압축기 유닛(수소·가스)
  'booster',        -- 부스터 유닛
  'purifier',       -- 퓨리파이어 유닛
  'diesel_power',   -- 디젤 발전 유닛
  'electric_heater',-- 전기 히터
  'filter_valve',   -- 필터·특수밸브
  'module',         -- 마린/오프쇼어/파워 모듈
  'other'
);

-- 구매(기자재) 상태
create type procurement_status as enum (
  'planned',     -- 발주 예정
  'ordered',     -- 발주(PO)
  'in_transit',  -- 운송 중
  'received',    -- 입고
  'inspected'    -- 입고검사 완료
);

-- 점검 유형에 FAT(공장수락시험) 추가
alter type inspection_type add value if not exists 'fat';

-- AI 의도 확장
alter type ai_intent add value if not exists 'record_procurement';
alter type ai_intent add value if not exists 'get_procurement_status';


-- ------------------------------------------------------------
-- B. projects 확장 — 프로젝트 = 수주 건
-- ------------------------------------------------------------
alter table public.projects
  add column if not exists order_no       text,            -- 수주번호
  add column if not exists product_type   product_type,    -- 제품 유형
  add column if not exists end_user        text,           -- 최종 납품처(예: ○○ 수소충전소)
  add column if not exists delivery_date   date,           -- 납기(출하 예정일)
  add column if not exists serial_no       text;           -- 제품 시리얼/패키지 번호

comment on column public.projects.end_user is '최종 사용처(충전소/선사/발전소 등)';
comment on column public.projects.delivery_date is '계약 납기(출하 예정일)';


-- ------------------------------------------------------------
-- C. 기자재 구매(BOM/Procurement) — ETO 핵심: 롱리드 수입품 납기 추적
--    (예: 독일 NEA 압축기 본체는 리드타임이 길어 전체 일정의 임계경로)
-- ------------------------------------------------------------
create table public.procurement_items (
  id               uuid primary key default uuid_generate_v4(),
  project_id       uuid not null references public.projects(id) on delete cascade,
  vendor_id        uuid references public.subcontractors(id) on delete set null,  -- 공급사(협력사 재사용)
  work_package_id  uuid references public.work_packages(id) on delete set null,   -- 관련 단계

  name             text not null,                 -- 품목명(예: NEA 다이어프램 압축기 본체)
  spec             text,                          -- 사양
  qty              numeric(12, 2) default 1,
  unit             text default 'EA',
  amount           numeric(16, 0) default 0,      -- 발주 금액

  po_no            text,                          -- 발주번호(PO)
  order_date       date,                          -- 발주일
  lead_time_weeks  int,                           -- 리드타임(주)
  eta              date,                          -- 입고 예정일
  received_date    date,                          -- 실제 입고일
  is_long_lead     boolean default false,         -- 롱리드(임계경로) 품목
  status           procurement_status not null default 'planned',

  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);
comment on table public.procurement_items is '기자재 구매/입고 추적(롱리드 수입품 임계경로 관리)';

create index idx_proc_project on public.procurement_items(project_id);
create index idx_proc_vendor on public.procurement_items(vendor_id);
create index idx_proc_longlead on public.procurement_items(project_id) where is_long_lead = true;

create trigger trg_proc_updated_at before update on public.procurement_items
  for each row execute function public.handle_updated_at();


-- ------------------------------------------------------------
-- D. RLS — 멤버 조회, viewer 제외 변경
-- ------------------------------------------------------------
alter table public.procurement_items enable row level security;

create policy "구매 조회" on public.procurement_items for select
  using (public.is_project_member(project_id));
create policy "구매 생성" on public.procurement_items for insert
  with check (public.get_project_role(project_id) not in ('viewer'));
create policy "구매 수정" on public.procurement_items for update
  using (public.get_project_role(project_id) not in ('viewer'));
create policy "구매 삭제" on public.procurement_items for delete
  using (public.get_project_role(project_id) in ('owner', 'manager'));


-- ------------------------------------------------------------
-- E. 구매 현황 뷰 (입고율·롱리드 지연 위험)
-- ------------------------------------------------------------
create or replace view public.procurement_summary as
select
  pi.project_id,
  count(*)                                                          as item_count,
  count(*) filter (where pi.status in ('received', 'inspected'))    as received_count,
  count(*) filter (where pi.is_long_lead)                           as long_lead_count,
  count(*) filter (
    where pi.is_long_lead
      and pi.status not in ('received', 'inspected')
      and pi.eta < current_date
  )                                                                 as long_lead_overdue,
  round(
    count(*) filter (where pi.status in ('received', 'inspected'))::numeric
    / nullif(count(*), 0) * 100, 1
  )                                                                 as received_rate,
  sum(pi.amount)                                                    as procurement_total
from public.procurement_items pi
group by pi.project_id;
comment on view public.procurement_summary is '기자재 입고율·롱리드 지연 현황';


-- ------------------------------------------------------------
-- F. 표준 ETO 단계(Phase) 시드 — 공종 대신 수주 제조 단계
--    work_packages를 단계로 사용(가중치 합 100)
-- ------------------------------------------------------------
create or replace function public.seed_standard_phases(p_project_id uuid)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare v_count int;
begin
  insert into public.work_packages (project_id, code, name, weight, planned_progress, actual_progress, status)
  values
    (p_project_id, 'P1', '수주/계약',        5,  0, 0, 'not_started'),
    (p_project_id, 'P2', '기본·상세설계',     20, 0, 0, 'not_started'),
    (p_project_id, 'P3', '구매/자재조달',     15, 0, 0, 'not_started'),
    (p_project_id, 'P4', '제작/가공',        25, 0, 0, 'not_started'),
    (p_project_id, 'P5', '조립/패키징',       15, 0, 0, 'not_started'),
    (p_project_id, 'P6', 'FAT(공장시험)',     10, 0, 0, 'not_started'),
    (p_project_id, 'P7', '출하/납품',         5,  0, 0, 'not_started'),
    (p_project_id, 'P8', '설치/시운전',       5,  0, 0, 'not_started');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
grant execute on function public.seed_standard_phases to authenticated;
comment on function public.seed_standard_phases is '수주 제조 표준 단계 8종 생성(설계→구매→제작→FAT→출하→시운전)';


-- ------------------------------------------------------------
-- G. create_project 확장 — 제품유형·납품처·납기·수주번호 포함
-- ------------------------------------------------------------
-- 0005의 14인자 버전을 제거(인자 추가로 시그니처가 바뀌어 중복 방지)
drop function if exists public.create_project(
  text, text, text, text, text, numeric, date, date, text, numeric, numeric, numeric, text, text
);

create or replace function public.create_project(
  p_name                  text,
  p_construction_type     text    default null,   -- (호환) 사업부문/구분
  p_client_name           text    default null,   -- 발주처/고객
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
  p_icon                  text    default '🏭',
  p_order_no              text    default null,
  p_product_type          text    default null,
  p_end_user              text    default null,
  p_delivery_date         date    default null
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
  if v_uid is null then raise exception '인증되지 않은 요청입니다.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception '프로젝트명은 필수입니다.'; end if;

  insert into public.projects (
    name, construction_type, client_name, contractor_name, contract_no,
    contract_amount, start_date, end_date, site_address,
    advance_payment, advance_recovery_rate, retention_rate,
    description, icon, status, owner_id,
    order_no, product_type, end_user, delivery_date
  ) values (
    p_name, p_construction_type, p_client_name, p_contractor_name, p_contract_no,
    p_contract_amount, p_start_date, p_end_date, p_site_address,
    coalesce(p_advance_payment, 0), coalesce(p_advance_recovery_rate, 0), coalesce(p_retention_rate, 0),
    p_description, coalesce(p_icon, '🏭'), 'planning', v_uid,
    p_order_no, p_product_type::product_type, p_end_user, p_delivery_date
  )
  returning id into v_id;

  insert into public.project_members (project_id, user_id, role)
  values (v_id, v_uid, 'owner');

  return v_id;
end;
$$;
grant execute on function public.create_project to authenticated;

-- ============================================================
-- 완료
-- ============================================================

-- ===== 0007_users_roles.sql =====
-- ============================================================
-- 0007: 사용자 · 권한 · 시스템 관리자
--   회원가입(Supabase Auth) 후 profiles 자동 생성은 0001 트리거가 처리.
--   여기서는 시스템 관리자 권한과 멤버 초대 RPC를 추가한다.
--   0006 이후 실행
-- ============================================================

-- ------------------------------------------------------------
-- A. 시스템 관리자 플래그
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

comment on column public.profiles.is_admin is '시스템 관리자(전체 프로젝트·사용자 접근)';

-- 현재 사용자가 시스템 관리자인지
create or replace function public.is_system_admin()
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_admin = true);
$$;


-- ------------------------------------------------------------
-- B. 관리자 전체 접근 override
--    멤버 판정 헬퍼가 시스템 관리자에게 true를 반환하도록 갱신.
--    → 기존 모든 RLS 정책(조회)이 자동으로 관리자 전체 접근을 허용.
-- ------------------------------------------------------------
create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.project_members
    where project_id = p_project_id and user_id = auth.uid()
  )
  or exists (
    select 1 from public.profiles where id = auth.uid() and is_admin = true
  );
$$;


-- ------------------------------------------------------------
-- C. 모든 사용자 프로필 조회 (멤버 초대 시 이메일 검색용)
--    profiles SELECT는 기본적으로 본인+같은프로젝트로 제한되므로,
--    관리자/소유자가 이메일로 사용자를 찾을 수 있는 안전한 RPC를 제공.
-- ------------------------------------------------------------
create or replace function public.find_user_by_email(p_email text)
returns table (id uuid, email text, full_name text)
language sql security definer stable
set search_path = public
as $$
  select p.id, p.email, p.full_name
  from public.profiles p
  where lower(p.email) = lower(trim(p_email))
  limit 1;
$$;
grant execute on function public.find_user_by_email to authenticated;


-- ------------------------------------------------------------
-- D. 멤버 초대(추가) — owner/manager 또는 시스템 관리자만
-- ------------------------------------------------------------
create or replace function public.add_project_member(
  p_project_id uuid,
  p_email      text,
  p_role       member_role default 'developer'
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_target uuid;
  v_role  member_role;
begin
  if v_uid is null then raise exception '인증되지 않은 요청입니다.'; end if;

  -- 권한 확인: 해당 프로젝트의 owner/manager 또는 시스템 관리자
  select role into v_role from public.project_members
    where project_id = p_project_id and user_id = v_uid;
  if not (v_role in ('owner', 'manager') or public.is_system_admin()) then
    raise exception '멤버를 추가할 권한이 없습니다.';
  end if;

  -- 대상 사용자 찾기(이미 가입된 사용자만)
  select id into v_target from public.profiles where lower(email) = lower(trim(p_email)) limit 1;
  if v_target is null then
    raise exception '해당 이메일의 사용자를 찾을 수 없습니다. 먼저 회원가입이 필요합니다.';
  end if;

  insert into public.project_members (project_id, user_id, role)
  values (p_project_id, v_target, p_role)
  on conflict (project_id, user_id) do update set role = excluded.role;

  return v_target;
end;
$$;
grant execute on function public.add_project_member to authenticated;
comment on function public.add_project_member is '이메일로 프로젝트 멤버 추가/역할변경 (owner·manager·시스템관리자)';


-- ------------------------------------------------------------
-- E. 시스템 관리자 전용: 전체 사용자 목록 / 관리자 권한 토글
-- ------------------------------------------------------------
create or replace function public.admin_list_users()
returns table (id uuid, email text, full_name text, is_admin boolean, created_at timestamptz)
language sql security definer stable
set search_path = public
as $$
  select p.id, p.email, p.full_name, p.is_admin, p.created_at
  from public.profiles p
  where public.is_system_admin()       -- 관리자가 아니면 0행
  order by p.created_at desc;
$$;
grant execute on function public.admin_list_users to authenticated;

create or replace function public.admin_set_user_admin(p_user_id uuid, p_is_admin boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_system_admin() then
    raise exception '시스템 관리자만 수행할 수 있습니다.';
  end if;
  update public.profiles set is_admin = p_is_admin where id = p_user_id;
end;
$$;
grant execute on function public.admin_set_user_admin to authenticated;


-- ------------------------------------------------------------
-- F. profiles 본인 조회 정책에 관리자 추가
-- ------------------------------------------------------------
create policy "관리자 전체 프로필 조회"
  on public.profiles for select
  using (public.is_system_admin());

-- ============================================================
-- 최초 관리자 지정: 가입 후 아래를 한 번 실행
--   update public.profiles set is_admin = true where email = 'you@example.com';
-- ============================================================

-- ===== 0008_notifications_activity.sql =====
-- ============================================================
-- 0008: 알림(Notifications) · 활동 로그(Activity Log / 감사)
--   0007 이후 실행
-- ============================================================

-- ------------------------------------------------------------
-- A. 활동 로그 (감사 추적)
-- ------------------------------------------------------------
create table public.activity_log (
  id          uuid primary key default uuid_generate_v4(),
  project_id  uuid references public.projects(id) on delete cascade,
  actor_id    uuid references public.profiles(id) on delete set null,
  entity      text not null,         -- billing / procurement / inspection / phase / member
  action      text not null,         -- created / updated / status_changed
  summary     text,
  created_at  timestamptz default now()
);
create index idx_activity_project on public.activity_log(project_id, created_at desc);

alter table public.activity_log enable row level security;
create policy "활동 조회" on public.activity_log for select
  using (public.is_project_member(project_id));


-- ------------------------------------------------------------
-- B. 알림
-- ------------------------------------------------------------
create table public.notifications (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  project_id  uuid references public.projects(id) on delete cascade,
  type        text not null,         -- member / billing / inspection / procurement
  title       text not null,
  body        text,
  link        text,
  is_read     boolean default false,
  created_at  timestamptz default now()
);
create index idx_notif_user on public.notifications(user_id, is_read, created_at desc);

alter table public.notifications enable row level security;
create policy "내 알림 조회" on public.notifications for select using (user_id = auth.uid());
create policy "내 알림 수정" on public.notifications for update using (user_id = auth.uid());
create policy "내 알림 삭제" on public.notifications for delete using (user_id = auth.uid());


-- ------------------------------------------------------------
-- C. 헬퍼 — 프로젝트 멤버 전원에게 알림
-- ------------------------------------------------------------
create or replace function public.notify_members(
  p_project_id uuid, p_type text, p_title text, p_body text, p_link text
)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, project_id, type, title, body, link)
  select pm.user_id, p_project_id, p_type, p_title, p_body, p_link
  from public.project_members pm
  where pm.project_id = p_project_id;
end;
$$;

create or replace function public.won(n numeric)
returns text language sql immutable as $$
  select to_char(coalesce(n, 0), 'FM999,999,999,999') || '원';
$$;


-- ------------------------------------------------------------
-- D. 이벤트 트리거 — 대금 / 구매 / 점검 / 진척
-- ------------------------------------------------------------

-- 대금 등록
create or replace function public.on_billing_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.activity_log (project_id, actor_id, entity, action, summary)
  values (new.project_id, auth.uid(), 'billing', 'created',
          new.period_no || '회차 대금 ' || public.won(new.this_amount) || ' 청구');
  perform public.notify_members(new.project_id, 'billing', '대금 청구 등록',
          new.period_no || '회차 ' || public.won(new.this_amount), '/projects/' || new.project_id || '/billings');
  return new;
end; $$;
create trigger trg_billing_activity after insert on public.billings
  for each row execute function public.on_billing_created();

-- 기자재 등록/상태변경
create or replace function public.on_procurement_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.activity_log (project_id, actor_id, entity, action, summary)
    values (new.project_id, auth.uid(), 'procurement', 'created',
            '기자재 발주: ' || new.name || case when new.is_long_lead then ' (롱리드)' else '' end);
    if new.is_long_lead then
      perform public.notify_members(new.project_id, 'procurement', '롱리드 자재 발주',
              new.name || ' · ETA ' || coalesce(new.eta::text, '미정'), '/projects/' || new.project_id || '/procurement');
    end if;
  elsif new.status is distinct from old.status then
    insert into public.activity_log (project_id, actor_id, entity, action, summary)
    values (new.project_id, auth.uid(), 'procurement', 'status_changed',
            new.name || ' 상태 → ' || new.status);
  end if;
  return new;
end; $$;
create trigger trg_proc_activity after insert or update on public.procurement_items
  for each row execute function public.on_procurement_change();

-- 점검(FAT/품질/안전)
create or replace function public.on_inspection_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.activity_log (project_id, actor_id, entity, action, summary)
  values (new.project_id, auth.uid(), 'inspection', 'created',
          new.type || ' 점검: ' || new.result);
  if new.result = 'fail' then
    perform public.notify_members(new.project_id, 'inspection', '점검 불합격',
            new.type || ' 불합격 — 시정 필요', null);
  end if;
  return new;
end; $$;
create trigger trg_insp_activity after insert on public.inspections
  for each row execute function public.on_inspection_created();

-- 단계 진척 갱신
create or replace function public.on_phase_progress()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.actual_progress is distinct from old.actual_progress then
    insert into public.activity_log (project_id, actor_id, entity, action, summary)
    values (new.project_id, auth.uid(), 'phase', 'updated',
            new.name || ' 진척 ' || old.actual_progress || '% → ' || new.actual_progress || '%');
  end if;
  return new;
end; $$;
create trigger trg_phase_activity after update on public.work_packages
  for each row execute function public.on_phase_progress();


-- ------------------------------------------------------------
-- E. 멤버 초대 시 대상자에게 알림 (0007 함수 재정의)
-- ------------------------------------------------------------
create or replace function public.add_project_member(
  p_project_id uuid, p_email text, p_role member_role default 'developer'
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_target uuid;
  v_role member_role;
  v_pname text;
begin
  if v_uid is null then raise exception '인증되지 않은 요청입니다.'; end if;
  select role into v_role from public.project_members where project_id = p_project_id and user_id = v_uid;
  if not (v_role in ('owner', 'manager') or public.is_system_admin()) then
    raise exception '멤버를 추가할 권한이 없습니다.';
  end if;
  select id into v_target from public.profiles where lower(email) = lower(trim(p_email)) limit 1;
  if v_target is null then
    raise exception '해당 이메일의 사용자를 찾을 수 없습니다. 먼저 회원가입이 필요합니다.';
  end if;

  insert into public.project_members (project_id, user_id, role)
  values (p_project_id, v_target, p_role)
  on conflict (project_id, user_id) do update set role = excluded.role;

  select name into v_pname from public.projects where id = p_project_id;
  insert into public.notifications (user_id, project_id, type, title, body, link)
  values (v_target, p_project_id, 'member', '프로젝트에 추가됨',
          v_pname || ' (' || p_role || ')', '/projects/' || p_project_id || '/board');

  insert into public.activity_log (project_id, actor_id, entity, action, summary)
  values (p_project_id, v_uid, 'member', 'created', p_email || ' 추가(' || p_role || ')');

  return v_target;
end;
$$;
grant execute on function public.add_project_member to authenticated;

-- ============================================================
-- 완료
-- ============================================================
