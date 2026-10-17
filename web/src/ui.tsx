import type { ComponentChildren } from "preact";
import { copyText } from "./toast";

export const inputCls =
  "w-full bg-dark-900 border border-dark-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500";
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
  children: ComponentChildren;
}) {
  const width = props.size === "xl" ? "max-w-2xl" : props.size === "md" ? "max-w-md" : "max-w-lg";
  return (
    <div class="modal-overlay fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class={`modal-panel bg-dark-800 border border-dark-700 rounded-2xl ${width} w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto`}>
        <div class="flex items-center justify-between">
          <h3 class="text-base font-semibold text-white flex items-center gap-2">{props.title}</h3>
          <button type="button" onClick={props.onClose} class="modal-close text-slate-400 hover:text-white text-lg" aria-label="Close">
            &times;
          </button>
        </div>
        {props.children}
      </div>
    </div>
  );
}

export function Field(props: { label: ComponentChildren; children: ComponentChildren }) {
  return (
    <div>
      <label class="block text-slate-400 mb-1">{props.label}</label>
      {props.children}
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
        <h2 class="text-base font-semibold text-white flex items-center gap-2">{props.title}</h2>
        {props.subtitle && <p class="text-xs text-slate-400">{props.subtitle}</p>}
      </div>
      {props.children && <div class="section-actions flex items-center gap-2">{props.children}</div>}
    </div>
  );
}

/** Table that turns into cards on narrow screens; each <td> uses data-label for its caption. */
export function DataTable(props: { head: string[]; children: ComponentChildren; mono?: boolean; compact?: boolean }) {
  const last = props.head.length - 1;
  return (
    <div class={`${cardCls} overflow-hidden shadow-sm`}>
      <div class="overflow-x-auto">
        <table class={`rtable w-full text-left text-xs ${props.mono ? "font-mono" : ""}`}>
          <thead class={`bg-dark-900/70 border-b border-dark-700 text-slate-400 uppercase tracking-wider text-[10px] ${props.mono ? "font-sans" : ""}`}>
            <tr>
              {props.head.map((h, i) => (
                <th key={h} class={`py-3 px-4 ${i === last && h === "Actions" ? "text-right" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody class="divide-y divide-dark-700/50">{props.children}</tbody>
        </table>
      </div>
    </div>
  );
}

export function EmptyRow(props: { cols: number; children: ComponentChildren }) {
  return (
    <tr>
      <td colspan={props.cols} class="p-6 text-center text-slate-400 font-sans">
        {props.children}
      </td>
    </tr>
  );
}

export function Td(props: { label?: string; class?: string; actions?: boolean; children?: ComponentChildren }) {
  return (
    <td data-label={props.label} class={`py-3 px-4 ${props.actions ? "actions text-right space-x-2" : ""} ${props.class ?? ""}`}>
      {props.children}
    </td>
  );
}

export function EnabledPill(props: { enabled: boolean; offLabel: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition ${
        props.enabled ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-slate-700 text-slate-400"
      }`}
    >
      {props.enabled ? "● Active" : `○ ${props.offLabel}`}
    </button>
  );
}

export function IconBox(props: { src: string; fallback: string; size?: "sm" | "md" }) {
  const box = props.size === "sm" ? "w-7 h-7" : "w-8 h-8";
  return (
    <div class={`${box} rounded-lg bg-dark-700 border border-dark-600 flex items-center justify-center shrink-0 overflow-hidden p-1`}>
      <img
        src={props.src}
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
        <div class="text-[10px] text-slate-400 font-sans uppercase font-bold tracking-wider">{props.label}</div>
        <div class="truncate text-slate-200 mt-0.5">{props.value}</div>
      </div>
      <button
        type="button"
        onClick={() => copyText(props.value)}
        class="shrink-0 text-slate-400 hover:text-white p-1.5 bg-dark-800 rounded-lg border border-dark-600"
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
        <button type="button" onClick={() => copyText(props.code)} class="text-blue-400 hover:underline">
          {props.copyLabel ?? "Copy JSON"}
        </button>
      </div>
      <pre class="text-slate-300 text-[11px] overflow-x-auto whitespace-pre">{props.code}</pre>
    </div>
  );
}
