import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { tools, TOOL_TO_INTENT } from "@/lib/ai/tools";
import { buildCommandSystemPrompt } from "@/lib/ai/prompts";
import { executeTool, type ExecutorContext, type ExecutorResult } from "@/lib/ai/executors";
import { createAdminClient } from "@/lib/supabase/admin";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface CommandRequest {
  db: SupabaseClient<Database>;
  userId: string;
  projectId: string;
  projectName: string;
  works: string[];           // 공종 목록
  subcontractors: string[];  // 협력사 목록
  text: string;
  confirmed?: boolean;
}

export interface CommandResponse {
  reply: string;
  toolCalled: string | null;
  executor: ExecutorResult | null;
}

/**
 * 자연어 명령 처리 루프.
 *  1) Claude에 tool 목록과 함께 사용자 입력 전달 (모델:165 라우터)
 *  2) tool_use가 오면 executor로 실행(권한 재검증·엔티티 해소)
 *  3) 실행 결과를 Claude에 되돌려 자연어 확정 응답 생성
 *  4) 전 과정을 ai_action_logs에 기록
 */
export async function runCommand(req: CommandRequest): Promise<CommandResponse> {
  const started = Date.now();
  const model = process.env.CLAUDE_MODEL_ROUTER ?? "claude-haiku-4-5-20251001";

  const system = buildCommandSystemPrompt({
    projectName: req.projectName,
    works: req.works,
    subcontractors: req.subcontractors,
    today: new Date().toISOString().slice(0, 10),
  });

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: req.text }];

  let toolCalled: string | null = null;
  let executor: ExecutorResult | null = null;
  let reply = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let success = true;
  let errorMessage: string | null = null;

  try {
    // 1차: 도구 선택 (병렬 도구 호출 비활성화 → 한 번에 하나의 도구만)
    const first = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      system,
      tools,
      tool_choice: { type: "auto", disable_parallel_tool_use: true },
      messages,
    });
    inputTokens += first.usage.input_tokens;
    outputTokens += first.usage.output_tokens;

    const toolUse = first.content.find((c) => c.type === "tool_use") as
      | Anthropic.ToolUseBlock
      | undefined;

    if (!toolUse) {
      // 도구 없이 일반 답변
      reply = first.content.filter((c) => c.type === "text").map((c) => (c as Anthropic.TextBlock).text).join("\n");
      return finalize();
    }

    toolCalled = toolUse.name;

    // 2차: executor 실행 (권한 검증·엔티티 해소·2단계 확인)
    const ctx: ExecutorContext = {
      db: req.db,
      userId: req.userId,
      projectId: req.projectId,
      confirmed: req.confirmed,
    };
    executor = await executeTool(toolUse.name, toolUse.input as Record<string, unknown>, ctx);

    // 확인/되묻기가 필요한 경우, LLM을 다시 호출하지 않고 바로 사용자에게 반환
    if (!executor.ok && (executor.reason === "needs_confirmation" || executor.reason === "needs_clarification")) {
      reply = executor.message;
      success = false;
      return finalize();
    }

    // 3차: 실행 결과를 Claude에 되돌려 확정 응답 생성
    // 안전장치: first.content의 모든 tool_use 블록에 tool_result를 만들어 준다
    // (Anthropic은 tool_use마다 대응 tool_result를 요구함)
    const toolUses = first.content.filter((c) => c.type === "tool_use") as Anthropic.ToolUseBlock[];
    const toolResults = await Promise.all(
      toolUses.map(async (tu) => {
        const res = tu.id === toolUse.id ? executor! : await executeTool(tu.name, tu.input as Record<string, unknown>, ctx);
        return { type: "tool_result" as const, tool_use_id: tu.id, content: JSON.stringify(res), is_error: !(res as ExecutorResult).ok };
      }),
    );
    messages.push({ role: "assistant", content: first.content });
    messages.push({ role: "user", content: toolResults });

    try {
      const second = await anthropic.messages.create({ model, max_tokens: 1024, system, messages });
      inputTokens += second.usage.input_tokens;
      outputTokens += second.usage.output_tokens;
      reply = second.content.filter((c) => c.type === "text").map((c) => (c as Anthropic.TextBlock).text).join("\n").trim();
    } catch (e2) {
      // 요약 생성 실패해도 실행은 됐으니 결과 메시지로 대체
      console.error("[ai/command] 요약 생성 실패:", e2);
      reply = executor.message;
    }
    if (!reply) reply = executor.message;
    if (!executor.ok) success = false;
  } catch (e) {
    success = false;
    errorMessage = e instanceof Error ? e.message : String(e);
    console.error("[ai/command] 실패:", errorMessage, e);
    reply = "요청을 처리하는 중 오류가 발생했습니다.";
  }

  return finalize();

  // ── 감사 로그 기록 후 응답 반환 ──
  function finalize(): CommandResponse {
    // 로그는 service_role로 기록(사용자 권한과 무관한 시스템 작업)
    const admin = createAdminClient();
    void admin.from("ai_action_logs").insert({
      user_id: req.userId,
      project_id: req.projectId,
      input_text: req.text,
      intent: (toolCalled ? TOOL_TO_INTENT[toolCalled] : "unknown") as never,
      tool_called: toolCalled,
      tool_input: null,
      tool_result: executor ? (executor as unknown as Record<string, unknown>) : null,
      ai_response: reply,
      success,
      error_message: errorMessage,
      latency_ms: Date.now() - started,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    });

    return { reply, toolCalled, executor };
  }
}
