import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "~/lib/utils";

let buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        primary:
          "rounded-[10px] bg-moss font-display font-semibold text-white shadow-none hover:bg-moss-edge focus-visible:ring-2 focus-visible:ring-moss focus-visible:ring-offset-2",
        quiet:
          "rounded-[10px] border border-line bg-paper font-display font-semibold text-ink shadow-none hover:bg-paper-muted focus-visible:ring-2 focus-visible:ring-moss focus-visible:ring-offset-2",
      },
      size: {
        default: "h-9 px-4 py-2",
        tall: "h-11 px-4 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

let Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button };
