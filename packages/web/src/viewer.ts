"use strict";
export function mountViewer(root: Document = document) {
  const document: any = root;
  const data = JSON.parse(document.getElementById("world-data").textContent);
  const world = data.world;
  const stage = document.getElementById("stage");
  const modeSelect = document.getElementById("mode");
  const empireSelect = document.getElementById("empire");
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
    selected = "",
    drag: any = null,
    ignoreClick = false;
  const label = (owner) => data.labels[String(owner)] || "Unknown empire";
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
    for (const node of svg.querySelectorAll("[data-owner]")) {
      node.classList.toggle(
        "focus-muted",
        selected !== "" && node.dataset.owner !== selected,
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
      showDetails("Map details", [
        ["View", modeSelect.selectedOptions[0].textContent],
      ]);
    }
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
    .addEventListener("click", () => focusEmpire(""));
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
  function setMode(mode) {
    const template = document.getElementById(`map-${mode}`);
    if (!template) return;
    const previous =
      view && base
        ? { x: view.x / base.w, y: view.y / base.h, w: view.w / base.w }
        : null;
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
    for (const node of svg.querySelectorAll(
      ".army-marker,.capital-marker,.city-marker",
    )) {
      node.setAttribute("tabindex", "0");
      node.setAttribute("role", "button");
      node.setAttribute("aria-label", node.querySelector("title").textContent);
    }
    applyLayers();
    applyPlayerFilters();
    focusEmpire(selected);
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
            computed.getPropertyValue(property),
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
      link.download = `civmapper-turn-${world.game.turn ?? "unknown"}-${exportMode}.png`;
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
    focusEmpire(city.owner);
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
    if (city.capital === true)
      rows.push([
        "Capital",
        civById.get(String(city.owner)).kind === "city-state"
          ? "City-state"
          : "Empire",
      ]);
    if (city.population !== undefined && city.population !== null)
      rows.push(["Population", city.population]);
    showDetails(city.name, rows);
    status(`Selected ${city.name}`);
  }
  function activate(target) {
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
    if (event.key === "Escape") focusEmpire("");
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
    a.download = `civmapper-turn-${world.game.turn ?? "unknown"}-${modeSelect.value}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  });
  setMode(data.mode);
  return {
    getState: () => ({
      mode: modeSelect.value,
      layers: { ...data.layers },
      playerGroups: { ...playerGroups },
      selected,
      view: { ...view },
    }),
    restoreState: (state) => {
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
    },
  };
}
