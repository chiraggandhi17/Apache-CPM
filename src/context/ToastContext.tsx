import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertCircle, Info, X, Undo2 } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info' | 'undoable';

interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
  actionLabel?: string;
  durationMs: number;
  createdAt: number;
}

interface UndoableOptions {
  message: string;
  actionLabel?: string;
  durationMs?: number;
  onCommit: () => void | Promise<void>;
  onUndo?: () => void;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  /** Shows a toast with an "Undo" action. The commit callback fires automatically
   *  once the toast expires unless the user clicks Undo first. */
  undoable: (opts: UndoableOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
};

let idCounter = 0;
const nextId = () => `toast-${Date.now()}-${idCounter++}`;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const commitFns = useRef<Map<string, () => void | Promise<void>>>(new Map());
  const undoFns = useRef<Map<string, () => void>>(new Map());

  const remove = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    commitFns.current.delete(id);
    undoFns.current.delete(id);
  }, []);

  const push = useCallback((item: Omit<ToastItem, 'id' | 'createdAt'>, onExpire?: () => void) => {
    const id = nextId();
    setToasts(prev => [...prev, { ...item, id, createdAt: Date.now() }]);
    const timer = setTimeout(() => {
      onExpire?.();
      remove(id);
    }, item.durationMs);
    timers.current.set(id, timer);
    return id;
  }, [remove]);

  const success = useCallback((message: string) => {
    push({ kind: 'success', message, durationMs: 4000 });
  }, [push]);

  const error = useCallback((message: string) => {
    push({ kind: 'error', message, durationMs: 6000 });
  }, [push]);

  const info = useCallback((message: string) => {
    push({ kind: 'info', message, durationMs: 4000 });
  }, [push]);

  const undoable = useCallback((opts: UndoableOptions) => {
    const durationMs = opts.durationMs ?? 6000;
    const id = push(
      { kind: 'undoable', message: opts.message, actionLabel: opts.actionLabel || 'Undo', durationMs },
      () => {
        // Timer expired without Undo — commit the action.
        opts.onCommit();
      }
    );
    commitFns.current.set(id, opts.onCommit);
    if (opts.onUndo) undoFns.current.set(id, opts.onUndo);
  }, [push]);

  const handleUndoClick = (id: string) => {
    const undoFn = undoFns.current.get(id);
    undoFn?.();
    remove(id);
  };

  useEffect(() => {
    const timersSnapshot = timers.current;
    return () => {
      timersSnapshot.forEach(t => clearTimeout(t));
    };
  }, []);

  return (
    <ToastContext.Provider value={{ success, error, info, undoable }}>
      {children}
      {createPortal(
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[10000] flex flex-col items-center gap-2 pointer-events-none w-full px-4">
          {toasts.map(t => (
            <ToastCard key={t.id} toast={t} onDismiss={() => remove(t.id)} onUndo={() => handleUndoClick(t.id)} />
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
};

const KIND_STYLES: Record<ToastKind, { icon: React.ReactNode; accent: string }> = {
  success: { icon: <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />, accent: '#10B981' },
  error: { icon: <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />, accent: '#F43F5E' },
  info: { icon: <Info className="w-4 h-4 text-[var(--accent)] shrink-0" />, accent: 'var(--accent)' },
  undoable: { icon: <Undo2 className="w-4 h-4 text-amber-500 shrink-0" />, accent: '#F59E0B' },
};

const ToastCard: React.FC<{ toast: ToastItem; onDismiss: () => void; onUndo: () => void }> = ({ toast, onDismiss, onUndo }) => {
  const style = KIND_STYLES[toast.kind];

  return (
    <div
      role="status"
      style={{ borderLeftColor: style.accent }}
      className="pointer-events-auto max-w-md w-full sm:w-auto bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl shadow-lg px-4 py-3 flex items-center gap-3 border-l-4 animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      {style.icon}
      <span className="text-xs font-semibold text-[var(--text-primary)] flex-1 leading-snug">{toast.message}</span>
      {toast.kind === 'undoable' && (
        <button
          type="button"
          onClick={onUndo}
          className="text-xs font-extrabold text-amber-600 hover:text-amber-700 shrink-0 px-2 py-1 rounded-lg hover:bg-amber-50 transition-colors"
        >
          {toast.actionLabel}
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        className="text-[var(--text-muted)] hover:text-[var(--text-primary)] shrink-0 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
