import { cloneElement, isValidElement, type ComponentChildren, type JSX, type VNode } from "preact";
import { useId } from "preact/hooks";
import { Dialog } from "./components/Dialog";
import { copyText } from "./toast";

export const inputCls =
  "w-full bg-dark-900 border border-dark-700 rounded-xl px-3 py-2 text-strong focus:outline-none focus:border-blue-500";
export const monoInputCls = `${inputCls} font-mono`;

export const btnPrimary =
  "bg-blue-600 hover:bg-blue-500 text-white font-medium px-4 py-2 rounded-xl transition shadow-md shadow-blue-600/30";
export const btnPurple =
  "bg-purple-600 hover:bg-purple-500 text-white font-medium px-4 py-2 rounded-xl transition shadow-md shadow-purple-600/30";
export const btnGhost = "px-4 py-2 rounded-xl text-slate-300 hover:bg-dark-700 transition";

export const cardCls = "bg-dark-800 border border-dark-700 rounded-2xl";

export function Modal(props: {
  title: ComponentChildren;
  onClose: () => void;
  size?: "md" | "lg" | "xl";
  /** Backdrop click closes the dialog. Leave off for forms. */
  closeOnOverlay?: boolean;
  children: ComponentChildren;
}) {
  return <Dialog {...props} />;
}

/**
 * A labelled form control. The label is tied to the control (so screen readers announce it and
 * clicking the label focuses it), and `error` is announced and linked through aria-describedby.
 * Pass exactly one control as the child; use `group` for a set of buttons that share one label.
 */
export function Field(props: { label: ComponentChildren; error?: string; hint?: ComponentChildren; group?: boolean; children: ComponentChildren }) {
  const uid = useId();
  const describedBy = [props.error ? `${uid}-error` : "", props.hint ? `${uid}-hint` : ""].filter(Boolean).join(" ") || undefined;
  const child = props.children;
  const control =
    !props.group && isValidElement(child)
      ? cloneElement(child as VNode<Record<string, unknown>>, { id: uid, "aria-describedby": describedBy, "aria-invalid": props.error ? true : undefined })
      : child;
  return (
    <div role={props.group ? "group" : undefined} aria-labelledby={props.group ? `${uid}-label` : undefined}>
      {props.group ? (
        <span id={`${uid}-label`} class="block text-slate-400 mb-1">
          {props.label}
        </span>
      ) : (
        <label for={uid} class="block text-slate-400 mb-1">
          {props.label}
        </label>
      )}
      {control}
      {props.hint && (
        <p id={`${uid}-hint`} class="text-[11px] text-slate-500 mt-1">
          {props.hint}
        </p>
      )}
      {props.error && (
        <p id={`${uid}-error`} role="alert" class="text-[11px] text-red-400 mt-1">
          {props.error}
        </p>
      )}
    </div>
  );
}

export function ModalFooter(props: { onCancel: () => void; submitLabel: string; submitClass?: string; disabled?: boolean }) {
  return (
    <div class="flex justify-end gap-2 pt-3 border-t border-dark-700">
      <button type="button" onClick={props.onCancel} class={btnGhost}>
        Cancel
      </button>
      <button type="submit" disabled={props.disabled} class={props.submitClass ?? btnPrimary}>
        {props.submitLabel}
      </button>
    </div>
  );
}

export function SectionHeader(props: { title: ComponentChildren; subtitle?: ComponentChildren; children?: ComponentChildren }) {
  return (
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h2 class="text-base font-semibold text-strong flex items-center gap-2">{props.title}</h2>
        {props.subtitle && <p class="text-xs text-slate-400">{props.subtitle}</p>}
      </div>
      {props.children && <div class="section-actions flex items-center gap-2">{props.children}</div>}
    </div>
  );
}

/** Table that turns into cards on narrow screens; each <td> uses data-label for its caption. */
export function DataTable(props: { head: string[]; label: string; busy?: boolean; children: ComponentChildren; mono?: boolean }) {
  const last = props.head.length - 1;
  return (
    <div class={`${cardCls} overflow-hidden shadow-sm`}>
      <div class="overflow-x-auto">
        <table role="table" aria-busy={props.busy ? true : undefined} class={`rtable w-full text-left text-xs ${props.mono ? "font-mono" : ""}`}>
          <caption class="sr-only">{props.label}</caption>
          <thead role="rowgroup" class={`bg-dark-900/70 border-b border-dark-700 text-slate-400 text-xs font-medium ${props.mono ? "font-sans" : ""}`}>
            <tr role="row">
              {props.head.map((h, i) => (
                <th key={h} scope="col" role="columnheader" class={`py-3 px-4 font-medium ${i === last && h === "Actions" ? "text-right" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody role="rowgroup" class="divide-y divide-dark-700/50">{props.children}</tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * A table row. On narrow screens the table is restyled into cards with display: block, which
 * strips the native table semantics in some browsers, so the roles are stated explicitly.
 */
export function Tr(props: JSX.IntrinsicElements["tr"]) {
  return <tr role="row" {...props} />;
}

/** Placeholder rows shown while a list loads; the table keeps its shape instead of jumping. */
export function SkeletonRows(props: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: props.rows ?? 3 }, (_, r) => (
        <Tr key={r} aria-hidden="true">
          <td colspan={props.cols} class="py-4 px-4">
            <div class="h-4 rounded bg-dark-700/70 animate-pulse motion-reduce:animate-none" style={{ width: `${88 - r * 14}%` }} />
          </td>
        </Tr>
      ))}
    </>
  );
}

/** An empty list is a prompt to act: say what is missing and offer the next step. */
export function EmptyRow(props: { cols: number; title: string; hint?: ComponentChildren; action?: { label: string; onClick: () => void } }) {
  return (
    <Tr>
      <td role="cell" colspan={props.cols} class="p-8 text-center font-sans">
        <p class="text-sm font-medium text-slate-200">{props.title}</p>
        {props.hint && <p class="text-xs text-slate-400 mt-1">{props.hint}</p>}
        {props.action && (
          <button type="button" onClick={props.action.onClick} class={`${btnPrimary} text-xs mt-4`}>
            {props.action.label}
          </button>
        )}
      </td>
    </Tr>
  );
}

/** Search box for the lists; filtering happens in the browser. */
export function SearchInput(props: { value: string; onInput: (v: string) => void; label: string; placeholder?: string }) {
  return (
    <div class="relative">
      <svg class="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" />
      </svg>
      <input
        type="search"
        aria-label={props.label}
        value={props.value}
        onInput={(e) => props.onInput(e.currentTarget.value)}
        placeholder={props.placeholder ?? "Search..."}
        class="w-56 max-w-full bg-dark-800 border border-dark-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-strong placeholder-slate-500 focus:outline-none focus:border-blue-500"
      />
    </div>
  );
}

/** Case-insensitive match of the query against the chosen fields of each item. */
export function filterBy<T>(items: T[], query: string, fields: (item: T) => (string | undefined | null)[]): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => fields(item).some((f) => f?.toLowerCase().includes(q)));
}

/** Returns a message when `text` is not a JSON object, or "" when it is empty or valid. */
export function jsonObjectError(text: string): string {
  if (!text.trim()) return "";
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? "" : "Must be a JSON object, like {\"KEY\": \"value\"}";
  } catch (err) {
    return `Not valid JSON: ${(err as Error).message}`;
  }
}

export function Td(props: { label?: string; class?: string; actions?: boolean; children?: ComponentChildren }) {
  return (
    <td role="cell" data-label={props.label} class={`py-3 px-4 ${props.actions ? "actions text-right space-x-2" : ""} ${props.class ?? ""}`}>
      {props.children}
    </td>
  );
}

/** On/off switch drawn as a pill. `subject` names what it controls, for people who cannot see the row. */
export function EnabledPill(props: { enabled: boolean; offLabel: string; subject: string; onClick: () => void }) {
  const state = props.enabled ? "Active" : props.offLabel;
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-label={`${state}: ${props.subject}. Press to ${props.enabled ? "disable" : "enable"}.`}
      class={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition whitespace-nowrap ${
        props.enabled ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-dark-700 text-slate-300 border border-dark-600"
      }`}
    >
      <span aria-hidden="true">{props.enabled ? "● " : "○ "}</span>
      {state}
    </button>
  );
}

export function IconBox(props: { src: string; fallback: string; size?: "sm" | "md" }) {
  const box = props.size === "sm" ? "w-7 h-7" : "w-8 h-8";
  return (
    <div class={`${box} rounded-lg bg-dark-700 border border-dark-600 flex items-center justify-center shrink-0 overflow-hidden p-1`}>
      <img
        src={props.src}
        alt=""
        class="w-full h-full object-contain"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).src = props.fallback;
        }}
      />
    </div>
  );
}

/** "Label + value + Copy button" row for OAuth URLs. */
export function UrlRow(props: { label: string; value: string }) {
  return (
    <div class="bg-dark-900/80 p-3 rounded-xl border border-dark-700 flex items-center justify-between gap-2">
      <div class="min-w-0">
        <div class="text-[11px] text-slate-400 font-sans font-medium">{props.label}</div>
        <div class="truncate text-slate-200 mt-0.5">{props.value}</div>
      </div>
      <button
        type="button"
        aria-label={`Copy ${props.label}`}
        onClick={() => copyText(props.value)}
        class="shrink-0 text-slate-400 hover:text-strong p-1.5 bg-dark-800 rounded-lg border border-dark-600"
      >
        Copy
      </button>
    </div>
  );
}

/** `mcpServers` config for Claude Desktop / Cursor. */
export function mcpConfigJson(origin: string, token: string, server = "dokploy"): string {
  return JSON.stringify(
    { mcpServers: { [server]: { url: `${origin}/mcp/${server}`, headers: { Authorization: `Bearer ${token}` } } } },
    null,
    2,
  );
}

export function CodeBlock(props: { title: string; code: string; copyLabel?: string }) {
  return (
    <div class="bg-dark-900/80 p-3.5 rounded-xl border border-dark-700 text-xs font-mono space-y-2">
      <div class="flex items-center justify-between text-slate-400 font-sans text-[11px]">
        <span>{props.title}</span>
        <button type="button" aria-label={`${props.copyLabel ?? "Copy JSON"}: ${props.title.replace(/:$/, "")}`} onClick={() => copyText(props.code)} class="text-blue-400 hover:underline">
          {props.copyLabel ?? "Copy JSON"}
        </button>
      </div>
      <pre class="text-slate-300 text-[11px] overflow-x-auto whitespace-pre">{props.code}</pre>
    </div>
  );
}
