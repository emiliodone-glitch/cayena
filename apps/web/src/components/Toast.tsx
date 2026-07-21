"use client";

import { CheckCircle2, XCircle, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type ToastTipo = "success" | "error" | "info";
type ToastItem = { id: number; mensaje: string; tipo: ToastTipo };

type ToastContextValue = {
  toast: (mensaje: string, tipo?: ToastTipo) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONO: Record<ToastTipo, ReactNode> = {
  success: <CheckCircle2 className="h-5 w-5 text-institucional-600" />,
  error: <XCircle className="h-5 w-5 text-red-600" />,
  info: <Info className="h-5 w-5 text-blue-600" />,
};

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((mensaje: string, tipo: ToastTipo = "success") => {
    const id = nextId++;
    setItems((prev) => [...prev, { id, mensaje, tipo }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  }, []);

  function cerrar(id: number) {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="pointer-events-auto flex w-80 items-start gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-lg"
          >
            {ICONO[item.tipo]}
            <p className="flex-1 text-sm text-gray-700">{item.mensaje}</p>
            <button onClick={() => cerrar(item.id)} className="text-gray-300 hover:text-gray-500">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de ToastProvider");
  return ctx.toast;
}
