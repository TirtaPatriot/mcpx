import type { ComponentChildren } from "preact";
import { useEffect, useId, useRef } from "preact/hooks";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Only the top-most dialog reacts to Escape and Tab, so a confirmation opened over a form
// closes by itself and leaves the form open.
const stack: symbol[] = [];

/**
 * Accessible modal dialog: Escape closes it, Tab stays inside, focus returns to the element
 * that opened it, and the page behind does not scroll. Give an element `data-autofocus` to
 * choose what receives focus first (default: the first field, then the first button).
 */
export function Dialog(props: {
  title: ComponentChildren;
  onClose: () => void;
  size?: "md" | "lg" | "xl";
  /** Close when the backdrop is clicked. Off for forms, so a stray click cannot discard input. */
  closeOnOverlay?: boolean;
  children: ComponentChildren;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onClose = useRef(props.onClose);
  onClose.current = props.onClose;

  useEffect(() => {
    const me = Symbol("dialog");
    stack.push(me);
    const opener = document.activeElement as HTMLElement | null;
    const el = panel.current!;
    const items = () => [...el.querySelectorAll<HTMLElement>(FOCUSABLE)];
    (el.querySelector<HTMLElement>("[data-autofocus]") ?? items().find((n) => n.matches("input,select,textarea")) ?? items()[0] ?? el).focus();

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== me) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose.current();
      } else if (e.key === "Tab") {
        const list = items();
        if (list.length === 0) return e.preventDefault();
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && (document.activeElement === first || !el.contains(document.activeElement))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      stack.splice(stack.indexOf(me), 1);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, []);

  const width = props.size === "xl" ? "max-w-2xl" : props.size === "md" ? "max-w-md" : "max-w-lg";
  return (
    <div
      class="modal-overlay fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (props.closeOnOverlay && e.target === e.currentTarget) props.onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        class={`modal-panel bg-dark-800 border border-dark-700 rounded-2xl ${width} w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto outline-none`}
      >
        <div class="flex items-center justify-between">
          <h3 id={titleId} class="text-base font-semibold text-white flex items-center gap-2">
            {props.title}
          </h3>
          <button type="button" onClick={props.onClose} class="modal-close text-slate-400 hover:text-white text-lg" aria-label="Close">
            &times;
          </button>
        </div>
        {props.children}
      </div>
    </div>
  );
}
