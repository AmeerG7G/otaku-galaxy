'use client';

import { useState } from 'react';
import { iraqiPhoneInputText, normalizeIraqiPhone, phoneFieldError } from '@/lib/phone';

/**
 * A phone field's state. `check()` runs the app's validator and shows its
 * message (nothing is sent while it fails); once shown, the message follows
 * every edit. `submitValue` is what the API gets: E.164.
 */
export function usePhoneField(initial = '') {
  const [value, setValue] = useState(() => iraqiPhoneInputText(initial));
  const [error, setError] = useState<string | null>(null);
  return {
    value,
    error,
    onChange(next: string) {
      setValue(next);
      if (error) setError(phoneFieldError(next));
    },
    check(): boolean {
      const problem = phoneFieldError(value);
      setError(problem);
      return problem === null;
    },
    get submitValue() {
      return normalizeIraqiPhone(value) ?? value.trim();
    },
  };
}

/**
 * Every phone field of the store (login, account request, forgotten password,
 * checkout) — the app's field: the whole local number `07XXXXXXXXX`, digits
 * only (Eastern digits converted), never more than 11, typed or pasted
 * (`iraqiPhoneInputText`). The form validates with `phoneFieldError` and sends
 * `normalizeIraqiPhone`.
 *
 * No `maxLength` attribute: the browser would cut a pasted `0770 123 4567` at
 * 11 characters before the separators are removed; the cut happens here, on
 * digits, like the app's formatter.
 */
export function PhoneField({
  label,
  value,
  onChange,
  onBlur,
  error,
  id = 'phone',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Checkout only: its submit button stays disabled while the number is invalid, so the message comes on leaving the field. */
  onBlur?: () => void;
  error?: string | null;
  id?: string;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name="phone"
        className="ltr"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder="07XXXXXXXXX"
        required
        value={value}
        onChange={(event) => onChange(iraqiPhoneInputText(event.target.value))}
        onBlur={onBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error ? (
        <span id={errorId} className="field-error">
          {error}
        </span>
      ) : null}
    </div>
  );
}
