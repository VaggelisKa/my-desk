type SerializableError = {
  message?: string;
};

export function getUserFriendlyErrorMessage(error: unknown) {
  let rawMessage =
    typeof error === "string"
      ? error
      : typeof error === "object" && error !== null
        ? ((error as SerializableError).message ?? "")
        : "";

  if (rawMessage.includes("SQLITE_CONSTRAINT_FOREIGNKEY")) {
    return "The selected record does not exist anymore. Please refresh and try again.";
  }

  if (
    rawMessage.includes("SQLITE_CONSTRAINT_PRIMARYKEY") ||
    rawMessage.includes("SQLITE_CONSTRAINT_UNIQUE")
  ) {
    return "This action conflicts with existing data. Please refresh and try again.";
  }

  if (!rawMessage) {
    return "Something went wrong. Please try again later.";
  }

  return rawMessage;
}

