import { createFileRoute } from '@tanstack/react-router';
import { LandingPage } from '@/modules/landing';

export const Route = createFileRoute('/')({
  component: LandingPage,
});
