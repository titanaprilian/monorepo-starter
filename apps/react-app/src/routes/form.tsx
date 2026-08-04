import { createFileRoute } from '@tanstack/react-router';
import { ExampleForm } from '@/modules/example-form';

export const Route = createFileRoute('/form')({
  component: FormPage,
});

function FormPage() {
  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-50">
      <main className="flex flex-1 flex-col justify-center py-16">
        <ExampleForm />
      </main>
    </div>
  );
}
