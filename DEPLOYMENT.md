# 배포 가이드 — 어디서나 접근 가능한 웹 서비스 구성

목표: ① PostgreSQL 데이터베이스, ② 어디서나 접근 가능한 웹, ③ GitHub 소스 동기화.

## 1. 데이터베이스 (PostgreSQL)

스키마(`supabase/migrations/0001~0004.sql`)는 표준 **PostgreSQL 15+**에서 동작한다.
두 가지 운영 경로:

### A. Supabase (권장 — 관리형 PostgreSQL)
- Supabase 프로젝트 = PostgreSQL 인스턴스 + Auth + Storage + 자동 백업.
- RLS 정책이 `auth.uid()`(Supabase Auth)에 의존하므로 가장 적은 설정으로 동작한다.
- 적용 방법 ① SQL Editor에 `0001 → 0002 → … → 0006` 순서로 붙여넣어 실행.
- 적용 방법 ② psql 한 번에:
  ```bash
  export DATABASE_URL="postgres://...supabase.co:5432/postgres"  # Database > Connection string
  ./scripts/apply-migrations.sh
  ```

### B. 셀프호스트 PostgreSQL (Docker)
```bash
docker compose up -d
for f in supabase/migrations/*.sql; do
  docker compose exec -T db psql -U postgres -d pms < "$f"
done
```
> RLS는 Supabase Auth를 전제로 한다. 순수 PostgreSQL로 가려면 `auth` 스키마와 JWT 컨텍스트를
> 별도 구성하거나 애플리케이션 레벨에서 권한을 강제해야 한다. 운영 부담을 줄이려면 A안 권장.

## 2. 웹 서비스 (어디서나 접근)

### Vercel (권장)
1. GitHub 저장소를 Vercel에 임포트(아래 3번 먼저 수행).
2. Environment Variables에 `.env.example` 값들을 입력
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `ANTHROPIC_API_KEY`, 모델명, 임베딩 키).
3. main 브랜치 push마다 자동 배포 → `https://<프로젝트>.vercel.app` 으로 어디서나 접근.

### 대안: Docker 셀프호스트
```bash
docker build -t pms-web .
docker run -p 3000:3000 --env-file .env.local pms-web
```
리버스 프록시(Nginx/Caddy) + 도메인 + HTTPS(Let's Encrypt)로 외부 공개.

## 3. GitHub 소스 동기화

로컬에서 git 저장소를 초기화하고 첫 커밋까지 만들어 두었다(브랜치: `master`). 원격 연결만 하면 된다:

```bash
# 0) (한 번만) 샌드박스에서 남은 스테일 락 파일 제거 — 본인 PC에서는 권한 문제 없음
rm -f .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock

# (이미 git init + 최초 커밋 완료된 상태)
# 1) GitHub에서 빈 저장소 생성 (예: my-pms) — README 체크 해제

# 2) 원격 연결 후 푸시
git remote add origin https://github.com/<USERNAME>/my-pms.git
git branch -M main
git push -u origin main
```
이후 `git add . && git commit -m "..." && git push` 로 동기화. PR마다 GitHub Actions가
타입체크·빌드를 자동 검증한다(`.github/workflows/ci.yml`).

> `.env*`는 `.gitignore`에 포함되어 키가 커밋되지 않는다. Vercel/서버 환경변수로만 주입할 것.

## 권장 아키텍처 (가장 빠른 경로)

```
GitHub(소스) ──push──> Vercel(웹, 자동배포) ──> Supabase(PostgreSQL+Auth)
                                              └──> Claude API
```
세 가지 요구사항(PostgreSQL · 어디서나 접근 · GitHub 동기화)을 최소 운영으로 충족한다.
