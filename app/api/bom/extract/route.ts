import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractBom } from "@/lib/ai/bom";

export const maxDuration = 60;

/**
 * POST /api/bom/extract  (multipart/form-data, field: file)
 * 도면(PDF/이미지)을 Claude 비전으로 읽어 프로젝트명·BOM을 추출해 반환.
 * 저장은 하지 않음(클라이언트에서 검토 후 프로젝트 생성 시 저장).
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file_required" }, { status: 400 });
  }
  const allowed = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
  const mediaType = file.type || "application/pdf";
  if (!allowed.includes(mediaType)) {
    return NextResponse.json({ error: "unsupported_type", detail: mediaType }, { status: 400 });
  }
  if (file.size > 30 * 1024 * 1024) {
    return NextResponse.json({ error: "file_too_large" }, { status: 400 });
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  try {
    const extraction = await extractBom(base64, mediaType);
    return NextResponse.json(extraction);
  } catch (e) {
    console.error("[bom/extract] 실패:", e);
    return NextResponse.json({ error: "extraction_failed", detail: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
