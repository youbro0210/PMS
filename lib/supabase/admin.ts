import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

/**
 * service_role 클라이언트 — RLS를 우회한다(!).
 *
 * 사용자 권한과 무관한 시스템 작업에만 극히 제한적으로 사용:
 *   - ai_action_logs 기록
 *   - 임베딩 백필 Cron
 *
 * 절대 사용자 명령 실행 경로에서 쓰지 말 것. 권한 검증이 무력화된다.
 * 서버에서만 import 가능(클라이언트 번들 포함 금지).
 */
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
