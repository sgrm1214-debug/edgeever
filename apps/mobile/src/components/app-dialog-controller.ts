import type { AlertButton, AlertOptions } from "react-native";

export type AppDialogRequest = {
  buttons?: AlertButton[];
  message?: string;
  options?: AlertOptions;
  title: string;
};

type AppDialogPresenter = (request: AppDialogRequest) => void;

let presenter: AppDialogPresenter | null = null;

export const registerAppDialogPresenter = (nextPresenter: AppDialogPresenter) => {
  presenter = nextPresenter;
  return () => {
    if (presenter === nextPresenter) {
      presenter = null;
    }
  };
};

export const presentAppDialog = (request: AppDialogRequest) => {
  if (!presenter) {
    return false;
  }
  presenter(request);
  return true;
};
