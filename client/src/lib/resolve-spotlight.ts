import { getSpotlightTarget } from "./ui-catalog";
import {
  captureUiSnapshot,
  findElementByLabel,
  type UiSnapshot,
  type UiSnapshotElement,
} from "./ui-snapshot";

function matchScore(haystack: string, query: string): number {
  const h = haystack.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  if (h === q) return 100;
  if (h.includes(q)) return 85;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  const matched = tokens.filter((t) => h.includes(t)).length;
  return matched === 0 ? 0 : 50 + (matched / tokens.length) * 35;
}

export type SpotlightRequest = {
  ref?: string;
  label?: string;
  selector?: string;
  target?: string;
  message?: string;
  route?: string;
};

export type ResolvedSpotlight = {
  selector: string;
  title: string;
  message?: string;
  element?: UiSnapshotElement;
};

export function resolveSpotlight(
  request: SpotlightRequest,
  snapshot?: UiSnapshot,
): ResolvedSpotlight | null {
  const snap = snapshot ?? captureUiSnapshot(window.location.pathname);

  if (request.ref) {
    const el = snap.elements.find((e) => e.ref === request.ref);
    if (el) {
      return { selector: el.selector, title: el.label, message: request.message, element: el };
    }
    const selector = `[data-ui-ref="${request.ref}"]`;
    if (document.querySelector(selector)) {
      return { selector, title: request.label ?? request.ref, message: request.message };
    }
  }

  if (request.selector && document.querySelector(request.selector)) {
    return {
      selector: request.selector,
      title: request.label ?? request.message ?? "Here",
      message: request.message,
    };
  }

  if (request.label) {
    const el = findElementByLabel(snap, request.label);
    if (el) {
      return { selector: el.selector, title: el.label, message: request.message, element: el };
    }

    const byUiLabel = document.querySelectorAll("[data-ui-label]");
    let bestEl: Element | null = null;
    let bestScore = 0;
    for (const node of byUiLabel) {
      const attr = node.getAttribute("data-ui-label") ?? "";
      const score =
        matchScore(attr, request.label) +
        (node.getAttribute("data-ui-spotlight") === request.label ? 20 : 0);
      if (score > bestScore) {
        bestScore = score;
        bestEl = node;
      }
    }
    if (bestEl && bestScore >= 50) {
      const ref = bestEl.getAttribute("data-ui-ref");
      const selector = ref
        ? `[data-ui-ref="${ref}"]`
        : `[data-ui-label="${bestEl.getAttribute("data-ui-label")}"]`;
      return {
        selector,
        title: bestEl.getAttribute("data-ui-label") ?? request.label,
        message: request.message,
      };
    }
  }

  if (request.target) {
    const meta = getSpotlightTarget(request.target);
    if (meta) {
      return {
        selector: meta.selector,
        title: meta.label,
        message: request.message,
      };
    }
    const bySpotlightAttr =
      document.querySelector(`[data-ui-spotlight="${request.target}"]`) ??
      document.querySelector(`[data-spotlight="${request.target}"]`);
    if (bySpotlightAttr) {
      const ref = bySpotlightAttr.getAttribute("data-ui-ref");
      const title =
        bySpotlightAttr.getAttribute("data-ui-label") ?? request.label ?? request.target;
      return {
        selector: ref ? `[data-ui-ref="${ref}"]` : `[data-ui-spotlight="${request.target}"]`,
        title,
        message: request.message,
      };
    }
  }

  return null;
}
