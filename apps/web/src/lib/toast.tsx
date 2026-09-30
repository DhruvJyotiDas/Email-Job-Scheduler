import { createContext, ReactNode, useCallback, useContext, useState } from 'react';

type Toast = { id: number; text: string; kind: 'ok' | 'err' };
const Ctx = createContext<(text: string, kind?: Toast['kind']) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, text, kind }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 4000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={`rounded-lg px-4 py-2.5 text-xs shadow-lg ${t.kind === 'err' ? 'bg-red-600 text-white' : 'bg-ink text-white'}`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
