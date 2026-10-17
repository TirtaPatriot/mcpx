import { validateValue, type OverridableSpec } from "../../../src/env-policy";
import { Field, inputCls, monoInputCls } from "../ui";

/**
 * One overridable variable as a form control: a select when the valid values are listed (starting at
 * Default), a text field otherwise. An empty value means "no override". Used by the client dialog and
 * the URL builder, so both look and behave the same.
 */
export function OverrideField(props: { name: string; spec: OverridableSpec; value: string; onChange: (value: string) => void }) {
  const { name, spec, value, onChange } = props;
  const listed = spec.values && spec.values.length > 0;
  const error = value && !listed ? validateValue(name, value, spec) : null;
  return (
    <Field label={<span class="font-mono">{name}</span>} hint={spec.description} error={error ?? undefined}>
      {listed ? (
        <select value={value} onChange={(e) => onChange(e.currentTarget.value)} class={inputCls}>
          <option value="">Default (no override)</option>
          {spec.values!.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      ) : (
        <input type="text" value={value} onInput={(e) => onChange(e.currentTarget.value)} placeholder="Default (no override)" class={monoInputCls} />
      )}
    </Field>
  );
}
