import {
  renderSvg,
  militarySummary,
  empireLabel,
  DEFAULT_STYLE,
  PALETTE,
  ROLE_LABELS,
  type World,
  type Style,
} from "./index.js";
export interface ViewerAssets {
  css: string;
  js: string;
}
export function playerControl(civ: any) {
  if (civ.kind !== "major") return "other";
  if (
    (typeof civ.playerName === "string" && civ.playerName.trim()) ||
    civ.setupSlotStatus === 3
  )
    return "human";
  return civ.setupSlotStatus === 1 ? "ai" : "unknown";
}
export function scriptJson(v: any) {
  return JSON.stringify(v)
    .replaceAll("&", "\\u0026")
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e");
}
export function renderHtml(
  world: World,
  assets: ViewerAssets,
  style: Style = {},
  mode = "political",
) {
  const primary = { ...style };
  if (mode !== "army")
    Object.assign(primary, { armyIcons: "domain", showMilitarySummary: false });
  renderSvg(world, primary, { mode });
  if (
    new Set(world.cities.map((c) => String(c.id))).size !== world.cities.length
  )
    throw new Error("HTML export requires unique city IDs");
  const config = { ...DEFAULT_STYLE, ...style },
    variants: any = {},
    unavailable: any = {};
  for (const view of ["political", "physical", "army", "religion"]) {
    const settings = {
      ...config,
      showCities: true,
      showRoads: true,
      showRivers: true,
      showCivilizationNames: true,
      showMilitarySummary: false,
    };
    if (view !== "army") settings.armyIcons = "domain";
    try {
      variants[view] = renderSvg(world, settings, {
        mode: view,
        interactive: true,
      });
    } catch (e) {
      unavailable[view] = (e as Error).message;
    }
  }
  const summary = variants.army ? militarySummary(world) : null,
    colors: any = {},
    labels: any = {};
  world = {
    ...world,
    civilizations: [...world.civilizations].sort((a, b) => a.id - b.id),
    tiles: [...world.tiles].sort((a, b) => a.y - b.y || a.x - b.x),
    cities: [...world.cities].sort((a, b) =>
      String(a.id).localeCompare(String(b.id)),
    ),
  };
  world.civilizations.forEach((c, i) => {
    colors[c.id] =
      config.colorOverrides?.[c.id] || c.color || PALETTE[i % PALETTE.length];
    labels[c.id] = empireLabel(c, config.empireLabels);
  });
  const data: any = {};
  for (const k of [
    "schemaVersion",
    "source",
    "game",
    "extraction",
    "civilizations",
    "tiles",
    "cities",
    "religions",
  ])
    data[k] = world[k];
  if (world.units)
    data.units = [...world.units].sort(
      (a, b) => a.owner - b.owner || String(a.id).localeCompare(String(b.id)),
    );
  const payload = {
    world: data,
    mode,
    unavailable,
    summary,
    playerControls: Object.fromEntries(
      world.civilizations.map((c) => [c.id, playerControl(c)]),
    ),
    labels,
    colors,
    roleLabels: ROLE_LABELS,
    layers: {
      armies: true,
      cities: config.showCities,
      religionTerritories: true,
      holyCities: true,
      roads: config.showRoads,
      rivers: config.showRivers,
      cityLabels: config.showCities,
      empireLabels: config.showCivilizationNames,
    },
    expandSummary: config.showMilitarySummary,
  };
  const title = (
    world.source.kind === "synthetic"
      ? "Synthetic demo"
      : `Turn ${world.game.turn ?? "?"}`
  )
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CivMapper · ${title}</title><style>${assets.css}</style></head><body><header><div><strong>CivMapper</strong><span>${title}</span></div><label>View <select id="mode">${["political", "physical", "army", "religion"].map((v) => `<option value="${v}"${variants[v] ? "" : " disabled"}>${{ political: "Political", physical: "Physical terrain", army: "Army", religion: "Religion" }[v]}</option>`).join("")}</select></label><nav aria-label="Map navigation"><button id="zoom-in" aria-label="Zoom in">+</button><button id="zoom-out" aria-label="Zoom out">−</button><button id="fit">Fit map</button><button id="export-png">Export PNG</button><button id="export-svg">Export SVG</button></nav></header><main><section id="stage" tabindex="0" aria-label="Interactive map. Drag to pan; scroll to zoom."></section><aside><section><h1>Explore the world</h1><p class="hint">Drag to pan · scroll to zoom · click a city or unit</p><div id="religion-controls" hidden><label for="religion-select">Highlight a religion</label><select id="religion-select"><option value="">All religions</option></select><p class="hint">Land colors show the majority religion of the city assigned that territory—not the empire’s religion. In the overview, circles show each city’s majority; colored diamonds show its holy religion, which may differ. Gray means unknown; cream means no majority; ochre means pantheon.</p><p class="hint">Click a colored territory or a religion below to show that faith’s follower share across empires. Clear the highlight to see all religions.</p><p id="religion-heatmap-hint" class="hint">Select a faith to see follower share, including minorities, as a heatmap.</p><h2>Religions</h2><p id="religion-coverage" class="hint"></p><div id="religion-summary"></div></div><label for="empire">Highlight an empire</label><select id="empire"><option value="">All empires</option></select><button id="clear-focus">Clear highlight</button></section><section><h2>Player groups</h2><div id="player-filters"></div><p class="hint">Human includes current human slots and retained player names after AI takeover. City-states and unknown groups stay visible.</p></section><section><h2>Layers</h2><div id="layers"></div></section><section><h2>Find a city</h2><input id="search" type="search" aria-label="City name" placeholder="Search cities…" autocomplete="off"><div id="search-results" aria-live="polite"></div></section><section id="details" aria-live="polite"><h2>Map details</h2><p>Select a city, army marker or territory.</p></section><section><h2 id="summary-title">Empires</h2><div id="summary"></div></section><details class="availability"><summary>Available views</summary><div id="availability"></div></details><p class="hint">Deterministic geography · current save data</p></aside></main><div id="status" class="visually-hidden" role="status"></div><noscript>${variants[mode]}</noscript>${Object.entries(
    variants,
  )
    .map(([view, svg]) => `<template id="map-${view}">${svg}</template>`)
    .join(
      "",
    )}<script id="world-data" type="application/json">${scriptJson(payload)}</script><script>${assets.js.replaceAll("</script", "<\\/script")}\nwindow.civmapperViewer=CivViewer.mountViewer(document);</script></body></html>`;
}
