import type { Notebook } from "./types";

export const getNotebookDescendantIds = (notebooks: Notebook[], targetNotebookId: string) => {
  const childrenByParentId = new Map<string, string[]>();

  for (const notebook of notebooks) {
    if (!notebook.parentId) {
      continue;
    }

    const children = childrenByParentId.get(notebook.parentId) ?? [];
    children.push(notebook.id);
    childrenByParentId.set(notebook.parentId, children);
  }

  const descendantIds: string[] = [];
  const visited = new Set<string>();
  const pendingIds = [targetNotebookId];

  while (pendingIds.length > 0) {
    const notebookId = pendingIds.pop();

    if (!notebookId || visited.has(notebookId)) {
      continue;
    }

    visited.add(notebookId);
    descendantIds.push(notebookId);
    pendingIds.push(...(childrenByParentId.get(notebookId) ?? []));
  }

  return descendantIds;
};
