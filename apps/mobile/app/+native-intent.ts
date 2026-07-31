export const redirectSystemPath = ({ path }: { path: string; initial: boolean }) => {
  try {
    return new URL(path).hostname === "expo-sharing" ? "/" : path;
  } catch {
    return "/";
  }
};
