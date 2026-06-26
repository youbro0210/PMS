import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/db/types";

/**
 * 서버(Server Component / Route Handler)용 Supabase 클라이언트.
 * 쿠키의 사용자 세션을 그대로 사용하므로 auth.uid()가 채워지고
 * RLS 정책(is_project_member / get_project_role)이 작동한다.
 *
 * ★ AI 경로(/api/ai/*)는 반드시 이 클라이언트로 DB를 조작해 RLS를 유지한다.
 *   service_role(admin.ts)을 쓰면 RLS가 무력화되므로 금지.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component에서 set 호출 시 무시 (미들웨어가 갱신 담당)
          }
        },
      },
    },
  );
}
