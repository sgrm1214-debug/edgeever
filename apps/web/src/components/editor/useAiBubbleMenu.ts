import { useCallback } from "react";
import type { BubbleMenuProps } from "@tiptap/react/menus";

type BubbleMenuShouldShow = NonNullable<BubbleMenuProps["shouldShow"]>;
type BubbleMenuOptions = NonNullable<BubbleMenuProps["options"]>;

const AI_BUBBLE_MENU_OPTIONS: BubbleMenuOptions = { placement: "top" };

export const useAiBubbleMenu = (assistantOpen: boolean) => {
  // BubbleMenu dispatches an options-update transaction whenever these prop
  // references change. Keep them stable so the editor's transaction-driven
  // toolbar refresh cannot feed back into another BubbleMenu update.
  const shouldShow = useCallback<BubbleMenuShouldShow>(
    ({ editor }) => editor.isEditable && !editor.state.selection.empty && !assistantOpen,
    [assistantOpen],
  );

  return {
    options: AI_BUBBLE_MENU_OPTIONS,
    shouldShow,
  };
};
