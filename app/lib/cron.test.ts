// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

let fetchMock = vi.fn();

// The auth header is built when the module is evaluated, so env vars have to
// be in place before each fresh import.
async function importCron() {
  vi.resetModules();
  vi.stubEnv("CRON_TOKEN", "test-token");
  vi.stubEnv("CRON_PASSWORD", "secret");
  vi.stubGlobal("fetch", fetchMock);

  return import("./cron");
}

function lastRequest() {
  let [url, init] = fetchMock.mock.lastCall as [string, RequestInit];
  return {
    url,
    method: init.method,
    headers: init.headers as Record<string, string>,
    body: init.body ? JSON.parse(init.body as string) : undefined,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ jobId: 42 })));
});

describe("addCron", () => {
  it("creates a weekly job that calls back with the desk, user, password and days", async () => {
    let { addCron } = await importCron();

    let result = await addCron({
      deskId: "7",
      userId: "user-1",
      firstName: "Jane",
      lastName: "Doe",
      days: ["monday", "thursday"],
    });

    expect(result).toEqual({ jobId: 42 });

    let request = lastRequest();
    expect(request.url).toBe("https://api.cron-job.org/jobs");
    expect(request.method).toBe("PUT");
    expect(request.headers.Authorization).toBe("Bearer test-token");

    let callbackUrl = new URL(request.body.job.url);
    expect(callbackUrl.origin + callbackUrl.pathname).toBe(
      "https://share-a-desk.vercel.app/cron/automatic-reservation",
    );
    expect(callbackUrl.searchParams.get("deskId")).toBe("7");
    expect(callbackUrl.searchParams.get("userId")).toBe("user-1");
    expect(callbackUrl.searchParams.get("cronPassword")).toBe("secret");
    expect(callbackUrl.searchParams.getAll("day")).toEqual([
      "monday",
      "thursday",
    ]);

    expect(request.body.job).toMatchObject({
      enabled: true,
      title: "auto-reservations-for-jane-doe",
      // Runs every Sunday at 10:00 Copenhagen time.
      schedule: {
        timezone: "Europe/Copenhagen",
        hours: [10],
        minutes: [0],
        wdays: [0],
      },
    });
  });
});

describe("job toggling", () => {
  it("disables a job by id", async () => {
    let { disableCron } = await importCron();

    await disableCron({ cronId: "99" });

    expect(lastRequest()).toMatchObject({
      url: "https://api.cron-job.org/jobs/99",
      method: "PATCH",
      body: { job: { enabled: false } },
    });
  });

  it("enables a job by id", async () => {
    let { enableCron } = await importCron();

    await enableCron({ cronId: "99" });

    expect(lastRequest()).toMatchObject({
      url: "https://api.cron-job.org/jobs/99",
      method: "PATCH",
      body: { job: { enabled: true } },
    });
  });

  it("deletes a job by id", async () => {
    let { deleteCron } = await importCron();

    await deleteCron({ cronId: "99" });

    expect(lastRequest()).toMatchObject({
      url: "https://api.cron-job.org/jobs/99",
      method: "DELETE",
    });
  });

  it("returns the parsed details of a job", async () => {
    let { getCronDetails } = await importCron();

    let details = await getCronDetails({ cronId: "99" });

    expect(details).toEqual({ jobId: 42 });
    expect(lastRequest()).toMatchObject({
      url: "https://api.cron-job.org/jobs/99",
      method: "GET",
    });
  });
});

describe("addCronSchema", () => {
  it("rejects weekend days", async () => {
    let { addCronSchema } = await importCron();

    let result = addCronSchema.safeParse({
      deskId: "1",
      userId: "u",
      firstName: "Jane",
      days: ["saturday"],
    });

    expect(result.success).toBe(false);
  });

  it("accepts a payload without a last name", async () => {
    let { addCronSchema } = await importCron();

    let result = addCronSchema.safeParse({
      deskId: "1",
      userId: "u",
      firstName: "Jane",
      days: ["monday", "friday"],
    });

    expect(result.success).toBe(true);
  });
});
