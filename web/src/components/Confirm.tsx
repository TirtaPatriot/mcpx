import type { ComponentChildren } from "preact";
import { createContext } from "preact";
import { useCallback, useContext, useState } from "preact/hooks";
import { Dialog } from "./Dialog";

export interface ConfirmOptions {
  title: string;
  /** Say what will happen, in plain words, so the choice is informed. */
  message: ComponentChildren;
  /** The action's own verb ("Delete server"), never a bare "OK". */
  confirmLabel: string;
  danger?: boolean;
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm>(() => Promise.resolve(false));

/** `const confirm = useConfirm(); if (await confirm({...})) ...` replaces window.confirm. */
export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider(props: { children: ComponentChildren }) {
  const [pending, setPending] = useState<{ options: ConfirmOptions; resolve: (ok: boolean) => void } | null>(null);
  const confirm = useCallback<Confirm>((options) => new Promise((resolve) => setPending({ options, resolve })), []);
  const settle = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {props.children}
      {pending && (
        <Dialog title={pending.options.title} onClose={() => settle(false)} size="md" closeOnOverlay>
          <div class="text-sm text-slate-300 leading-relaxed">{pending.options.message}</div>
          <div class="flex justify-end gap-2 pt-2">
            {/* Cancel takes focus first: the safe choice is the one Enter picks. */}
            <button type="button" data-autofocus onClick={() => settle(false)} class="px-4 py-2 rounded-xl text-slate-200 hover:bg-dark-700 transition text-sm">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => settle(true)}
              class={`px-4 py-2 rounded-xl text-sm font-medium text-white transition ${
                pending.options.danger ? "bg-red-600 hover:bg-red-500 shadow-md shadow-red-600/30" : "bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-600/30"
              }`}
            >
              {pending.options.confirmLabel}
            </button>
          </div>
        </Dialog>
      )}
    </ConfirmContext.Provider>
  );
}
