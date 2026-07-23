export type InstanceAuthMode = "required" | "disabled" | "unconfigured";

export const isUnauthenticatedAccessEnabled = (value: string | undefined) =>
  value?.trim().toLowerCase() === "true";

export const resolveInstanceAuthMode = ({
  allowUnauthenticated,
  hasBootstrapCredential,
  hasEnabledUser,
}: {
  allowUnauthenticated: boolean;
  hasBootstrapCredential: boolean;
  hasEnabledUser: boolean;
}): InstanceAuthMode => {
  if (allowUnauthenticated) {
    return "disabled";
  }

  if (hasBootstrapCredential || hasEnabledUser) {
    return "required";
  }

  return "unconfigured";
};

export const isDatabaseNotReadyError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return /D1_ERROR|no such table|no such column|DB\.prepare is not a function|Cannot read properties of undefined.*prepare/i.test(
    message,
  );
};
