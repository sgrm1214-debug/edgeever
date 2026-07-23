import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Constants from "expo-constants";
import { AppState, Linking, Platform, type AppStateStatus } from "react-native";
import * as Updates from "expo-updates";
import { Alert } from "../components/LocalizedText";
import { useMobileLocale } from "./mobile-locale";
import { findNewerMobileRelease, GITHUB_LATEST_RELEASE_URL, GOOGLE_PLAY_URL, type MobileRelease } from "./mobile-release";

const FOREGROUND_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

type MobileUpdateStatus = "idle" | "checking" | "downloading" | "ready";

type MobileUpdateContextValue = {
  checkForUpdate: () => Promise<void>;
  isSupported: boolean;
  status: MobileUpdateStatus;
};

const MobileUpdateContext = createContext<MobileUpdateContextValue>({
  checkForUpdate: async () => undefined,
  isSupported: false,
  status: "idle",
});

export const MobileUpdateProvider = ({ children }: { children: ReactNode }) => {
  const { resolvedLocale } = useMobileLocale();
  const [status, setStatus] = useState<MobileUpdateStatus>("idle");
  const activeCheckRef = useRef<Promise<void> | null>(null);
  const lastAutomaticCheckRef = useRef(0);
  const isSupported = !__DEV__ && Updates.isEnabled;
  const english = resolvedLocale === "en-US";
  const installedVersion = Updates.runtimeVersion ?? Constants.expoConfig?.version ?? null;

  const openUpdateUrl = useCallback((url: string) => {
    void Linking.openURL(url).catch(() => {
      Alert.alert(
        english ? "Unable to open update page" : "无法打开更新页面",
        english ? "Open the app store or GitHub Releases and try again." : "请手动打开应用商店或 GitHub Releases 后重试。"
      );
    });
  }, [english]);

  const showInstallableUpdatePrompt = useCallback((release: MobileRelease) => {
    Alert.alert(
      english ? "New app version available" : "发现新版本",
      english
        ? `Version v${release.version} is available. This update includes an installable app package and cannot be applied as an in-app update.`
        : `发现可安装的新版本 v${release.version}。此类更新包含新的应用安装包，无法通过应用内热更新完成。`,
      [
        { text: english ? "Later" : "稍后", style: "cancel" },
        { text: "Google Play", onPress: () => openUpdateUrl(GOOGLE_PLAY_URL) },
        { text: "GitHub", onPress: () => openUpdateUrl(GITHUB_LATEST_RELEASE_URL) },
      ]
    );
  }, [english, openUpdateUrl]);

  const restart = useCallback(async () => {
    try {
      await Updates.reloadAsync();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      Alert.alert(
        english ? "Unable to restart" : "重启失败",
        english ? `Close and reopen EdgeEver to apply the update.\n\n${detail}` : `请关闭并重新打开 EdgeEver 以应用更新。\n\n${detail}`
      );
    }
  }, [english]);

  const showRestartPrompt = useCallback(() => {
    Alert.alert(
      english ? "Update ready" : "更新已就绪",
      english
        ? "The update has been downloaded. Restart EdgeEver now to apply it?"
        : "新版本已下载完成。现在重启 EdgeEver 以应用更新吗？",
      [
        { text: english ? "Later" : "稍后", style: "cancel" },
        { text: english ? "Restart now" : "立即重启", onPress: () => void restart() },
      ]
    );
  }, [english, restart]);

  const runCheck = useCallback((userInitiated: boolean) => {
    if (activeCheckRef.current) {
      return activeCheckRef.current;
    }

    if (!isSupported) {
      if (userInitiated) {
        Alert.alert(
          english ? "Updates unavailable" : "暂无法检查更新",
          english
            ? "Update checks are available in installed release builds, not Expo Go or development builds."
            : "检查更新仅适用于已安装的正式版，Expo Go 和开发版暂不支持。"
        );
      }
      return Promise.resolve();
    }

    const check = (async () => {
      let installableReleaseCheckFailed = false;
      try {
        setStatus("checking");

        if (userInitiated && Platform.OS === "android") {
          try {
            if (!installedVersion) {
              throw new Error("Installed app version is unavailable");
            }
            const release = await findNewerMobileRelease(installedVersion);
            if (release) {
              setStatus("idle");
              showInstallableUpdatePrompt(release);
              return;
            }
          } catch {
            installableReleaseCheckFailed = true;
          }
        }

        const result = await Updates.checkForUpdateAsync();

        if (!result.isAvailable) {
          setStatus("idle");
          if (userInitiated) {
            if (installableReleaseCheckFailed) {
              Alert.alert(
                english ? "Unable to fully check for updates" : "无法完成更新检查",
                english
                  ? "No compatible in-app update was found, but the latest installable app version could not be verified. Check your connection and try again."
                  : "未发现兼容的应用内热更新，但无法确认最新安装包版本。请检查网络连接后重试。"
              );
            } else {
              Alert.alert(
                english ? "You're up to date" : "已是最新版本",
                english ? "No newer app package or compatible in-app update is available." : "当前没有更新的安装包或兼容的应用内热更新。"
              );
            }
          }
          return;
        }

        setStatus("downloading");
        await Updates.fetchUpdateAsync();
        setStatus("ready");
        showRestartPrompt();
      } catch (error) {
        setStatus("idle");
        if (userInitiated) {
          const detail = error instanceof Error ? error.message : String(error);
          Alert.alert(
            english ? "Unable to check for updates" : "检查更新失败",
            english ? `Check your connection and try again.\n\n${detail}` : `请检查网络连接后重试。\n\n${detail}`
          );
        }
      }
    })();

    activeCheckRef.current = check;
    void check.finally(() => {
      activeCheckRef.current = null;
    });
    return check;
  }, [english, installedVersion, isSupported, showInstallableUpdatePrompt, showRestartPrompt]);

  useEffect(() => {
    const attemptAutomaticCheck = () => {
      if (Date.now() - lastAutomaticCheckRef.current < FOREGROUND_CHECK_INTERVAL_MS) {
        return;
      }
      lastAutomaticCheckRef.current = Date.now();
      void runCheck(false);
    };
    const timer = setTimeout(attemptAutomaticCheck, 1_500);
    const subscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState === "active") {
        attemptAutomaticCheck();
      }
    });

    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [runCheck]);

  const value = useMemo<MobileUpdateContextValue>(
    () => ({
      checkForUpdate: () => {
        if (status === "ready") {
          showRestartPrompt();
          return Promise.resolve();
        }
        return runCheck(true);
      },
      isSupported,
      status,
    }),
    [isSupported, runCheck, showRestartPrompt, status]
  );

  return <MobileUpdateContext.Provider value={value}>{children}</MobileUpdateContext.Provider>;
};

export const useMobileUpdate = () => useContext(MobileUpdateContext);
