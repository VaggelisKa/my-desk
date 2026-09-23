import { DayPicker } from "@daypicker/react";
import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import * as React from "react";

import { buttonVariants } from "~/components/ui/button";
import { cn } from "~/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      weekStartsOn={1}
      className={cn("p-3", className)}
      classNames={{
        months: "relative flex flex-col sm:flex-row gap-4",
        month: "space-y-4",
        month_caption: "flex h-7 justify-center items-center",
        caption_label: "text-sm font-medium",
        nav: "absolute inset-x-0 top-0 flex items-center justify-between",
        button_previous: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 aria-disabled:pointer-events-none aria-disabled:opacity-25",
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 aria-disabled:pointer-events-none aria-disabled:opacity-25",
        ),
        month_grid: "w-full border-collapse space-y-1",
        weekdays: "flex",
        weekday:
          "text-muted-foreground rounded-md w-8 font-normal text-[0.8rem]",
        week: "flex w-full mt-2",
        day: cn(
          "group relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent data-[outside]:data-[selected]:bg-accent/50",
          props.mode === "range"
            ? "[&.range-end]:rounded-r-md [&.range-start]:rounded-l-md first:data-[selected]:rounded-l-md last:data-[selected]:rounded-r-md"
            : "data-[selected]:rounded-md",
        ),
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-8 w-8 p-0 font-normal",
          "group-data-[today]:bg-accent group-data-[today]:text-accent-foreground",
          "group-data-[selected]:bg-primary group-data-[selected]:text-primary-foreground group-data-[selected]:hover:bg-primary group-data-[selected]:hover:text-primary-foreground group-data-[selected]:focus:bg-primary group-data-[selected]:focus:text-primary-foreground",
          "group-data-[outside]:text-muted-foreground group-data-[outside]:opacity-50 group-data-[outside]:group-data-[selected]:bg-accent/50 group-data-[outside]:group-data-[selected]:text-muted-foreground group-data-[outside]:group-data-[selected]:opacity-30",
          "group-data-[disabled]:text-muted-foreground group-data-[disabled]:opacity-50",
        ),
        range_start: "range-start",
        range_end: "range-end",
        range_middle:
          "[&>button]:bg-accent [&>button]:text-accent-foreground [&>button]:rounded-none",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeftIcon className="h-4 w-4" />
          ) : (
            <ChevronRightIcon className="h-4 w-4" />
          ),
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
