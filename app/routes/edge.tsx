import type { MetaFunction } from "@vercel/remix";

export const config = { runtime: "edge" };

export const meta: MetaFunction = () => [
  { title: "Remix@Edge | New Remix App" },
];

export default function Edge() {
  return (
    <div>
      <h1>Welcome to Remix@Edge</h1>
    </div>
  );
}
