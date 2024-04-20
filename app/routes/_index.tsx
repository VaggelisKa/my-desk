import type { MetaFunction } from "@vercel/remix";
import { Button } from "~/components/ui/Button";

export const meta: MetaFunction = () => {
  return [
    { title: "New Remix App" },
    { name: "description", content: "Welcome to Remix!" },
  ];
};

export default function Index() {
  return (
    <div>
      <h1>Welcome to Remix</h1>
      <Button>test 1</Button>
      <a href="/login"> to login</a>
    </div>
  );
}
