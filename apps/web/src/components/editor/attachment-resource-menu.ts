import { flip, offset, shift, type ComputePositionConfig } from "@floating-ui/react-dom";

/** File/PDF cards own in-card download and open-external controls. */
export const ATTACHMENT_CARD_SELECTOR = ".edgeever-file-viewer, .edgeever-pdf-viewer";
export const ATTACHMENT_TOOLBAR_SELECTOR = "[data-edgeever-resource-toolbar]";
export const ATTACHMENT_ACTION_SELECTOR = ".pdf-viewer-action";
const ATTACHMENT_LINK_SELECTOR =
  'a.edgeever-attachment-link, a[href*="/api/v1/resources/"], a[href^="edgeever-resource://"]';

/** Keep rename/delete outside the toolbar so they do not cover in-card actions or their tooltips. */
export const attachmentResourceMenuPosition: Partial<ComputePositionConfig> = {
  placement: "top-end",
  strategy: "fixed",
  middleware: [
    offset(8),
    flip({ padding: 12 }),
    shift({ padding: 12 }),
  ],
};

export type AttachmentHoverTarget = {
  link: HTMLAnchorElement;
  card: HTMLElement | null;
  toolbar: HTMLElement | null;
};

const isResourceAnchor = (anchor: HTMLAnchorElement) => anchor.matches(ATTACHMENT_LINK_SELECTOR);

const findCardResourceLink = (card: HTMLElement): HTMLAnchorElement | null => {
  const anchors = [...card.querySelectorAll<HTMLAnchorElement>("a[href]")];
  const resourceAnchors = anchors.filter(isResourceAnchor);
  return resourceAnchors.find((anchor) => !anchor.closest(ATTACHMENT_ACTION_SELECTOR))
    ?? resourceAnchors[0]
    ?? null;
};

export const getAttachmentHoverTarget = (target: EventTarget | null): AttachmentHoverTarget | null => {
  if (!(target instanceof Element)) return null;

  const card = target.closest<HTMLElement>(ATTACHMENT_CARD_SELECTOR);
  if (card) {
    const link = findCardResourceLink(card);
    if (!link) return null;
    return {
      link,
      card,
      toolbar: card.querySelector<HTMLElement>(ATTACHMENT_TOOLBAR_SELECTOR) ?? card,
    };
  }

  const link = target.closest<HTMLAnchorElement>(ATTACHMENT_LINK_SELECTOR);
  if (!link || link.closest(ATTACHMENT_ACTION_SELECTOR)) return null;
  return { link, card: null, toolbar: null };
};

export const getAttachmentLinkFromEventTarget = (target: EventTarget | null) =>
  getAttachmentHoverTarget(target)?.link ?? null;

export const isInsideAttachmentHoverRegion = (
  origin: AttachmentHoverTarget,
  related: EventTarget | null,
) => {
  if (!(related instanceof Node)) return false;
  if (origin.card?.contains(related)) return true;
  if (!origin.card && origin.link.contains(related)) return true;
  return related instanceof Element && Boolean(related.closest("[data-edgeever-resource-menu]"));
};
