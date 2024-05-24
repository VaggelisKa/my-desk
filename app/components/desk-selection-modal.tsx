import { ArrowRightIcon } from "@radix-ui/react-icons";
import { Link, useFetcher } from "@remix-run/react";
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
    reservations: (typeof reservations.$inferSelect & {
      users: typeof users.$inferSelect;
    })[];
  };
  TriggerElement?: React.ReactNode;
  children?: React.ReactNode;
  allowedToReserve?: boolean;
  allowedToEdit?: boolean;
};

let lettersToDays: Record<string, string> = {
  M: "monday",
  T: "tuesday",
  W: "wednesday",
  Th: "thursday",
  F: "friday",
} as const;

let days = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export function DeskModal({
  TriggerElement,
  desk,
  allowedToReserve,
  allowedToEdit,
}: DeskModalProps) {
  let currentWeek = getWeek(new Date());
  let todaysDay = days[new Date().getDay()];
  let fetcher = useFetcher();
  let [open, setOpen] = useState(false);
  let isSmallDevice = useMediaQuery("(max-width : 768px)");
  let showReserveForTodayButton =
    todaysDay !== "saturday" &&
    todaysDay !== "sunday" &&
    !isReserved(todaysDay, currentWeek);
  let isSubmitting = fetcher.state !== "idle";
  let userBorrowingDesk =
    isReserved(todaysDay, currentWeek)?.users.id !== desk.user.id
      ? isReserved(todaysDay, currentWeek)?.users
      : null;

  function isReserved(day: string, week: number) {
    return desk.reservations.find(
      (r) => r.day === (lettersToDays[day] || day) && r.week === week,
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

      {userBorrowingDesk && (
        <div>
          <span className="text-sm text-gray-500">Used for today by</span>
          <p className="capitalize">{`${userBorrowingDesk.firstName} ${userBorrowingDesk.lastName}`}</p>
        </div>
      )}

      {/* TODO: Consider if it should be a thing */}
      {/* <div>
        <span className="text-sm text-gray-500">Computer type</span>
        <p>Desktop</p>
      </div> */}

      <div>
        <span className="text-sm text-gray-500">Availability</span>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex gap-2 pt-1">
            {Object.keys(lettersToDays).map((day) => (
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
            {Object.keys(lettersToDays).map((day) => (
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

  let reserveForTodayForm = (
    <fetcher.Form method="POST" action="/reserve">
      <input type="text" name="deskId" defaultValue={desk.id} hidden />
      <input type="text" name="week" defaultValue={currentWeek} hidden />
      <input type="text" name={todaysDay} defaultValue="on" hidden />

      <Button className="w-full" disabled={isSubmitting} type="submit">
        Reserve for today
      </Button>
    </fetcher.Form>
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
            {allowedToReserve ? (
              <Button className="padding-0" asChild>
                <Link className="flex gap-1 p-4" to={`/reserve/${desk.id}`}>
                  Reserve <ArrowRightIcon className="mt-[2px] h-4 w-4" />
                </Link>
              </Button>
            ) : showReserveForTodayButton ? (
              reserveForTodayForm
            ) : null}

            {allowedToEdit && (
              <Button className="padding-0" variant="secondary" asChild>
                <Link className="flex gap-1 p-4" to={`/desks/${desk.id}/edit`}>
                  Edit desk info
                  <ArrowRightIcon className="mt-1 h-4 w-4" />
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

        <DialogFooter>
          {allowedToReserve ? (
            <Button className="padding-0" asChild>
              <Link
                className="flex gap-1 p-4"
                to={`/reserve/${desk.id}`}
                prefetch="render"
              >
                Reserve <ArrowRightIcon className="mt-1 h-4 w-4" />
              </Link>
            </Button>
          ) : showReserveForTodayButton ? (
            reserveForTodayForm
          ) : null}

          {allowedToEdit && (
            <Button className="padding-0" variant="secondary" asChild>
              <Link className="flex gap-1 p-4" to={`/desks/${desk.id}/edit`}>
                Edit desk info
                <ArrowRightIcon className="mt-1 h-4 w-4" />
              </Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
