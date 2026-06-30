"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatThousands } from "@/lib/format";
import {
  type AccountCode, type JournalVoucher, type AccountSummary,
  type VoucherType, ACCOUNT_TYPE_LABELS, VOUCHER_TYPE_LABELS, VOUCHER_SOURCE_LABELS,
} from "@/lib/db/types";

const won = (n: number | null | undefined) => (n == null ? "-" : new Intl.NumberFormat("ko-KR").format(Math.round(n)) + "원");
const VTYPES = Object.entries(VOUCHER_TYPE_LABELS) as [VoucherType, string][];

interface DraftLine { account: string; debit: string; credit: string; desc: string }

/** 회계 전표 화면 — 시산표 + 전표/분개 목록 + 수동 전표 입력 */
export function AccountingView({
  projectId, vouchers, summary, codes,
}: {
  projectId: string;
  vouchers: JournalVoucher[];
  summary: AccountSummary[];
  codes: AccountCode[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [head, setHead] = useState({ date: new Date().toISOString().slice(0, 10), type: "transfer" as VoucherType, desc: "" });
  const [lines, setLines] = useState<DraftLine[]>([
    { account: codes[0]?.code ?? "", debit: "", credit: "", desc: "" },
    { account: codes[0]?.code ?? "", debit: "", credit: "", desc: "" },
  ]);

  const debitSum = lines.reduce((a, l) => a + Number(l.debit.replace(/,/g, "") || 0), 0);
  const creditSum = lines.reduce((a, l) => a + Number(l.credit.replace(/,/g, "") || 0), 0);
  const balanced = debitSum === creditSum && debitSum > 0;

  const totalDebit = summary.reduce((a, s) => a + Number(s.debit_total), 0);
  const totalCredit = summary.reduce((a, s) => a + Number(s.credit_total), 0);

  const byType = useMemo(() => {
    const g: Record<string, AccountSummary[]> = {};
    for (const s of summary) (g[s.type] ??= []).push(s);
    return g;
  }, [summary]);

  function setLine(i: number, k: keyof DraftLine, v: string) {
    setLines((p) => p.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));
  }

  async function save() {
    setErr(null);
    if (!balanced) { setErr("차변 합계와 대변 합계가 같아야 하며 0보다 커야 합니다."); return; }
    setBusy(true);
    const payload = lines
      .filter((l) => l.account && (l.debit || l.credit))
      .map((l) => ({ account: l.account, debit: Number(l.debit.replace(/,/g, "") || 0), credit: Number(l.credit.replace(/,/g, "") || 0), desc: l.desc || null }));
    const { error } = await supabase.rpc("acct_create_voucher", {
      p_project_id: projectId, p_type: head.type, p_date: head.date, p_desc: head.desc || null,
      p_source: "manual", p_source_id: null, p_lines: payload,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setOpen(false);
    setLines([{ account: codes[0]?.code ?? "", debit: "", credit: "", desc: "" }, { account: codes[0]?.code ?? "", debit: "", credit: "", desc: "" }]);
    setHead({ date: new Date().toISOString().slice(0, 10), type: "transfer", desc: "" });
    router.refresh();
  }

  const input = "rounded border bg-transparent px-2 py-1 text-xs";
  const style = { borderColor: "var(--border)" };

  return (
    <div className="space-y-6">
      {/* 시산표 */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium">시산표 (계정별 잔액)</h2>
          <span className="text-xs" style={{ color: totalDebit === totalCredit ? "#1d9e75" : "#ef4444" }}>
            차변 {won(totalDebit)} {totalDebit === totalCredit ? "=" : "≠"} 대변 {won(totalCredit)}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {(["asset", "liability", "equity", "revenue", "expense"] as const).filter((t) => byType[t]?.length).map((t) => (
            <div key={t} className="rounded-xl border p-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              <div className="mb-1 text-xs font-medium" style={{ color: "var(--navy)" }}>{ACCOUNT_TYPE_LABELS[t]}</div>
              <table className="w-full text-xs">
                <tbody>
                  {byType[t].map((s) => (
                    <tr key={s.account_code} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="py-1" style={{ color: "var(--muted)" }}>{s.account_code}</td>
                      <td className="py-1">{s.account_name}</td>
                      <td className="py-1 text-right font-medium">{won(Math.abs(Number(s.balance)))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {summary.length === 0 && <p className="text-sm" style={{ color: "var(--muted)" }}>전표가 없습니다. 기성·원가·구매 입력 시 자동 분개되거나, 아래에서 수동 전표를 입력하세요.</p>}
        </div>
      </section>

      {/* 전표 목록 */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium">전표 / 분개 ({vouchers.length})</h2>
          <button onClick={() => setOpen((v) => !v)} className="rounded-md px-3 py-1.5 text-sm font-medium text-white" style={{ background: "var(--accent)" }}>
            {open ? "닫기" : "+ 수동 전표"}
          </button>
        </div>

        {open && (
          <div className="mb-4 space-y-3 rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <div className="flex flex-wrap gap-3">
              <label className="text-xs">전표일<input type="date" className={`${input} ml-1`} style={style} value={head.date} onChange={(e) => setHead({ ...head, date: e.target.value })} /></label>
              <label className="text-xs">유형
                <select className={`${input} ml-1`} style={style} value={head.type} onChange={(e) => setHead({ ...head, type: e.target.value as VoucherType })}>
                  {VTYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <input className={`${input} flex-1`} style={style} placeholder="적요" value={head.desc} onChange={(e) => setHead({ ...head, desc: e.target.value })} />
            </div>
            <table className="w-full text-xs">
              <thead><tr style={{ color: "var(--muted)" }}>{["계정", "차변", "대변", "적요", ""].map((h, i) => <th key={i} className="px-1 py-1 text-left font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-1 py-1">
                      <select className={`${input} w-40`} style={style} value={l.account} onChange={(e) => setLine(i, "account", e.target.value)}>
                        {codes.map((c) => <option key={c.code} value={c.code}>{c.code} {c.name}</option>)}
                      </select>
                    </td>
                    <td className="px-1 py-1"><input className={`${input} w-28`} style={style} inputMode="numeric" value={l.debit} onChange={(e) => setLine(i, "debit", formatThousands(e.target.value))} /></td>
                    <td className="px-1 py-1"><input className={`${input} w-28`} style={style} inputMode="numeric" value={l.credit} onChange={(e) => setLine(i, "credit", formatThousands(e.target.value))} /></td>
                    <td className="px-1 py-1"><input className={`${input} w-full`} style={style} value={l.desc} onChange={(e) => setLine(i, "desc", e.target.value)} /></td>
                    <td className="px-1 py-1">{lines.length > 2 && <button onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))} className="text-red-500">×</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <button onClick={() => setLines((p) => [...p, { account: codes[0]?.code ?? "", debit: "", credit: "", desc: "" }])} style={{ color: "var(--accent)" }}>+ 분개 추가</button>
              <span style={{ color: balanced ? "#1d9e75" : "#ef4444" }}>차변 {won(debitSum)} / 대변 {won(creditSum)} {balanced ? "✓ 일치" : "✗ 불일치"}</span>
              <button onClick={save} disabled={busy || !balanced} className="ml-auto rounded-md px-4 py-2 font-medium text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>{busy ? "저장…" : "전표 등록"}</button>
            </div>
            {err && <p className="text-sm text-red-500">{err}</p>}
          </div>
        )}

        <div className="space-y-2">
          {vouchers.map((v) => (
            <div key={v.id} className="rounded-lg border p-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="rounded px-1.5 py-0.5 font-medium text-white" style={{ background: "var(--navy)" }}>{VOUCHER_TYPE_LABELS[v.type] ?? v.type}</span>
                  <span style={{ color: "var(--muted)" }}>{v.voucher_date} · {v.voucher_no}</span>
                  <span style={{ color: "var(--muted)" }}>· {VOUCHER_SOURCE_LABELS[v.source] ?? v.source}</span>
                  {v.description && <span>· {v.description}</span>}
                </div>
                <span className="font-medium">{won(v.total_amount)}</span>
              </div>
              <table className="mt-2 w-full text-xs">
                <tbody>
                  {(v.journal_lines ?? []).sort((a, b) => a.line_no - b.line_no).map((l) => (
                    <tr key={l.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="py-1" style={{ color: "var(--muted)", width: "40%" }}>{l.account_code} {l.description ?? ""}</td>
                      <td className="py-1 text-right" style={{ color: Number(l.debit) ? "var(--text)" : "var(--border)" }}>{Number(l.debit) ? won(l.debit) : "-"}</td>
                      <td className="py-1 text-right" style={{ color: Number(l.credit) ? "var(--text)" : "var(--border)" }}>{Number(l.credit) ? won(l.credit) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {vouchers.length === 0 && <p className="rounded-lg border p-6 text-center text-sm" style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--muted)" }}>등록된 전표가 없습니다.</p>}
        </div>
        <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
          기성 확정·수금, 원가, 구매 입고, 선급금은 자동 분개됩니다(부가세 10%). 전표는 ERP 회계 모듈로 전송 큐에 적재됩니다.
        </p>
      </section>
    </div>
  );
}
