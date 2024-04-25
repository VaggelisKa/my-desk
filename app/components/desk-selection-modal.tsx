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
import type { users, reservations } from "~/lib/db/schema.server";
import { useMediaQuery } from "usehooks-ts";

import {
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  Drawer,
} from "./ui/drawer";
import { useState } from "react";
import { Link } from "@remix-run/react";
import { ArrowRightIcon } from "@radix-ui/react-icons";

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
  let [open, setOpen] = useState(false);
  let isSmallDevice = useMediaQuery("(max-width : 768px)");

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

          <div className="flex flex-col gap-4 px-4">
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
              <span className="text-sm text-gray-500">Weekly availability</span>
              <div className="flex gap-2 pt-1">
                {["M", "T", "W", "Th", "F"].map((day) => (
                  <div key={day} className="flex flex-col items-center">
                    <div
                      style={{
                        backgroundColor: desk.reservations.find((r) => {
                          console.log(r.day, lettersToDays[day]);

                          return r.day === lettersToDays[day];
                        })
                          ? "rgb(248, 113, 113)"
                          : "rgb(74, 222, 128)",
                      }}
                      className="h-4 w-4 rounded-s "
                    />
                    <p className="text-xs">{day}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {allowedToReserve && (
            <DrawerFooter>
              <Button asChild>
                <div className="flex gap-1">
                  <Link to={`/reserve/${desk.id}`}>Reserve</Link>
                  <ArrowRightIcon className="mt-[2px] h-4 w-4" />
                </div>
              </Button>
            </DrawerFooter>
          )}
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

        <div className="flex flex-col gap-4">
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
            <span className="text-sm text-gray-500">Weekly availability</span>
            <div className="flex gap-2 pt-1">
              {["M", "T", "W", "Th", "F"].map((day) => (
                <div key={day} className="flex flex-col items-center">
                  <div
                    className={`h-4 w-4 rounded-sm ${
                      desk.reservations.find(
                        (r) => r.day === lettersToDays[day],
                      )
                        ? "bg-red-400"
                        : "bg-green-400"
                    }`}
                  />
                  <p className="text-xs">{day}</p>
                </div>
              ))}
            </div>
          </div>

          {allowedToReserve && (
            <DialogFooter className="">
              <Button asChild>
                <div className="flex gap-1">
                  <Link to={`/reserve/${desk.id}`}>Reserve</Link>
                  <ArrowRightIcon className="mt-[2px] h-4 w-4" />
                </div>
              </Button>
            </DialogFooter>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
