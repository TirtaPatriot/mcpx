import { useEffect, useRef, useState } from "preact/hooks";

export interface Action {
  label: string;
  onClick: () => void;
  /** Destructive actions sit in the menu, in red, below a divider. */
  danger?: boolean;
  hidden?: boolean;
}

const link = "hover:underline";

/**
 * Row actions grouped by risk: the everyday actions are visible buttons, the rest (including
 * anything destructive) live in a "more" menu that follows the usual menu keyboard pattern.
 */
export function RowActions(props: { subject: string; primary: Action[]; menu: Action[] }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const items = props.menu.filter((a) => !a.hidden);

  useEffect(() => {
    if (!open) return;
    const rect = trigger.current!.getBoundingClientRect();
    // The menu is positioned against the viewport so the table's overflow cannot clip it;
    // it opens upwards when there is no room below.
    const height = menu.current?.offsetHeight ?? items.length * 36 + 8;
    const top = rect.bottom + height + 8 > window.innerHeight ? rect.top - height - 4 : rect.bottom + 4;
    setPos({ top, right: Math.max(8, window.innerWidth - rect.right) });
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();

    const close = () => setOpen(false);
    const onDown = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const onMenuKey = (e: KeyboardEvent) => {
    const nodes = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = nodes.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      nodes[(i + 1) % nodes.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      nodes[(i - 1 + nodes.length) % nodes.length]?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  const firstDanger = items.findIndex((a) => a.danger);

  return (
    // One non-wrapping row on desktop; on narrow screens the table turns into cards and
    // `contents` lets the buttons flow into the card's own action row.
    <div class="flex items-center justify-end gap-3 whitespace-nowrap max-sm:contents">
      {props.primary
        .filter((a) => !a.hidden)
        .map((a) => (
          <button key={a.label} type="button" onClick={a.onClick} class={`${a.danger ? "text-red-400" : "text-blue-400"} ${link}`}>
            {a.label}
          </button>
        ))}
      {items.length > 0 && (
        <>
          <button
            ref={trigger}
            type="button"
            aria-label={`More actions for ${props.subject}`}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            class="px-2 py-0.5 rounded-lg text-slate-300 hover:text-strong hover:bg-dark-700 transition leading-none text-base"
          >
            ⋯
          </button>
          {open && (
            <div
              ref={menu}
              role="menu"
              aria-label={`Actions for ${props.subject}`}
              onKeyDown={onMenuKey}
              style={{ position: "fixed", top: `${pos.top}px`, right: `${pos.right}px` }}
              class="z-[60] min-w-44 rounded-xl border border-dark-600 bg-dark-800 p-1 shadow-2xl text-xs text-left"
            >
              {items.map((a, i) => (
                <div key={a.label}>
                  {i === firstDanger && i > 0 && <div class="my-1 border-t border-dark-700" />}
                  <button
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    onClick={() => {
                      setOpen(false);
                      a.onClick();
                    }}
                    class={`w-full text-left px-3 py-2 rounded-lg hover:bg-dark-700 focus:bg-dark-700 outline-none ${a.danger ? "text-red-400" : "text-slate-200"}`}
                  >
                    {a.label}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
