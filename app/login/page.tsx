"use client";

import { useState } from "react";
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
    <main className="flex min-h-screen items-center justify-center p-6">
      <form
        onSubmit={signIn}
        className="w-full max-w-sm space-y-4 rounded-xl border p-8"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="syu-logo mb-1 text-2xl">SYU<span style={{ color: "var(--accent)" }}>·</span>PMS</div>
        <h1 className="text-lg font-semibold" style={{ color: "var(--navy)" }}>현장 관리 로그인</h1>
        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)" }}
          required
        />
        <input
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)" }}
          required
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ background: "var(--accent)" }}
        >
          {loading ? "처리 중…" : "로그인"}
        </button>
      </form>
    </main>
  );
}
