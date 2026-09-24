import { Check } from "lucide-react";
import * as React from "react";
import { Link, type LinkProps } from "react-router";
import { Button, type ButtonProps } from "~/components/ui/button";
import { Input, type InputProps } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { cn } from "~/lib/utils";

/**
 * Shared layout for the sign-in and registration pages, mirroring the "Sign in"
 * mock in design/design-options.html: title, description and form straight on
 * the page, no panel, full width on phones and narrow on desktop. `notice`
 * renders under the form, where the mock places the signed-out line.
 */
export function AuthCard({
  title,
  description,
  notice,
  children,
}: {
  title: string;
  description: string;
  notice?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex w-full max-w-sm flex-col gap-6 py-4 font-display text-ink sm:py-14">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-[26px] font-bold tracking-tight">{title}</h1>
        <p className="text-[15px] text-ink-muted">{description}</p>
      </header>

      {children}

      {notice && (
        <p
          role="status"
          className="flex items-start gap-2 text-[13px] font-semibold text-moss-edge"
        >
          <Check aria-hidden="true" className="mt-px h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </p>
      )}
    </section>
  );
}

let inputClassName =
  "h-11 rounded-lg border-line bg-paper px-3 text-[15px] shadow-none placeholder:text-dim focus-visible:border-moss focus-visible:ring-[3px] focus-visible:ring-moss-soft aria-[invalid]:border-danger";

function FieldError({ id, error }: { id: string; error?: string }) {
  if (!error) {
    return null;
  }

  return (
    <p id={id} role="alert" className="text-[13px] font-medium text-danger">
      {error}
    </p>
  );
}

type AuthFieldProps = InputProps & {
  id: string;
  label: string;
  error?: string;
};

export let AuthField = React.forwardRef<HTMLInputElement, AuthFieldProps>(
  ({ id, label, error, className, ...props }, ref) => {
    let errorId = `${id}-error`;

    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id} className="text-[13px] font-semibold">
          {label}
        </Label>

        <Input
          ref={ref}
          id={id}
          type="text"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(inputClassName, className)}
          {...props}
        />

        <FieldError id={errorId} error={error} />
      </div>
    );
  },
);
AuthField.displayName = "AuthField";

export const CODE_LENGTH = 6;

type CodeFieldProps = Omit<
  InputProps,
  "value" | "onChange" | "maxLength" | "type"
> & {
  id: string;
  label: string;
  error?: string;
  value: string;
  onChange: (value: string) => void;
};

/**
 * A six-character code drawn as six boxes. The boxes are purely visual; a
 * single real input sits on top of them, transparent, so the label, focus,
 * autofill, paste and assistive tech all work as for any text field.
 */
export let CodeField = React.forwardRef<HTMLInputElement, CodeFieldProps>(
  ({ id, label, error, value, onChange, className, ...props }, ref) => {
    let errorId = `${id}-error`;
    let inputRef = React.useRef<HTMLInputElement>(null);
    let [focused, setFocused] = React.useState(false);

    // With `autoFocus`, the browser focuses the server-rendered input before
    // React hydrates, so no focus event reaches us. Read the state on mount.
    React.useEffect(() => {
      setFocused(document.activeElement === inputRef.current);
    }, []);

    let chars = Array.from({ length: CODE_LENGTH }, (_, i) => value[i] ?? "");
    let cursor = Math.min(value.length, CODE_LENGTH - 1);

    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id} className="text-[13px] font-semibold">
          {label}
        </Label>

        <div className="relative">
          <div
            aria-hidden="true"
            className="grid grid-cols-6 gap-2"
            data-testid={`${id}-boxes`}
          >
            {chars.map((char, i) => (
              <div
                key={i}
                className={cn(
                  "grid h-[52px] place-items-center rounded-lg border border-line bg-paper text-[22px] font-bold uppercase text-ink",
                  error && "border-danger",
                  focused &&
                    i === cursor &&
                    "border-moss ring-[3px] ring-moss-soft",
                )}
              >
                {char}
              </div>
            ))}
          </div>

          <input
            ref={(node) => {
              inputRef.current = node;
              if (typeof ref === "function") {
                ref(node);
              } else if (ref) {
                ref.current = node;
              }
            }}
            id={id}
            type="text"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            maxLength={CODE_LENGTH}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            // Full-size and transparent, so it catches taps and focus but the
            // boxes underneath do the drawing. 16px+ keeps iOS from zooming.
            className={cn(
              "absolute inset-0 h-full w-full cursor-text bg-transparent text-base text-transparent caret-transparent opacity-0 outline-none selection:bg-transparent",
              className,
            )}
            {...props}
          />
        </div>

        <FieldError id={errorId} error={error} />
      </div>
    );
  },
);
CodeField.displayName = "CodeField";

export function AuthSubmit({ className, ...props }: ButtonProps) {
  return (
    <Button
      type="submit"
      className={cn(
        "h-11 w-full rounded-[10px] bg-moss text-sm font-semibold text-white shadow-none hover:bg-moss-edge focus-visible:ring-[3px] focus-visible:ring-moss-soft focus-visible:ring-offset-0",
        className,
      )}
      {...props}
    />
  );
}

export function AuthLink({ className, ...props }: LinkProps) {
  return (
    <Link
      className={cn(
        "rounded-sm font-semibold text-ink underline decoration-ink-muted underline-offset-4 hover:decoration-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-moss-soft",
        className,
      )}
      {...props}
    />
  );
}
