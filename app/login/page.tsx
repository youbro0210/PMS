"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setError(error.message);
    else router.push("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6" style={{ background: "var(--surface-3)" }}>
      <div className="w-full max-w-[380px]">
        <div className="mb-5 text-center">
          <div className="mb-2 inline-flex items-center rounded-[6px] px-3 py-1.5 text-[17px] font-extrabold text-white" style={{ background: "var(--navy)", letterSpacing: "-.2px" }}>
            SYU<span style={{ opacity: 0.55 }}>·</span>PMS
          </div>
          <p className="text-[13px]" style={{ color: "var(--muted)" }}>수주 프로젝트 관리 시스템</p>
        </div>
        <form onSubmit={signIn} className="card p-6">
          <h1 className="mb-4 text-[15px] font-bold" style={{ color: "var(--heading)" }}>로그인</h1>
          <div className="space-y-3">
            <div>
              <label className="field-label">이메일</label>
              <input type="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className="input" required />
            </div>
            <div>
              <label className="field-label">비밀번호</label>
              <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="input" required />
            </div>
            {error && <p className="rounded-[4px] px-2.5 py-1.5 text-[12px]" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>{error}</p>}
            <button type="submit" disabled={loading} className="btn btn-primary btn-lg w-full">
              {loading ? "처리 중…" : "로그인"}
            </button>
          </div>
          <p className="mt-4 text-center text-[12px]" style={{ color: "var(--muted)" }}>
            계정이 없으신가요? <Link href="/signup" className="link">회원가입</Link>
          </p>
        </form>
      </div>
    </main>
  );
}
