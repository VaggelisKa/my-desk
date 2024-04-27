import { ArrowRightIcon } from "@radix-ui/react-icons";
import { Link } from "@remix-run/react";
import { getWeek } from "date-fns";
import { useState } from "react";
import { useMediaQuery } from "usehooks-ts";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import type { reservations, users } from "~/lib/db/schema.server";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "./ui/drawer";

type DeskModalProps = {
  desk: {
    id: number;
    row: number;
    block: number;
    column: number;
    user: typeof users.$inferSelect;
    reservations: (typeof reservations.$inferSelect)[];
  };
  TriggerElement?: React.ReactNode;
  children?: React.ReactNode;
  allowedToReserve?: boolean;
};

let lettersToDays: Record<string, string> = {
  M: "monday",
  T: "tuesday",
  W: "wednesday",
  Th: "thursday",
  F: "friday",
};

export function DeskModal({
  TriggerElement,
  desk,
  allowedToReserve,
}: DeskModalProps) {
  let currentWeek = getWeek(new Date());

  let [open, setOpen] = useState(false);
  let isSmallDevice = useMediaQuery("(max-width : 768px)");

  function isReserved(day: string, week: number) {
    return desk.reservations.find(
      (r) => r.day === lettersToDays[day] && r.week === week,
    );
  }

  let contentTemplate = (
    <div className="flex flex-col gap-4 ">
      <div>
        <span className="text-sm text-gray-500">Assigned to</span>
        <p className="capitalize">
          {`${desk.user.firstName} ${desk.user.lastName}`}
        </p>
      </div>

      <div>
        <span className="text-sm text-gray-500">Computer type</span>
        <p>Desktop</p>
      </div>

      <div>
        <span className="text-sm text-gray-500">Availability</span>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex gap-2 pt-1">
            {["M", "T", "W", "Th", "F"].map((day) => (
              <div key={day} className="flex flex-col items-center">
                <div
                  className={`h-4 w-4 rounded-sm ${
                    isReserved(day, currentWeek) ? "bg-red-400" : "bg-green-400"
                  }`}
                />
                <p className="text-xs">{day}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-2 pt-1">
            {["M", "T", "W", "Th", "F"].map((day) => (
              <div key={day} className="flex flex-col items-center">
                <div
                  className={`h-4 w-4 rounded-sm ${
                    isReserved(day, currentWeek + 1)
                      ? "bg-red-400"
                      : "bg-green-400"
                  }`}
                />
                <p className="text-xs">{day}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  if (isSmallDevice) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>
          {TriggerElement || <Button variant="outline">Edit Profile</Button>}
        </DrawerTrigger>

        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>Desk {`${desk.row}.${desk.column}`}</DrawerTitle>
            <DrawerDescription>
              View and edit this desk's information
            </DrawerDescription>
          </DrawerHeader>

          <div className="px-4">{contentTemplate}</div>

          <DrawerFooter>
            {allowedToReserve && (
              <Button className="padding-0" asChild>
                <Link className="flex gap-1 p-4" to={`/reserve/${desk.id}`}>
                  Reserve <ArrowRightIcon className="mt-1 h-4 w-4" />
                </Link>
              </Button>
            )}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        {TriggerElement || <Button variant="outline">Edit Profile</Button>}
      </DialogTrigger>

      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Desk {`${desk.row}.${desk.column}`}</DialogTitle>
          <DialogDescription>
            View and edit this desk's information
          </DialogDescription>
        </DialogHeader>

        {contentTemplate}

        {allowedToReserve && (
          <DialogFooter className="">
            <Button className="padding-0" asChild>
              <Link
                className="flex gap-1 p-4"
                to={`/reserve/${desk.id}`}
                prefetch="render"
              >
                Reserve <ArrowRightIcon className="mt-1 h-4 w-4" />
              </Link>
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
