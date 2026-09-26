import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import { ProfilePage, type ProfileDesk } from "./profile";

let alice = {
  id: "emp001",
  firstName: "Alice",
  lastName: "Andersen",
  role: "user" as const,
};

function renderProfile({
  desk = { block: 1, row: 2, column: 1 },
  isSelf = true,
}: { desk?: ProfileDesk; isSelf?: boolean } = {}) {
  let Stub = createRoutesStub([
    {
      path: "/",
      Component: () => <ProfilePage user={alice} desk={desk} isSelf={isSelf} />,
    },
  ]);
  render(<Stub />);
}

describe("ProfilePage", () => {
  it("shows who you are, with your ID and desk", async () => {
    renderProfile();

    expect(
      await screen.findByRole("heading", { name: "Your profile" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Alice Andersen")).toBeInTheDocument();
    expect(screen.getByText("emp001 · Desk 1.2.1")).toBeInTheDocument();
    expect(screen.getByText("Block 1 · by the window")).toBeInTheDocument();
  });

  it("says when you have no desk", async () => {
    renderProfile({ desk: null });

    expect(await screen.findByText("emp001 · No desk")).toBeInTheDocument();
  });

  it("names the person when an admin edits someone else", async () => {
    renderProfile({ isSelf: false });

    expect(
      await screen.findByRole("heading", { name: "Alice's profile" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Their ID and desk are set by an admin."),
    ).toBeInTheDocument();
  });

  it("only lets you save once the name has changed", async () => {
    renderProfile();
    let save = await screen.findByRole("button", { name: "Save changes" });

    expect(save).toBeDisabled();

    await userEvent.type(screen.getByLabelText("First name"), "x");
    expect(save).toBeEnabled();

    await userEvent.type(screen.getByLabelText("First name"), "{backspace}");
    expect(save).toBeDisabled();
  });
});
