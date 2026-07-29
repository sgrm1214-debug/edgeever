export const isNativeDesktopRuntime = () =>
  Boolean(typeof window !== "undefined" && window.edgeeverDesktop?.isAvailable);
