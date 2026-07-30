export type EditorLinkClick = {
  button: number;
  ctrlKey: boolean;
  metaKey: boolean;
};

export const shouldOpenEditorLink = (
  event: EditorLinkClick,
  editable: boolean
): boolean =>
  event.button === 0 &&
  (!editable || event.ctrlKey || event.metaKey);
