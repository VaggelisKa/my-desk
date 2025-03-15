import { use } from "react";
import { cn } from "~/lib/utils";
import type { Route } from "../routes/+types/_index";
import { DeskButton } from "./desk-button";
import { DeskModal } from "./desk-selection-modal";

export function DesksArea({
  desksPromise,
  userId,
  role,
}: {
  desksPromise: Route.ComponentProps["loaderData"]["desksPromise"];
  userId: string;
  role?: "admin" | "user" | null;
}) {
  let desks = use(desksPromise);

  return (
    <div className="flex flex-1 flex-col gap-8">
      {Object.entries(desks).map(([block, desksData]) => {
        return (
          <div key={block} className="flex flex-col gap-2">
            <span className="text-lg font-bold">Block {block}</span>
            <div
              className={cn(
                `grid grid-cols-3 grid-rows-2 gap-2`,
                // Maybe there is a smarter way for this?
                block === "4" && "grid-rows-1",
              )}
            >
              {desksData.map((desk) => (
                <DeskModal
                  key={desk.id}
                  TriggerElement={
                    <DeskButton
                      style={{
                        gridColumnStart: desk.column,
                        gridColumnEnd: desk.column,
                        gridRowStart: desk.row,
                        gridRowEnd: desk.row,
                      }}
                      className={
                        desk.reserved
                          ? "border-b-2 border-b-red-400"
                          : "border-b-2 border-b-green-400"
                      }
                      disabled={desk.disabled}
                      name={desk.user?.firstName}
                    />
                  }
                  desk={desk}
                  allowedToReserve={desk.user?.id === userId}
                  allowedToEdit={role === "admin"}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DesksAreaSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-8">
      {[...Array(4)].map((_, blockIndex) => {
        const block = (blockIndex + 1).toString();
        return (
          <div key={block} className="flex flex-col gap-2">
            <div className="h-7 w-24 animate-pulse rounded-md bg-gray-200" />
            <div
              className={cn(
                `grid grid-cols-3 grid-rows-2 gap-2`,
                block === "4" && "grid-rows-1",
              )}
            >
              {[...Array(block === "4" ? 3 : 6)].map((_, index) => (
                <div
                  key={index}
                  className="h-32 w-[110px] animate-pulse rounded-lg bg-gray-200 fade-out"
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
