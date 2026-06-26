"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    // 이메일 확인이 꺼져 있으면 즉시 세션 발급 → 홈으로
    if (data.session) router.push("/");
    else setDone(true);
  }

  const input = "w-full rounded-md border bg-transparent px-3 py-2 text-sm";
  const style = { borderColor: "var(--border)" };

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border p-8" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="syu-logo mb-1 text-2xl">MnSi<span style={{ color: "var(--accent)" }}>·</span>PMS</div>
        <h1 className="mb-5 text-lg font-semibold" style={{ color: "var(--navy)" }}>회원가입</h1>

        {done ? (
          <div className="space-y-3 text-sm">
            <p>가입 확인 메일을 보냈습니다. 메일의 링크를 눌러 인증을 완료한 뒤 로그인해 주세요.</p>
            <Link href="/login" className="inline-block rounded-md px-4 py-2 text-white" style={{ background: "var(--accent)" }}>로그인으로</Link>
          </div>
        ) : (
          <form onSubmit={signUp} className="space-y-4">
            <input className={input} style={style} placeholder="이름" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            <input className={input} style={style} type="email" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input className={input} style={style} type="password" placeholder="비밀번호 (6자 이상)" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button type="submit" disabled={loading} className="w-full rounded-md py-2 text-sm font-medium text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>
              {loading ? "처리 중…" : "가입하기"}
            </button>
            <p className="text-center text-xs" style={{ color: "var(--muted)" }}>
              이미 계정이 있으신가요? <Link href="/login" style={{ color: "var(--accent)" }}>로그인</Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
