export const saveAndSyncEditor = async ({
  hasUnsavedChanges,
  save,
  sync,
}: {
  hasUnsavedChanges: boolean;
  save: () => Promise<unknown>;
  sync: () => Promise<unknown>;
}) => {
  if (hasUnsavedChanges) {
    await save();
  }

  await sync();
};

export const getAiSlashCommandStart = ({
  caretPosition,
  insertedText,
  textBefore,
}: {
  caretPosition: number;
  insertedText: string;
  textBefore: string;
}) => {
  if (insertedText.toLowerCase() !== "i" || !/(?:^|\s)\/a$/i.test(textBefore)) {
    return null;
  }

  return caretPosition - 2;
};
