import { addDays, format } from "date-fns";
import { authFile, expect, test } from "./fixtures";
import { bookingDay, desks, users } from "./support/db";
import { NOW } from "./support/env";

test.use({ storageState: authFile("alice") });

// The clock is pinned to a Monday morning, so the map opens on Monday.

test("each desk says in words whether it is free, taken or yours", async ({
  page,
  db,
  desksPage,
}) => {
  // Gary borrows Bob's desk today.
  await db.addReservation({
    user: "guest",
    deskId: desks.bob.id,
    day: "monday",
  });
  await desksPage.goto();

  let alice = desksPage.desk(users.alice.firstName);
  let bob = desksPage.desk(users.bob.firstName);
  let unclaimed = desksPage.desk("Unclaimed");

  await expect(alice).toContainText("Yours");
  await expect(alice).toHaveAccessibleDescription("Desk 1.1.1, yours");
  await expect(bob).toContainText("Taken");
  await expect(bob).toHaveAccessibleDescription(
    "Desk 1.1.2, taken, Gary is sitting here",
  );
  await expect(unclaimed).toContainText("Free");
  await expect(unclaimed).toHaveAccessibleDescription("Desk 2.1.1, free");
  await expect(page.getByRole("main")).toContainText("3 of 4 free");
});

test("a placement filter outlines the desks it leaves out", async ({
  page,
  desksPage,
}) => {
  await desksPage.goto();

  await page.getByRole("button", { name: "Window" }).click();
  await expect(page).toHaveURL(/column=1/);

  // Bob sits in the middle column, Ada by the aisle.
  await expect(desksPage.desk(users.bob.firstName)).toContainText(
    "Filtered out",
  );
  await expect(desksPage.desk(users.bob.firstName)).toBeDisabled();
  await expect(desksPage.desk(users.admin.firstName)).toBeDisabled();
  await expect(desksPage.desk(users.alice.firstName)).toBeEnabled();
  await expect(desksPage.desk("Unclaimed")).toBeEnabled();

  // Pressing the active chip again clears the filter.
  await page.getByRole("button", { name: "Window" }).click();
  await expect(desksPage.desk(users.bob.firstName)).toBeEnabled();
});

test("the week arrows land on next Monday and back on this Friday", async ({
  page,
  db,
  desksPage,
}) => {
  await db.addReservation({
    user: "bob",
    deskId: desks.bob.id,
    day: "monday",
    weekOffset: 1,
  });
  await desksPage.goto();

  let strip = page.getByRole("navigation", { name: "Day" });
  let dayLink = (date: Date) =>
    strip.getByRole("link", { name: format(date, "EEEE d MMMM") });
  let nextMonday = addDays(NOW, 7);
  let friday = addDays(NOW, 4);

  await expect(dayLink(NOW)).toHaveAttribute("aria-current", "date");
  // Nothing to go back to from this week.
  await expect(strip.getByRole("link", { name: "Previous week" })).toHaveCount(
    0,
  );

  await strip.getByRole("link", { name: "Next week" }).click();
  await expect(page).toHaveURL(
    new RegExp(`selected-day=${bookingDay("monday", 1).date}`),
  );
  await expect(dayLink(nextMonday)).toHaveAttribute("aria-current", "date");
  await expect(page.getByRole("main")).toContainText(
    format(nextMonday, "EEE d MMM"),
  );
  // The map follows the day: Bob's desk is only booked next Monday.
  await expect(desksPage.desk(users.bob.firstName)).toContainText("Taken");
  await expect(strip.getByRole("link", { name: "Next week" })).toHaveCount(0);

  await strip.getByRole("link", { name: "Previous week" }).click();
  await expect(page).toHaveURL(
    new RegExp(`selected-day=${bookingDay("friday").date}`),
  );
  await expect(dayLink(friday)).toHaveAttribute("aria-current", "date");
  await expect(desksPage.desk(users.bob.firstName)).toContainText("Free");
});

test("a link with a desk opens that desk's sheet", async ({ desksPage }) => {
  await desksPage.goto(`?desk=${desks.bob.id}`);

  let dialog = await desksPage.dialog();
  await expect(dialog.title).toHaveText("Desk 1.1.2");
  await expect(dialog.assignedTo).toContainText(users.bob.firstName);
});

test("the account menu leads to the profile and has no booking shortcut", async ({
  page,
  desksPage,
}) => {
  await desksPage.goto();
  await desksPage.openAccountMenu();

  await expect(
    desksPage.accountMenu.getByRole("link", { name: "Book my desk" }),
  ).toHaveCount(0);
  await desksPage.accountMenu
    .getByRole("link", { name: "Edit profile" })
    .click();

  await expect(page).toHaveURL(`/users/edit/${users.alice.id}`);
  await expect(page.getByRole("main")).toContainText(
    `${users.alice.id} · Desk 1.1.1`,
  );
});
