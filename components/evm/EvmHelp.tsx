"use client";

import { useState } from "react";

/** EVM 계산 로직 설명 팝업 — 제목 옆 도움말(tip) 버튼 */
export function EvmHelp() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-[6px] border px-2.5 py-1 text-[13px] font-semibold"
        style={{ borderColor: "var(--accent-line)", color: "var(--accent)", background: "var(--accent-soft)" }}
        title="EVM 계산 방법 설명"
      >
        <span style={{ fontWeight: 800 }}>ⓘ</span> 계산 설명
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(16,24,40,.45)" }}
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-[640px] overflow-y-auto rounded-[8px] shadow-xl"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between border-b px-5 py-3.5"
              style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
              <span className="text-[16px] font-bold" style={{ color: "var(--heading)" }}>EVM 성과분석 — 어떻게 계산되나요?</span>
              <button onClick={() => setOpen(false)} className="rounded-[4px] px-2 py-1 text-[13px] font-semibold" style={{ color: "var(--muted)" }}>✕ 닫기</button>
            </div>

            <div className="space-y-4 px-5 py-4 text-[14px] leading-relaxed" style={{ color: "var(--text)" }}>
              <p>EVM은 <b>계획과 실제를 ‘돈’으로 바꿔 비교</b>하는 방법입니다. 진척률(%)만으로는 알 수 없는 <b>일정·원가 성과를 동시에</b> 판단합니다.</p>

              <div>
                <div className="mb-1 text-[13px] font-bold" style={{ color: "var(--heading)" }}>① 기준 숫자 3개 (+총예산)</div>
                <ul className="space-y-1">
                  <li>· <b>BAC(총예산)</b> = 단계 계획 예산의 합(실행예산)</li>
                  <li>· <b>PV(계획가치)</b> = BAC × <b>계획 진척%</b> — 오늘까지 계획대로면 했어야 할 금액</li>
                  <li>· <b>EV(획득가치)</b> = BAC × <b>실적 진척%</b> — 실제 달성한 일의 금액</li>
                  <li>· <b>AC(실제원가)</b> = 실제로 쓴 돈(원가 집행 누계)</li>
                </ul>
              </div>

              <div>
                <div className="mb-1 text-[13px] font-bold" style={{ color: "var(--heading)" }}>② 나머지는 자동 계산</div>
                <ul className="space-y-1">
                  <li>· <b>SPI(일정효율)</b> = EV ÷ PV — 1↑ 빠름 / 1↓ 지연</li>
                  <li>· <b>CPI(원가효율)</b> = EV ÷ AC — 1↑ 절감 / 1↓ 초과</li>
                  <li>· <b>SV(일정차이)</b> = EV − PV — +선행 / −지연</li>
                  <li>· <b>CV(원가차이)</b> = EV − AC — +절감 / −초과</li>
                  <li>· <b>EAC(완료예상원가)</b> = BAC ÷ CPI — 이대로면 최종 얼마</li>
                  <li>· <b>VAC(완료차이)</b> = BAC − EAC — +예산내 / −초과 예상</li>
                </ul>
              </div>

              <div className="rounded-[6px] p-3" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                <div className="mb-1 text-[13px] font-bold" style={{ color: "var(--heading)" }}>③ 예시 (총예산 1,000만원)</div>
                <p className="text-[13px]">계획진척 40%, 실적진척 30%, 실제원가 350만원이면:</p>
                <p className="mt-1 text-[13px]">PV=400만, EV=300만, AC=350만 → <b>SPI 0.75(지연)</b>, <b>CPI 0.86(초과)</b>, SV −100만, CV −50만, EAC≈1,167만, VAC −167만.</p>
                <p className="mt-1 text-[13px]" style={{ color: "var(--muted)" }}>→ “계획보다 덜 했는데 돈은 더 썼고, 이대로면 167만원 초과로 끝난다”를 한눈에.</p>
              </div>

              <div>
                <div className="mb-1 text-[13px] font-bold" style={{ color: "var(--heading)" }}>④ 값은 어디서 들어오나</div>
                <ul className="space-y-1">
                  <li>· BAC·PV·EV → <b>간트/단계 계획</b>에서 단계별 <b>계획 예산·계획 진척%·실적 진척%</b> 입력</li>
                  <li>· AC(실제원가) → 원가(실행) 집계</li>
                </ul>
                <p className="mt-1 text-[13px]" style={{ color: "var(--muted)" }}>지금 값이 0이거나 “데이터 없음”이면 아직 진척·원가가 입력되지 않은 것입니다.</p>
              </div>

              <div>
                <div className="mb-1 text-[13px] font-bold" style={{ color: "var(--heading)" }}>⑤ S-curve · 스냅샷</div>
                <p>시간축으로 PV·EV·AC 누적 곡선을 그려 추세를 봅니다(EV가 PV 아래=지연, AC가 EV 위=원가 초과). <b>오늘 스냅샷 기록</b>을 누르면 그날 값이 저장돼 주차별 추세를 관리할 수 있습니다.</p>
              </div>
            </div>

            <div className="border-t px-5 py-3" style={{ borderColor: "var(--border)" }}>
              <button onClick={() => setOpen(false)} className="btn btn-primary w-full">이해했어요</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
