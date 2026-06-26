# MnSi PMS — 자연어로 관리하는 수주 제조(ETO) 프로젝트 관리 시스템

Next.js + Supabase + Claude API 기반. MnSi(수소·가스 압축기 패키지, 디젤/마린 모듈 제조)의
수주 프로젝트를 **단계 진척·마일스톤 대금·기자재 구매(롱리드)·원가·FAT/품질**로 관리한다.
"상세설계 진척 80%로 갱신해줘", "NEA 압축기 본체 입고 처리해줘"처럼 입력하면 Claude가 도구를
호출해 DB에 반영하고, 현황을 집계해 요약한다.

> 도메인: 압축기 유닛(최대 4,000bar)·부스터·퓨리파이어·디젤발전·전기히터·필터/밸브·모듈.
> 핵심 부품(독일 NEA 압축기)을 수입하므로 **롱리드 자재 납기**가 일정의 임계경로다.

설계 배경은 [`architecture.md`](./architecture.md), 구동 미리보기는 [`demo/preview.html`](./demo/preview.html).

## 핵심 구조

```
직접 경로:  브라우저 ── Supabase JS (RLS) ──> DB        (대시보드 조회·입력, 무료·빠름)
AI 경로:    브라우저 ── /api/ai/* (서버) ── Claude ── executor (권한검증) ──> DB
```

- **LLM은 DB에 직접 쓰지 않는다.** Claude는 tool use로 "무엇을 할지"만 정하고, 실제 실행은
  권한을 재검증하는 서버 executor가 한다(`lib/ai/executors.ts`).
- **권한은 RLS가 최종 강제.** AI 경로도 사용자 세션 클라이언트로 DB를 조작한다.
- **수치는 SQL, 서술은 LLM.** 공정률·기성률·집행률은 집계 뷰에서, 문장만 Claude가 생성(환각 방지).

## 도메인 모델 (수주 제조 / ETO)

| 영역 | 테이블 | 핵심 |
|------|--------|------|
| 수주 | `projects` (확장) | 고객·납품처·제품유형·수주번호·계약금액·납기 |
| 공급사/협력사 | `subcontractors` | 벤더(NEA 등), 공종/업종, 계약금액 |
| 단계/WBS | `work_packages` | 수주→설계→구매→제작→FAT→출하→시운전, 가중치·계획/실적 진척 |
| 진척 실적 | `progress_records` | 기간별 계획 대비 실적 이력 |
| 마일스톤 대금 | `billings` | 계약금/중도금/잔금 청구·확정·수금, **선급금 정산·유보·실수금** |
| 기자재 구매 | `procurement_items` | 발주(PO)→운송→입고→검사, **롱리드 임계경로·ETA 추적** |
| 원가 | `budget_items`, `cost_entries` | 노무·자재·외주·장비·경비 |
| FAT/품질/안전 | `inspections` | FAT·품질·안전 점검 결과·시정 |

집계 뷰: `project_progress_summary`(가중 진척), `billing_summary`(누계 대금률·실수금),
`procurement_summary`(입고율·롱리드 지연), `cost_summary`(예산 대비 집행률).

## 사용자 · 권한

- 회원가입(`/signup`) → Supabase Auth, 가입 시 `profiles` 자동 생성(트리거).
- 프로젝트 역할(6단계): 소유자 / 관리자(PM) / 실무 담당 / 설계 / 품질·QA / 열람 전용.
  RLS가 역할별 접근을 강제(예: 열람 전용은 쓰기 불가, 삭제는 소유자·관리자만).
- 멤버 관리(`/projects/[id]/members`): 이메일로 초대(`add_project_member` RPC, 권한 검증),
  역할 변경·삭제. 초대 대상은 먼저 회원가입돼 있어야 한다.
- 시스템 관리자(`profiles.is_admin`): 전체 프로젝트·사용자 접근(`/admin`). 최초 관리자는
  `0007` 주석대로 `update profiles set is_admin=true where email='...'` 한 번 실행해 지정.

## AI 명령 예시

| 입력 | tool | 동작 |
|------|------|------|
| "상세설계 진척 80%로 갱신해줘" | `update_progress` | 단계 실적 갱신 + 이력 적재 |
| "NEA 압축기 본체 롱리드로 발주 등록" | `record_procurement` | 발주·ETA·임계경로 등록 |
| "기자재 구매 현황 알려줘" | `get_procurement_status` | 입고율·롱리드 지연 |
| "중도금 5억 청구해줘" | `record_billing` | 회차·누계·유보·실수금 자동 산정 |
| "단계 진척 현황" | `get_progress_summary` | 가중 진척·지연 단계 |
| "FAT 합격 처리" | `log_inspection` | FAT/품질 점검 등록 |

조회성 명령의 수치는 LLM이 아니라 집계 뷰에서 가져온다. 단계/공급사 식별이 모호하면 되묻는다.

## 폴더 구조

```
app/
  login/  signup/         로그인 · 회원가입
  admin/                  시스템 관리자(전체 사용자·관리자 권한 토글)
  page.tsx                수주 목록 + 신규 등록 버튼
  projects/new/           신규 수주 등록(제품·계약·납기 + 표준 단계 시드)
  projects/[id]/board/    수주 대시보드 + AI 어시스턴트 패널
  projects/[id]/members/  멤버·권한 관리(이메일 초대·역할 변경·삭제)
  api/ai/command/         자연어 명령 엔드포인트
lib/
  supabase/               server / client / admin 클라이언트
  db/                     types, 직접경로 queries
  ai/                     tools · executors · orchestrator · prompts
components/
  dashboard/SiteDashboard 공정률·기성·원가 + 공종별 진행
  chat/ChatPanel          AI 명령 패널
supabase/migrations/
  0001_init.sql           기반(현장·멤버·RLS·트리거)
  0002_pgvector.sql       (선택) 의미 검색용 임베딩
  0003_construction.sql   건설 도메인(기성·공정·원가·협력사·안전)
  0004_billing_*.sql      선급금·기성 유보 정산
  0005_project_*.sql      신규 등록 RPC + 표준 공종 시드
  0006_mnsi_eto.sql       수주 제조(ETO): 제품유형·기자재구매(롱리드)·FAT·단계 시드
demo/preview.html         백엔드 없이 도는 구동 미리보기
```

## 셋업

1. 의존성: `npm install`
2. 마이그레이션 순서대로 실행: `0001` → … → `0006` (Supabase SQL Editor 또는 `docker compose` psql)
3. 환경변수: `.env.example`을 `.env.local`로 복사 후 채우기 (Supabase 키, `ANTHROPIC_API_KEY`, 모델명)
4. 타입 생성(권장): `npx supabase gen types typescript --project-id <id> > lib/db/types.ts`
5. 개발 서버: `npm run dev`

배포(PostgreSQL · 어디서나 접근 · GitHub 동기화)는 [`DEPLOYMENT.md`](./DEPLOYMENT.md) 참고.
디자인은 www.syu.ai.kr의 화이트/네이비 기업형 톤을 따랐다(`app/globals.css`).

> `0002_pgvector.sql`은 대규모 현장에서 "비슷한 안전 지적사항 찾기" 같은 의미 검색이 필요할 때
> 활성화하는 선택 사항이다. 건설 MVP의 기본 검색은 단순 매칭(`executors.search`)을 쓴다.

## 구현 상태

| 영역 | 상태 |
|------|------|
| 건설 도메인 스키마(0003) + 집계 뷰 + RLS | ✅ |
| AI 명령 레이어(공정·기성·원가·점검 tool·executor) | ✅ 골격 |
| 현장 대시보드(공정률·기성·원가·공종별 진행) | ✅ |
| 기성 사정/확정/지급 워크플로 UI | ⬜ 상태 전이 화면 추가 |
| 공정표(간트)·실적 이력 차트 | ⬜ |
| 기성/월간 보고서 자동 생성 | ⬜ `architecture.md` §6.2 패턴 적용 |

## 주의

- 모델 문자열(`claude-*`)·tool use 스펙은 변동 가능 → 배포 전 docs.claude.com 확인.
- `service_role` 키는 서버에서만(`lib/supabase/admin.ts`), 클라이언트 번들 포함 금지.
- 기성·원가는 금액 정확성이 중요하므로 누계·기성률 산정은 DB에서 계산하고 LLM은 서술만 담당한다.
