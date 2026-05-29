import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";

const AUTO_DISMISS_MS = 3000;
const SPOTLIGHT_ACTIVE_CLASS = "spotlight-active";

let activeDriver: Driver | null = null;
let dismissTimer: ReturnType<typeof setTimeout> | null = null;

export type SpotlightLifecycle = {
  onStart?: () => void;
  onEnd?: () => void;
};

function setSpotlightActive(active: boolean) {
  document.documentElement.classList.toggle(SPOTLIGHT_ACTIVE_CLASS, active);
}

export function clearSpotlight() {
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
  activeDriver?.destroy();
  activeDriver = null;
  setSpotlightActive(false);
}

export async function waitForElement(selector: string, timeoutMs = 4000): Promise<Element | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const el = document.querySelector(selector);
    if (el) return el;
    await new Promise((r) => setTimeout(r, 80));
  }
  return null;
}

export function showSpotlight(
  options: {
    selector: string;
    title: string;
    message?: string;
  },
  lifecycle?: SpotlightLifecycle,
): boolean {
  const el = document.querySelector(options.selector);
  if (!el) return false;

  clearSpotlight();
  lifecycle?.onStart?.();
  setSpotlightActive(true);

  activeDriver = driver({
    showProgress: false,
    allowClose: true,
    overlayOpacity: 0.65,
    stagePadding: 8,
    popoverClass: "portfolio-driver-popover",
    steps: [
      {
        element: options.selector,
        popover: {
          title: options.title,
          description: options.message ?? "",
          side: "bottom",
          align: "start",
        },
      },
    ],
    onDestroyed: () => {
      activeDriver = null;
      if (dismissTimer) {
        clearTimeout(dismissTimer);
        dismissTimer = null;
      }
      setSpotlightActive(false);
      lifecycle?.onEnd?.();
    },
  });

  activeDriver.drive();

  dismissTimer = setTimeout(() => {
    clearSpotlight();
  }, AUTO_DISMISS_MS);

  return true;
}
