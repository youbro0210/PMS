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
export function ChatPanel({ projectId, onChange }: { projectId: string; onChange?: () => void }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  // 마크다운을 간결한 평문 HTML로 정리(표·헤더 제거, 굵게·줄바꿈만 유지)
  function format(text: string): string {
    const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return esc
      .split("\n")
      .filter((l) => !/^\s*\|?\s*[-|:\s]+\|?\s*$/.test(l)) // 표 구분선 제거
      .map((l) => l.replace(/^#{1,6}\s*/, "").replace(/^\s*[-*]\s+/, "· "))
      .join("\n")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\s*\|\s*/g, "  ") // 표 파이프 → 공백
      .replace(/\n{2,}/g, "\n")
      .trim()
      .replace(/\n/g, "<br/>");
  }

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

      // 실제 변경이 일어났으면 대시보드 즉시 갱신(클라이언트 재조회 + 서버 새로고침)
      if (data.executor?.ok) {
        onChange?.();
        router.refresh();
      }
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "네트워크 오류가 발생했습니다." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="flex h-[70vh] w-full flex-shrink-0 flex-col border-t lg:h-auto lg:w-96 lg:border-l lg:border-t-0" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
        <span className="text-[15px] font-bold" style={{ color: "var(--heading)" }}>AI 어시스턴트</span>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="rounded-[4px] border px-2.5 py-1 text-[13px] font-medium"
            style={{ borderColor: "var(--border-strong)", color: "var(--muted)" }}
          >
            초기화
          </button>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="rounded-[6px] border px-3 py-3 text-[14px] leading-relaxed" style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--muted)" }}>
            <p className="mb-1 font-semibold" style={{ color: "var(--heading)" }}>이렇게 명령해 보세요</p>
            <p>· 상세설계 진척 70%로 갱신해줘</p>
            <p>· NEA 압축기 본체 롱리드로 발주 등록</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
            <div
              className="inline-block max-w-[90%] whitespace-pre-wrap rounded-[8px] px-3.5 py-2.5 text-left text-[15px] leading-relaxed"
              style={{
                background: m.role === "user" ? "var(--accent)" : "var(--surface-2)",
                color: m.role === "user" ? "#fff" : "var(--text)",
                border: m.role === "assistant" ? "1px solid var(--border)" : "none",
              }}
            >
              {m.role === "assistant"
                ? <span dangerouslySetInnerHTML={{ __html: format(m.text) }} />
                : m.text}
            </div>

            {m.needsConfirmation && (
              <div className="mt-2">
                <button
                  onClick={() => send(m.originalText!, true)}
                  className="rounded-[6px] px-4 py-2 text-[14px] font-semibold text-white"
                  style={{ background: "var(--danger)" }}
                >
                  삭제 확인
                </button>
              </div>
            )}

            {m.candidates && m.candidates.length > 0 && !m.needsConfirmation && (
              <div className="mt-2 space-y-1.5">
                {m.candidates.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => send(`"${c.title}"`)}
                    className="block w-full rounded-[6px] border px-3 py-2 text-left text-[14px]"
                    style={{ borderColor: "var(--border-strong)", background: "var(--surface)" }}
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
        className="flex items-center gap-2 border-t p-3"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
          enterKeyHint="send"
          placeholder={busy ? "처리 중…" : "자연어로 명령하세요"}
          className="min-w-0 flex-1 rounded-[6px] border bg-transparent px-3 py-2.5 text-[16px]"
          style={{ borderColor: "var(--border-strong)" }}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="전송"
          className="flex-shrink-0 rounded-[6px] px-5 py-2.5 text-[15px] font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--accent)" }}
        >
          전송
        </button>
      </form>
    </aside>
  );
}
