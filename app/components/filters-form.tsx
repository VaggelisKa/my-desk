import { Form, useSearchParams, useSubmit } from "@remix-run/react";
import { useRef } from "react";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

export function FiltersForm() {
  let formRef = useRef<HTMLFormElement | null>(null);
  let submit = useSubmit();
  let [searchParams] = useSearchParams();

  return (
    <Form ref={formRef} method="GET" className="flex flex-col gap-8">
      <fieldset className="flex items-center gap-1">
        <Checkbox
          id="terms"
          onCheckedChange={() => submit(formRef.current)}
          name="show-free"
          defaultChecked={searchParams.get("show-free") === "on"}
        />
        <label
          htmlFor="terms"
          className="text-sm font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          Show free desks only
        </label>
      </fieldset>

      <fieldset className="space-y-2">
        <p className="text-sm font-medium capitalize leading-none">
          Desk placement
        </p>
        <Select
          name="column"
          defaultValue={searchParams.get("column") ?? "all"}
          onValueChange={() => {
            submit(formRef.current);
          }}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Placement of desk" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">all</SelectItem>
              <SelectItem value="1">window</SelectItem>
              <SelectItem value="2">middle</SelectItem>
              <SelectItem value="3">aisle</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </fieldset>

      <fieldset className="space-y-2">
        <p className="text-sm font-medium capitalize leading-none">Block</p>
        <Select
          name="block"
          defaultValue={searchParams.get("block") ?? "all"}
          onValueChange={() => {
            submit(formRef.current);
          }}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Placement of desk" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">all</SelectItem>
              <SelectItem value="1">1</SelectItem>
              <SelectItem value="2">2</SelectItem>
              <SelectItem value="3">3</SelectItem>
              <SelectItem value="4">4</SelectItem>
              <SelectItem value="5">5</SelectItem>
              <SelectItem value="6">6</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </fieldset>
    </Form>
  );
}
