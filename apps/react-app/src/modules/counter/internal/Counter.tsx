import { Button } from '@/components/ui/button';
import { useCounterStore } from './store';

export function Counter() {
  const { count, increment, decrement, reset } = useCounterStore();

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-slate-900 border border-slate-800 rounded-xl max-w-sm mx-auto shadow-lg space-y-4">
      <h2 className="text-xl font-bold text-slate-200">Zustand Counter Demo</h2>
      <div className="text-5xl font-mono font-bold text-sky-400 py-4">
        {count}
      </div>
      <div className="flex gap-2">
        <Button onClick={decrement} variant="secondary" className="w-16">
          -
        </Button>
        <Button onClick={reset} variant="secondary" className="w-20">
          Reset
        </Button>
        <Button onClick={increment} className="w-16">
          +
        </Button>
      </div>
    </div>
  );
}
