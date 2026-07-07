"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SettingsTabs } from "@/components/layout/SettingsTabs";

type Choice = "light" | "dark" | "system";
const KEY = "pms-theme";

/** 선택값을 실제 테마로 변환해 <html data-theme> 에 적용 */
function apply(choice: Choice) {
  const dark = choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

const OPTS: { v: Choice; label: string; desc: string }[] = [
  { v: "light", label: "라이트", desc: "밝은 화면(기본)" },
  { v: "dark", label: "다크", desc: "어두운 화면 · 눈부심 감소" },
  { v: "system", label: "시스템 설정", desc: "기기(OS) 설정을 따름" },
];

export default function AppearancePage() {
  const [choice, setChoice] = useState<Choice>("system");

  useEffect(() => {
    const c = (localStorage.getItem(KEY) as Choice) || "system";
    setChoice(c);
  }, []);

  // '시스템'일 때 OS 다크모드 변경을 실시간 반영
  useEffect(() => {
    if (choice !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const h = () => apply("system");
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [choice]);

  function pick(c: Choice) {
    setChoice(c);
    localStorage.setItem(KEY, c);
    apply(c);
  }

  // 미니 프리뷰 색상(고정) — 옵션별 상단바/본문 느낌
  function preview(v: Choice) {
    const bar = v === "dark" ? "#0c1424" : "#16244a";
    const body = v === "dark" ? "#161d28" : "#ffffff";
    const barSys = "linear-gradient(90deg,#16244a 50%,#0c1424 50%)";
    const bodySys = "linear-gradient(90deg,#ffffff 50%,#161d28 50%)";
    return { bar: v === "system" ? barSys : bar, body: v === "system" ? bodySys : body };
  }

  return (
    <main>
      <SiteHeader />
      <div className="page" style={{ maxWidth: 1080 }}>
        <div className="page-head">
          <div>
            <p className="eyebrow">설정</p>
            <h1 className="page-title">화면</h1>
            <p className="page-sub">테마(라이트·다크)를 선택합니다. 선택 즉시 적용되고 이 기기에 저장됩니다.</p>
          </div>
          <Link href="/" className="link text-[14px]">← 홈</Link>
        </div>

        <SettingsTabs active="appearance" />

        <div className="card" style={{ maxWidth: 720 }}>
          <h2 className="mb-1 text-[15px] font-semibold" style={{ color: "var(--heading)" }}>테마</h2>
          <p className="mb-4 text-[13px]" style={{ color: "var(--muted)" }}>다음 방문에도 유지됩니다. 설치형 앱에서도 동일하게 적용됩니다.</p>

          <div className="grid gap-3 sm:grid-cols-3">
            {OPTS.map((o) => {
              const on = choice === o.v;
              const pv = preview(o.v);
              return (
                <button
                  key={o.v}
                  onClick={() => pick(o.v)}
                  className="rounded-lg border p-4 text-left transition-colors"
                  style={{
                    borderColor: on ? "var(--accent)" : "var(--border)",
                    background: on ? "var(--accent-soft)" : "var(--surface)",
                    boxShadow: on ? "var(--ring)" : "none",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] font-semibold" style={{ color: "var(--heading)" }}>{o.label}</span>
                    <span aria-hidden style={{ color: on ? "var(--accent)" : "var(--faint)" }}>{on ? "●" : "○"}</span>
                  </div>
                  <div className="mt-1 text-[12px]" style={{ color: "var(--muted)" }}>{o.desc}</div>
                  <div className="mt-3 overflow-hidden rounded-md border" style={{ borderColor: "var(--border)" }}>
                    <div style={{ height: 16, background: pv.bar }} />
                    <div style={{ height: 40, background: pv.body }} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}
