import { afterEach, describe, expect, it } from "bun:test";
import { presentAppDialog, registerAppDialogPresenter, type AppDialogRequest } from "./app-dialog-controller";

let unregister: (() => void) | null = null;

afterEach(() => {
  unregister?.();
  unregister = null;
});

describe("app dialog controller", () => {
  it("routes a dialog request to the active native presenter", () => {
    const requests: AppDialogRequest[] = [];
    unregister = registerAppDialogPresenter((request) => requests.push(request));

    expect(presentAppDialog({ title: "Delete?", message: "Cannot be undone." })).toBe(true);
    expect(requests).toEqual([{ title: "Delete?", message: "Cannot be undone." }]);
  });

  it("falls back when the provider is not mounted", () => {
    unregister = registerAppDialogPresenter(() => undefined);
    unregister();
    unregister = null;

    expect(presentAppDialog({ title: "Notice" })).toBe(false);
  });
});
