import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ErrorCard } from "./error-card";

describe("ErrorCard", () => {
  it("shows the given error message", () => {
    render(<ErrorCard message="Could not load desks." />);

    expect(screen.getByText("Could not load desks.")).toBeInTheDocument();
  });

  it("falls back to a generic message", () => {
    render(<ErrorCard />);

    expect(
      screen.getByText("Something went wrong. Please try again later."),
    ).toBeInTheDocument();
  });
});
