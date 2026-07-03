# PMS 프로젝트 컨텍스트 (이어서 작업용)

> 모바일/다른 기기에서 작업을 이어갈 때 이 파일을 먼저 읽으면 전체 상황을 파악할 수 있습니다.
> 최종 업데이트: 2026-07 (세션 기준)

---

## 1. 무엇을 만들고 있나

**MnSi PMS** — 수주형 제조(ETO: 수주→설계→구매→제작→FAT→출하→시운전) 프로젝트 관리 시스템.
압축기·모듈 패키지 등 수주 프로젝트의 단계 진척·기성·원가·구매·리스크·회계를 관리하고, 자연어 AI 어시스턴트로 조회/입력한다.

- **스택**: Next.js 15 (App Router) + Supabase (PostgreSQL·Auth·RLS) + Claude API (tool use)
- **배포**: Vercel (자동 배포, GitHub main 푸시 시)
- **UI 톤**: 화이트/네이비 corporate (syu.ai.kr 참조)

---

## 2. 접속 정보 / 링크

| 항목 | 값 |
|---|---|
| 웹앱 (운영) | https://pms-five-rosy.vercel.app |
| GitHub 저장소 | https://github.com/youbro0210/PMS (branch: `main`) |
| Vercel 프로젝트 | https://vercel.com/youbro211/pms |
| Supabase 프로젝트 ref | `vbqjppjodsumsnszydqn` |
| Supabase SQL Editor | https://supabase.com/dashboard/project/vbqjppjodsumsnszydqn/sql/new |
| 로컬 폴더 (Mac) | `~/Claude/Projects/PMS` |
| 관리자 계정 | youbro0210@gmail.com (신정환, is_admin=true) |

> 비밀키(Anthropic API 키, Supabase service_role 등)는 `.env.local`과 Vercel 환경변수에 있음. 이 문서에는 저장하지 않음.

---

## 3. 화면 구성 (프로젝트 공통 네비)

프로젝트를 열면 상단에 공통 탭이 고정으로 따라온다: **대시보드 · 간트 · EVM · 리스크 · 대금 · 구매 · 회계 · 활동 · 멤버**
(※ **활동·멤버 탭은 관리자에게만** 보임)

전역: 상단 **수주(홈)** · **전사 현황(portfolio)**, 우측 **알림·설정·관리자·로그아웃**, 우측 하단 **로그아웃 플로팅 버튼**.

- **대시보드(board)**: 단계 진척·대금·구매·원가 핵심지표 + 도넛 게이지 차트 + AI 어시스턴트 채팅
- **간트(schedule)**: 단계별 계획 일정·예산·진척 입력, "기본 일정 자동배분(가중치대로 배분)", 단계 추가/삭제, 간트차트
- **EVM(evm)**: PV/EV/AC·CPI/SPI·EAC·VAC·SV/CV + S-curve + "오늘 스냅샷 기록"
- **리스크(risks)**: 리스크 등록/수정/삭제, 확률×영향 5×5 매트릭스
- **대금(billings)**: 기성 회차 청구·상태(청구→사정→확정→지급)·삭제
- **구매(procurement)**: 기자재 발주·입고, 롱리드 납기 추적
- **회계(accounting)**: 복식부기 전표·분개·시산표, 자동전표 생성, 수동 전표(차변 입력 시 대변 자동채움), 전표 삭제, 프로젝트 선택
- **활동(activity)**: 활동/감사 로그 (관리자)
- **멤버(members)**: 이메일로 멤버 추가, 역할 변경(드롭다운)·삭제 (소유자 본인은 역할 고정) (관리자)
- 신규 수주 등록: 홈 → "신규 수주 등록" (총 실행예산·착수·납기 입력 시 단계에 일정·예산 자동배분)
- ERP 연동 설정: 설정 → 모듈별(수주/대금/구매/원가/품질/회계) 연동 방식·엔드포인트

---

## 4. 핵심 기능 사용법

### EVM 성과분석 (숫자가 0이면 데이터부터 입력)
1. **간트** 화면에서 단계별 **계획 예산(원)** 입력 → 합계가 **BAC(총예산)**
2. 단계별 **계획 진척% / 실적 진척%** 입력 후 저장 → **PV·EV·SV** 계산
3. 원가(자재·외주비)가 집행되면 **AC** 채워지고 **CPI·CV·EAC**까지 산출
4. EVM 화면 **"오늘 스냅샷 기록"** → S-curve에 점 적립(주기적으로 누르면 추세선)
- 지표: CPI=EV/AC(원가효율, 1↑ 양호), SPI=EV/PV(일정효율), EAC=완료시 예상총비용, VAC=BAC−EAC(+절감/−초과)

### 회계 전표
- 기성 확정·수금, 원가, 구매 입고, 선급금은 **자동 분개**됨
- 기존 데이터는 **"자동전표 생성"** 버튼으로 일괄 전표화
- 수동 전표: 차변 금액 입력 시 대변 자동 채움, 차/대변 일치해야 등록

### AI 어시스턴트 (대시보드 채팅)
- 진척·기성·구매·원가·EVM·회계전표·단계 일정을 자연어로 질문/입력
- 예: "기본·상세설계 완료예정일 알려줘", "외상매출금 잔액 얼마야", "상세설계 진척 70%로 갱신"

---

## 5. DB 마이그레이션 상태 (모두 적용 완료)

`supabase/migrations/` 0001 ~ 0016 전부 Supabase에 실행됨.
- 0012 EVM·리스크 / 0013 단계 일정·예산 / 0014 회계 전표 / 0015 회계 보완(현금·어음·수금정합·백필) / 0016 관리자 RLS 우회
- 새 마이그레이션 추가 시: 해당 SQL을 **Supabase SQL Editor에 붙여넣고 Run** (또는 `supabase/RUN_*.sql` 파일 사용)

> **RLS 관리자 우회**: 관리자가 본인이 멤버로 등록 안 된 프로젝트도 수정할 수 있게 리스크·EVM·회계·건설/제조 테이블 정책에 `is_system_admin()`를 추가함(0012/0014/0016). 저장이 막히면 이 정책 확인.

---

## 6. ⚠️ 미완료 / 다음 할 일

1. **코드 푸시 필요**: 로컬에 커밋 `0e76d88`까지 있으나 아직 GitHub 미반영일 수 있음.
   - 내용: AI 회계전표 답변(get_accounting_summary) + 0016 마이그레이션 파일
   - 실행: `cd ~/Claude/Projects/PMS && git push origin main`
   - (DB 0016은 이미 실행됨. 이 푸시는 코드 정리용)
2. (선택) 데모 프로젝트에 예산·진척 입력해 EVM·S-curve 예시 채우기

---

## 7. 운영 시 알아둘 점 (트러블슈팅)

- **git commit이 "Another git process" 오류로 막힐 때**: 잠금 파일 삭제 후 재시도
  ```bash
  cd ~/Claude/Projects/PMS
  rm -f .git/*.lock .git/HEAD.lock .git/refs/heads/*.lock
  git add -A && git commit -m "..." && git push origin main
  ```
- **화면이 "안 바뀜"**: 대부분 브라우저 캐시. 하드 리프레시(⌘⇧R) 또는 시크릿 창. Vercel Deployments에서 최신 커밋이 "Ready·Production"인지 확인.
- **저장이 안 됨(RLS)**: `new row violates row-level security` → 해당 테이블 정책에 관리자 우회(`is_system_admin()`)가 있는지 확인.
- **AI 오류**: Vercel 런타임 로그 확인. `CLAUDE_MODEL_ROUTER=claude-haiku-4-5-20251001`, `ANTHROPIC_API_KEY` 환경변수 확인. 로컬(사내망)에서는 api.anthropic.com 차단될 수 있어 배포본에서 테스트.

---

## 8. 폴더 구조 요약

```
app/
  page.tsx (홈·수주목록)  login/  signup/  portfolio/  admin/  settings/erp/
  projects/new/           프로젝트 등록
  projects/[id]/board|schedule|evm|risks|billings|procurement|accounting|activity|members
components/
  layout/ (SiteHeader, ProjectNav, FloatingLogout, UserMenu, NotificationBell)
  dashboard/  schedule/  evm/  accounting/  board/  chat/
lib/
  ai/ (orchestrator, tools, executors, prompts)   db/ (queries, types)
  supabase/ (client, server, admin)   erp/ (adapter, sync)   format.ts
supabase/migrations/ 0001~0016 + RUN_*.sql (수동 실행용)
```

---

## 9. 이어서 하고 싶은 것 (메모)

- (여기에 다음 요청 사항을 적어두면 다음 세션에서 바로 이어감)
