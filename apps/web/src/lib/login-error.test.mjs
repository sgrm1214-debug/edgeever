import { describe, expect, test } from "bun:test";
import { ApiRequestError, DesktopInstanceUrlError } from "./api.ts";
import { classifyLoginError } from "./login-error.ts";

describe("login error classification", () => {
  test("distinguishes invalid URLs and unreachable instances", () => {
    expect(classifyLoginError(new DesktopInstanceUrlError(), "login")).toEqual({
      kind: "invalidInstanceUrl",
      diagnosticCode: "instance_url_invalid",
    });
    expect(classifyLoginError(new TypeError("Failed to fetch"), "login")).toEqual({
      kind: "instanceUnreachable",
      diagnosticCode: "network_unreachable",
    });
  });

  test("distinguishes invalid credentials from an expired session", () => {
    const unauthorized = new ApiRequestError("Authentication required", 401, "unauthorized");
    expect(classifyLoginError(unauthorized, "login").kind).toBe("invalidCredentials");
    expect(classifyLoginError(unauthorized, "session").kind).toBe("sessionExpired");
  });

  test("preserves actionable server error categories", () => {
    expect(classifyLoginError(new ApiRequestError("Not found", 404), "login").kind).toBe("instanceApiNotFound");
    expect(classifyLoginError(new ApiRequestError("Slow down", 429, "login_rate_limited"), "login").kind)
      .toBe("loginRateLimited");
    expect(classifyLoginError(new ApiRequestError("Unavailable", 503, "database_not_ready"), "session").kind)
      .toBe("databaseNotReady");
    expect(classifyLoginError(new ApiRequestError("Bad gateway", 502), "login")).toEqual({
      kind: "instanceServerError",
      diagnosticCode: "http_502",
      status: 502,
    });
  });

  test("identifies responses that are not EdgeEver JSON", () => {
    expect(classifyLoginError(new SyntaxError("Unexpected token"), "login")).toEqual({
      kind: "invalidResponse",
      diagnosticCode: "invalid_instance_response",
    });
  });
});
