import { z } from "zod";

const BASE_URL = "https://api.cron-job.org";
const FOLDER_ID = 56321;

const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.CRON_TOKEN!}`,
} satisfies HeadersInit;

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
}: z.infer<typeof addCronSchema>) {
  let callbackUrl = new URL(
    "https://share-a-desk.vercel.app/cron/automatic-reservation",
  );
  callbackUrl.searchParams.set("deskId", deskId);
  callbackUrl.searchParams.set("userId", userId);
  callbackUrl.searchParams.set("cronPassword", process.env.CRON_PASSWORD ?? "");
  days.forEach((day) => callbackUrl.searchParams.append("day", day));

  let response = await fetch(`${BASE_URL}/jobs`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      job: {
        url: callbackUrl.toString(),
        enabled: true,
        title: `auto-reservations-for-${firstName.toLowerCase()}-${lastName?.toLowerCase()}`,
        saveResponses: true,
        folderId: FOLDER_ID,
        schedule: {
          timezone: "Europe/Copenhagen",
          expiresAt: 0,
          hours: [10],
          mdays: [-1],
          minutes: [0],
          months: [-1],
          wdays: [0],
        },
        requestMethod: 0,
      },
    }),
  });

  let json = await response.json();
  return json;
}

export async function deleteCron({ cronId }: { cronId: string }) {
  await fetch(`${BASE_URL}/jobs/${cronId}`, {
    method: "DELETE",
    headers,
  });
}

export async function getCronDetails({ cronId }: { cronId: string }) {
  let response = await fetch(`${BASE_URL}/jobs/${cronId}`, {
    method: "GET",
    headers,
  });

  let json = await response.json();
  return json;
}

export async function disableCron({ cronId }: { cronId: string }) {
  await fetch(`${BASE_URL}/jobs/${cronId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      job: { enabled: false },
    }),
  });
}

export async function enableCron({ cronId }: { cronId: string }) {
  await fetch(`${BASE_URL}/jobs/${cronId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      job: { enabled: true },
    }),
  });
}
