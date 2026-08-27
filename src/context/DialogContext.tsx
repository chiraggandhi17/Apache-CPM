import React, { createContext, useCallback, useContext, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, HelpCircle, Copy, Check, X } from 'lucide-react';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** If set, the confirm button stays disabled until the user types this exact text. */
  requireTypedText?: string;
}

interface InfoOptions {
  title: string;
  message?: string;
  /** Shown in a read-only, select-all, copy-to-clipboard field. */
  copyText?: string;
  closeLabel?: string;
}

interface DialogContextValue {
  /** Replacement for window.confirm() — themed, non-blocking, returns a Promise<boolean>. */
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  /** Replacement for window.prompt() used as a display/OK dialog — shows info with an optional copy button. */
  showInfo: (opts: InfoOptions) => Promise<void>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

export const useDialog = (): DialogContextValue => {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within a DialogProvider');
  return ctx;
};

type ActiveConfirm = { kind: 'confirm'; opts: ConfirmOptions; resolve: (v: boolean) => void };
type ActiveInfo = { kind: 'info'; opts: InfoOptions; resolve: () => void };
type ActiveDialog = ActiveConfirm | ActiveInfo | null;

export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [active, setActive] = useState<ActiveDialog>(null);
  const [typedText, setTypedText] = useState('');
  const [copied, setCopied] = useState(false);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise(resolve => {
      setTypedText('');
      setActive({ kind: 'confirm', opts, resolve });
    });
  }, []);

  const showInfo = useCallback((opts: InfoOptions): Promise<void> => {
    return new Promise(resolve => {
      setCopied(false);
      setActive({ kind: 'info', opts, resolve });
    });
  }, []);

  const close = () => setActive(null);

  const handleConfirmResolve = (val: boolean) => {
    if (active?.kind === 'confirm') active.resolve(val);
    close();
  };

  const handleInfoResolve = () => {
    if (active?.kind === 'info') active.resolve();
    close();
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — the text is still selectable in the field.
    }
  };

  const confirmDisabled =
    active?.kind === 'confirm' && active.opts.requireTypedText
      ? typedText !== active.opts.requireTypedText
      : false;

  return (
    <DialogContext.Provider value={{ confirm, showInfo }}>
      {children}
      {active &&
        createPortal(
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-[10001] animate-in fade-in">
            <div className="bg-[var(--card-bg)] rounded-3xl shadow-2xl w-full max-w-sm border border-[var(--border)] p-6 space-y-4">
              {active.kind === 'confirm' ? (
                <>
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${
                        active.opts.destructive
                          ? 'bg-rose-50 text-rose-600 border-rose-200'
                          : 'bg-[var(--accent-subtle)] text-[var(--accent)] border-[var(--accent)]/20'
                      }`}
                    >
                      {active.opts.destructive ? <AlertTriangle className="w-5 h-5" /> : <HelpCircle className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-sm font-bold text-[var(--text-primary)] leading-snug">{active.opts.title}</h2>
                      <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed whitespace-pre-wrap">{active.opts.message}</p>
                    </div>
                  </div>

                  {active.opts.requireTypedText && (
                    <div>
                      <label className="text-[11px] font-bold text-[var(--text-secondary)] block mb-1">
                        Type <span className="font-mono text-rose-600">{active.opts.requireTypedText}</span> to confirm:
                      </label>
                      <input
                        type="text"
                        autoFocus
                        value={typedText}
                        onChange={e => setTypedText(e.target.value)}
                        className="w-full text-xs px-3 py-2 bg-[var(--input-bg)] border border-[var(--border)] rounded-xl outline-none focus:border-rose-400 font-mono"
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleConfirmResolve(false)}
                      className="h-9 px-4 text-[var(--text-secondary)] font-semibold rounded-xl hover:bg-[var(--badge-bg)] transition-colors text-xs"
                    >
                      {active.opts.cancelLabel || 'Cancel'}
                    </button>
                    <button
                      type="button"
                      disabled={confirmDisabled}
                      onClick={() => handleConfirmResolve(true)}
                      className={`h-9 px-4 font-bold rounded-xl text-xs shadow-xs transition-all ${
                        confirmDisabled
                          ? 'bg-[var(--badge-bg)] text-[var(--text-muted)] cursor-not-allowed'
                          : active.opts.destructive
                          ? 'bg-rose-600 hover:bg-rose-700 text-white'
                          : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white'
                      }`}
                    >
                      {active.opts.confirmLabel || (active.opts.destructive ? 'Delete' : 'Confirm')}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-sm font-bold text-[var(--text-primary)] leading-snug">{active.opts.title}</h2>
                    <button type="button" onClick={handleInfoResolve} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] shrink-0">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {active.opts.message && (
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">{active.opts.message}</p>
                  )}

                  {active.opts.copyText && (
                    <div className="flex items-center gap-2">
                      <textarea
                        readOnly
                        value={active.opts.copyText}
                        rows={Math.min(6, active.opts.copyText.split('\n').length)}
                        onFocus={e => e.currentTarget.select()}
                        className="flex-1 text-[11px] font-mono p-2.5 bg-[var(--input-bg)] border border-[var(--border)] rounded-xl outline-none text-[var(--text-primary)] resize-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleCopy(active.opts.copyText!)}
                        className="h-9 px-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 self-start"
                      >
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copied ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  )}

                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={handleInfoResolve}
                      className="h-9 px-4 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold rounded-xl text-xs"
                    >
                      {active.opts.closeLabel || 'Done'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body
        )}
    </DialogContext.Provider>
  );
};
