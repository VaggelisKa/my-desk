import { z } from "zod";

const BASE_URL = "https://api.cron-job.org";
const FOLDER_ID = 56321;

const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.CRON_TOKEN!}`,
} satisfies HeadersInit;

/** cron-job.org said no, or could not be reached. */
export class CronError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CronError";
  }
}

// cron-job.org answers errors with a status, not an exception, so check it:
// a paused, removed or created job must never be reported when it was not.
async function cronRequest(path: string, init: RequestInit) {
  let response = await fetch(`${BASE_URL}${path}`, { ...init, headers });

  if (!response.ok) {
    throw new CronError(
      `cron-job.org ${init.method} ${path.replace(/\d+/, ":id")} failed with ${response.status}`,
    );
  }

  return response;
}

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

  let response = await cronRequest("/jobs", {
    method: "PUT",
    body: JSON.stringify({
      job: {
        url: callbackUrl.toString(),
        enabled: true,
        title: `auto-reservations-for-${[firstName, lastName].filter(Boolean).join("-").toLowerCase()}`,
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

  // Without a job id there is nothing to pause or remove later.
  if (typeof json?.jobId !== "number") {
    throw new CronError("cron-job.org created no job id");
  }

  return json as { jobId: number };
}

export async function deleteCron({ cronId }: { cronId: string }) {
  await cronRequest(`/jobs/${cronId}`, { method: "DELETE" });
}

export async function getCronDetails({ cronId }: { cronId: string }) {
  let response = await cronRequest(`/jobs/${cronId}`, { method: "GET" });
  let json = await response.json();

  // An answer without the job is not a paused job with no days.
  if (typeof json?.jobDetails !== "object" || json.jobDetails === null) {
    throw new CronError("cron-job.org returned no job details");
  }

  return json as { jobDetails: { enabled?: boolean; url?: unknown } };
}

export async function disableCron({ cronId }: { cronId: string }) {
  await cronRequest(`/jobs/${cronId}`, {
    method: "PATCH",
    body: JSON.stringify({
      job: { enabled: false },
    }),
  });
}

export async function enableCron({ cronId }: { cronId: string }) {
  await cronRequest(`/jobs/${cronId}`, {
    method: "PATCH",
    body: JSON.stringify({
      job: { enabled: true },
    }),
  });
}

/**
 * The weekdays a job books, read back from its callback URL. Only the days
 * leave this function: the URL also carries the cron password.
 */
export function daysFromJob(jobDetails: { url?: unknown } | undefined) {
  if (typeof jobDetails?.url !== "string") {
    return [];
  }

  try {
    let days = new URL(jobDetails.url).searchParams.getAll("day");
    return addCronSchema.shape.days.catch([]).parse(days);
  } catch {
    return [];
  }
}
