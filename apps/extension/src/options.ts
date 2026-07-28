import "./styles.css";
import { getSettings, saveSettings, testConnection, type ExtensionSettings } from "./extension";
import { localizeDocument, t } from "./i18n";

localizeDocument();

type NotebookSelect = {
  value: string;
  replaceChildren: (...nodes: Node[]) => void;
  add: (option: HTMLOptionElement) => void;
};

const form = document.querySelector<HTMLFormElement>("#settings-form");
const instanceUrlInput = document.querySelector<HTMLInputElement>("#instance-url");
const tokenInput = document.querySelector<HTMLInputElement>("#token");
const notebookSelect = document.querySelector("#notebook-id") as NotebookSelect | null;
const testButton = document.querySelector<HTMLButtonElement>("#test");
const status = document.querySelector<HTMLParagraphElement>("#status");
const copyDiagnosticsButton = document.querySelector<HTMLButtonElement>("#copy-diagnostics");
const copyStatus = document.querySelector<HTMLSpanElement>("#copy-status");

type DiagnosticInfo = {
  extensionVersion: string;
  manifestVersion: string;
  browser: string;
  system: string;
  extensionId: string;
  instanceOrigin: string;
  instancePermission: string;
};

const setStatus = (message: string, kind: "normal" | "error" | "success" = "normal") => {
  if (status) {
    status.textContent = message;
    status.dataset.kind = kind;
  }
};

const readSettings = (): ExtensionSettings => ({
  instanceUrl: instanceUrlInput?.value.trim() ?? "",
  token: tokenInput?.value.trim() ?? "",
  notebookId: notebookSelect?.value ?? "",
});

const getBrowserLabel = () => {
  const userAgent = navigator.userAgent;
  const match = userAgent.match(/(Edg|Chrome|Firefox|Version)\/([\d.]+)/);
  if (!match) {
    return userAgent;
  }
  const name = match[1] === "Edg" ? "Microsoft Edge" : match[1] === "Version" ? "Safari" : match[1];
  return `${name} ${match[2]}`;
};

const getInstanceOrigin = (instanceUrl: string) => {
  if (!instanceUrl) {
    return t("notConfigured");
  }
  try {
    return new URL(instanceUrl).origin;
  } catch {
    return t("invalidInstanceAddress");
  }
};

const getDiagnosticInfo = async (settings: ExtensionSettings): Promise<DiagnosticInfo> => {
  const manifest = chrome.runtime.getManifest() as { version?: string };
  const instanceOrigin = getInstanceOrigin(settings.instanceUrl);
  let instancePermission = t("permissionNotConfigured");
  if (instanceOrigin.startsWith("http")) {
    const granted = await chrome.permissions.contains({ origins: [`${instanceOrigin}/*`] });
    instancePermission = granted ? t("permissionGranted") : t("permissionNotGranted");
  }

  return {
    extensionVersion: manifest.version || t("unknownValue"),
    manifestVersion: manifest.version || t("unknownValue"),
    browser: getBrowserLabel(),
    system: `${navigator.platform || t("unknownValue")} (${navigator.language || t("unknownValue")})`,
    extensionId: chrome.runtime.id || t("unknownValue"),
    instanceOrigin,
    instancePermission,
  };
};

const diagnosticText = (info: DiagnosticInfo) => [
  "EdgeEver Web Clipper diagnostics",
  `Extension version: ${info.extensionVersion}`,
  `Manifest version: ${info.manifestVersion}`,
  `Browser: ${info.browser}`,
  `System: ${info.system}`,
  `Extension ID: ${info.extensionId}`,
  `Instance origin: ${info.instanceOrigin}`,
  `Instance permission: ${info.instancePermission}`,
  "Declared permissions: activeTab, scripting, storage",
].join("\n");

const setCopyStatus = (message: string, kind: "normal" | "error" | "success" = "normal") => {
  if (copyStatus) {
    copyStatus.textContent = message;
    copyStatus.dataset.kind = kind;
  }
};

const renderNotebooks = (notebooks: Array<{ id: string; name: string }>, selectedId: string) => {
  if (!notebookSelect) {
    return;
  }

  notebookSelect.replaceChildren(new Option(t("autoFirstNotebook"), ""));
  for (const notebook of notebooks) {
    notebookSelect.add(new Option(notebook.name, notebook.id));
  }
  notebookSelect.value = selectedId;
};

const initialize = async () => {
  const settings = await getSettings();
  if (instanceUrlInput) instanceUrlInput.value = settings.instanceUrl;
  if (tokenInput) tokenInput.value = settings.token;
  if (notebookSelect) notebookSelect.value = settings.notebookId;

  const info = await getDiagnosticInfo(settings);
  document.querySelector("#extension-version")!.textContent = info.extensionVersion;
  document.querySelector("#manifest-version")!.textContent = info.manifestVersion;
  document.querySelector("#browser-version")!.textContent = info.browser;
  document.querySelector("#system-version")!.textContent = info.system;
  document.querySelector("#extension-id")!.textContent = info.extensionId;
  document.querySelector("#instance-origin")!.textContent = info.instanceOrigin;
  document.querySelector("#instance-permission")!.textContent = info.instancePermission;
};

testButton?.addEventListener("click", async () => {
  testButton.disabled = true;
  setStatus(t("connecting"));
  try {
    const settings = readSettings();
    const notebooks = await testConnection(settings);
    renderNotebooks(notebooks, notebookSelect?.value ?? "");
    const messageKey = notebooks.length === 1 ? "connectionSuccessOne" : "connectionSuccessMany";
    setStatus(t(messageKey, String(notebooks.length)), "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t("connectionFailed"), "error");
  } finally {
    testButton.disabled = false;
  }
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await saveSettings(readSettings());
    setStatus(t("settingsSaved"), "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t("settingsSaveFailed"), "error");
  }
});

copyDiagnosticsButton?.addEventListener("click", async () => {
  copyDiagnosticsButton.disabled = true;
  try {
    const info = await getDiagnosticInfo(readSettings());
    await navigator.clipboard.writeText(diagnosticText(info));
    setCopyStatus(t("diagnosticsCopied"), "success");
  } catch {
    setCopyStatus(t("diagnosticsCopyFailed"), "error");
  } finally {
    copyDiagnosticsButton.disabled = false;
  }
});

void initialize();
