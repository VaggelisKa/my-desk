import { useLoaderData } from "@remix-run/react";
import type { LoaderFunctionArgs, MetaFunction } from "@vercel/remix";

import { requireAuthCookie } from "~/cookies.server";

import { DeskButton } from "~/components/desk-button";
import { DialogDemo } from "~/components/desk-selection-modal";

export const meta: MetaFunction = () => {
  return [
    { title: "New Remix App" },
    { name: "description", content: "Welcome to Remix!" },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  let employeeNumber = await requireAuthCookie(request);

  return { employeeNumber };
}

export default function Index() {
  let loaderData = useLoaderData<typeof loader>();

  console.log(loaderData);

  return (
    <section>
      <div className="grid grid-cols-3 gap-4 md:gap-8">
        <div className="flex flex-col gap-2">
          <span className="text-sm">C1.1</span>
          <DialogDemo TriggerElement={<DeskButton />} />
        </div>

        <div className="flex flex-col gap-2">
          <span>C1.2</span>
          <DeskButton />
        </div>

        <div className="flex flex-col gap-2">
          <span>C1.3</span>
          <DeskButton />
        </div>

        <div className="flex flex-col gap-2">
          <span>C1.4</span>
          <DeskButton />
        </div>

        <div className="flex flex-col gap-2">
          <span>C1.5</span>
          <DeskButton />
        </div>
      </div>
    </section>
  );
}
