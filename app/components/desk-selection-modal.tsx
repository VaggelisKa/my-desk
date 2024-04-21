import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";

export function DialogDemo({
  TriggerElement,
}: {
  TriggerElement?: React.ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {TriggerElement || <Button variant="outline">Edit Profile</Button>}
      </DialogTrigger>

      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Desk C1.1</DialogTitle>
          <DialogDescription>
            View and edit this desk's information
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div>
            <span className="text-sm text-gray-500">Assigned to</span>
            <p>Vaggelis karavasileiadis</p>
          </div>

          <div>
            <span className="text-sm text-gray-500">Weekly availability</span>
            <div className="flex gap-2 pt-1">
              {["M", "T", "W", "Th", "F"].map((day) => (
                <div key={day} className="flex flex-col items-center">
                  <div className="h-4 w-4 rounded-sm bg-green-400" />
                  <p className="text-xs">{day}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* <DialogFooter>
          <Button type="submit">Save changes</Button>
        </DialogFooter> */}
      </DialogContent>
    </Dialog>
  );
}
