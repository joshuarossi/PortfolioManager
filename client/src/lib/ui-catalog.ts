import catalog from "../../../ui-catalog.json";

export const UI_CATALOG = catalog;

export function resolveRoute(routeOrPage: string): string | null {
  const routes = UI_CATALOG.routes as Record<string, string>;
  if (routeOrPage.startsWith("/")) return routeOrPage;
  return routes[routeOrPage] ?? null;
}

export function getSpotlightTarget(target: string) {
  return UI_CATALOG.spotlights[target as keyof typeof UI_CATALOG.spotlights] ?? null;
}

export function listUiCapabilities() {
  return {
    routes: UI_CATALOG.routes,
    spotlights: Object.fromEntries(
      Object.entries(UI_CATALOG.spotlights).map(([key, v]) => [key, v.label]),
    ),
  };
}
