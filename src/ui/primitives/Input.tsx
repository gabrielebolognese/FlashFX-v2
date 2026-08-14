import { forwardRef } from 'react';
import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cx } from './cx';

const BASE =
  'w-full rounded-sm bg-surface-1 px-2 text-body text-primary placeholder:text-muted ' +
  'border border-hairline outline-none transition-colors duration-micro ' +
  'focus:border-accent focus:shadow-focus disabled:opacity-40';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cx(BASE, 'h-default', invalid && 'border-danger', className)}
      {...rest}
    />
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cx(BASE, 'py-1.5 leading-normal', invalid && 'border-danger', className)}
      {...rest}
    />
  );
});
