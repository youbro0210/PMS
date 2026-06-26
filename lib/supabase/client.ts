import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/db/types";

/**
 * 브라우저(Client Component)용 Supabase 클라이언트.
 * anon key + 사용자 세션으로 동작하며 RLS가 항상 적용된다.
 * 직접 경로(칸반 드래그, 폼 입력, 실시간 구독)에서 사용.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
