import { createFileRoute } from '@tanstack/react-router';
import { RegisterForm } from '@/modules/auth';

export const Route = createFileRoute('/register')({
  component: RegisterPage,
});

function RegisterPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <RegisterForm />
    </div>
  );
}
