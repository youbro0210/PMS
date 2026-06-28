/** 입력 문자열을 천 단위 구분자(콤마) 형식으로 변환. 숫자만 남김. */
export function formatThousands(v: string): string {
  const digits = v.replace(/[^\d]/g, "");
  return digits ? Number(digits).toLocaleString("ko-KR") : "";
}

/** 콤마 제거 후 숫자 반환(빈 값이면 null). */
export function parseAmount(v: string): number | null {
  const digits = v.replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}
