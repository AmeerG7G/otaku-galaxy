'use client';

import { useState } from 'react';
import { newPasswordError, type PasswordIdentity } from '@/lib/password-policy';

/**
 * A NEW-password field's state (registration, change password) — never the
 * login field: old accounts keep signing in with whatever they have.
 *
 * The message appears on leaving a filled field or on submit, then follows
 * every edit of the password AND of the identity it is checked against (the
 * name or phone typed in the same form), because it is derived at render.
 */
export function useNewPasswordField(identity: PasswordIdentity) {
  const [value, setValue] = useState('');
  const [shown, setShown] = useState(false);
  return {
    value,
    error: shown ? newPasswordError(value, identity) : null,
    onChange: setValue,
    onBlur() {
      if (value) setShown(true);
    },
    /** Shows the message, if any; true when the API would accept the password. */
    check(): boolean {
      setShown(true);
      return newPasswordError(value, identity) === null;
    },
    reset() {
      setValue('');
      setShown(false);
    },
  };
}

export function NewPasswordField({
  id,
  label,
  hint,
  field,
}: {
  id: string;
  label: string;
  hint?: string;
  field: Pick<ReturnType<typeof useNewPasswordField>, 'value' | 'error' | 'onChange' | 'onBlur'>;
}) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [field.error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {/* No minLength: the browser counts UTF-16 units, the API code points (STEP 86). */}
      <input
        id={id}
        name={id}
        type="password"
        autoComplete="new-password"
        required
        value={field.value}
        onChange={(event) => field.onChange(event.target.value)}
        onBlur={field.onBlur}
        aria-invalid={field.error ? true : undefined}
        aria-describedby={describedBy}
      />
      {field.error ? (
        <span id={errorId} className="field-error" role="alert">
          {field.error}
        </span>
      ) : null}
      {hint ? (
        <span id={hintId} className="hint">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
