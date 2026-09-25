import { readFile, writeFile } from "node:fs/promises";
import { CRON_LOG_FILE } from "./env";

type CronCall = { method: string; path: string };

/** Calls the server made to the stubbed cron-job.org API. */
export class CronJobOrgStub {
  async clear() {
    await writeFile(CRON_LOG_FILE, "");
  }

  async calls(): Promise<CronCall[]> {
    let log = await readFile(CRON_LOG_FILE, "utf8").catch(() => "");

    return log
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
}
