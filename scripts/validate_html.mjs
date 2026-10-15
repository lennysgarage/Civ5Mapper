// Browser acceptance check. Node 22+ and a Chromium executable; no npm packages.
// node scripts/validate_html.mjs map.html /path/to/chrome [report.json]
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";

const [file, browser, reportPath, save, ruleset, localization] =
  process.argv.slice(2);
const serverURL =
  /^http:\/\/(127\.0\.0\.1|localhost):[0-9]+(?:\/[^?#]*)?\/$/.test(file || "");
let contextId;
const contexts = new Map();
if (!file || !browser)
  throw new Error(
    "Usage: node scripts/validate_html.mjs map.html /path/to/chrome [report.json]",
  );
if (reportPath && resolve(reportPath) === resolve(file))
  throw new Error("Report must differ from input HTML");
const profile = await mkdtemp(join(tmpdir(), "civmapper-browser-"));
const chrome = spawn(
  browser,
  [
    "--headless",
    "--no-sandbox",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);
let socket;
const results = [];
const errors = [];
const requests = [];
try {
  const endpoint = await new Promise((resolve, reject) => {
    let stderr = "";
    const timeout = setTimeout(
      () => reject(new Error("Chromium startup timed out")),
      15000,
    );
    chrome.stderr.on("data", (chunk) => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    chrome.on("error", reject);
    chrome.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Chromium exited (${code}): ${stderr.slice(-1000)}`));
    });
  });
  const endpointURL = new URL(endpoint);
  const targets = await (
    await fetch(`http://${endpointURL.host}/json/list`)
  ).json();
  socket = new WebSocket(
    targets.find((t) => t.type === "page").webSocketDebuggerUrl,
  );
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let seq = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const entry = pending.get(message.id);
      if (entry) {
        pending.delete(message.id);
        clearTimeout(entry.timeout);
        message.error
          ? entry.reject(new Error(JSON.stringify(message.error)))
          : entry.resolve(message.result);
      }
    }
    if (message.method === "Runtime.executionContextCreated") {
      const c = message.params.context;
      if (c.auxData?.isDefault) contexts.set(c.auxData.frameId, c.id);
    }
    if (message.method === "Runtime.exceptionThrown")
      errors.push(message.params.exceptionDetails);
    if (message.method === "Network.requestWillBeSent")
      requests.push(message.params.request.url);
  });
  function call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 10000);
      pending.set(id, { resolve, reject, timeout });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await call("Runtime.evaluate", {
      expression,
      contextId,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails)
      throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  function passed(name) {
    results.push(name);
    process.stdout.write(`PASS ${name}\n`);
  }
  await call("Page.enable");
  await call("Runtime.enable");
  await call("Network.enable");
  if (!serverURL)
    await call("Network.setBlockedURLs", { urls: ["http://*", "https://*"] });
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 960,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await call("Page.navigate", {
    url: serverURL ? file : pathToFileURL(resolve(file)).href,
  });
  if (serverURL) {
    if (!save)
      throw new Error(
        "Server check requires a save file as the fourth argument",
      );
    for (let i = 0; i < 100; i++) {
      if (await evaluate('document.documentElement.dataset.ready==="true"'))
        break;
      if (i === 99)
        throw new Error(
          JSON.stringify({ message: "Browser app did not initialize", errors }),
        );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const { root } = await call("DOM.getDocument");
    for (const [id, input] of [
      ["ruleset", ruleset],
      ["localization", localization],
    ])
      if (input) {
        const { nodeId } = await call("DOM.querySelector", {
          nodeId: root.nodeId,
          selector: "#" + id,
        });
        await call("DOM.setFileInputFiles", {
          nodeId,
          files: [resolve(input)],
        });
      }
    const { nodeId } = await call("DOM.querySelector", {
      nodeId: root.nodeId,
      selector: "#save",
    });
    await call("DOM.setFileInputFiles", { nodeId, files: [resolve(save)] });
    const loadingStages = new Set();
    let loadingScreenshot = false;
    for (let i = 0; i < 900; i++) {
      const state = await evaluate(
        '(()=>{const spinner=document.querySelector("#loading");return{ready:Boolean(document.querySelector("#viewer").contentDocument?.querySelector("#stage svg")),busy:!document.querySelector("#cancel").hidden,spinner:!spinner.hidden&&getComputedStyle(spinner).display!=="none",ariaBusy:document.querySelector("#drop").getAttribute("aria-busy"),stage:document.querySelector("#message").textContent,uploadVisible:!document.querySelector("#loading-panel").hidden,filename:document.querySelector("#loading-file").textContent,uploadStage:document.querySelector("#loading-stage").textContent,welcomeHidden:document.querySelector("#welcome").hidden,progressVisible:getComputedStyle(document.querySelector("#upload-progress")).display!=="none"}})()',
      );
      if (state.busy) {
        assert.equal(
          state.spinner,
          true,
          "loading spinner remains visible while processing",
        );
        assert.equal(state.ariaBusy, "true");
        assert.equal(state.uploadVisible, true);
        assert.equal(state.filename, resolve(save).split(/[\\/]/).at(-1));
        assert.equal(state.uploadStage, state.stage);
        assert.equal(state.welcomeHidden, true);
        assert.equal(state.progressVisible, true);
        loadingStages.add(state.stage);
        if (reportPath && !loadingScreenshot && /Decoding/.test(state.stage)) {
          const screenshot = await call("Page.captureScreenshot", {
            format: "png",
          });
          await writeFile(
            reportPath + "-loading.png",
            Buffer.from(screenshot.data, "base64"),
          );
          loadingScreenshot = true;
        }
      }
      if (state.ready && !state.busy) {
        assert.equal(
          state.spinner,
          false,
          "loading spinner clears when the map is ready",
        );
        assert.equal(state.ariaBusy, "false");
        assert.equal(state.uploadVisible, false);
        break;
      }
      if (i === 899)
        throw new Error(
          JSON.stringify({
            message: await evaluate(
              'document.querySelector("#message").textContent',
            ),
            errors,
          }),
        );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(loadingStages.size > 0, "file loading displays a busy stage");
    if (/\.civ5save$/i.test(save))
      assert.ok([...loadingStages].some((s) => /Decoding save/.test(s)));
    passed(
      "loading spinner displays decoding stages and clears when the map is ready",
    );
    passed(
      "upload area shows the selected file, stage and progress bar instead of drop instructions",
    );
    assert.equal(
      await evaluate(
        "/Lekmod community|Python installation|No uploads, accounts/.test(document.body.textContent)",
      ),
      false,
    );
    await call("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    assert.equal(
      await evaluate(
        'getComputedStyle(document.querySelector("#loading")).animationName',
      ),
      "none",
    );
    assert.equal(
      await evaluate(
        'getComputedStyle(document.querySelector("#upload-progress span")).animationName',
      ),
      "none",
    );
    await call("Emulation.setEmulatedMedia", { features: [] });
    passed("loading spinner respects reduced-motion preferences");
    const { frameTree } = await call("Page.getFrameTree");
    contextId = contexts.get(frameTree.childFrames[0].frame.id);
    assert.ok(contextId, "iframe runtime context");
    passed("real save browser loading without uploads");
  }
  for (let i = 0; i < 100; i++) {
    if (await evaluate('Boolean(document.querySelector("#stage svg"))')) break;
    if (i === 99) throw new Error("Viewer did not initialize");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(errors.length, 0, JSON.stringify(errors));
  passed(
    serverURL ? "static app viewer initialization" : "file:// initialization",
  );
  const available = await evaluate(
    'Array.from(document.querySelector("#mode").options).filter(o=>!o.disabled).map(o=>o.value)',
  );
  const initial = await evaluate('document.querySelector("#mode").value');
  const capitalCounts = await evaluate(
    '({expected:JSON.parse(document.querySelector("#world-data").textContent).world.cities.filter(c=>c.capital===true).length,actual:document.querySelectorAll("#stage .capital-marker").length})',
  );
  assert.equal(capitalCounts.actual, capitalCounts.expected);
  passed("recorded current capitals receive capital markers");
  const naturalWonders = await evaluate(
    'JSON.parse(document.querySelector("#world-data").textContent).world.tiles.filter(t=>t.naturalWonder)',
  );
  if (naturalWonders.length) {
    for (const mode of available) {
      const markers = await evaluate(
        `(()=>{const mode=document.querySelector('#mode');mode.value=${JSON.stringify(mode)};mode.dispatchEvent(new Event('change'));return Array.from(document.querySelectorAll('#stage .natural-wonder-marker')).map(n=>({x:Number(n.dataset.x),y:Number(n.dataset.y),type:n.dataset.naturalWonder}));})()`,
      );
      assert.equal(markers.length, naturalWonders.length);
      assert.ok(
        markers.every((marker) =>
          naturalWonders.some(
            (tile) =>
              tile.x === marker.x &&
              tile.y === marker.y &&
              tile.naturalWonder.type === marker.type,
          ),
        ),
      );
    }
    const detail = await evaluate(
      `(()=>{document.querySelector('#stage .natural-wonder-marker').dispatchEvent(new MouseEvent('click',{bubbles:true}));return document.querySelector('#details').textContent;})()`,
    );
    assert.ok(detail.includes(naturalWonders[0].naturalWonder.name));
    assert.ok(detail.includes("Natural wonder"));
    await evaluate(
      'document.querySelector("[data-layer=naturalWonders]").click()',
    );
    assert.equal(
      await evaluate(
        'Array.from(document.querySelectorAll("#stage .natural-wonder-marker")).every(n=>n.classList.contains("layer-hidden"))',
      ),
      true,
    );
    await evaluate(
      'document.querySelector("[data-layer=naturalWonders]").click()',
    );
    await evaluate(
      `document.querySelector('#mode').value=${JSON.stringify(initial)};document.querySelector('#mode').dispatchEvent(new Event('change'));document.querySelector('#clear-focus').click()`,
    );
    passed(
      "recorded natural wonders appear in every available view with click details and a layer toggle",
    );
  }
  const alliances = await evaluate(`(()=>{
    const {world}=JSON.parse(document.querySelector('#world-data').textContent);
    return world.civilizations.filter(c=>c.kind==='city-state' && c.allianceKnown===true && c.ally!==null);
  })()`);
  for (const cityState of alliances) {
    for (const mode of available.filter((mode) => mode !== "culture")) {
      const result = await evaluate(`(()=>{
        const data=JSON.parse(document.querySelector('#world-data').textContent);
        const minor=${JSON.stringify(cityState)};
        const mode=document.querySelector('#mode');mode.value=${JSON.stringify(mode)};mode.dispatchEvent(new Event('change'));
        const select=document.querySelector('#empire');select.value=String(minor.ally);select.dispatchEvent(new Event('change'));
        const nodes=Array.from(document.querySelectorAll('#stage [data-owner]'));
        const allies=new Set(data.world.civilizations.filter(c=>c.kind==='city-state' && c.allianceKnown===true && c.ally===minor.ally).map(c=>String(c.id)));
        allies.add(String(minor.ally));
        return {matches:nodes.every(n=>n.classList.contains('focus-muted')===!allies.has(n.dataset.owner)),
          listed:document.querySelector('#details').textContent.includes(data.labels[String(minor.id)])};
      })()`);
      assert.equal(
        result.matches,
        true,
        "only empire and recorded allies stay highlighted",
      );
      assert.equal(result.listed, true, "details list the allied city-state");
    }
    const details = await evaluate(`(()=>{
      const data=JSON.parse(document.querySelector('#world-data').textContent);
      const minor=${JSON.stringify(cityState)};
      const node=document.querySelector('#stage [data-owner="'+minor.id+'"]');
      if(!node)return null;
      node.dispatchEvent(new MouseEvent('click',{bubbles:true}));
      const territory=document.querySelector('#details').textContent;
      const city=document.querySelector('#stage [data-owner="'+minor.id+'"][data-city-id]');
      city?.dispatchEvent(new MouseEvent('click',{bubbles:true}));
      return {territory,city:city?document.querySelector('#details').textContent:null,ally:data.labels[String(minor.ally)]};
    })()`);
    if (details) {
      assert.ok(
        details.territory.includes("Allied empire") &&
          details.territory.includes(details.ally),
      );
      if (details.city)
        assert.ok(
          details.city.includes("Allied empire") &&
            details.city.includes(details.ally),
        );
    }
  }
  if (alliances.length)
    passed(
      "recorded city-state allies highlight in political, physical and army views",
    );
  if (available.includes("culture")) {
    const result = await evaluate(`(async()=>{
      const data=JSON.parse(document.querySelector('#world-data').textContent);
      const mode=document.querySelector('#mode'); mode.value='culture';mode.dispatchEvent(new Event('change'));
      document.querySelector('#clear-focus').click();
      const select=document.querySelector('#perspective');
      const overview=select.value==='' && window.civmapperViewer.getState().perspective===null && document.querySelector('#stage .culture-legend').textContent.includes('overview');
      const overviewTotals=data.world.culture.players.filter(p=>p.alive).every(p=>{
        const targets=data.world.civilizations.filter(c=>c.kind==='major'&&c.id!==p.playerId);
        const total=targets.reduce((sum,c)=>sum+p.accumulatedInfluence[c.id],0);
        const path=document.querySelector('#stage path[data-surface="land"][data-owner="'+p.playerId+'"]');
        return !path||path.querySelector('title').textContent.includes('Total accumulated tourism exported: '+total);
      });
      const source=data.world.culture.players.find(p=>p.alive&&document.querySelector('#stage path[data-surface="land"][data-owner="'+p.playerId+'"]')).playerId;
      const path=document.querySelector('#stage path[data-surface="land"][data-owner="'+source+'"]');
      path.dispatchEvent(new MouseEvent('click',{bubbles:true}));
      const target=data.world.culture.players.find(p=>p.alive&&p.playerId!==source&&p.lifetimeCulture!==null&&document.querySelector('#stage path[data-surface="land"][data-owner="'+p.playerId+'"]'));
      const influence=data.world.culture.players.find(p=>p.playerId===source).accumulatedInfluence[target.playerId];
      const percent=target.lifetimeCulture>0?Math.floor(influence*100/target.lifetimeCulture):0;
      const details=document.querySelector('#details').textContent;
      const noDimming=!document.querySelector('#stage .focus-muted');
      const sourcePath=document.querySelector('#stage path[data-owner="'+source+'"][data-surface="land"]');
      const sourceMarked=sourcePath.dataset.tourismRole==='source' && sourcePath.getAttribute('fill')===data.world.civilizations.find(c=>c.id===source).color && sourcePath.hasAttribute('stroke-dasharray');
      const state=window.civmapperViewer.getState();
      mode.value='political';mode.dispatchEvent(new Event('change'));
      window.civmapperViewer.restoreState(state);
      const restored=Number(select.value)===source&&window.civmapperViewer.getState().perspective===source;
      const live=document.querySelector('#stage path[data-surface="land"][data-owner="'+target.playerId+'"]');
      const fill=live.getAttribute('fill');
      const create=URL.createObjectURL,click=HTMLAnchorElement.prototype.click;let blob,filename;
      URL.createObjectURL=function(value){blob=value;return create.call(this,value)};
      HTMLAnchorElement.prototype.click=function(){filename=this.download};
      let xml;
      try{document.querySelector('#export-svg').click();xml=new DOMParser().parseFromString(await blob.text(),'image/svg+xml')}
      finally{URL.createObjectURL=create;HTMLAnchorElement.prototype.click=click}
      const legend=xml.querySelector('.culture-legend').textContent;
      const exportedFill=xml.querySelector('path[data-surface="land"][data-owner="'+target.playerId+'"]').getAttribute('fill');
      const selected=Number(select.value);
      document.querySelector('#clear-focus').click();
      const cleared=select.value==='' && window.civmapperViewer.getState().perspective===null && document.querySelector('#stage .culture-legend').textContent.includes('overview');
      const overviewState=window.civmapperViewer.getState();window.civmapperViewer.restoreState(overviewState);
      const overviewRestored=select.value==='';
      select.value=String(source);select.dispatchEvent(new Event('change'));
      const dropdown=window.civmapperViewer.getState().selected===String(source);
      return {source,percent,details,noDimming,restored,selected,fill,filename,exportedFill,legend,sourceLabel:data.labels[source],overview,cleared,overviewRestored,dropdown,sourceMarked,overviewTotals};
    })()`);
    assert.ok(result.overview, "culture starts with overview after clear");
    assert.ok(
      result.overviewTotals,
      "each empire territory shows its own summed exports",
    );
    assert.equal(
      result.selected,
      result.source,
      "territory click selects outgoing influence source",
    );
    assert.match(result.details, /Outgoing accumulated tourism influence/);
    assert.ok(result.details.includes(`${result.percent}%`));
    assert.ok(result.noDimming, "all tourism targets remain visible");
    assert.ok(
      result.sourceMarked,
      "source remains in empire color with a distinct outline",
    );
    assert.ok(
      result.restored,
      "selected source survives restoring viewer state",
    );
    assert.ok(
      result.cleared && result.overviewRestored,
      "clearing and state restore preserve overview",
    );
    assert.ok(result.dropdown, "source dropdown synchronizes empire selection");
    assert.equal(result.exportedFill, result.fill);
    assert.ok(result.filename.endsWith(`-culture-from-${result.source}.svg`));
    assert.ok(result.legend.includes(result.sourceLabel));
    passed(
      "culture overview, click-to-source, outgoing totals, clear/reset, persistence and SVG export",
    );
  }
  await evaluate(
    `document.querySelector('#mode').value=${JSON.stringify(initial)};document.querySelector('#mode').dispatchEvent(new Event('change'));document.querySelector('#clear-focus').click()`,
  );
  if (serverURL && /\.civ5save$/i.test(save) && !ruleset && !localization) {
    assert.ok(
      ["political", "physical", "army"].every((mode) =>
        available.includes(mode),
      ),
    );
    assert.ok(
      available.every((mode) =>
        ["political", "physical", "army", "culture", "religion"].includes(mode),
      ),
    );
    const world = await evaluate(
      'JSON.parse(document.querySelector("#world-data").textContent).world',
    );
    assert.deepEqual(available, [
      "political",
      "physical",
      "army",
      ...(world.culture ? ["culture"] : []),
      ...(world.cities.some((c) => c.religionKnown === true)
        ? ["religion"]
        : []),
    ]);
    assert.ok(world.cities.every((c) => !c.name.startsWith("TXT_KEY_")));
    assert.ok(world.tiles.every((t) => typeof t.terrain === "string"));
    assert.ok(world.units.every((u) => u.classificationKnown === true));
    const labels = await evaluate(
      'Array.from(document.querySelectorAll("#stage .city-label,#stage .city-state-label")).map(n=>n.textContent)',
    );
    assert.ok(labels.length > 0);
    assert.ok(
      labels.every((name) => world.cities.some((c) => c.name === name)),
    );
    assert.ok(labels.every((name) => !name.startsWith("TXT_KEY_")));
    assert.equal(
      await evaluate(
        'Boolean(parent.document.querySelector("#download-html"))',
      ),
      false,
    );
    if (process.env.CIVMAPPER_EXPECTED_WORLD) {
      const expected = JSON.parse(
        await readFile(process.env.CIVMAPPER_EXPECTED_WORLD, "utf8"),
      );
      // Compact copies preserve metadata values, but have their own byte hashes.
      delete world.source.ruleset;
      delete expected.source.ruleset;
      // The viewer sorts entities and omits the binary inspection report.
      delete expected.inspection;
      expected.civilizations.sort((a, b) => a.id - b.id);
      expected.tiles.sort((a, b) => a.y - b.y || a.x - b.x);
      expected.cities.sort((a, b) => String(a.id).localeCompare(String(b.id)));
      expected.units?.sort(
        (a, b) => a.owner - b.owner || String(a.id).localeCompare(String(b.id)),
      );
      for (const key of Object.keys(world))
        assert.ok(
          isDeepStrictEqual(world[key], expected[key]),
          `Python-era ${key} data mismatch`,
        );
      passed("default metadata matches the full Python-era normalized world");
    }
    passed(
      "bare save resolves city names and enables physical/army with bundled databases",
    );
  }
  if (available.includes("army")) {
    await evaluate(
      'document.querySelector("#mode").value="army";document.querySelector("#mode").dispatchEvent(new Event("change"))',
    );
    const count = await evaluate(
      'document.querySelectorAll("#stage .army-marker").length',
    );
    if (count) {
      const point = await evaluate(
        '(()=>{const r=document.querySelector("#stage .army-marker").getBoundingClientRect();const f=window.frameElement?.getBoundingClientRect() || {x:0,y:0};return{x:r.x+r.width/2+f.x,y:r.y+r.height/2+f.y}})()',
      );
      await call("Input.dispatchMouseEvent", {
        type: "mousePressed",
        button: "left",
        clickCount: 1,
        ...point,
      });
      await call("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        button: "left",
        clickCount: 1,
        ...point,
      });
      assert.match(
        await evaluate('document.querySelector("#details").textContent'),
        /military units/,
      );
      passed("real pointer click opens unit composition");
      await evaluate('document.querySelector("[data-layer=armies]").click()');
      assert.equal(
        await evaluate(
          'Array.from(document.querySelectorAll("#stage .army-marker")).every(n=>getComputedStyle(n).display==="none")',
        ),
        true,
      );
      await evaluate('document.querySelector("[data-layer=armies]").click()');
      passed("army layer toggle");
    }
  }
  if (available.includes("religion")) {
    await evaluate(
      'document.querySelector("#mode").value="religion";document.querySelector("#mode").dispatchEvent(new Event("change"));document.querySelector("#clear-focus").click()',
    );
    const religion = await evaluate(`(()=>{
      const w=JSON.parse(document.querySelector('#world-data').textContent).world;
      const markers=Array.from(document.querySelectorAll('#stage .religion-marker'));
      const holy=document.querySelectorAll('#stage .holy-city-marker').length;
      const expectedHoly=w.cities.filter(c=>c.religionKnown===true&&c.religions.some(r=>r.holyCity)).length;
      const paths=Array.from(document.querySelectorAll('#stage .religion-territory'));
      markers[0].dispatchEvent(new MouseEvent('click',{bubbles:true}));
      return {markers:markers.length,cities:w.cities.length,holy,expectedHoly,
        assigned:paths.filter(p=>p.dataset.religionId!=='unknown').length,
        legends:document.querySelectorAll('#stage .religion-legend').length,
        details:document.querySelector('#details').textContent};
    })()`);
    assert.equal(religion.markers, religion.cities);
    assert.equal(religion.holy, religion.expectedHoly);
    assert.ok(religion.assigned > 0);
    assert.ok(religion.legends > 0);
    assert.match(religion.details, /Religion/);
    assert.match(religion.details, /followers/);
    passed(
      "religion markers, exact assigned territories, holy status and city details",
    );
    for (const [layer, selector] of [
      ["religionTerritories", ".religion-territory"],
      ["holyCities", ".holy-city-marker"],
    ]) {
      if (layer === "holyCities" && !religion.holy) continue;
      await evaluate(`document.querySelector('[data-layer=${layer}]').click()`);
      assert.equal(
        await evaluate(
          `Array.from(document.querySelectorAll('#stage ${selector}')).every(n=>getComputedStyle(n).display==='none')`,
        ),
        true,
      );
      await evaluate(`document.querySelector('[data-layer=${layer}]').click()`);
    }
    const svg = await evaluate(`(async()=>{
      const create=URL.createObjectURL,click=HTMLAnchorElement.prototype.click;let blob;
      URL.createObjectURL=b=>{blob=b;return create.call(URL,b)};
      HTMLAnchorElement.prototype.click=function(){};
      try{document.querySelector('#export-svg').click();return await blob.text();}
      finally{URL.createObjectURL=create;HTMLAnchorElement.prototype.click=click;}
    })()`);
    assert.match(svg, /religion-territory/);
    assert.match(svg, /religion-marker/);
    if (religion.holy) assert.match(svg, /holy-city-marker/);
    passed("religion layer toggles and SVG download");
    const selection = await evaluate(`(async()=>{
      document.querySelector('#clear-focus').click();
      const w=JSON.parse(document.querySelector('#world-data').textContent).world;
      const path=Array.from(document.querySelectorAll('#stage .religion-territory')).find(p=>Number(p.dataset.religionId)>0);
      if(!path)throw new Error('No known faith territory to select');
      const id=path.dataset.religionId;
      path.dispatchEvent(new MouseEvent('click',{bubbles:true}));
      const state=window.civmapperViewer.getState();
      const expected=w.cities.filter(c=>c.religionKnown===true).reduce((sum,c)=>sum+(c.religions.find(r=>String(r.religionId)===id)?.followers??0),0);
      const selected=document.querySelector('#religion-select').value===id&&state.selectedReligion===id&&state.selected==='';
      const paths=Array.from(document.querySelectorAll('#stage .religion-territory'));
      const highlighted=paths.every(n=>!n.classList.contains('focus-muted'));
      const heatmap=paths.every(n=>{
        const c=w.cities.find(c=>c.owner+':'+c.localId===n.dataset.religionCity);
        const followers=c?.religionKnown===true?(c.religions.find(r=>String(r.religionId)===id)?.followers??0):null;
        return n.querySelector('title').textContent.includes(''+(followers??'Unknown')+' followers');
      })&&document.querySelector('.religion-heatmap-legend').textContent.includes('followers / city population');
      const details=document.querySelector('#details').textContent;
      const card=document.querySelector('.religion-card[data-religion-id="'+id+'"]');
      const summary=card.textContent.includes(String(expected))&&card.classList.contains('active');
      document.querySelector('#mode').value='political';document.querySelector('#mode').dispatchEvent(new Event('change'));
      window.civmapperViewer.restoreState(state);
      const restored=window.civmapperViewer.getState().selectedReligion===id;
      const holy=Array.from(document.querySelectorAll('#stage .holy-city-marker')).find(n=>n.dataset.holyReligionId===id);
      const holyColored=!holy||holy.getAttribute('fill')!== '#fff8e8';
      if(holy)holy.dispatchEvent(new MouseEvent('click',{bubbles:true}));
      const holySelect=!holy||window.civmapperViewer.getState().selectedReligion===id;
      document.querySelector('#clear-focus').click();
      const cleared=document.querySelector('#religion-select').value===''&&!document.querySelector('#stage .focus-muted')&&!document.querySelector('.religion-card.active');
      card.click();const cardSelect=window.civmapperViewer.getState().selectedReligion===id;
      card.click();const cardClear=window.civmapperViewer.getState().selectedReligion===null;
      return {selected,highlighted,summary,details,expected,restored,holyColored,holySelect,cleared,cardSelect,cardClear,heatmap};
    })()`);
    assert.ok(
      selection.selected && selection.highlighted && selection.heatmap,
      "faith selection highlights territories and independent holy cities",
    );
    assert.ok(
      selection.summary &&
        selection.details.includes(String(selection.expected)),
      "summary reports decoded follower counts",
    );
    assert.ok(
      selection.restored,
      "religion selection survives view and state restoration",
    );
    assert.ok(
      selection.holyColored && selection.holySelect,
      "holy diamond identifies and selects its own faith",
    );
    assert.ok(
      selection.cleared && selection.cardSelect && selection.cardClear,
      "clear and summary-card toggles restore overview",
    );
    passed(
      "religion summaries, cross-empire selection, colored holy faith, state restore and clear",
    );
    if (available.includes("culture")) {
      const combined = await evaluate(`(()=>{
        const mode=document.querySelector('#mode');
        mode.value='culture';mode.dispatchEvent(new Event('change'));
        document.querySelector('#clear-focus').click();
        const source=Array.from(document.querySelector('#perspective').options).find(o=>o.value!=='').value;
        document.querySelector('#perspective').value=source;document.querySelector('#perspective').dispatchEvent(new Event('change'));
        const before=Array.from(document.querySelectorAll('#stage path[data-surface="land"][data-owner]')).map(n=>n.getAttribute('fill'));
        mode.value='religion';mode.dispatchEvent(new Event('change'));
        const faith=Array.from(document.querySelector('#religion-select').options).find(o=>Number(o.value)>0).value;
        document.querySelector('#religion-select').value=faith;document.querySelector('#religion-select').dispatchEvent(new Event('change'));
        mode.value='culture';mode.dispatchEvent(new Event('change'));
        const after=Array.from(document.querySelectorAll('#stage path[data-surface="land"][data-owner]')).map(n=>n.getAttribute('fill'));
        const tourism=window.civmapperViewer.getState().perspective===Number(source)&&JSON.stringify(before)===JSON.stringify(after);
        mode.value='religion';mode.dispatchEvent(new Event('change'));
        const religion=window.civmapperViewer.getState().selectedReligion===faith;
        document.querySelector('#clear-focus').click();mode.value='culture';mode.dispatchEvent(new Event('change'));document.querySelector('#clear-focus').click();
        return {tourism,religion};
      })()`);
      assert.ok(
        combined.tourism,
        "religion selection preserves the tourism source and fills",
      );
      assert.ok(
        combined.religion,
        "tourism selection preserves the religion heatmap choice",
      );
      passed(
        "tourism and religion retain independent selections when switching views",
      );
    }
    await evaluate(
      `document.querySelector('#mode').value=${JSON.stringify(initial)};document.querySelector('#mode').dispatchEvent(new Event('change'));document.querySelector('#clear-focus').click()`,
    );
  }
  const box = await evaluate(
    'document.querySelector("#stage svg").getAttribute("viewBox")',
  );
  await evaluate('document.querySelector("#zoom-in").click()');
  assert.notEqual(
    await evaluate(
      'document.querySelector("#stage svg").getAttribute("viewBox")',
    ),
    box,
  );
  passed("zoom button");
  await evaluate('document.querySelector("#fit").click()');
  await evaluate(
    '(()=>{const card=document.querySelector(".empire-card");if(card){document.querySelector("#empire").value=card.dataset.owner;document.querySelector("#empire").dispatchEvent(new Event("change"));}})()',
  );
  const beforePanSelection = await evaluate(
    'document.querySelector("#empire").value',
  );
  const beforePan = await evaluate(
    'document.querySelector("#stage svg").getAttribute("viewBox")',
  );
  const center = await evaluate(
    '(()=>{const r=document.querySelector("#stage").getBoundingClientRect();const f=window.frameElement?.getBoundingClientRect() || {x:0,y:0};return{x:r.x+r.width/2+f.x,y:r.y+r.height/2+f.y}})()',
  );
  await call("Input.dispatchMouseEvent", {
    type: "mousePressed",
    button: "left",
    clickCount: 1,
    ...center,
  });
  await call("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    button: "left",
    buttons: 1,
    x: center.x + 90,
    y: center.y + 40,
  });
  await call("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    button: "left",
    clickCount: 1,
    x: center.x + 90,
    y: center.y + 40,
  });
  assert.notEqual(
    await evaluate(
      'document.querySelector("#stage svg").getAttribute("viewBox")',
    ),
    beforePan,
  );
  passed("pointer drag pans map");
  assert.equal(
    await evaluate('document.querySelector("#empire").value'),
    beforePanSelection,
  );
  passed("panning preserves the empire highlight");
  await evaluate('document.querySelector("#fit").click()');
  if (await evaluate('Boolean(document.querySelector(".empire-card"))')) {
    await evaluate('document.querySelector("#clear-focus").click()');
    await evaluate('document.querySelector(".empire-card").click()');
    assert.equal(
      await evaluate('Boolean(document.querySelector(".empire-card.active"))'),
      true,
    );
    assert.equal(
      await evaluate('Boolean(document.querySelector("#stage .focus-muted"))'),
      true,
    );
    passed("summary card highlights empire");
    // Empty SVG background and unclaimed geography should restore all empires.
    for (const selector of ["#stage svg", '#stage [data-owner="unowned"]']) {
      if (
        !(await evaluate(
          `Boolean(document.querySelector(${JSON.stringify(selector)}))`,
        ))
      )
        continue;
      await evaluate(
        `document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new MouseEvent('click',{bubbles:true}))`,
      );
      assert.equal(
        await evaluate('document.querySelector("#empire").value'),
        "",
      );
      assert.equal(
        await evaluate(
          'document.querySelectorAll("#stage .focus-muted").length',
        ),
        0,
      );
      await evaluate('document.querySelector(".empire-card").click()');
    }
    passed("clicking empty or unclaimed map clears the highlight");
    await evaluate('document.querySelector("#clear-focus").click()');
    assert.equal(
      await evaluate('document.querySelectorAll("#stage .focus-muted").length'),
      0,
    );
    passed("clear empire highlight");
  }
  const cities = await evaluate(
    'JSON.parse(document.querySelector("#world-data").textContent).world.cities',
  );
  if (cities.length) {
    await evaluate(
      `document.querySelector('#search').value=${JSON.stringify(cities[0].name)};document.querySelector('#search').dispatchEvent(new Event('input'))`,
    );
    assert.equal(
      await evaluate(
        'Boolean(document.querySelector("#search-results button"))',
      ),
      true,
    );
    await evaluate('document.querySelector("#search-results button").click()');
    assert.equal(
      await evaluate('document.querySelector("#details h3").textContent'),
      cities[0].name,
    );
    assert.equal(
      await evaluate(
        'Boolean(document.querySelector("#stage .search-target"))',
      ),
      true,
    );
    passed("city search navigates and shows details");
  }
  for (const mode of available) {
    await evaluate(
      `document.querySelector('#mode').value=${JSON.stringify(mode)};document.querySelector('#mode').dispatchEvent(new Event('change'))`,
    );
    assert.equal(await evaluate('document.querySelector("#mode").value'), mode);
    assert.equal(
      await evaluate('document.querySelectorAll("#stage>svg").length'),
      1,
    );
  }
  passed("all available mode switches");
  // Capture the actual download Blob without saving it outside the test report.
  // Verify PNG decoding for each mode plus current clipping and display filters.
  for (const mode of available) {
    await evaluate(
      `document.querySelector('#mode').value=${JSON.stringify(mode)};document.querySelector('#mode').dispatchEvent(new Event('change'));document.querySelector('#zoom-in').click();document.querySelector('[data-layer=cities]').click()`,
    );
    const result = await evaluate(`(async()=>{
      const create=URL.createObjectURL, click=HTMLAnchorElement.prototype.click;
      let png, filename, snapshot;
      URL.createObjectURL=function(blob){if(blob.type==='image/png')png=blob;else if(blob.type.startsWith('image/svg'))snapshot=blob;return create.call(this,blob);};
      HTMLAnchorElement.prototype.click=function(){filename=this.download;};
      try{
        const button=document.querySelector('#export-png');
        await new Promise((resolve,reject)=>{
          const timer=setTimeout(()=>{observer.disconnect();reject(new Error('PNG timeout'));},8000);
          const observer=new MutationObserver(()=>{if(!button.disabled){clearTimeout(timer);observer.disconnect();resolve();}});
          observer.observe(button,{attributes:true,attributeFilter:['disabled']});button.click();
        });
        if(!png)throw new Error(document.querySelector('#details').textContent);
        const bytes=new Uint8Array(await png.arrayBuffer()),image=await createImageBitmap(png);
        const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
        const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
        const pixels=ctx.getImageData(0,0,image.width,image.height).data,colors=new Set();
        for(let i=0;i<pixels.length;i+=548)colors.add(Array.from(pixels.slice(i,i+4)).join(','));
        const pngData=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(png);});
        const xml=new DOMParser().parseFromString(await snapshot.text(),'image/svg+xml');
        const original=document.querySelector('#stage svg');
        const originals=Array.from(original.querySelectorAll('*')),copies=Array.from(xml.documentElement.querySelectorAll('*'));
        const stylesMatch=originals.every((n,i)=>getComputedStyle(n).display===copies[i].style.display && getComputedStyle(n).opacity===copies[i].style.opacity);
        return {header:Array.from(bytes.slice(0,8)),width:image.width,height:image.height,filename,stylesMatch,
          clipping:xml.documentElement.getAttribute('viewBox')===original.getAttribute('viewBox'),bytes:png.size,colorCount:colors.size,pngData,
          perspective:window.civmapperViewer.getState().perspective,
          cultureFillsMatch:Array.from(original.querySelectorAll('path[data-surface="land"]')).every((n,i)=>n.getAttribute('fill')===xml.querySelectorAll('path[data-surface="land"]')[i].getAttribute('fill'))};
      }finally{URL.createObjectURL=create;HTMLAnchorElement.prototype.click=click;}
    })()`);
    assert.deepEqual(result.header, [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.ok(result.bytes > 1000);
    assert.ok(result.width > 100 && result.height > 100);
    assert.ok(result.stylesMatch);
    assert.ok(result.clipping);
    assert.ok(
      result.filename.endsWith(
        mode === "culture"
          ? result.perspective === null
            ? "-culture-overview.png"
            : `-culture-from-${result.perspective}.png`
          : `-${mode}.png`,
      ),
    );
    if (mode === "culture")
      assert.ok(
        result.cultureFillsMatch,
        "PNG preserves current perspective fills",
      );
    assert.ok(result.colorCount > 4, "PNG includes visible map colors");
    if (reportPath)
      await writeFile(
        reportPath + `-${mode}.png`,
        Buffer.from(result.pngData, "base64"),
      );
    await evaluate(
      "document.querySelector('[data-layer=cities]').click();document.querySelector('#fit').click()",
    );
    passed(`${mode} PNG download with live layers and viewport`);
  }

  for (const group of ["human", "ai"]) {
    if (
      await evaluate(
        `document.querySelector('[data-player-group=${group}]').disabled`,
      )
    )
      continue;
    await evaluate(
      `(()=>{const d=JSON.parse(document.querySelector('#world-data').textContent);const option=Array.from(document.querySelector('#empire').options).find(o=>d.playerControls[o.value]===${JSON.stringify(group)});if(option){document.querySelector('#empire').value=option.value;document.querySelector('#empire').dispatchEvent(new Event('change'));}document.querySelector('[data-player-group=${group}]').click()})()`,
    );
    assert.equal(await evaluate('document.querySelector("#empire").value'), "");
    const verify = `(()=>{const d=JSON.parse(document.querySelector('#world-data').textContent), group=${JSON.stringify(group)};return Array.from(document.querySelectorAll('#stage [data-owner],.empire-card')).every(n=>{const excluded=d.playerControls[n.dataset.owner]===group,territory=n.hasAttribute('data-surface');return n.classList.contains('player-hidden')===(excluded&&!territory)&&(!territory||n.classList.contains('player-context')===excluded)})})()`;
    assert.equal(await evaluate(verify), true);
    for (const mode of available) {
      await evaluate(
        `document.querySelector('#mode').value=${JSON.stringify(mode)};document.querySelector('#mode').dispatchEvent(new Event('change'))`,
      );
      assert.equal(await evaluate(verify), true);
    }
    if (
      !(await evaluate(
        'document.querySelector("[data-layer=armies]").disabled',
      ))
    ) {
      await evaluate(
        'document.querySelector("[data-layer=armies]").click();document.querySelector("[data-layer=armies]").click()',
      );
      assert.equal(await evaluate(verify), true);
    }
    await evaluate(
      `document.querySelector('[data-player-group=${group}]').click()`,
    );
    assert.equal(
      await evaluate(
        'document.querySelectorAll(".player-hidden,.player-context").length',
      ),
      0,
    );
    passed(
      `${group} player filter, selection reset and persistence across views/layers`,
    );
  }
  await evaluate(
    `document.querySelector('#mode').value=${JSON.stringify(initial)};document.querySelector('#mode').dispatchEvent(new Event('change'));document.querySelector('#fit').click();document.querySelector('#clear-focus').click()`,
  );
  await call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  assert.equal(
    await evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"),
    true,
  );
  passed("mobile layout fits viewport");
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 960,
    deviceScaleFactor: 1,
    mobile: false,
  });
  if (serverURL) {
    contextId = undefined;
    const setFile = async (id, name) => {
      const { root } = await call("DOM.getDocument");
      const { nodeId } = await call("DOM.querySelector", {
        nodeId: root.nodeId,
        selector: "#" + id,
      });
      await call("DOM.setFileInputFiles", {
        nodeId,
        files: name ? [resolve(name)] : [],
      });
    };
    const until = async (expression) => {
      for (let i = 0; i < 900; i++) {
        if (await evaluate(expression)) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(
        "Browser timeout: " +
          expression +
          "; " +
          (await evaluate('document.querySelector("#message").textContent')),
      );
    };
    // Switching presets must update the canvas as well as the embedded SVG,
    // and reset preset layer defaults without losing the current map.
    for (const [preset, ocean] of [
      ["parchment", "#a3b6ac"],
      ["minimalist", "#d4e3e8"],
      ["atlas", "#244b60"],
    ]) {
      await evaluate(
        `document.querySelector('#style').value=${JSON.stringify(preset)};document.querySelector('#style').dispatchEvent(new Event('change'))`,
      );
      await until(
        `(()=>{const v=document.querySelector('#viewer');return Boolean(v.contentWindow?.civmapperViewer) && JSON.parse(v.contentDocument.querySelector('#world-data').textContent).oceanColor===${JSON.stringify(ocean)}})()`,
      );
      const appearance = await evaluate(
        `(()=>{const d=document.querySelector('#viewer').contentDocument,w=document.querySelector('#viewer').contentWindow;d.querySelector('#mode').value='political';d.querySelector('#mode').dispatchEvent(new Event('change'));d.querySelector('#clear-focus').click();d.querySelector('#fit').click();const grid=d.querySelector('#stage .hex-grid');return { background:w.getComputedStyle(d.querySelector('#stage')).backgroundColor,grid:!!grid && !grid.classList.contains('layer-hidden'),roads:d.querySelector('[data-layer=roads]').checked,ice:d.querySelectorAll('#stage .ice').length };})()`,
      );
      const rgb =
        "rgb(" +
        [1, 3, 5].map((i) => parseInt(ocean.slice(i, i + 2), 16)).join(", ") +
        ")";
      assert.equal(appearance.background, rgb);
      assert.equal(appearance.grid, preset !== "minimalist");
      assert.equal(appearance.roads, preset !== "minimalist");
      if (reportPath) {
        const shot = await call("Page.captureScreenshot", { format: "png" });
        await writeFile(
          reportPath + "-preset-" + preset + ".png",
          Buffer.from(shot.data, "base64"),
        );
      }
      passed(
        preset +
          " browser preset updates background, hex grid and road defaults",
      );
    }
    if (/\.civ5save$/i.test(save) && !ruleset && !localization) {
      const before = await evaluate(
        'JSON.parse(document.querySelector("#viewer").contentDocument.querySelector("#world-data").textContent).world',
      );
      await evaluate(
        'document.querySelector("#viewer").contentDocument.querySelector("#zoom-in").click();document.querySelector("#viewer").contentDocument.querySelector(".empire-card").click()',
      );
      const viewState = await evaluate(
        'document.querySelector("#viewer").contentWindow.civmapperViewer.getState()',
      );
      await evaluate('document.querySelector("#bundled-metadata").click()');
      await until(
        '(()=>{const text=document.querySelector("#viewer").contentDocument?.querySelector("#world-data")?.textContent;return text && JSON.parse(text).world.tiles[0].terrain===null && document.querySelector("#cancel").hidden})()',
      );
      assert.equal(
        await evaluate('document.querySelector("#metadata-notice").hidden'),
        false,
      );
      await evaluate('document.querySelector("#bundled-metadata").click()');
      await until(
        '(()=>{const text=document.querySelector("#viewer").contentDocument?.querySelector("#world-data")?.textContent;return text && JSON.parse(text).world.units.every(u=>u.classificationKnown===true) && document.querySelector("#cancel").hidden})()',
      );
      await until(
        'Boolean(document.querySelector("#viewer").contentWindow.civmapperViewer)',
      );
      assert.equal(
        await evaluate('document.querySelector("#metadata-notice").hidden'),
        true,
      );
      assert.deepEqual(
        await evaluate(
          'JSON.parse(document.querySelector("#viewer").contentDocument.querySelector("#world-data").textContent).world',
        ),
        before,
      );
      assert.deepEqual(
        await evaluate(
          'document.querySelector("#viewer").contentWindow.civmapperViewer.getState()',
        ),
        viewState,
      );
      passed(
        "metadata changes update names and views without reloading and retain viewer state",
      );
    }
    await setFile("ruleset");
    await setFile("localization");
    await setFile("replay", "examples/synthetic-replay.json");
    await evaluate(
      'document.querySelector("#wrap").value="true";document.querySelector("#maxturns").value=2;document.querySelector("#inputs").open=true;document.querySelector("#load-replay").click()',
    );
    await until(
      '!document.querySelector("#playback").hidden && document.querySelector("#cancel").hidden',
    );
    assert.equal(await evaluate('document.querySelector("#turn").max'), "1");
    await until(
      'Boolean(document.querySelector("#viewer").contentWindow?.civmapperViewer) && JSON.parse(document.querySelector("#viewer").contentDocument.querySelector("#world-data").textContent).world.game.width===2',
    );
    await evaluate(
      'document.querySelector("#viewer").contentDocument.querySelector("#zoom-in").click();document.querySelector("#viewer").contentDocument.querySelector("[data-layer=cities]").click()',
    );
    const replayBox = await evaluate(
      'document.querySelector("#viewer").contentDocument.querySelector("#stage svg").getAttribute("viewBox")',
    );
    await evaluate('document.querySelector("#next").click()');
    await until(
      'document.querySelector("#cancel").hidden && document.querySelector("#turn-label").textContent==="Turn 2"',
    );
    await until(
      'JSON.parse(document.querySelector("#viewer").contentDocument.querySelector("#world-data").textContent).world.game.turn===2 && Boolean(document.querySelector("#viewer").contentWindow?.civmapperViewer)',
    );
    await until(
      'document.querySelector("#viewer").contentDocument?.querySelector("#stage svg")?.getAttribute("viewBox")===' +
        JSON.stringify(replayBox),
    );
    assert.equal(
      await evaluate(
        'document.querySelector("#viewer").contentDocument.querySelector("[data-layer=cities]").checked',
      ),
      false,
    );
    passed("replay slider and next frame preserve viewport and layers");
    await evaluate('document.querySelector("#previous").click()');
    await until(
      'document.querySelector("#cancel").hidden && document.querySelector("#turn-label").textContent==="Turn 0"',
    );
    await evaluate(
      'document.querySelector("#duration").value=100;document.querySelector("#play").click()',
    );
    await until(
      'document.querySelector("#cancel").hidden && document.querySelector("#turn-label").textContent==="Turn 2"',
    );
    await evaluate('document.querySelector("#play").click()');
    passed("browser replay playback");
    await evaluate(
      'window.downloads=[];window.originalCreateURL=URL.createObjectURL;URL.createObjectURL=function(blob){window.downloads.push(blob);return window.originalCreateURL(blob)};HTMLAnchorElement.prototype.click=function(){};document.querySelector("#download-gif").click()',
    );
    await until(
      'document.querySelector("#message").textContent==="GIF exported."',
    );
    const gif = await evaluate(
      '(async()=>{const b=window.downloads.find(b=>b.type==="image/gif");const d=new Uint8Array(await b.arrayBuffer());return{header:String.fromCharCode(...d.slice(0,6)),size:d.length}})()',
    );
    assert.equal(gif.header, "GIF89a");
    assert.ok(gif.size > 100);
    passed("browser GIF export through self-hosted WASM and fonts");
    const current = await evaluate('document.querySelector("#viewer").srcdoc');
    await setFile("save", save);
    // Chromium does not emit change when the same path is selected again.
    await evaluate(
      'document.querySelector("#save").dispatchEvent(new Event("change"))',
    );
    assert.equal(
      await evaluate('document.querySelector("#loading-panel").hidden'),
      false,
    );
    await evaluate('document.querySelector("#cancel-upload").click()');
    assert.match(
      await evaluate('document.querySelector("#message").textContent'),
      /Cancelled/,
    );
    assert.equal(
      await evaluate(
        'document.querySelector("#loading").hidden && document.querySelector("#loading-panel").hidden && document.querySelector("#drop").getAttribute("aria-busy")==="false"',
      ),
      true,
    );
    assert.equal(
      await evaluate('document.querySelector("#viewer").srcdoc'),
      current,
    );
    await evaluate('document.querySelector("#previous").click()');
    await until(
      'document.querySelector("#cancel").hidden && document.querySelector("#turn-label").textContent==="Turn 0"',
    );
    passed("cancelled parsing preserves map and restores replay session");
    const retained = await evaluate('document.querySelector("#viewer").srcdoc');
    await evaluate(
      '(()=>{const input=document.querySelector("#save"),dt=new DataTransfer();dt.items.add(new File(["{bad"],"broken.json"));input.files=dt.files;input.dispatchEvent(new Event("change"))})()',
    );
    await until(
      'document.querySelector("#cancel").hidden && /JSON|Unexpected|property/.test(document.querySelector("#message").textContent)',
    );
    assert.equal(
      await evaluate(
        'document.querySelector("#loading").hidden && document.querySelector("#loading-panel").hidden && document.querySelector("#drop").getAttribute("aria-busy")==="false"',
      ),
      true,
    );
    assert.equal(
      await evaluate('document.querySelector("#viewer").srcdoc'),
      retained,
    );
    passed("invalid replacement file reports error and retains previous map");

    // Start fresh so cached metadata cannot hide an accidental database fetch.
    const exampleRequests = requests.length;
    await call("Page.navigate", { url: file });
    await until('document.documentElement.dataset.ready==="true"');
    assert.equal(
      requests.slice(exampleRequests).some((url) => url.includes("/examples/")),
      false,
    );
    await evaluate('document.querySelector("#load-example").click()');
    const exampleWorld =
      'JSON.parse(document.querySelector("#viewer").contentDocument.querySelector("#world-data").textContent).world';
    await until(
      `document.querySelector("#cancel").hidden && Boolean(document.querySelector("#viewer").contentWindow?.civmapperViewer) && ${exampleWorld}.game.turn===132`,
    );
    const expectedExample = JSON.parse(
      await readFile("assets/examples/turn-132.json", "utf8"),
    );
    for (const expected of Object.values(expectedExample)) {
      delete expected.inspection;
      expected.civilizations.sort((a, b) => a.id - b.id);
      expected.tiles.sort((a, b) => a.y - b.y || a.x - b.x);
      expected.cities.sort((a, b) => String(a.id).localeCompare(String(b.id)));
      expected.units?.sort(
        (a, b) => a.owner - b.owner || String(a.id).localeCompare(String(b.id)),
      );
    }
    const compareExample = async (expected) => {
      const actual = await evaluate(exampleWorld);
      for (const key of Object.keys(actual))
        assert.ok(
          isDeepStrictEqual(actual[key], expected[key]),
          `Example ${key} mismatch`,
        );
    };
    await compareExample(expectedExample.world);
    assert.equal(
      await evaluate(
        'document.querySelector("#viewer").contentDocument.querySelectorAll("#stage .natural-wonder-marker").length',
      ),
      expectedExample.world.tiles.filter((t) => t.naturalWonder).length,
    );
    const fetched = requests.slice(exampleRequests);
    assert.ok(fetched.some((url) => url.endsWith("/examples/turn-132.json")));
    assert.equal(
      fetched.some((url) => /\.Civ5Save|\/databases\/|sql-wasm/.test(url)),
      false,
      "prepared example needs no source save or metadata databases",
    );
    passed(
      "example JSON matches the prepared world without save or database downloads",
    );

    await evaluate('document.querySelector("#bundled-metadata").click()');
    await until(
      `document.querySelector("#cancel").hidden && ${exampleWorld}.tiles[0].terrain===null`,
    );
    await compareExample(expectedExample.rawWorld);
    await evaluate('document.querySelector("#bundled-metadata").click()');
    await until(
      `document.querySelector("#cancel").hidden && ${exampleWorld}.units.every(u=>u.classificationKnown===true)`,
    );
    await compareExample(expectedExample.world);
    passed("example retains decoded source data for metadata changes");

    await evaluate(
      'document.querySelector("#player-names").checked=false;document.querySelector("#load-example").click()',
    );
    await until(
      `document.querySelector("#cancel").hidden && ${exampleWorld}.extraction.fields.playerNames==="unavailable"`,
    );
    assert.equal(
      await evaluate(`${exampleWorld}.civilizations.some(c=>c.playerName)`),
      false,
    );
    const retainedExample = await evaluate(
      'document.querySelector("#viewer").srcdoc',
    );
    await evaluate(
      'document.querySelector("#load-example").click();document.querySelector("#cancel").click()',
    );
    assert.equal(
      await evaluate('document.querySelector("#viewer").srcdoc'),
      retainedExample,
    );
    assert.equal(
      await evaluate('document.querySelector("#cancel").hidden'),
      true,
    );
    passed("example respects player name settings and cancellation");
  }
  assert.equal(errors.length, 0);
  if (serverURL)
    assert.equal(requests.filter((r) => r.includes("/upload")).length, 0);
  assert.equal(
    requests.filter(
      (u) => /^https?:/.test(u) && !(serverURL && u.startsWith(file)),
    ).length,
    0,
    JSON.stringify(
      requests.filter(
        (u) => /^https?:/.test(u) && !(serverURL && u.startsWith(file)),
      ),
    ),
  );
  passed("no JavaScript errors or external network requests");
  const report = {
    file: serverURL ? file : resolve(file),
    passed: results.length,
    checks: results,
    errors,
    externalRequests: requests.filter(
      (u) => /^https?:/.test(u) && !(serverURL && u.startsWith(file)),
    ),
  };
  if (reportPath) {
    await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
    const screenshot = await call("Page.captureScreenshot", { format: "png" });
    await writeFile(
      reportPath + ".png",
      Buffer.from(screenshot.data, "base64"),
    );
  }
} finally {
  if (socket) socket.close();
  chrome.kill();
  await new Promise((resolve) =>
    chrome.exitCode !== null || chrome.signalCode !== null
      ? resolve()
      : chrome.once("exit", resolve),
  );
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
}
