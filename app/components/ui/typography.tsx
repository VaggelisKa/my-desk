import { cn } from "~/lib/utils";

export function TypographyH1({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h1
      className={cn(
        "scroll-m-20 text-center text-3xl font-extrabold tracking-tight lg:text-4xl",
        className,
      )}
    >
      {children}
    </h1>
  );
}
