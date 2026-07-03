import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedBomRow, ProcureType } from "@/lib/db/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface BomExtraction {
  project_name: string | null;
  drawing_no: string | null;
  rev: string | null;
  items: ExtractedBomRow[];
}

/** 구매구분 키워드 자동분류 — 외주/자사 키워드에 걸리지 않으면 구매품(기성품) */
const OUTSOURCE_KW = ["fabricat", "weld", "machin", "casting", "coating", "paint", "galvaniz", "assembly", "subcontract", "외주", "도장", "가공"];
const INHOUSE_KW = ["tank", "vessel", "skid", "frame", "bracket", "structure", "plate", "shell", "module", "제작", "본체", "하우징", "housing"];

export function classifyProcureType(description: string, manufacturer?: string | null): ProcureType {
  const s = `${description} ${manufacturer ?? ""}`.toLowerCase();
  if (OUTSOURCE_KW.some((k) => s.includes(k))) return "outsource";
  if (INHOUSE_KW.some((k) => s.includes(k))) return "inhouse";
  return "purchase";
}

const bomTool: Anthropic.Tool = {
  name: "submit_bom",
  description: "도면에서 읽은 프로젝트 정보와 자재표(BOM)를 제출한다.",
  input_schema: {
    type: "object",
    properties: {
      project_name: { type: "string", description: "도면 제목/장비명(예: Fuel Oil Day Tank). 없으면 빈 문자열." },
      drawing_no: { type: "string", description: "도면번호(있으면). 없으면 빈 문자열." },
      rev: { type: "string", description: "리비전(있으면). 없으면 빈 문자열." },
      items: {
        type: "array",
        description: "BILL OF MATERIALS 표의 각 행. 표가 없으면 빈 배열.",
        items: {
          type: "object",
          properties: {
            item_no: { type: "number", description: "ITEM 번호" },
            description: { type: "string", description: "품명(DESCRIPTION)" },
            qty: { type: "number", description: "수량(QTY)" },
            size: { type: "string", description: "규격/사이즈(SIZE)" },
            manufacturer: { type: "string", description: "제조사(MANUFACTURER)" },
            model: { type: "string", description: "모델(MODEL/PART NO)" },
            procure_type: { type: "string", enum: ["purchase", "outsource", "inhouse"], description: "구매구분 추정: 기성품=purchase, 외주가공=outsource, 자사제작=inhouse" },
          },
          required: ["description", "qty"],
        },
      },
    },
    required: ["project_name", "items"],
  },
};

/**
 * 도면(PDF 또는 이미지)을 Claude 비전으로 읽어 BOM을 구조화 추출.
 * mediaType 예: application/pdf, image/png, image/jpeg
 */
export async function extractBom(base64: string, mediaType: string): Promise<BomExtraction> {
  const model = process.env.CLAUDE_MODEL_VISION ?? "claude-sonnet-4-6";

  const doc: Anthropic.ContentBlockParam = mediaType === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
    : { type: "image", source: { type: "base64", media_type: mediaType as "image/png" | "image/jpeg" | "image/gif" | "image/webp", data: base64 } };

  const res = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    tools: [bomTool],
    tool_choice: { type: "tool", name: "submit_bom" },
    messages: [{
      role: "user",
      content: [
        doc,
        { type: "text", text: "이 엔지니어링 도면을 읽고 BILL OF MATERIALS(자재표)를 추출해 submit_bom 도구로 제출하세요. 표의 모든 행을 빠짐없이, ITEM 번호 순서대로. 표가 여러 장이면 모두 합치세요. 값이 없으면 빈 문자열." },
      ],
    }],
  });

  const tu = res.content.find((c) => c.type === "tool_use") as Anthropic.ToolUseBlock | undefined;
  const input = (tu?.input ?? {}) as {
    project_name?: string; drawing_no?: string; rev?: string;
    items?: { item_no?: number; description?: string; qty?: number; size?: string; manufacturer?: string; model?: string; procure_type?: string }[];
  };

  const items: ExtractedBomRow[] = (input.items ?? [])
    .filter((r) => (r.description ?? "").trim())
    .map((r) => {
      const pt = (["purchase", "outsource", "inhouse"].includes(r.procure_type ?? "")
        ? r.procure_type
        : classifyProcureType(r.description ?? "", r.manufacturer)) as ProcureType;
      return {
        item_no: r.item_no ?? null,
        description: (r.description ?? "").trim(),
        qty: Number(r.qty ?? 1) || 1,
        size: r.size?.trim() || null,
        manufacturer: r.manufacturer?.trim() || null,
        model: r.model?.trim() || null,
        procure_type: pt,
      };
    });

  return {
    project_name: input.project_name?.trim() || null,
    drawing_no: input.drawing_no?.trim() || null,
    rev: input.rev?.trim() || null,
    items,
  };
}
