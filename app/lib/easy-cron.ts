import { z } from "zod";

const BASE_URL = "https://www.easycron.com/rest";
const GROUP_ID = "39667";

export const addCronSchema = z.object({
  days: z.array(
    z.enum(["monday", "tuesday", "wednesday", "thursday", "friday"]),
  ),
  deskId: z.string(),
  userId: z.string(),
  firstName: z.string(),
  lastName: z.string().optional(),
});

export async function addCron({
  deskId,
  days,
  userId,
  firstName,
  lastName,
}: z.infer<typeof addCronSchema>): Promise<{
  status: string;
  cron_job_id: string;
}> {
  let url = new URL(`${BASE_URL}/add`);
  let callbackUrl = new URL(
    "https://share-a-desk.vercel.app/cron/automatic-reservation",
  );
  callbackUrl.searchParams.set("deskId", deskId);
  callbackUrl.searchParams.set("userId", userId);
  days.forEach((day) => callbackUrl.searchParams.append("day", day));

  url.searchParams.set("token", process.env.CRON_TOKEN!);
  url.searchParams.set("url", callbackUrl.toString());
  url.searchParams.set("cron_expression", "0 10 * * 7");
  url.searchParams.set(
    "cron_job_name",
    `auto-reservations-for-${firstName.toLowerCase()}-${lastName?.toLowerCase()}`,
  );
  url.searchParams.set("group_id", GROUP_ID);

  let response = await fetch(url.toString(), { method: "POST" });
  let json = await response.json();

  return json;
}

export async function deleteCron({ cronId }: { cronId: string }): Promise<{
  status: string;
  cron_job_id: string;
}> {
  let url = new URL(`${BASE_URL}/delete`);

  url.searchParams.set("token", process.env.CRON_TOKEN!);
  url.searchParams.set("id", cronId);

  let response = await fetch(url.toString(), { method: "DELETE" });
  let json = await response.json();

  return json;
}
