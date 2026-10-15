"use strict";
import {
  cultureSources,
  culturePair,
  cultureTerritory,
  cultureLegend,
  cultureExports,
  cultureLegendSvg,
} from "../../core/src/culture_present.js";

import {
  religionName,
  religiousMajority,
  cityReligionName,
  religionSummary,
  religionPresence,
  religionHeatColor,
  religionColor,
} from "../../core/src/religion.js";
("use strict");
export function mountViewer(root: Document = document) {
  const document: any = root;
  const data = JSON.parse(document.getElementById("world-data").textContent);
  const world = data.world;
  const faithSelect = document.getElementById("religion-select");
  let selectedReligion: string | null = null;
  let activeMode: string | null = null;
  const faithSummary = religionSummary(world);
  const faithCities = new Map<string, any>(
    world.cities.map((c) => [`${c.owner}:${c.localId}`, c]),
  );
  const stage = document.getElementById("stage");
  const modeSelect = document.getElementById("mode");
  const empireSelect = document.getElementById("empire");
  const perspectiveSelect = document.getElementById("perspective");
  let perspective = data.perspective ?? null;
  for (const id of cultureSources(world)) {
    const option = document.createElement("option");
    option.value = String(id);
    option.textContent = data.labels[id] || `Player ${id}`;
    perspectiveSelect.append(option);
  }
  perspectiveSelect.value = perspective === null ? "" : String(perspective);
  const details = document.getElementById("details");
  const cityById = new Map<string, any>(
    world.cities.map((c) => [String(c.id), c]),
  );
  const civById = new Map<string, any>(
    world.civilizations.map((c) => [String(c.id), c]),
  );
  const military = new Map<string, any[]>();
  if (data.summary !== null) {
    for (const u of world.units || []) {
      if (
        u.isMilitary !== true ||
        civById.get(String(u.owner)).kind !== "major"
      )
        continue;
      const key = `${u.owner}:${u.x}:${u.y}`;
      if (!military.has(key)) military.set(key, []);
      military.get(key).push(u);
    }
  }
  const layers = {
    armies: ["Armies", ".army-marker"],
    cities: ["Cities", ".capital-marker,.city-marker"],
    religionTerritories: ["Assigned-city religion", ".religion-territory"],
    holyCities: ["Holy cities", ".holy-city-marker"],
    naturalWonders: ["Natural wonders", ".natural-wonder-marker"],
    hexGrid: ["Hex grid", ".hex-grid"],
    roads: ["Roads", ".route"],
    rivers: ["Rivers", ".river"],
    cityLabels: ["City labels", ".city-label,.city-state-label"],
    empireLabels: ["Empire labels", ".country"],
  };
  const checks: any = {};
  const playerGroups = { human: true, ai: true };
  let svg: any,
    base: any,
    view: any,
    selected = perspective === null ? "" : String(perspective),
    drag: any = null,
    ignoreClick = false;
  const label = (owner) => data.labels[String(owner)] || "Unknown empire";
  function knownAlly(civ) {
    if (civ?.kind !== "city-state" || civ.allianceKnown !== true) return null;
    const ally = civById.get(String(civ.ally));
    return ally?.kind === "major" ? ally : null;
  }
  function allianceRows(owner) {
    const civ = civById.get(String(owner));
    if (civ?.kind !== "city-state") return [];
    const ally = knownAlly(civ);
    const rows = [
      [
        "Allied empire",
        ally
          ? label(ally.id)
          : civ.allianceKnown === true && civ.ally === null
            ? "None"
            : "Unknown",
      ],
    ];
    if (
      ally &&
      civ.allianceSinceTurn !== undefined &&
      civ.allianceSinceTurn !== null
    )
      rows.push(["Allied since turn", civ.allianceSinceTurn]);
    return rows;
  }
  const religionLabel = (id) => religionName(world, id);
  const status = (text) => {
    document.getElementById("status").textContent = text;
  };
  function element(tag, text?: any, className?: string) {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (className) e.className = className;
    return e;
  }
  function showDetails(title, rows, items = []) {
    details.replaceChildren(element("h3", title));
    const dl = element("dl");
    for (const [key, value] of rows) {
      dl.append(element("dt", key), element("dd", String(value)));
    }
    details.append(dl);
    if (items.length) {
      const ul = element("ul");
      for (const item of items) ul.append(element("li", item));
      details.append(ul);
    }
  }
  function applyLayers() {
    for (const [key, [, selector]] of Object.entries(layers)) {
      const nodes = svg.querySelectorAll(selector);
      checks[key].disabled = !nodes.length;
      checks[key].parentElement.classList.toggle("unavailable", !nodes.length);
      for (const node of nodes)
        node.classList.toggle("layer-hidden", !data.layers[key]);
    }
  }
  function playerVisible(owner) {
    const control = data.playerControls[String(owner)];
    return !(control in playerGroups) || playerGroups[control];
  }
  function applyPlayerFilters() {
    for (const node of svg.querySelectorAll("[data-owner]")) {
      const excluded = !playerVisible(node.dataset.owner);
      const territory = node.hasAttribute("data-surface");
      node.classList.toggle("player-context", excluded && territory);
      node.classList.toggle("player-hidden", excluded && !territory);
    }
    for (const card of document.querySelectorAll(".empire-card"))
      card.classList.toggle(
        "player-hidden",
        !playerVisible(card.dataset.owner),
      );
    for (const option of empireSelect.options) {
      const excluded = option.value !== "" && !playerVisible(option.value);
      option.hidden = excluded;
      option.disabled = excluded;
    }
    if (selected !== "" && !playerVisible(selected)) focusEmpire("");
  }
  for (const [key, [name]] of Object.entries(layers)) {
    const wrapper = element("label");
    const check = element("input");
    check.type = "checkbox";
    check.checked = data.layers[key];
    check.dataset.layer = key;
    check.addEventListener("change", () => {
      data.layers[key] = check.checked;
      applyLayers();
    });
    checks[key] = check;
    wrapper.append(check, document.createTextNode(name));
    document.getElementById("layers").append(wrapper);
  }
  function focusEmpire(owner) {
    if (String(owner) !== "" && !playerVisible(owner)) return;
    selected = String(owner);
    empireSelect.value = selected;
    if (modeSelect.value === "culture") {
      perspective =
        selected !== "" && cultureSources(world).includes(Number(selected))
          ? Number(selected)
          : null;
      perspectiveSelect.value = perspective === null ? "" : String(perspective);
      applyCulture();
    }

    if (modeSelect.value === "religion" && selected !== "")
      selectedReligion = null;
    const allies = world.civilizations
      .filter((c) => selected !== "" && String(knownAlly(c)?.id) === selected)
      .sort((a, b) => label(a.id).localeCompare(label(b.id)) || a.id - b.id);
    const unknownAlliances =
      world.extraction.fields.cityStateAlliances === "unavailable" ||
      world.civilizations.some(
        (c) => c.kind === "city-state" && c.allianceKnown !== true,
      );
    const focusedOwners = new Set([
      selected,
      ...(modeSelect.value === "culture" ? [] : allies).map((c) =>
        String(c.id),
      ),
    ]);
    for (const node of svg.querySelectorAll("[data-owner]")) {
      node.classList.toggle(
        "focus-muted",
        modeSelect.value !== "culture" &&
          selected !== "" &&
          !focusedOwners.has(node.dataset.owner),
      );
    }
    for (const card of document.querySelectorAll(".empire-card")) {
      const active = card.dataset.owner === selected;
      card.classList.toggle("active", active);
      card.setAttribute("aria-pressed", String(active));
    }
    if (selected !== "") {
      const cities = world.cities.filter((c) => String(c.owner) === selected);
      const owned = world.tiles.filter(
        (t) => String(t.owner) === selected && t.owner !== null,
      ).length;
      const entry = (data.summary || []).find(
        (e) => String(e.owner) === selected,
      );
      const rows = [
        ["Cities", cities.length],
        ["Owned tiles", owned],
      ];
      rows.push(...allianceRows(selected));
      if (modeSelect.value === "culture")
        rows.push(...cultureRows(Number(selected)));
      if (civById.get(selected)?.kind === "major")
        rows.push([
          "Known city-state allies",
          allies.length
            ? allies.map((c) => label(c.id)).join(", ") +
              (unknownAlliances ? "; other alliances unknown" : "")
            : unknownAlliances
              ? "Unknown"
              : "None recorded",
        ]);
      if (entry) rows.push(["Military units", entry.total]);
      showDetails(
        label(selected),
        rows,
        entry
          ? Object.entries(entry.categories).map(
              ([r, n]) => `${data.roleLabels[r]}: ${n}`,
            )
          : [],
      );
    } else {
      for (const node of svg.querySelectorAll(".search-target"))
        node.classList.remove("search-target");
      const rows = [["View", modeSelect.selectedOptions[0].textContent]];
      if (modeSelect.value === "culture") {
        rows.push([
          "Showing",
          "Total accumulated tourism exported by each empire",
        ]);
        const ranked = world.civilizations
          .filter(
            (c) =>
              c.kind === "major" &&
              world.culture?.players.some(
                (p) => p.playerId === c.id && p.alive,
              ),
          )
          .map((c) => ({ id: c.id, total: cultureExports(world, c.id).total }))
          .sort((a, b) => (b.total ?? -1) - (a.total ?? -1) || a.id - b.id);
        rows.push(...ranked.map((c) => [label(c.id), c.total ?? "Unknown"]));
      }
      showDetails("Map details", rows);
    }
    applyReligionFocus();
    status(
      selected === ""
        ? "Empire highlight cleared"
        : `Highlighted ${label(selected)}`,
    );
  }
  const represented = new Set(world.cities.map((c) => String(c.owner)));
  for (const tile of world.tiles)
    if (tile.owner !== null) represented.add(String(tile.owner));
  for (const entry of data.summary || []) represented.add(String(entry.owner));
  for (const [control, name] of [
    ["human", "Human players"],
    ["ai", "AI players"],
  ]) {
    const count = world.civilizations.filter(
      (c) =>
        represented.has(String(c.id)) &&
        data.playerControls[String(c.id)] === control,
    ).length;
    const wrapper = element("label"),
      check = element("input");
    check.type = "checkbox";
    check.checked = true;
    check.disabled = count === 0;
    check.dataset.playerGroup = control;
    check.addEventListener("change", () => {
      playerGroups[control] = check.checked;
      applyPlayerFilters();
      findCities();
      status(`${name} ${check.checked ? "shown" : "hidden"}`);
    });
    wrapper.append(check, document.createTextNode(`${name} (${count})`));
    document.getElementById("player-filters").append(wrapper);
  }
  for (const civ of world.civilizations) {
    if (!represented.has(String(civ.id)) || civ.kind === "barbarian") continue;
    const option = element("option", label(civ.id));
    option.value = String(civ.id);
    empireSelect.append(option);
  }
  empireSelect.addEventListener("change", () =>
    focusEmpire(empireSelect.value),
  );
  document
    .getElementById("clear-focus")
    .addEventListener("click", () =>
      modeSelect.value === "religion" ? focusReligion(null) : focusEmpire(""),
    );
  function applyReligionFocus() {
    const active = modeSelect.value === "religion";
    document.getElementById("religion-controls").hidden = !active;
    faithSelect.value = selectedReligion ?? "";
    for (const card of document.querySelectorAll(".religion-card")) {
      const chosen = card.dataset.religionId === selectedReligion;
      card.classList.toggle("active", chosen);
      card.setAttribute("aria-pressed", String(chosen));
    }
    if (!active) return;
    const heat =
      selectedReligion !== null &&
      selectedReligion !== "unknown" &&
      Number(selectedReligion) >= 0;
    for (const node of svg.querySelectorAll("[data-religion-id]")) {
      if (node.classList.contains("religion-territory")) {
        if (!node.dataset.overviewTitle)
          node.dataset.overviewTitle = node.querySelector("title").textContent;
        node.setAttribute(
          "fill",
          heat
            ? religionHeatColor(
                Number(selectedReligion),
                religionPresence(
                  faithCities.get(node.dataset.religionCity),
                  Number(selectedReligion),
                ).share,
              )
            : religionColor(
                node.dataset.religionId === "unknown"
                  ? null
                  : Number(node.dataset.religionId),
              ),
        );
        if (heat) {
          const city = faithCities.get(node.dataset.religionCity);
          const presence = religionPresence(city, Number(selectedReligion));
          node.querySelector("title").textContent =
            `${city?.name ?? "Unassigned territory"} — ${religionLabel(Number(selectedReligion))}: ${presence.followers ?? "Unknown"} followers; ${presence.share === null ? "share unknown" : Math.round(presence.share * 100) + "% of city population"}. Shading uses saved city territory assignment.`;
        } else
          node.querySelector("title").textContent = node.dataset.overviewTitle;
      }
      if (selectedReligion === null) {
        if (selected === "" || !node.hasAttribute("data-owner"))
          node.classList.remove("focus-muted");
      } else if (
        heat &&
        (node.classList.contains("religion-territory") ||
          node.classList.contains("religion-marker"))
      ) {
        node.classList.remove("focus-muted");
        if (node.classList.contains("religion-marker")) {
          const city = cityById.get(node.dataset.cityId);
          const presence = religionPresence(city, Number(selectedReligion));
          const circle = node.querySelector("circle");
          const title = node.querySelector("title");
          if (!node.dataset.overviewTitle)
            node.dataset.overviewTitle = title.textContent;
          title.textContent = `${city?.name ?? "City"} — ${religionLabel(Number(selectedReligion))}: ${presence.followers ?? "Unknown"} followers; ${presence.share === null ? "share unknown" : Math.round(presence.share * 100) + "% of population"}. ${node.dataset.overviewTitle}`;
          node.setAttribute("aria-label", title.textContent);
          circle.setAttribute(
            "fill",
            religionHeatColor(Number(selectedReligion), presence.share),
          );
        }
      } else {
        const matches =
          node.dataset.religionId === selectedReligion ||
          (node.dataset.holyReligionIds ?? "")
            .split(",")
            .includes(selectedReligion);
        node.classList.toggle("focus-muted", !matches);
      }
      if (!heat && node.classList.contains("religion-marker"))
        node
          .querySelector("circle")
          .setAttribute(
            "fill",
            religionColor(
              node.dataset.religionId === "unknown"
                ? null
                : Number(node.dataset.religionId),
            ),
          );
    }
    const legend = svg.querySelector(".religion-heatmap-legend");
    if (legend) {
      const x = Number(legend.dataset.x),
        y = Number(legend.dataset.y);
      legend.replaceChildren();
      const text = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text",
      );
      text.setAttribute("x", String(x));
      text.setAttribute("y", String(y + 9));
      text.setAttribute("font-size", "9");
      text.textContent = heat
        ? `${religionLabel(Number(selectedReligion))} — followers / city population; pale = 0%, gray = unknown. Circles show follower share; holy diamonds keep their faith colors.`
        : "Overview: assigned-city majority colors. Select a religion for follower share.";
      legend.append(text);
      if (heat)
        for (const [i, share] of [0, 0.25, 0.5, 0.75, 1].entries()) {
          const rect = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "rect",
          );
          rect.setAttribute("x", String(x + i * 58));
          rect.setAttribute("y", String(y + 12));
          rect.setAttribute("width", "10");
          rect.setAttribute("height", "6");
          rect.setAttribute(
            "fill",
            religionHeatColor(Number(selectedReligion), share),
          );
          const label = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "text",
          );
          label.setAttribute("x", String(x + i * 58 + 13));
          label.setAttribute("y", String(y + 18));
          label.setAttribute("font-size", "8");
          label.textContent = share * 100 + "%";
          legend.append(rect, label);
        }
    }
  }
  function focusReligion(id: string | null, contextOwner?: string) {
    if (
      id !== null &&
      !faithSummary.some((e) => String(e.id ?? "unknown") === id)
    )
      id = null;
    selectedReligion = null;
    focusEmpire("");
    selectedReligion = id;
    applyReligionFocus();
    document.getElementById("religion-heatmap-hint").textContent =
      id !== null && id !== "unknown" && Number(id) >= 0
        ? "Heatmap: stronger color means a larger share of city population follows the selected religion. Minority followers are included. Territory shading uses saved city assignments; it is not independently saved plot religion."
        : "Overview: colors show assigned-city majority religion. Select a faith to see its followers, including minorities, as a heatmap.";
    if (id === null) {
      showDetails(
        "Religious overview",
        [
          ["Showing", "All known religions across civilization borders"],
          [
            "City religion known",
            `${world.cities.filter((c) => c.religionKnown === true).length}/${world.cities.length}`,
          ],
        ],
        [
          "Territory color = assigned city’s majority",
          "Circle = current majority; diamond = holy religion",
          "Follower totals count only cities with decoded religion records",
        ],
      );
    } else {
      const entry = faithSummary.find((e) => String(e.id ?? "unknown") === id);
      if (entry)
        showDetails(entry.name, [
          ...(contextOwner !== undefined && civById.has(String(contextOwner))
            ? [
                ["Territory owner", label(contextOwner)],
                ...allianceRows(contextOwner),
              ]
            : []),
          [
            id === "unknown"
              ? "Cities with unknown religion"
              : id === "-1"
                ? "Cities without a majority"
                : "Majority cities",
            entry.majorityCities,
          ],
          [
            id === "-1" ? "Known unaffiliated followers" : "Known followers",
            entry.followers ?? "Unknown",
          ],
          [
            "Present in cities",
            id === "unknown" ? "Unknown" : entry.presentCities,
          ],
          [
            "Holy cities",
            entry.holyCities.length
              ? entry.holyCities.map((c) => c.name).join(", ")
              : "None recorded",
          ],
        ]);
    }
    status(
      id === null
        ? "Showing all religions"
        : `Religion highlighted: ${faithSummary.find((e) => String(e.id ?? "unknown") === id)?.name}`,
    );
  }
  faithSelect.addEventListener("change", () =>
    focusReligion(faithSelect.value || null),
  );
  document.getElementById("religion-coverage").textContent =
    `City religion known for ${world.cities.filter((c) => c.religionKnown === true).length}/${world.cities.length} cities. Counts cover all decoded cities, including city-states.`;
  for (const entry of faithSummary) {
    const id = String(entry.id ?? "unknown");
    const option = element("option", entry.name);
    option.value = id;
    faithSelect.append(option);
    const card = element("button");
    card.type = "button";
    card.className = "religion-card";
    card.dataset.religionId = id;
    card.setAttribute("aria-pressed", "false");
    const swatch = element("span");
    swatch.style.cssText = `display:inline-block;width:12px;height:12px;background:${entry.color};margin-right:6px;border:1px solid #292a28`;
    const title = element("strong", entry.name);
    card.append(swatch, title);
    card.append(
      element(
        "p",
        entry.id === null
          ? `${entry.majorityCities} cities with unknown religion`
          : `${entry.followers} known ${entry.id === -1 ? "unaffiliated " : ""}followers · ${entry.majorityCities} ${entry.id === -1 ? "cities without a majority" : "majority cities"} · ${entry.holyCities.length} holy cities`,
      ),
    );
    card.addEventListener("click", () =>
      focusReligion(selectedReligion === id ? null : id),
    );
    document.getElementById("religion-summary").append(card);
  }
  const entries =
    data.summary ||
    world.civilizations
      .filter((c) => c.kind === "major" && represented.has(String(c.id)))
      .map((c) => ({ owner: c.id }));
  if (data.summary !== null)
    document.getElementById("summary-title").textContent = "Military summary";
  for (const entry of entries) {
    const card = element("button", undefined, "empire-card");
    card.type = "button";
    card.dataset.owner = String(entry.owner);
    card.style.setProperty("--empire-color", data.colors[String(entry.owner)]);
    card.setAttribute("aria-pressed", "false");
    card.append(element("span", label(entry.owner), "empire-name"));
    const control = data.playerControls[String(entry.owner)];
    card.append(
      element(
        "span",
        control === "human"
          ? "Human player"
          : control === "ai"
            ? "AI player"
            : "Player control unknown",
        "empire-control",
      ),
    );
    card.append(
      element(
        "span",
        entry.total === undefined
          ? `${world.cities.filter((c) => c.owner === entry.owner).length} cities`
          : `${entry.total} military units`,
        "empire-total",
      ),
    );
    if (data.expandSummary && entry.categories) {
      const ul = element("ul", undefined, "empire-categories");
      for (const [role, count] of Object.entries(entry.categories))
        ul.append(element("li", `${data.roleLabels[role]}: ${count}`));
      if (!ul.children.length)
        ul.append(element("li", "No military units on plots"));
      card.append(ul);
    }
    card.addEventListener("click", () =>
      focusEmpire(selected === String(entry.owner) ? "" : entry.owner),
    );
    document.getElementById("summary").append(card);
  }
  const availability = document.getElementById("availability");
  for (const option of modeSelect.options) {
    const why = data.unavailable[option.value];
    availability.append(
      element("p", `${option.textContent}: ${why || "available"}`),
    );
  }
  if (world.source.kind === "synthetic")
    status("Synthetic demonstration, not parsed game data");
  function updateView() {
    svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
  }
  function point(clientX, clientY) {
    const p = svg.createSVGPoint();
    p.x = clientX;
    p.y = clientY;
    return p.matrixTransform(svg.getScreenCTM().inverse());
  }
  function zoom(factor, anchor?: any) {
    const p = anchor || { x: view.x + view.w / 2, y: view.y + view.h / 2 };
    const w = Math.max(base.w / 32, Math.min(base.w * 1.5, view.w * factor));
    const ratio = w / view.w;
    view = {
      x: p.x - (p.x - view.x) * ratio,
      y: p.y - (p.y - view.y) * ratio,
      w,
      h: view.h * ratio,
    };
    updateView();
  }
  function fit() {
    view = { ...base };
    updateView();
    status("Map fitted to window");
  }
  function cultureRows(target) {
    if (civById.get(String(target))?.kind !== "major")
      return [["Tourism influence", "Not a tourism target"]];

    if (perspective === null) {
      const exports = cultureExports(world, target);
      return [
        ["Total accumulated tourism exported", exports.total ?? "Unknown"],
        ["Target totals known", `${exports.knownTargets}/${exports.targets}`],
      ];
    }
    if (target === perspective) {
      const targets = (world.culture?.players ?? [])
        .filter((p) => p.alive && p.playerId !== perspective)
        .map((p) => ({ p, pair: culturePair(world, perspective, p.playerId) }))
        .sort(
          (a, b) =>
            (b.pair.influence ?? -1) - (a.pair.influence ?? -1) ||
            a.p.playerId - b.p.playerId,
        );
      return [
        ["Showing", "Outgoing accumulated tourism influence"],
        ...targets.map(({ p, pair }) => [
          label(p.playerId),
          pair.influence === null
            ? "Unknown"
            : `${pair.influence} accumulated tourism · ${pair.percent === null ? "Unknown" : pair.percent + "%"} of lifetime culture`,
        ]),
      ];
    }
    const pair = culturePair(world, perspective, target);
    return [
      ["Influence from", label(perspective)],
      ["Accumulated tourism", pair.influence ?? "Unknown"],
      ["Target lifetime culture", pair.lifetime ?? "Unknown"],
      [
        "Influence / lifetime culture",
        pair.percent === null ? "Unknown" : `${pair.percent}%`,
      ],
      [
        "Contact",
        pair.contact === null ? "Unknown" : pair.contact ? "Met" : "Unmet",
      ],
      [
        "Game influence level",
        pair.level ?? (pair.contact === false ? "Unmet" : "Unavailable"),
      ],
    ];
  }
  function applyCulture() {
    document.getElementById("culture-controls").hidden =
      modeSelect.value !== "culture";
    if (modeSelect.value !== "culture") return;
    for (const node of svg.querySelectorAll(
      'path[data-surface="land"][data-owner]',
    )) {
      const owner =
        node.dataset.owner === "unowned" ? null : Number(node.dataset.owner);
      const territory = cultureTerritory(world, perspective, owner);
      node.setAttribute("fill", territory.fill);
      const isSource = perspective !== null && owner === perspective;
      node.dataset.tourismRole = isSource ? "source" : "target";
      for (const [attribute, value] of Object.entries({
        stroke: "#252525",
        "stroke-width": "2.5",
        "stroke-dasharray": "6 3",
      })) {
        if (isSource) node.setAttribute(attribute, value);
        else node.removeAttribute(attribute);
      }
      node.querySelector("title").textContent = territory.description;
    }
    const legend = svg.querySelector(".culture-legend");
    if (legend)
      legend.innerHTML = cultureLegendSvg(
        world,
        perspective,
        Number(legend.dataset.x),
        Number(legend.dataset.y),
        Number(legend.dataset.width),
      );
    document.querySelector('label[for="empire"]').textContent =
      "Select an empire";
    document.getElementById("clear-focus").textContent = "Show overview";
    svg.setAttribute("aria-label", cultureLegend(world, perspective));
  }
  perspectiveSelect.addEventListener("change", () => {
    focusEmpire(perspectiveSelect.value);
    status(
      perspective === null
        ? "Accumulated tourism overview"
        : `Influence from ${label(perspective)}`,
    );
  });
  function setMode(mode) {
    const previousMode = activeMode;
    const previousReligion = selectedReligion;
    const template = document.getElementById(`map-${mode}`);
    if (!template) return;
    const previous =
      view && base
        ? { x: view.x / base.w, y: view.y / base.h, w: view.w / base.w }
        : null;
    stage.style.backgroundColor = data.oceanColor;
    stage.replaceChildren(template.content.cloneNode(true));
    svg = stage.querySelector("svg");
    const b = svg.viewBox.baseVal;
    base = { x: b.x, y: b.y, w: b.width, h: b.height };
    view = previous
      ? {
          x: previous.x * base.w,
          y: previous.y * base.h,
          w: previous.w * base.w,
          h: previous.w * base.h,
        }
      : { ...base };
    updateView();
    modeSelect.value = mode;
    activeMode = mode;
    document.querySelector('label[for="empire"]').textContent =
      "Highlight an empire";
    document.getElementById("clear-focus").textContent = "Clear highlight";
    applyCulture();
    for (const node of svg.querySelectorAll(
      ".army-marker,.capital-marker,.city-marker,.holy-city-marker,.religion-legend",
    )) {
      node.setAttribute("tabindex", "0");
      node.setAttribute("role", "button");
      node.setAttribute("aria-label", node.querySelector("title").textContent);
    }
    applyLayers();
    applyPlayerFilters();
    if (
      mode === "culture" &&
      previousMode === "religion" &&
      perspective !== null &&
      playerVisible(perspective)
    )
      selected = String(perspective);
    if (
      mode === "religion" &&
      previousMode !== "religion" &&
      previousReligion !== null
    )
      focusReligion(previousReligion);
    else {
      focusEmpire(selected);
      if (mode === "religion" && selected === "")
        focusReligion(selectedReligion);
    }
    status(`${modeSelect.selectedOptions[0].textContent} view`);
  }
  modeSelect.addEventListener("change", () => setMode(modeSelect.value));
  document.getElementById("zoom-in").addEventListener("click", () => zoom(0.8));
  document
    .getElementById("zoom-out")
    .addEventListener("click", () => zoom(1.25));
  document.getElementById("fit").addEventListener("click", fit);
  document.getElementById("export-png").addEventListener("click", async () => {
    const button = document.getElementById("export-png");
    button.disabled = true;
    button.textContent = "Exporting…";
    let imageURL, downloadURL;
    try {
      // Snapshot the live SVG so mode, clipping, layers and player filters are
      // captured together. Viewer CSS lives outside SVG; bake it into the copy.
      const snapshot = svg.cloneNode(true),
        originals = [svg, ...svg.querySelectorAll("*")];
      const copies = [snapshot, ...snapshot.querySelectorAll("*")];
      const properties = [
        "display",
        "visibility",
        "opacity",
        "fill",
        "fill-opacity",
        "fill-rule",
        "stroke",
        "stroke-opacity",
        "stroke-width",
        "stroke-linecap",
        "stroke-linejoin",
        "stroke-dasharray",
        "stroke-dashoffset",
        "font-family",
        "font-size",
        "font-weight",
        "font-style",
        "letter-spacing",
        "text-anchor",
        "dominant-baseline",
        "paint-order",
        "filter",
      ];
      originals.forEach((node, index) => {
        const computed = getComputedStyle(node);
        for (const property of properties)
          copies[index].style.setProperty(
            property,
            computed
              .getPropertyValue(property)
              .replace(/url\(["']?[^)"']*#([^"')]+)["']?\)/g, "url(#$1)"),
          );
      });
      const bounds = stage.getBoundingClientRect();
      // Twice the visible resolution, bounded for browser canvas memory limits.
      const scale = Math.min(2, 4096 / Math.max(bounds.width, bounds.height));
      const width = Math.max(1, Math.round(bounds.width * scale));
      const height = Math.max(1, Math.round(bounds.height * scale));
      snapshot.setAttribute("width", width);
      snapshot.setAttribute("height", height);
      snapshot.style.width = width + "px";
      snapshot.style.height = height + "px";
      const exportMode = modeSelect.value;
      imageURL = URL.createObjectURL(
        new Blob([new XMLSerializer().serializeToString(snapshot)], {
          type: "image/svg+xml;charset=utf-8",
        }),
      );
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error("Could not rasterize the map."));
        image.src = imageURL;
      });
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context)
        throw new Error("Canvas export is unavailable in this browser.");
      context.fillStyle = getComputedStyle(stage).backgroundColor;
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      const blob: Blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) throw new Error("PNG encoding failed.");
      downloadURL = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadURL;
      link.download = `civmapper-turn-${world.game.turn ?? "unknown"}-${exportMode}${exportMode === "culture" ? (perspective === null ? "-overview" : `-from-${perspective}`) : ""}.png`;
      document.body.append(link);
      link.click();
      link.remove();
      status(`Exported ${exportMode} view as PNG (${width} × ${height}).`);
    } catch (error) {
      showDetails("PNG export failed", [["Reason", error.message]]);
      status("PNG export failed.");
    } finally {
      if (imageURL) URL.revokeObjectURL(imageURL);
      // Give the browser time to start reading the download before revocation.
      if (downloadURL)
        setTimeout(() => URL.revokeObjectURL(downloadURL), 10000);
      button.disabled = false;
      button.textContent = "Export PNG";
    }
  });

  stage.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      zoom(
        Math.exp(Math.max(-250, Math.min(250, event.deltaY)) * 0.002),
        point(event.clientX, event.clientY),
      );
    },
    { passive: false },
  );
  stage.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !svg) return;
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      view: { ...view },
      matrix: svg.getScreenCTM().inverse(),
      moved: false,
    };
  });
  stage.addEventListener("pointermove", (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x,
      dy = event.clientY - drag.y;
    if (Math.hypot(dx, dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    if (!stage.hasPointerCapture(event.pointerId))
      stage.setPointerCapture(event.pointerId);
    stage.classList.add("dragging");
    view = {
      ...drag.view,
      x: drag.view.x - dx * drag.matrix.a - dy * drag.matrix.c,
      y: drag.view.y - dx * drag.matrix.b - dy * drag.matrix.d,
    };
    updateView();
  });
  function endDrag(event) {
    if (!drag || drag.id !== event.pointerId) return;
    ignoreClick = event.type === "pointerup" && drag.moved;
    if (stage.hasPointerCapture(event.pointerId))
      stage.releasePointerCapture(event.pointerId);
    drag = null;
    stage.classList.remove("dragging");
  }
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);
  function showCity(city, navigate = false) {
    if (modeSelect.value === "religion")
      focusReligion(
        city.religionKnown === true
          ? String(religiousMajority(city.religions))
          : "unknown",
      );
    else focusEmpire(city.owner);
    if (navigate) {
      data.layers.cities = true;
      checks.cities.checked = true;
      applyLayers();
      const marker: any = Array.from<any>(
        svg.querySelectorAll(".capital-marker,.city-marker"),
      ).find((n) => n.dataset.cityId === String(city.id));
      if (marker) {
        const box = marker.getBBox(),
          cx = box.x + box.width / 2,
          cy = box.y + box.height / 2;
        const w = Math.min(view.w, Math.max(160, base.w / 4));
        const h = (w * base.h) / base.w;
        view = { x: cx - w / 2, y: cy - h / 2, w, h };
        updateView();
      }
      for (const node of svg.querySelectorAll("[data-city-id]"))
        node.classList.toggle(
          "search-target",
          node.dataset.cityId === String(city.id),
        );
    }
    const rows = [
      ["Empire", label(city.owner)],
      ["Position", `(${city.x}, ${city.y})`],
    ];
    rows.push(...allianceRows(city.owner));
    if (modeSelect.value === "culture") rows.push(...cultureRows(city.owner));
    if (city.capital === true)
      rows.push([
        "Capital",
        civById.get(String(city.owner)).kind === "city-state"
          ? "City-state"
          : "Empire",
      ]);
    if (city.population !== undefined && city.population !== null)
      rows.push(["Population", city.population]);
    rows.push([
      "Religion",
      city.religionKnown === true ? cityReligionName(world, city) : "Unknown",
    ]);
    if (city.religionKnown === true) {
      const holy = city.religions.filter((r) => r.holyCity);
      rows.push([
        "Holy city",
        holy.length
          ? holy.map((r) => religionLabel(r.religionId)).join(", ")
          : "No",
      ]);
    }
    showDetails(
      city.name,
      rows,
      city.religionKnown === true
        ? city.religions.map(
            (r) =>
              `${r.religionId === -1 ? "Unaffiliated" : religionLabel(r.religionId)}: ${r.followers} followers${city.population > 0 ? ` (${Math.round((r.followers / city.population) * 100)}%)` : ""}${r.holyCity ? " · holy city" : ""}`,
          )
        : [],
    );
    status(`Selected ${city.name}`);
  }
  function activate(target) {
    const wonder = target.closest(".natural-wonder-marker");
    if (wonder) {
      const tile = world.tiles.find(
        (t) =>
          t.x === Number(wonder.dataset.x) && t.y === Number(wonder.dataset.y),
      );
      if (tile?.naturalWonder) {
        showDetails(tile.naturalWonder.name || tile.naturalWonder.type, [
          ["Feature", "Natural wonder"],
          ["Location", `${tile.x}, ${tile.y}`],
          ["Territory", tile.owner === null ? "Unclaimed" : label(tile.owner)],
        ]);
        status(
          `Selected ${tile.naturalWonder.name || tile.naturalWonder.type}`,
        );
      }
      return;
    }
    if (modeSelect.value === "religion") {
      const holy = target.closest(".holy-city-marker");
      if (holy) {
        focusReligion(holy.dataset.holyReligionId);
        return;
      }
      const legend = target.closest(".religion-legend[data-religion-id]");
      if (legend) {
        focusReligion(legend.dataset.religionId);
        return;
      }
    }
    const marker = target.closest(".army-marker");
    if (marker) {
      const { owner, x, y } = marker.dataset;
      focusEmpire(owner);
      const counts = new Map();
      for (const u of military.get(`${owner}:${x}:${y}`) || []) {
        const name = u.name || u.type;
        counts.set(name, (counts.get(name) || 0) + 1);
      }
      showDetails(
        `${label(owner)} · military units`,
        [
          ["Position", `(${x}, ${y})`],
          ["Units", marker.dataset.count],
        ],
        Array.from(counts)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, n]) => `${name} × ${n}`),
      );
      return;
    }
    const cityNode = target.closest("[data-city-id]");
    if (cityNode) {
      showCity(cityById.get(cityNode.dataset.cityId));
      return;
    }
    if (modeSelect.value === "religion") {
      const territory = target.closest(".religion-territory[data-religion-id]");
      if (territory)
        focusReligion(territory.dataset.religionId, territory.dataset.owner);
      else {
        const owner = target.closest("[data-owner]");
        if (owner && civById.has(owner.dataset.owner))
          focusEmpire(owner.dataset.owner);
        else focusReligion(null);
      }
      return;
    }
    const ownerNode = target.closest("[data-owner]");
    if (ownerNode && civById.has(ownerNode.dataset.owner))
      focusEmpire(ownerNode.dataset.owner);
    else focusEmpire("");
  }
  stage.addEventListener("click", (event) => {
    if (ignoreClick) {
      ignoreClick = false;
      return;
    }
    activate(event.target);
  });
  stage.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      if (event.target.closest("[role=button]")) {
        event.preventDefault();
        activate(event.target);
      }
      return;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoom(0.8);
    }
    if (event.key === "-") {
      event.preventDefault();
      zoom(1.25);
    }
    if (event.key === "0") {
      event.preventDefault();
      fit();
    }
    if (event.key === "Escape")
      modeSelect.value === "religion" ? focusReligion(null) : focusEmpire("");
  });
  const search = document.getElementById("search"),
    results = document.getElementById("search-results");
  function findCities() {
    results.replaceChildren();
    const query = search.value.trim().toLocaleLowerCase();
    if (!query) return;
    const matches = world.cities
      .filter(
        (c) =>
          playerVisible(c.owner) && c.name.toLocaleLowerCase().includes(query),
      )
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name) ||
          String(a.id).localeCompare(String(b.id)),
      );
    if (!matches.length) {
      results.append(element("p", "No matching visible cities.", "hint"));
      return;
    }
    for (const city of matches.slice(0, 30)) {
      const button = element(
        "button",
        `${city.name} · ${label(city.owner)}`,
        "result",
      );
      button.addEventListener("click", () => showCity(city, true));
      results.append(button);
    }
    if (matches.length > 30)
      results.append(
        element(
          "p",
          "Showing 30 results; type more to narrow the search.",
          "hint",
        ),
      );
  }
  search.addEventListener("input", findCities);
  search.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      const first = results.querySelector("button");
      if (first) {
        event.preventDefault();
        first.click();
      }
    }
  });
  document.getElementById("export-svg")?.addEventListener("click", () => {
    const copy = svg.cloneNode(true),
      nodes = [svg, ...svg.querySelectorAll("*")],
      copies = [copy, ...copy.querySelectorAll("*")];
    nodes.forEach((node, i) => {
      const style = getComputedStyle(node);
      for (const key of ["display", "opacity", "filter"])
        copies[i].style.setProperty(key, style.getPropertyValue(key));
    });
    const url = URL.createObjectURL(
      new Blob([new XMLSerializer().serializeToString(copy)], {
        type: "image/svg+xml",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `civmapper-turn-${world.game.turn ?? "unknown"}-${modeSelect.value}${modeSelect.value === "culture" ? (perspective === null ? "-overview" : `-from-${perspective}`) : ""}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  });
  setMode(data.mode);
  return {
    getState: () => ({
      mode: modeSelect.value,
      perspective,
      layers: { ...data.layers },
      playerGroups: { ...playerGroups },
      selected,
      selectedReligion,
      view: { ...view },
    }),
    restoreState: (state) => {
      if (
        state.perspective === null ||
        cultureSources(world).includes(state.perspective)
      ) {
        perspective = state.perspective;
        perspectiveSelect.value =
          perspective === null ? "" : String(perspective);
      }
      Object.assign(data.layers, state.layers);
      for (const [key, check] of Object.entries(checks))
        (check as any).checked = data.layers[key];
      Object.assign(playerGroups, state.playerGroups);
      for (const check of document.querySelectorAll("[data-player-group]"))
        check.checked = playerGroups[check.dataset.playerGroup];
      if (document.getElementById(`map-${state.mode}`)) setMode(state.mode);
      applyLayers();
      applyPlayerFilters();
      if (state.view) {
        view = { ...state.view };
        updateView();
      }
      focusEmpire(state.selected ?? "");
      if (modeSelect.value === "religion" && !state.selected)
        focusReligion(state.selectedReligion ?? null);
    },
  };
}
