import { cn } from "~/lib/utils";

export function Wall({
  className,
  height = "md",
}: {
  className?: string;
  height?: "sm" | "md" | "lg";
}) {
  const heightClasses = {
    sm: "h-8",
    md: "h-12",
    lg: "h-12",
  };

  return (
    <div
      className={cn(
        "w-full border-b border-t-2 border-b-gray-700 border-t-gray-500 bg-gradient-to-b from-gray-600 to-gray-800 shadow-lg",
        "relative overflow-hidden",
        heightClasses[height],
        className,
      )}
    >
      {/* Wall texture pattern */}
      <div className="absolute inset-0 opacity-20">
        <div
          className="h-full w-full bg-repeat-x"
          style={{
            backgroundImage: `repeating-linear-gradient(
                 90deg,
                 transparent,
                 transparent 8px,
                 rgba(0,0,0,0.1) 8px,
                 rgba(0,0,0,0.1) 9px
               )`,
          }}
        />
      </div>

      {/* Wall highlight */}
      <div className="absolute left-0 right-0 top-0 h-1 bg-gradient-to-r from-transparent via-gray-400 to-transparent opacity-60" />
    </div>
  );
}
