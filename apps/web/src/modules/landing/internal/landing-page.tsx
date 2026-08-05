import { Button } from '@/components/ui/button';

export function LandingPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-16">
        <div className="max-w-2xl space-y-6">
          <p className="text-sm uppercase tracking-[0.35em] text-sky-400">
            Monorepo starter
          </p>
          <h1 className="text-5xl font-semibold tracking-tight sm:text-7xl">
            Vite, React, Tailwind, and shadcn are wired up.
          </h1>
          <p className="max-w-xl text-lg text-slate-300">
            This app lives in isolation inside the monorepo and carries its own
            local tooling.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button>Primary action</Button>
            <Button variant="secondary">Secondary action</Button>
          </div>
        </div>
      </section>
    </main>
  );
}
