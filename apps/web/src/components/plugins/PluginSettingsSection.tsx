import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PluginManifest, PluginSettingValue } from "@edgeever/plugin-api";
import type { EdgeEverPluginHost } from "@/lib/plugins/plugin-host";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const PluginSettingsSection = ({ host, manifest }: { host: EdgeEverPluginHost; manifest: PluginManifest }) => {
  const { t } = useTranslation();
  const formId = useId();
  const fields = manifest.settings?.fields ?? [];
  const [values, setValues] = useState<Record<string, PluginSettingValue | "">>({});
  const [configuredSecrets, setConfiguredSecrets] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(fields.length > 0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(fields.length > 0);
    setMessage(null);
    setError(null);
    setLoadError(null);
    void Promise.all(fields.map(async (field) => {
      if (field.type === "secret") return { key: field.key, value: "" as const, configured: await host.hasSettingValue(manifest.id, field.key) };
      return { key: field.key, value: await host.getSettingValue(manifest.id, field.key) ?? "", configured: false };
    })).then((loaded) => {
      if (!active) return;
      setValues(Object.fromEntries(loaded.map((item) => [item.key, item.value])));
      setConfiguredSecrets(Object.fromEntries(loaded.map((item) => [item.key, item.configured])));
      setLoading(false);
    }).catch((error) => {
      if (!active) return;
      setLoadError(error instanceof Error ? error.message : String(error));
      setLoading(false);
    });
    return () => { active = false; };
  }, [host, manifest.id, manifest.version, manifest.settings, loadAttempt]);

  if (fields.length === 0) return null;

  const clearFeedback = () => {
    setMessage(null);
    setError(null);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      // Check every required field before writing any values.
      for (const field of fields) {
        const value = values[field.key];
        if (field.type === "secret" && value === "" && configuredSecrets[field.key]) continue;
        if (field.required && (value == null || (typeof value === "string" && !value.trim()))) {
          throw new Error(t("plugins.settings.required", { name: field.label }));
        }
      }
      for (const field of fields) {
        const value = values[field.key];
        if (field.type === "secret" && value === "") {
          continue;
        }
        if (value === "") {
          await host.removeSettingValue(manifest.id, field.key);
          continue;
        }
        await host.setSettingValue(manifest.id, field.key, value);
        if (field.type === "secret") {
          setConfiguredSecrets((current) => ({ ...current, [field.key]: true }));
          setValues((current) => ({ ...current, [field.key]: "" }));
        }
      }
      setMessage(t("plugins.settings.saved"));
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="min-w-0">
      <h3 className="text-xs font-semibold text-slate-700">{t("plugins.settings.title")}</h3>
      <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500">{t("plugins.settings.description")}</p>
      {loading ? <p className="mt-3 text-xs text-slate-400" role="status">{t("common.loading")}</p> : loadError ? (
        <div className="mt-4 grid justify-items-start gap-3">
          <p className="text-sm text-rose-600" role="alert">{t("plugins.settings.loadFailed", { message: loadError })}</p>
          <Button size="sm" variant="outline" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>{t("plugins.settings.retry")}</Button>
        </div>
      ) : (
        <form className="mt-5 max-w-2xl" onChange={clearFeedback} onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <fieldset disabled={saving} className="grid min-w-0 gap-5">
            {fields.map((field) => {
              const value = values[field.key] ?? "";
              const inputId = `${formId}-${field.key}`;
              const descriptionId = field.description ? `${inputId}-description` : undefined;
              return (
                <div key={field.key} className="grid gap-1.5 text-xs text-slate-700">
                  <label htmlFor={inputId} className="font-medium">{field.label}{field.required ? " *" : ""}</label>
                  {field.type === "boolean" ? (
                    <Switch
                      id={inputId}
                      aria-describedby={descriptionId}
                      aria-label={field.label}
                      checked={value === true}
                      onCheckedChange={(checked) => { clearFeedback(); setValues((current) => ({ ...current, [field.key]: checked })); }}
                    />
                  ) : field.type === "select" ? (
                    <Select
                      disabled={saving}
                      value={value === "" ? (field.required ? "" : "none") : `option:${value}`}
                      onValueChange={(next) => {
                        clearFeedback();
                        setValues((current) => ({ ...current, [field.key]: next === "none" ? "" : next.slice(7) }));
                      }}
                    >
                      <SelectTrigger id={inputId} aria-describedby={descriptionId} aria-required={field.required}>
                        <SelectValue placeholder={t("plugins.settings.none")} />
                      </SelectTrigger>
                      <SelectContent>
                        {!field.required ? <SelectItem value="none">{t("plugins.settings.none")}</SelectItem> : null}
                        {field.options.map((option) => <SelectItem key={option.value} value={`option:${option.value}`}>{option.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id={inputId}
                      aria-describedby={descriptionId}
                      required={field.required && !(field.type === "secret" && configuredSecrets[field.key])}
                      autoComplete={field.type === "secret" ? "new-password" : "off"}
                      type={field.type === "secret" ? "password" : field.type === "number" ? "number" : "text"}
                      value={String(value)}
                      placeholder={field.type === "secret" && configuredSecrets[field.key]
                        ? t("plugins.settings.secretConfigured")
                        : field.type === "text" || field.type === "secret"
                          ? field.placeholder
                          : undefined}
                      min={field.type === "number" ? field.min : undefined}
                      max={field.type === "number" ? field.max : undefined}
                      step={field.type === "number" ? field.step ?? "any" : undefined}
                      onChange={(event) => setValues((current) => ({
                        ...current,
                        [field.key]: field.type === "number" && event.target.value !== "" ? Number(event.target.value) : event.target.value,
                      }))}
                    />
                  )}
                  {field.description ? <p id={descriptionId} className="text-slate-500">{field.description}</p> : null}
                </div>
              );
            })}
            <div className="flex items-center gap-3">
              <Button type="submit" size="sm" disabled={saving}>{saving ? t("common.saving") : t("common.save")}</Button>
              {message ? <span className="text-xs text-slate-500" role="status">{message}</span> : null}
            </div>
            {error ? <p className="text-sm text-rose-600" role="alert">{t("plugins.settings.saveFailed", { message: error })}</p> : null}
          </fieldset>
        </form>
      )}
    </section>
  );
};
