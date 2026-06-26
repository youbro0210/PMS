#!/usr/bin/env bash
# 마이그레이션을 순서대로 PostgreSQL에 적용한다.
#
# 사용:
#   # Supabase: 프로젝트 > Database > Connection string(psql)
#   export DATABASE_URL="postgres://...supabase.co:5432/postgres"
#   ./scripts/apply-migrations.sh
#
#   # 로컬 docker-compose
#   export DATABASE_URL="postgres://postgres:postgres@localhost:5432/pms"
#   ./scripts/apply-migrations.sh
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL 환경변수를 설정하세요}"
DIR="$(cd "$(dirname "$0")/../supabase/migrations" && pwd)"

for f in "$DIR"/0*.sql; do
  echo "▶ 적용: $(basename "$f")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done
echo "✓ 모든 마이그레이션 적용 완료 (0001 → 0006)"
