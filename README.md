# 건설 PMS — 자연어로 관리하는 건설 프로젝트 관리 시스템

Next.js + Supabase + Claude API 기반. 현장별 **공정률·기성·실행예산/원가·협력업체·안전/품질**을
자연어 명령으로 관리한다. "철근콘크리트 공정률 65%로 갱신해줘", "3회차 기성 2억5천 등록해줘"처럼
입력하면 Claude가 도구를 호출해 DB에 반영하고, 현황을 집계해 요약한다.

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

## 건설 도메인 모델

| 영역 | 테이블 | 핵심 |
|------|--------|------|
| 현장 | `projects` (확장) | 발주처·원도급사·도급액·계약번호·공사종류 |
| 협력업체 | `subcontractors` | 하도급사, 공종, 계약금액 |
| 공종/WBS | `work_packages` | 계층 구조, 가중치, 계획/실적 공정률 |
| 공정 실적 | `progress_records` | 기간별 계획 대비 실적 이력 |
| 기성 | `billings`, `billing_items` | 회차별 청구·사정·확정·지급, 누계 기성률, **선급금 정산·유보(유보율)·실지급액** |
| 실행예산/원가 | `budget_items`, `cost_entries` | 노무·자재·외주·장비·경비 |
| 안전/품질 | `inspections` | 점검 결과·지적·시정 |

집계 뷰: `project_progress_summary`(가중 공정률), `billing_summary`(누계 기성률),
`cost_summary`(예산 대비 집행률), `cost_by_category`(원가 분류별).

## AI 명령 예시

| 입력 | tool | 동작 |
|------|------|------|
| "철근콘크리트 공정률 65%로 갱신해줘" | `update_progress` | 공종 실적 갱신 + 실적 이력 적재 |
| "3회차 기성 2억5천 등록해줘" | `record_billing` | 회차·누계·기성률 자동 산정 |
| "공정 현황 알려줘" | `get_progress_summary` | 가중 공정률·지연 공종 |
| "기성 현황 요약" | `get_billing_status` | 누계 기성률·지급액 |
| "원가 집행 현황" | `get_cost_summary` | 실행예산 대비 집행률 |
| "안전점검 불합격, 3층 개구부 난간 미설치" | `log_inspection` | 점검·시정 등록 |

조회성 명령의 수치는 LLM이 아니라 집계 뷰에서 가져온다. 공종/협력사 식별이 모호하면 되묻는다.

## 폴더 구조

```
app/
  login/                  로그인
  page.tsx                현장(프로젝트) 목록
  projects/[id]/board/    현장 대시보드 + AI 어시스턴트 패널
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
demo/preview.html         백엔드 없이 도는 구동 미리보기
```

## 셋업

1. 의존성: `npm install`
2. 마이그레이션 순서대로 실행: `0001` → `0002` → `0003` → `0004` (Supabase SQL Editor 또는 `docker compose` psql)
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
