import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { exampleFormSchema, type ExampleFormValues } from './schema';

export function ExampleForm() {
  const [submitted, setSubmitted] = useState<ExampleFormValues | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ExampleFormValues>({
    resolver: zodResolver(exampleFormSchema),
    defaultValues: { name: '', email: '' },
  });

  function onSubmit(values: ExampleFormValues) {
    setSubmitted(values);
  }

  const fieldClassName =
    'h-11 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400';

  return (
    <div className="mx-auto flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6 bg-slate-900 p-6 border border-slate-800 rounded-xl shadow-lg">
        <h2 className="text-xl font-bold text-slate-200">
          React Hook Form + Zod Demo
        </h2>
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-1.5">
            <label
              htmlFor="name"
              className="block text-sm font-medium text-slate-300"
            >
              Name
            </label>
            <input
              id="name"
              type="text"
              placeholder="Jane Doe"
              className={fieldClassName}
              {...register('name')}
            />
            {errors.name && (
              <p className="text-sm text-red-400">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-300"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              placeholder="jane@example.com"
              className={fieldClassName}
              {...register('email')}
            />
            {errors.email && (
              <p className="text-sm text-red-400">{errors.email.message}</p>
            )}
          </div>

          <Button type="submit" disabled={isSubmitting} className="w-full">
            Submit
          </Button>
        </form>

        {submitted && (
          <div className="rounded-md border border-emerald-800 bg-emerald-950/50 p-4 text-sm text-emerald-300">
            <p className="font-semibold">Valid submission:</p>
            <p>Name: {submitted.name}</p>
            <p>Email: {submitted.email}</p>
          </div>
        )}
      </div>
    </div>
  );
}
