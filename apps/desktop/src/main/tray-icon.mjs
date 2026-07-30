import { join } from "node:path";

export const trayIconPath = ({
  isPackaged,
  platform,
  projectRoot,
  resourcesPath,
}) => {
  if (platform === "darwin") {
    return isPackaged
      ? join(resourcesPath, "tray", "trayTemplate.png")
      : join(projectRoot, "apps/desktop/assets/trayTemplate.png");
  }

  return isPackaged
    ? join(resourcesPath, "web", "pwa-192x192.png")
    : join(projectRoot, "apps/web/public/pwa-192x192.png");
};
