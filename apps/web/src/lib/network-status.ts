const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);
let browserConnectivityConfirmed = false;

const isLoopbackOrigin = () =>
  typeof window !== "undefined" && LOOPBACK_HOSTNAMES.has(window.location.hostname);

export const isBrowserOffline = () =>
  typeof navigator !== "undefined" &&
  navigator.onLine === false &&
  !isLoopbackOrigin() &&
  !browserConnectivityConfirmed;

export const isBrowserOnline = () => !isBrowserOffline();

export const verifyBrowserConnectivity = async () => {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return true;
  }

  if (navigator.onLine || isLoopbackOrigin()) {
    browserConnectivityConfirmed = true;
    return true;
  }

  try {
    await fetch(new URL("/api/v1/auth/session", window.location.origin), {
      cache: "no-store",
      credentials: "include",
    });
    browserConnectivityConfirmed = true;
    return true;
  } catch {
    browserConnectivityConfirmed = false;
    return false;
  }
};
