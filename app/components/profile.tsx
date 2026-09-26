import { useState } from "react";
import { Form, useNavigation } from "react-router";
import { AuthField } from "~/components/auth-card";
import { Button } from "~/components/ui/button";
import { deskLabel, deskPlace } from "~/lib/utils";

export type ProfileUser = {
  id: string;
  firstName: string;
  lastName: string;
  role: "user" | "admin" | null;
};

export type ProfileDesk = {
  block: number;
  row: number;
  column: number;
} | null;

type Props = {
  user: ProfileUser;
  desk: ProfileDesk;
  // False when an admin is editing someone else.
  isSelf: boolean;
};

function useNameForm(user: ProfileUser) {
  let [saved, setSaved] = useState(user);
  let [firstName, setFirstName] = useState(user.firstName);
  let [lastName, setLastName] = useState(user.lastName);
  let navigation = useNavigation();

  // After a save the loader returns the new name; start from it again.
  if (saved.firstName !== user.firstName || saved.lastName !== user.lastName) {
    setSaved(user);
    setFirstName(user.firstName);
    setLastName(user.lastName);
  }

  let changed =
    firstName.trim() !== user.firstName || lastName.trim() !== user.lastName;
  let saving = navigation.state !== "idle" && navigation.formMethod === "PUT";

  return { firstName, setFirstName, lastName, setLastName, changed, saving };
}

function title(user: ProfileUser, isSelf: boolean) {
  return isSelf ? "Your profile" : `${user.firstName}'s profile`;
}

function deskText(desk: ProfileDesk) {
  return desk ? `Desk ${deskLabel(desk)}` : "No desk";
}

function NameFields({ form }: { form: ReturnType<typeof useNameForm> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <AuthField
        id="firstName"
        name="firstName"
        label="First name"
        autoComplete="given-name"
        value={form.firstName}
        onChange={(e) => form.setFirstName(e.target.value)}
        required
      />
      <AuthField
        id="lastName"
        name="lastName"
        label="Last name"
        autoComplete="family-name"
        value={form.lastName}
        onChange={(e) => form.setLastName(e.target.value)}
        required
      />
    </div>
  );
}

function SaveButton({ form }: { form: ReturnType<typeof useNameForm> }) {
  return (
    <Button
      type="submit"
      variant="primary"
      size="tall"
      disabled={!form.changed || form.saving}
      className="w-full sm:w-auto sm:self-start sm:px-6"
    >
      {form.saving ? "Saving…" : "Save changes"}
    </Button>
  );
}

/**
 * Edit profile (design/design-options.html, "You"): who you are on a card up
 * top, the name form below. Only the name is yours to change; the ID and desk
 * are shown for reference and are set by an admin. The page belongs to no tab
 * and links to none.
 */
export function ProfilePage({ user, desk, isSelf }: Props) {
  let form = useNameForm(user);

  return (
    <section className="flex w-full max-w-lg flex-col gap-8 font-display text-ink">
      <h1 className="text-[20px] font-bold tracking-tight sm:text-[22px]">
        {title(user, isSelf)}
      </h1>

      <div className="flex min-w-0 flex-col gap-0.5 rounded-xl p-5 ring-1 ring-inset ring-line">
        <p className="truncate text-[17px] font-bold">
          {user.firstName} {user.lastName}
        </p>
        <p className="text-[13px] text-ink-muted">
          {user.id} · {deskText(desk)}
          {user.role === "admin" && " · admin"}
        </p>
        {desk && (
          <p className="text-[13px] text-ink-muted">{deskPlace(desk)}</p>
        )}
      </div>

      <Form method="PUT" className="flex flex-col gap-5">
        <NameFields form={form} />
        <SaveButton form={form} />
      </Form>

      <p className="text-[13px] text-ink-muted">
        {isSelf ? "Your" : "Their"} ID and desk are set by an admin.
      </p>
    </section>
  );
}
