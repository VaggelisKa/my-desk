import { fireEvent, screen } from "@testing-library/react";
import { createRef, useState } from "react";
import { Form } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../test/render-with-router";
import {
  AuthCard,
  AuthField,
  AuthLink,
  AuthSubmit,
  CodeField,
} from "./auth-card";

describe("AuthCard", () => {
  it("renders the title as the page heading with the description", () => {
    renderWithRouter(
      <AuthCard title="Sign in" description="Enter your user ID.">
        <p>body</p>
      </AuthCard>,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Sign in" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Enter your user ID.")).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the notice as a status line under the form", () => {
    renderWithRouter(
      <AuthCard title="Sign in" description="" notice="You're signed out.">
        <p>body</p>
      </AuthCard>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("You're signed out.");
  });
});

describe("AuthField", () => {
  it("labels the input and is valid by default", () => {
    renderWithRouter(<AuthField id="user-id" name="user-id" label="User ID" />);

    let input = screen.getByLabelText("User ID");
    expect(input).toHaveAttribute("name", "user-id");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
  });

  it("marks the input invalid and describes it with the error", () => {
    renderWithRouter(
      <AuthField id="user-id" label="User ID" error="No user found" />,
    );

    let input = screen.getByLabelText("User ID");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("No user found");
    expect(screen.getByRole("alert")).toHaveTextContent("No user found");
  });

  it("forwards its ref to the input", () => {
    let ref = createRef<HTMLInputElement>();
    renderWithRouter(<AuthField ref={ref} id="user-id" label="User ID" />);

    expect(ref.current).toBe(screen.getByLabelText("User ID"));
  });
});

function ControlledCode({ error }: { error?: string }) {
  let [value, setValue] = useState("");

  return (
    <CodeField
      id="user-id"
      name="user-id"
      label="User ID"
      value={value}
      onChange={setValue}
      error={error}
    />
  );
}

describe("CodeField", () => {
  it("draws one box per character and mirrors what is typed, uppercased", async () => {
    let { user } = renderWithRouter(<ControlledCode />);

    let boxes = screen.getByTestId("user-id-boxes");
    expect(boxes.children).toHaveLength(6);

    await user.type(screen.getByLabelText("User ID"), "g01");

    expect(screen.getByLabelText("User ID")).toHaveValue("g01");
    expect(Array.from(boxes.children, (box) => box.textContent)).toEqual([
      "g",
      "0",
      "1",
      "",
      "",
      "",
    ]);
    expect(boxes.children[0]).toHaveClass("uppercase");
  });

  it("highlights the box at the real caret and the real selection", async () => {
    let { user } = renderWithRouter(<ControlledCode />);
    let input = screen.getByLabelText("User ID");
    let boxes = screen.getByTestId("user-id-boxes");
    let active = () =>
      Array.from(boxes.children).flatMap((box, i) =>
        box.classList.contains("border-moss") ? [i] : [],
      );

    await user.type(input, "emp00");
    expect(active()).toEqual([5]);

    await user.keyboard("{Home}");
    expect(active()).toEqual([0]);

    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(active()).toEqual([2]);

    // jsdom does not extend a selection with Shift+arrows; select directly.
    (input as HTMLInputElement).setSelectionRange(2, 4);
    fireEvent.select(input);
    expect(active()).toEqual([2, 3]);
  });

  it("never holds more than six characters", async () => {
    let { user } = renderWithRouter(<ControlledCode />);

    await user.type(screen.getByLabelText("User ID"), "emp001extra");

    expect(screen.getByLabelText("User ID")).toHaveValue("emp001");
  });

  it("submits the raw value under its name", async () => {
    let action = vi.fn(async ({ request }: { request: Request }) => {
      let form = await request.formData();
      return { value: form.get("user-id") };
    });
    let { user } = renderWithRouter(
      <Form method="post">
        <ControlledCode />
        <AuthSubmit>Sign in</AuthSubmit>
      </Form>,
      { action },
    );

    await user.type(screen.getByLabelText("User ID"), "EMP001");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(action).toHaveBeenCalledOnce();
    expect(await action.mock.results[0].value).toEqual({ value: "EMP001" });
  });

  it("marks the input invalid and describes it with the error", () => {
    renderWithRouter(<ControlledCode error="No user found" />);

    let input = screen.getByLabelText("User ID");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("No user found");
    expect(screen.getByRole("alert")).toHaveTextContent("No user found");
  });
});

describe("AuthSubmit", () => {
  it("is a submit button that can be disabled", () => {
    renderWithRouter(<AuthSubmit disabled>Create account</AuthSubmit>);

    let button = screen.getByRole("button", { name: "Create account" });
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toBeDisabled();
  });
});

describe("AuthLink", () => {
  it("renders a link to the given route", () => {
    renderWithRouter(<AuthLink to="/login/guest">Create an account</AuthLink>);

    expect(
      screen.getByRole("link", { name: "Create an account" }),
    ).toHaveAttribute("href", "/login/guest");
  });
});
