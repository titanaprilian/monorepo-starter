import { createFileRoute } from '@tanstack/react-router';
import { LandingPage } from '@/modules/landing';
import { Counter } from '@/modules/counter';

export const Route = createFileRoute('/')({
  component: IndexPage,
});

function IndexPage() {
  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-50">
      <LandingPage />
      <div className="pb-16 flex justify-center">
        <Counter />
      </div>
    </div>
  );
}
