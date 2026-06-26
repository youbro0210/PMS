"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Msg {
  role: "user" | "assistant";
  text: string;
  /** 확인/되묻기 후보 (있으면 버튼 표시) */
  candidates?: { id: string; title: string }[];
  needsConfirmation?: boolean;
  originalText?: string;
}

/**
 * AI 챗봇 패널 — 자연어 명령 입력.
 * /api/ai/command를 호출하고, 되묻기/확인이 필요하면 후속 버튼을 렌더한다.
 * 명령 성공 시 router.refresh()로 보드를 갱신한다.
 */
export function ChatPanel({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(text: string, confirmed = false) {
    if (!text.trim()) return;
    if (!confirmed) setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/ai/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, text, confirmed }),
      });
      const data = await res.json();

      const reason = data.executor?.reason;
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: data.reply ?? "오류가 발생했습니다.",
          candidates: data.executor?.candidates,
          needsConfirmation: reason === "needs_confirmation",
          originalText: text,
        },
      ]);

      // 실제 변경이 일어났으면 보드 갱신
      if (data.executor?.ok) router.refresh();
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "네트워크 오류가 발생했습니다." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="flex w-96 flex-shrink-0 flex-col border-l" style={{ borderColor: "var(--border)" }}>
      <div className="border-b p-3 text-sm font-medium" style={{ borderColor: "var(--border)" }}>
        AI 어시스턴트
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            예: &quot;상세설계 진척 70%로 갱신해줘&quot; · &quot;NEA 압축기 본체 롱리드로 발주 등록&quot;
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
            <div
              className="inline-block max-w-[85%] rounded-lg px-3 py-2 text-sm"
              style={{
                background: m.role === "user" ? "var(--accent)" : "var(--surface-2)",
                color: m.role === "user" ? "#fff" : "var(--text)",
              }}
            >
              {m.text}
            </div>

            {m.needsConfirmation && (
              <div className="mt-2">
                <button
                  onClick={() => send(m.originalText!, true)}
                  className="rounded bg-red-600 px-3 py-1 text-xs text-white"
                >
                  삭제 확인
                </button>
              </div>
            )}

            {m.candidates && m.candidates.length > 0 && !m.needsConfirmation && (
              <div className="mt-2 space-y-1">
                {m.candidates.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => send(`"${c.title}"`)}
                    className="block w-full rounded border px-2 py-1 text-left text-xs"
                    style={{ borderColor: "var(--border)" }}
                  >
                    {c.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="border-t p-3"
        style={{ borderColor: "var(--border)" }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
          placeholder={busy ? "처리 중…" : "자연어로 명령하세요"}
          className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)" }}
        />
      </form>
    </aside>
  );
}
