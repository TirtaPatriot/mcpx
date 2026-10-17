import { useEffect, useRef } from "preact/hooks";
import type { TabId } from "../context";
import { Modal } from "../ui";

/** "g" then a letter jumps to a section, the way many ops tools do. */
const GO: Record<string, { tab: TabId; label: string }> = {
  o: { tab: "overview", label: "Overview" },
  s: { tab: "servers", label: "MCP Servers" },
  c: { tab: "clients", label: "OAuth Clients" },
  u: { tab: "users", label: "Users" },
  t: { tab: "tokens", label: "Tokens & Sessions" },
  l: { tab: "logs", label: "Activity Log" },
  ",": { tab: "settings", label: "Settings" },
};

const isTyping = (el: EventTarget | null) => !!(el as HTMLElement | null)?.closest?.("input,textarea,select,[contenteditable='true']");

/**
 * Global shortcuts: "/" focuses the search box, "g" + letter goes to a section, "?" lists them.
 * They stay out of the way while typing and while a dialog is open.
 */
export function useShortcuts(goTab: (tab: TabId) => void, showHelp: () => void) {
  const latest = useRef({ goTab, showHelp });
  latest.current = { goTab, showHelp };

  useEffect(() => {
    let waiting = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector('[role="dialog"]')) return;

      if (waiting) {
        waiting = false;
        clearTimeout(timer);
        const target = GO[e.key];
        if (target) {
          e.preventDefault();
          latest.current.goTab(target.tab);
        }
        return;
      }
      if (e.key === "g") {
        waiting = true;
        timer = setTimeout(() => (waiting = false), 1200);
      } else if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        // Some keyboard layouts report "?" as "/" with Shift held.
        e.preventDefault();
        latest.current.showHelp();
      } else if (e.key === "/") {
        const box = document.querySelector<HTMLInputElement>('input[type="search"]');
        if (box) {
          e.preventDefault();
          box.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(timer);
    };
  }, []);
}

function Keys(props: { keys: string[] }) {
  return (
    <span class="flex items-center gap-1">
      {props.keys.map((k, i) => (
        <span key={i} class="contents">
          {i > 0 && <span class="text-slate-500 text-[11px]">then</span>}
          <kbd class="min-w-6 text-center font-mono text-[11px] px-1.5 py-0.5 rounded-md bg-dark-700 border border-dark-600 text-slate-200">{k}</kbd>
        </span>
      ))}
    </span>
  );
}

export function ShortcutsDialog(props: { onClose: () => void }) {
  const rows: { keys: string[]; label: string }[] = [
    { keys: ["/"], label: "Search the current list" },
    { keys: ["?"], label: "Show this list" },
    { keys: ["Esc"], label: "Close a dialog or menu" },
    ...Object.entries(GO).map(([key, { label }]) => ({ keys: ["g", key], label: `Go to ${label}` })),
  ];
  return (
    <Modal title="Keyboard shortcuts" onClose={props.onClose} size="md" closeOnOverlay>
      <ul class="space-y-2 text-sm">
        {rows.map((r) => (
          <li key={r.label} class="flex items-center justify-between gap-4">
            <span class="text-slate-300">{r.label}</span>
            <Keys keys={r.keys} />
          </li>
        ))}
      </ul>
    </Modal>
  );
}
