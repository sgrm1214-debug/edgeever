/**
 * Expo DOM imperative methods (`focusEnd`, `setContent`, `flush`, …) bridge through
 * `DomWebView.injectJavaScript`. After the native view unmounts, those calls reject with:
 *
 *   Unable to find the class expo.modules.webview.DomWebView view with tag N
 *
 * That rejection surfaces as the red "Uncaught (in promise)" toast in dev. Swallow it —
 * the host screen has already left the editor.
 */
export const safeDomCall = (invoke: () => unknown): void => {
  try {
    const result = invoke();
    if (result != null && typeof (result as Promise<unknown>).then === "function") {
      void (result as Promise<unknown>).catch(() => undefined);
    }
  } catch {
    // Synchronous bridge failures (rare) — ignore.
  }
};
