"use client";

import { CalendarIcon } from "@radix-ui/react-icons";
import { addDays, format } from "date-fns";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { cn } from "~/lib/utils";

type DatepickerProps = {
  onDateChange: (date: Date | undefined) => void;
  initialDate?: Date;
};

export function DatePicker({ initialDate, onDateChange }: DatepickerProps) {
  const [date, setDate] = useState<Date | undefined>(initialDate);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          className={cn(
            "w-full justify-start text-left font-normal",
            !date && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, "PPP") : <span>View specific date</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(date) => {
            setDate(date);
            onDateChange(date);
          }}
          initialFocus
          fromDate={new Date()}
          toDate={addDays(new Date(), 14)}
        />
      </PopoverContent>
    </Popover>
  );
}
