/**
 * Shared DOM / WebView host props for Expo DOM components and react-native-webview.
 *
 * Apple Review crashlogs (iPadOS 26.5) showed WKWebView init probing microphone TCC
 * and concurrent Fabric text layout corruption. Deny media capture at the WebView
 * layer and require a user gesture for playback so host creation stays quiet.
 */
export const SAFE_DOM_WEBVIEW_PROPS = {
  allowsInlineMediaPlayback: true,
  mediaCapturePermissionGrantType: "deny" as const,
  mediaPlaybackRequiresUserAction: true,
};
