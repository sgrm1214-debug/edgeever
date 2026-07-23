import { requireNativeModule } from "expo";

type EdgeEverKeyboardNativeModule = {
  show: () => boolean;
};

export const showEdgeEverKeyboard = () => {
  requireNativeModule<EdgeEverKeyboardNativeModule>("EdgeEverKeyboard").show();
};
