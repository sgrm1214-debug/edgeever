import { ApiRequestError, DesktopInstanceUrlError } from "@/lib/api";

export type LoginErrorPhase = "session" | "login";

export type LoginProblem =
  | { kind: "invalidInstanceUrl"; diagnosticCode: "instance_url_invalid" }
  | { kind: "instanceUnreachable"; diagnosticCode: "network_unreachable" }
  | { kind: "instanceApiNotFound"; diagnosticCode: "edgeever_api_not_found" }
  | { kind: "invalidCredentials"; diagnosticCode: "invalid_credentials" }
  | { kind: "sessionExpired"; diagnosticCode: "session_expired" }
  | { kind: "loginRateLimited"; diagnosticCode: "login_rate_limited" }
  | { kind: "authNotConfigured"; diagnosticCode: "auth_not_configured" }
  | { kind: "databaseNotReady"; diagnosticCode: "database_not_ready" }
  | { kind: "passwordHashInvalid"; diagnosticCode: "password_hash_invalid" }
  | { kind: "instanceServerError"; diagnosticCode: string; status: number }
  | { kind: "requestRejected"; diagnosticCode: string; status: number }
  | { kind: "invalidResponse"; diagnosticCode: "invalid_instance_response" }
  | { kind: "unexpected"; diagnosticCode: "unexpected_login_error" };

export const classifyLoginError = (error: unknown, phase: LoginErrorPhase): LoginProblem => {
  if (error instanceof DesktopInstanceUrlError) {
    return { kind: "invalidInstanceUrl", diagnosticCode: "instance_url_invalid" };
  }

  if (error instanceof ApiRequestError) {
    if (error.code === "auth_not_configured") {
      return { kind: "authNotConfigured", diagnosticCode: "auth_not_configured" };
    }
    if (error.code === "database_not_ready") {
      return { kind: "databaseNotReady", diagnosticCode: "database_not_ready" };
    }
    if (error.code === "password_hash_invalid") {
      return { kind: "passwordHashInvalid", diagnosticCode: "password_hash_invalid" };
    }
    if (error.code === "login_rate_limited" || error.status === 429) {
      return { kind: "loginRateLimited", diagnosticCode: "login_rate_limited" };
    }
    if (error.code === "unauthorized" || error.status === 401) {
      return phase === "login"
        ? { kind: "invalidCredentials", diagnosticCode: "invalid_credentials" }
        : { kind: "sessionExpired", diagnosticCode: "session_expired" };
    }
    if (error.status === 404) {
      return { kind: "instanceApiNotFound", diagnosticCode: "edgeever_api_not_found" };
    }
    if (error.status >= 500) {
      return { kind: "instanceServerError", diagnosticCode: `http_${error.status}`, status: error.status };
    }
    return {
      kind: "requestRejected",
      diagnosticCode: error.code || `http_${error.status}`,
      status: error.status,
    };
  }

  if (error instanceof TypeError) {
    return { kind: "instanceUnreachable", diagnosticCode: "network_unreachable" };
  }

  if (error instanceof SyntaxError) {
    return { kind: "invalidResponse", diagnosticCode: "invalid_instance_response" };
  }

  return { kind: "unexpected", diagnosticCode: "unexpected_login_error" };
};
