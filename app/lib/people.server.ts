import { eq } from "drizzle-orm";
import { CODE_LENGTH } from "~/components/auth-card";
import { db } from "~/lib/db/drizzle.server";
import { users } from "~/lib/db/schema";

// Adding a person, shared by guest sign-up and Admin › People so both check
// the same things and store IDs the same way.

export type NewPerson = { id: string; firstName: string; lastName: string };

export type NewPersonErrors = {
  id?: string;
  firstName?: string;
  lastName?: string;
};

/**
 * Tidies what was typed (IDs are stored lowercase) and says what is wrong
 * with it, per field. `errors` is null when the person can be added.
 */
export function checkNewPerson(input: {
  id: string;
  firstName: string;
  lastName: string;
}) {
  let person: NewPerson = {
    id: input.id.trim().toLowerCase(),
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
  };
  let errors: NewPersonErrors = {};

  if (!person.id) {
    errors.id = "User ID is required";
  } else if (person.id.length !== CODE_LENGTH) {
    // Sign-in takes exactly six characters, so any other length could never
    // be used to sign in.
    errors.id = `User ID must be ${CODE_LENGTH} characters`;
  }

  if (!person.firstName) {
    errors.firstName = "First name is required";
  }

  if (!person.lastName) {
    errors.lastName = "Last name is required";
  }

  return { person, errors: Object.keys(errors).length ? errors : null };
}

/**
 * Adds the person, unless their ID is taken: then nothing changes and it
 * returns false. An existing person is never overwritten.
 */
export async function addPerson(
  person: NewPerson,
  tx: Pick<typeof db, "insert"> = db,
) {
  let added = await tx
    .insert(users)
    .values(person)
    .onConflictDoNothing()
    .returning({ id: users.id });

  return added.length > 0;
}

/** Who already has this ID, for saying so. */
export async function personWithId(id: string) {
  return db.query.users.findFirst({
    where: eq(users.id, id),
    columns: { firstName: true, lastName: true },
  });
}
