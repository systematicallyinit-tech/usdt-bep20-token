import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="relative overflow-hidden">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl" />

        <div className="absolute -right-32 top-32 h-96 w-96 rounded-full bg-blue-600/20 blur-3xl" />

        <div className="relative mx-auto max-w-6xl px-6 py-24 lg:py-32">
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex rounded-full border border-violet-400/20 bg-violet-400/10 px-4 py-2 text-sm font-semibold text-violet-300">
              MONAD
            </div>

            <h1 className="text-5xl font-black tracking-tight sm:text-6xl lg:text-7xl">
              USD Tether (USDT) on Monad
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-400">
              A mintable ERC-20 token deployed on Monad for development
              and testing.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/dashboard"
                className="rounded-xl bg-violet-600 px-6 py-3 text-center font-semibold transition hover:bg-violet-500"
              >
                Open Dashboard
              </Link>

              <a
                href="https://testnet.monadscan.com"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-center font-semibold transition hover:bg-white/10"
              >
                MonadScan
              </a>
            </div>
          </div>

          <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Symbol", "USDT"],
              ["Initial Supply", "1,000,000"],
              ["Decimals", "18"],
              ["Network", "Monad"],
            ].map(([title, value]) => (
              <div
                key={title}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur"
              >
                <p className="text-sm text-slate-500">{title}</p>

                <p className="mt-2 text-xl font-bold">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
