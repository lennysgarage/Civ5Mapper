import "./app.css";
import viewerCss from "../../../assets/viewer.css?raw";
import viewerJs from "../../../dist/viewer/viewer.js?raw";
import { renderHtml } from "../../core/src/html.js";
import { STYLES } from "../../core/src/styles.js";
import { renderSvg, captionText, type World } from "../../core/src/index.js";
import { metadataNeeds } from "../../core/src/browser_metadata.js";
const el = (id: string) => document.getElementById(id) as any;
const assets = { css: viewerCss, js: viewerJs };
let session: any = null;
let worker: Worker | null = null,
  sequence = 0,
  active = 0,
  busy = false,
  loadingFileName = "",
  currentWorld: World | null = null,
  currentReplay: any = null,
  turns: number[] = [],
  notes: any[] = [],
  timer: any = null;
const assetBase = new URL(import.meta.env.BASE_URL, location.href).href;
function createWorker() {
  return new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module",
  });
}
function message(text: string) {
  el("message").textContent = text;
  el("loading-stage").textContent = text;
  el("upload-progress").setAttribute("aria-valuetext", text);
}
function showUpload(name: string, title = "Opening your save") {
  loadingFileName = name;
  el("loading-file").textContent = name;
  el("loading-title").textContent = title;
}
function setBusy(value: boolean) {
  busy = value;
  el("loading-panel").hidden = !value || !loadingFileName;
  el("loading-panel").classList.toggle("with-map", Boolean(currentWorld));
  el("welcome").hidden =
    Boolean(currentWorld) || (value && Boolean(loadingFileName));
  if (!value) loadingFileName = "";
  el("loading").hidden = !value;
  el("drop").setAttribute("aria-busy", String(value));
  el("cancel").hidden = !value;
  for (const id of [
    "save",
    "load-replay",
    "download-gif",
    "play",
    "next",
    "previous",
    "turn",
    "ruleset",
    "localization",
    "bundled-metadata",
  ])
    el(id).disabled = value;
}
function stop() {
  clearInterval(timer);
  timer = null;
  el("play").textContent = "Play";
}
function resetWorker() {
  worker?.terminate();
  worker = createWorker();
  worker.onmessage = receive;
  worker.onerror = (event) => {
    setBusy(false);
    stop();
    message("Worker failed: " + event.message);
  };
  if (session)
    worker.postMessage({ id: 0, action: "restore", inputs: session });
}
async function file(id: string) {
  const f = el(id).files[0];
  if (!f) return null;
  if (f.size > 64 * 1024 * 1024)
    throw new Error("Files must be no larger than 64 MiB");
  return { name: f.name, bytes: await f.arrayBuffer() };
}
async function inputs() {
  return {
    assetBase,
    ruleset: await file("ruleset"),
    localization: await file("localization"),
    playerNames: el("player-names").checked,
    bundledMetadata: el("bundled-metadata").checked,
  };
}
function request(action: string, inputs: any) {
  setBusy(true);
  message("Loading…");
  active = ++sequence;
  worker.postMessage({ id: active, action, inputs });
}
function mount(
  world: World,
  resetView = false,
  selectedMode?: string,
  ready?: () => void,
  resetLayers = false,
) {
  const style = {
    ...STYLES[el("style").value],
    armyIcons: "detailed",
    showMilitarySummary: true,
  };
  let documentText = renderHtml(
    world,
    assets,
    style,
    el("playback").hidden ? "political" : el("replay-mode").value,
  );
  if (currentReplay && el("captions").checked) {
    const svg = renderSvg(world, STYLES[el("style").value], {
      mode: el("replay-mode").value,
      captions: captionText(notes, world, style),
      interactive: true,
    });
    documentText = documentText.replace(
      new RegExp(
        `(<template id="map-${el("replay-mode").value}">)[\\s\\S]*?(</template>)`,
      ),
      (_all, a, b) => a + svg + b,
    );
  }
  const viewer = el("viewer");
  const previous = resetView
    ? null
    : viewer.contentWindow?.civmapperViewer?.getState();
  if (previous && resetLayers) delete previous.layers;
  if (previous && selectedMode) previous.mode = selectedMode;
  el("replay-mode").querySelector('[value="physical"]').disabled =
    !world.tiles.every(
      (t) => typeof t.terrain === "string" && t.terrain.length > 0,
    );
  viewer.onload = () => {
    if (previous) viewer.contentWindow.civmapperViewer?.restoreState(previous);
    const child = viewer.contentWindow;
    child.addEventListener("dragover", (e) => e.preventDefault());
    child.addEventListener("drop", (e) => {
      e.preventDefault();
      loadSave(e.dataTransfer.files[0]);
    });
    ready?.();
  };
  viewer.srcdoc = documentText;
  viewer.hidden = false;
  el("welcome").hidden = true;
  el("downloads").hidden = false;
  el("download-replay").hidden = !currentReplay;
  el("download-gif").hidden = !currentReplay;
}
async function receive(event: MessageEvent) {
  const data = event.data;
  if (data.id !== active) return;
  if (data.progress) {
    message(data.progress);
    return;
  }
  if (data.error) {
    setBusy(false);
    stop();
    message(data.error);
    return;
  }
  if (data.download) {
    setBusy(false);
    download(
      new Uint8Array(data.download),
      "civmapper-replay.gif",
      "image/gif",
    );
    message("GIF exported.");
    return;
  }
  message("Drawing map…");
  // Paint the current stage before the synchronous SVG rendering work starts.
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
  if (data.id !== active) return;
  const previous = { world: currentWorld, replay: currentReplay, turns, notes };
  try {
    if (data.replay) {
      currentReplay = data.replay;
      turns = data.turns;
      el("playback").hidden = false;
      el("turn").max = turns.length - 1;
      el("turn").value = 0;
    } else if (!("notes" in data)) {
      currentReplay = null;
      el("playback").hidden = true;
    }
    notes = data.notes ?? [];
    mount(data.world, data.resetView, undefined, () => {
      if (data.id !== active) return;
      setBusy(false);
      message(
        `Turn ${data.world.game.turn} · ${data.world.tiles.length} tiles · ${data.world.cities.length} cities`,
      );
    });
    currentWorld = data.world;
    if (data.session) session = data.session;
    else if (session) session.world = currentWorld;
    el("turn-label").textContent = `Turn ${currentWorld.game.turn}`;
    const needs = metadataNeeds(currentWorld);
    const problems = [
      needs.cityNames ? `${needs.cityNames} city names need localization` : "",
      needs.terrain ? "Physical view needs matching terrain metadata" : "",
      needs.military ? "Army view needs matching unit metadata" : "",
      ...currentWorld.extraction.warnings.filter((w) =>
        /Bundled metadata unavailable|Army view unavailable/.test(w),
      ),
    ].filter(Boolean);
    el("metadata-notice").hidden = !problems.length;
    el("metadata-message").textContent = problems.join(". ");
  } catch (e) {
    setBusy(false);
    currentWorld = previous.world;
    currentReplay = previous.replay;
    turns = previous.turns;
    notes = previous.notes;
    el("playback").hidden = !currentReplay;
    resetWorker();
    message((e as Error).message);
    stop();
  }
}
async function loadSave(selected?: File) {
  if (busy) return;
  const f = selected ?? el("save").files[0];
  if (!f) return;
  if (!/\.(civ5save|json)$/i.test(f.name)) {
    message("Choose a .Civ5Save or normalized JSON file.");
    return;
  }
  if (f.size > 64 * 1024 * 1024) {
    message("Save exceeds 64 MiB");
    return;
  }
  stop();
  showUpload(f.name);
  const token = (active = ++sequence);
  setBusy(true);
  message("Reading files…");
  try {
    const i = await inputs(),
      bytes = await f.arrayBuffer();
    if (token !== active) return;
    request("load-save", { ...i, file: { name: f.name, bytes } });
  } catch (e) {
    if (token === active) {
      setBusy(false);
      message((e as Error).message);
    }
  }
}
function download(data: any, name: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([data], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function go(index: number) {
  if (busy) return;
  index = Math.max(0, Math.min(turns.length - 1, index));
  el("turn").value = index;
  request("replay-frame", { index });
}
resetWorker();
el("save").addEventListener("change", () => loadSave());
el("cancel").onclick = () => {
  active = ++sequence;
  stop();
  resetWorker();
  setBusy(false);
  message("Cancelled. You can open another file.");
};
el("cancel-upload").onclick = () => el("cancel").click();
el("load-replay").onclick = async () => {
  if (busy) return;
  stop();
  showUpload(el("replay").files[0]?.name ?? "", "Opening your replay");
  const token = (active = ++sequence);
  setBusy(true);
  message("Reading replay inputs…");
  try {
    const f = await file("replay");
    if (!f) throw new Error("Choose a replay or save file.");
    const n = Number(el("maxturns").value);
    if (!Number.isInteger(n) || n < 0)
      throw new Error("Eventful turn limit must be a nonnegative integer");
    const i = await inputs();
    const base = await file("base"),
      ownerMap = await file("owner-map");
    if (token !== active) return;
    request("load-replay", {
      ...i,
      file: f,
      base,
      ownerMap,
      maxturns: n,
      wrapX: el("wrap").value === "auto" ? null : el("wrap").value === "true",
    });
  } catch (e) {
    if (token === active) {
      setBusy(false);
      message((e as Error).message);
    }
  }
};
el("style").onchange = () => {
  if (currentWorld && !busy)
    mount(currentWorld, false, undefined, undefined, true);
};
el("replay-mode").onchange = () => {
  if (currentReplay && !busy)
    try {
      mount(currentWorld, false, el("replay-mode").value);
    } catch (e) {
      message((e as Error).message);
    }
};
el("captions").onchange = () => {
  if (currentReplay && !busy) mount(currentWorld);
};
el("previous").onclick = () => {
  stop();
  go(Number(el("turn").value) - 1);
};
el("next").onclick = () => {
  stop();
  go(Number(el("turn").value) + 1);
};
el("turn").oninput = () => {
  stop();
  go(Number(el("turn").value));
};
el("play").onclick = () => {
  if (timer) {
    stop();
    return;
  }
  const duration = Number(el("duration").value);
  if (!Number.isInteger(duration) || duration < 10 || duration > 60000) {
    message("Frame duration must be 10–60000 ms");
    return;
  }
  el("play").textContent = "Pause";
  timer = setInterval(() => {
    if (busy) return;
    const n = Number(el("turn").value) + 1;
    if (n >= turns.length) {
      stop();
      return;
    }
    go(n);
  }, duration);
};
el("download-json").onclick = () => {
  if (currentWorld)
    download(JSON.stringify(currentWorld, null, 2), "civmapper-world.json");
};
el("download-replay").onclick = () => {
  if (currentReplay)
    download(JSON.stringify(currentReplay, null, 2), "civmapper-replay.json");
};
el("configure-metadata").onclick = () => {
  el("inputs").open = true;
  el("ruleset").focus();
};
let metadataTimer: any;
for (const id of ["ruleset", "localization", "bundled-metadata"])
  el(id).addEventListener("change", () => {
    clearTimeout(metadataTimer);
    if (!currentWorld) return;
    metadataTimer = setTimeout(async () => {
      if (busy) return;
      stop();
      const token = (active = ++sequence);
      setBusy(true);
      try {
        const i = await inputs();
        if (token === active) request("update-metadata", i);
      } catch (error) {
        if (token === active) {
          setBusy(false);
          message((error as Error).message);
        }
      }
    }, 250);
  });
el("download-gif").onclick = () => {
  if (busy) return;
  stop();
  request("export-gif", {
    assetBase,
    style: el("style").value,
    mode: el("replay-mode").value,
    captions: el("captions").checked,
    duration: Number(el("duration").value),
    scale: Number(el("gif-scale").value),
  });
};
let depth = 0;
window.addEventListener("dragenter", (e) => {
  e.preventDefault();
  depth++;
  el("drop").classList.add("dropping");
});
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("dragleave", (e) => {
  e.preventDefault();
  if (--depth <= 0) {
    depth = 0;
    el("drop").classList.remove("dropping");
  }
});
window.addEventListener("drop", (e) => {
  e.preventDefault();
  depth = 0;
  el("drop").classList.remove("dropping");
  loadSave(e.dataTransfer.files[0]);
});
document.documentElement.dataset.ready = "true";
