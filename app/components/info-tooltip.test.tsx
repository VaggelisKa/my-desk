import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { InfoTooltip } from "./info-tooltip";

describe("InfoTooltip", () => {
  it("reveals its text when the icon is hovered", async () => {
    let { container } = render(
      <InfoTooltip text="Take it with a grain of salt" />,
    );

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    // The trigger is a bare icon with no accessible role.
    await userEvent.hover(container.querySelector("svg")!);

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Take it with a grain of salt",
    );
  });
});
