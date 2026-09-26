import { format, subMonths } from "date-fns";
import * as schema from "../app/lib/db/schema";
import { authFile, expect, test } from "./fixtures";
import { gotoHydrated } from "./pages/hydration";
import { NOW } from "./support/env";

test.use({ storageState: authFile("alice") });

test("says so when nothing has been counted yet", async ({
  page,
  desksPage,
}) => {
  await desksPage.goto();
  await desksPage.tab("Metrics").click();

  await expect(page).toHaveURL("/metrics");
  await expect(page.getByRole("heading", { name: "Metrics" })).toBeVisible();
  await expect(page.getByText("Nothing counted yet")).toBeVisible();
});

test("shows this month against last month, the busiest day and the bars", async ({
  page,
  db,
}) => {
  // One counted day today, and the same date last month with half as many.
  await db.db.insert(schema.bookingMetrics).values([
    {
      metricDate: format(subMonths(NOW, 1), "dd.MM.yyyy"),
      totalBookings: 3,
      totalGuestBookings: 1,
      participation_percentage: 9,
      createdAt: subMonths(NOW, 1),
    },
    {
      metricDate: format(NOW, "dd.MM.yyyy"),
      totalBookings: 6,
      totalGuestBookings: 2,
      participation_percentage: 18,
      createdAt: NOW,
    },
  ]);

  await gotoHydrated(page, "/metrics");

  let thisMonth = page.getByRole("region", { name: "This month" });
  await expect(thisMonth).toContainText(
    `6 bookings in ${format(NOW, "MMMM")} so far`,
  );
  await expect(thisMonth).toContainText(
    `Up 100% vs ${format(subMonths(NOW, 1), "MMMM")} by this date`,
  );
  await expect(thisMonth).toContainText("Desks in use18%");

  let busiest = page
    .getByRole("listitem")
    .filter({ hasText: "Monday" })
    .filter({ hasText: "Busiest" });
  await expect(busiest).toBeVisible();

  let byWeek = page.getByRole("heading", { name: "Week by week" });
  await expect(byWeek).toBeVisible();
  let group = page.getByRole("group", { name: "Group bookings by" });
  await group.getByRole("button", { name: "Months" }).click();
  await expect(
    page.getByRole("heading", { name: "Month by month" }),
  ).toBeVisible();
  await expect(group.getByRole("button", { name: "Months" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
