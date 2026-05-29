export type UiSnapshotElement = {
  ref: string;
  tag: string;
  label: string;
  kind: "interactive" | "region";
  role?: string;
  href?: string;
  selector: string;
  spotlightId?: string;
};

export type UiSnapshot = {
  route: string;
  capturedAt: string;
  elements: UiSnapshotElement[];
};

const INTERACTIVE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  'input:not([type="hidden"]):not([disabled])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[role="button"]',
  "[data-spotlight]",
  "[data-ui-spotlight]",
].join(", ");

const MAX_ELEMENTS = 120;

function isVisible(el: Element): boolean {
  const html = el as HTMLElement;
  if (html.offsetParent === null && getComputedStyle(html).position !== "fixed") return false;
  const rect = html.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  const style = getComputedStyle(html);
  return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) > 0.05;
}

function isExcluded(el: Element): boolean {
  return (
    !!el.closest('[data-ui-chrome="agent"]') ||
    !!el.closest(".driver-overlay") ||
    !!el.closest(".driver-popover")
  );
}

function getElementLabel(el: Element): string {
  const html = el as HTMLElement;

  const uiLabel = html.getAttribute("data-ui-label")?.trim();
  if (uiLabel) return uiLabel;

  const aria = html.getAttribute("aria-label")?.trim();
  if (aria) return aria;

  const labelledBy = html.getAttribute("aria-labelledby");
  if (labelledBy) {
    const labelEl = document.getElementById(labelledBy);
    if (labelEl?.textContent?.trim()) return labelEl.textContent.trim();
  }

  const spotlight = html.getAttribute("data-ui-spotlight") ?? html.getAttribute("data-spotlight");
  if (spotlight?.trim()) {
    const text = html.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (text.length > 0 && text.length <= 100) return text;
    return spotlight.trim();
  }

  const text = html.textContent?.replace(/\s+/g, " ").trim() ?? "";
  if (text.length > 0 && text.length <= 80) return text;

  const placeholder = (html as HTMLInputElement).placeholder?.trim();
  if (placeholder) return placeholder;

  const name = html.getAttribute("name")?.trim();
  if (name) return name;

  const title = html.getAttribute("title")?.trim();
  if (title) return title;

  return "";
}

function pruneSnapshot(elements: UiSnapshotElement[]): UiSnapshotElement[] {
  const seen = new Set<string>();
  const out: UiSnapshotElement[] = [];

  for (const item of elements) {
    if (seen.has(item.ref)) continue;
    seen.add(item.ref);
    out.push(item);
    if (out.length >= MAX_ELEMENTS) break;
  }

  return out;
}

function addElement(
  el: Element,
  route: string,
  index: number,
  elements: UiSnapshotElement[],
  kind: UiSnapshotElement["kind"],
) {
  const label = getElementLabel(el);
  if (!label) return;

  const html = el as HTMLElement;
  const existingRef = el.getAttribute("data-ui-ref");
  const ref = existingRef ?? `ui-${route.replace(/\//g, "_") || "root"}-${index}`;
  if (!existingRef) el.setAttribute("data-ui-ref", ref);

  const spotlightId =
    html.getAttribute("data-ui-spotlight") ?? html.getAttribute("data-spotlight") ?? undefined;

  elements.push({
    ref,
    tag: html.tagName.toLowerCase(),
    label,
    kind,
    role: html.getAttribute("role") ?? undefined,
    href: html.tagName === "A" ? (html as HTMLAnchorElement).getAttribute("href") ?? undefined : undefined,
    selector: `[data-ui-ref="${ref}"]`,
    spotlightId,
  });
}

export function captureUiSnapshot(route: string): UiSnapshot {
  const nodes = document.querySelectorAll(INTERACTIVE_SELECTOR);
  const elements: UiSnapshotElement[] = [];
  let index = 0;

  for (const el of nodes) {
    if (!isVisible(el) || isExcluded(el)) continue;

    const kind: UiSnapshotElement["kind"] = el.hasAttribute("data-ui-spotlight")
      ? "region"
      : "interactive";

    addElement(el, route, index, elements, kind);
    index += 1;
  }

  return {
    route,
    capturedAt: new Date().toISOString(),
    elements: pruneSnapshot(elements),
  };
}

function matchScore(haystack: string, query: string): number {
  const h = haystack.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  if (h === q) return 100;
  if (h.includes(q)) return 85;

  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  const matched = tokens.filter((t) => h.includes(t)).length;
  if (matched === 0) return 0;
  return 50 + (matched / tokens.length) * 35;
}

export function findElementByLabel(
  snapshot: UiSnapshot,
  label: string,
): UiSnapshotElement | undefined {
  const q = label.trim();
  if (!q) return undefined;

  const byRef = snapshot.elements.find((e) => e.ref === q || e.spotlightId === q);
  if (byRef) return byRef;

  let best: UiSnapshotElement | undefined;
  let bestScore = 0;

  for (const el of snapshot.elements) {
    const hay = [el.label, el.spotlightId].filter(Boolean).join(" ");
    const score = matchScore(hay, q);
    if (score > bestScore) {
      bestScore = score;
      best = el;
    }
  }

  return bestScore >= 50 ? best : undefined;
}
