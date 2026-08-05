import { z } from 'zod';

export const exampleFormSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters'),
  email: z.string().email('Enter a valid email address'),
});

export type ExampleFormValues = z.infer<typeof exampleFormSchema>;
