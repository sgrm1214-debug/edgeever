export type WebClientKind = "desktopApp" | "pwa" | "web";

type WebClientEnvironment = {
  desktopBridgeAvailable: boolean;
  displayModeStandalone: boolean;
  navigatorStandalone: boolean;
};

export const detectWebClientKind = ({
  desktopBridgeAvailable,
  displayModeStandalone,
  navigatorStandalone,
}: WebClientEnvironment): WebClientKind => {
  if (desktopBridgeAvailable) return "desktopApp";
  if (displayModeStandalone || navigatorStandalone) return "pwa";
  return "web";
};
