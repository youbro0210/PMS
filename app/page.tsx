import Link from "next/link";
import { getMyProjects } from "@/lib/db/queries";
import { SiteHeader } from "@/components/layout/SiteHeader";

export default async function HomePage() {
  const projects = await getMyProjects();

  return (
    <main>
      <SiteHeader />

      {/* SYU 스타일 히어로 */}
      <section className="syu-hero px-8 py-16">
        <div className="mx-auto max-w-5xl">
          <p className="text-sm opacity-80">수주 프로젝트 관리 시스템</p>
          <h1 className="mt-2 text-3xl font-bold leading-snug">
            문맥을 이해하는 지능형 수주·제작 관리
          </h1>
          <p className="mt-3 max-w-xl text-sm opacity-90">
            단계 진척·대금·기자재 구매·FAT를 자연어로 관리합니다. 명령 한 줄이면 수주 데이터가 정리됩니다.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-8 py-10">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold" style={{ color: "var(--navy)" }}>수주 목록</h2>
          <Link
            href="/projects/new"
            className="rounded-md px-4 py-2 text-sm font-medium text-white"
            style={{ background: "var(--accent)" }}
          >
            + 신규 수주 등록
          </Link>
        </div>
        {projects.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>등록된 현장이 없습니다.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.id}/board`}
                  className="block rounded-xl border p-5 transition hover:shadow-md"
                  style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                >
                  <div className="mb-2 text-2xl">{p.icon}</div>
                  <div className="font-medium" style={{ color: "var(--navy)" }}>{p.name}</div>
                  <div className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                    {p.client_name ?? "고객 미지정"}{p.end_user ? ` · ${p.end_user}` : ""} · {p.status}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
