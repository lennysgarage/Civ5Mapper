// Browser acceptance check. Node 22+ and a Chromium executable; no npm packages.
// node scripts/validate_html.mjs map.html /path/to/chrome [report.json]
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

const [file,browser,reportPath,save]=process.argv.slice(2);
const serverURL=/^http:\/\/(127\.0\.0\.1|localhost):[0-9]+\/$/.test(file || '');
let contextId;const contexts=new Map();
if(!file||!browser)throw new Error('Usage: node scripts/validate_html.mjs map.html /path/to/chrome [report.json]');
if(reportPath && resolve(reportPath)===resolve(file))throw new Error('Report must differ from input HTML');
const profile=await mkdtemp(join(tmpdir(),'civmapper-browser-'));
const chrome=spawn(browser,['--headless','--no-sandbox','--disable-gpu','--no-first-run','--no-default-browser-check',
  '--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
let socket; const results=[]; const errors=[]; const requests=[];
try {
  const endpoint=await new Promise((resolve,reject)=>{
    let stderr='';const timeout=setTimeout(()=>reject(new Error('Chromium startup timed out')),15000);
    chrome.stderr.on('data',chunk=>{stderr+=chunk;const match=stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timeout);resolve(match[1]);}});
    chrome.on('error',reject);chrome.on('exit',code=>{clearTimeout(timeout);reject(new Error(`Chromium exited (${code}): ${stderr.slice(-1000)}`));});
  });
  const endpointURL=new URL(endpoint);
  const targets=await (await fetch(`http://${endpointURL.host}/json/list`)).json();
  socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  let seq=0;const pending=new Map();
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.id){const entry=pending.get(message.id);if(entry){pending.delete(message.id);clearTimeout(entry.timeout);message.error?entry.reject(new Error(JSON.stringify(message.error))):entry.resolve(message.result);}}
    if(message.method==='Runtime.executionContextCreated'){const c=message.params.context;if(c.auxData?.isDefault)contexts.set(c.auxData.frameId,c.id);}
    if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails);
    if(message.method==='Network.requestWillBeSent')requests.push(message.params.request.url);
  });
  function call(method,params={}){
    return new Promise((resolve,reject)=>{const id=++seq;const timeout=setTimeout(()=>{pending.delete(id);reject(new Error(`CDP timeout: ${method}`));},10000);pending.set(id,{resolve,reject,timeout});socket.send(JSON.stringify({id,method,params}));});
  }
  async function evaluate(expression){
    const result=await call('Runtime.evaluate',{expression,contextId,returnByValue:true,awaitPromise:true});
    if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  function passed(name){results.push(name);process.stdout.write(`PASS ${name}\n`);}
  await call('Page.enable');await call('Runtime.enable');await call('Network.enable');
  if(!serverURL)await call('Network.setBlockedURLs',{urls:['http://*','https://*']});
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:serverURL?file:pathToFileURL(resolve(file)).href});
  if(serverURL){
    if(!save)throw new Error('Server check requires a save file as the fourth argument');
    for(let i=0;i<100;i++){
      if(await evaluate('Boolean(document.querySelector("#save"))'))break;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    const {root}=await call('DOM.getDocument');
    const {nodeId}=await call('DOM.querySelector',{nodeId:root.nodeId,selector:'#save'});
    await call('DOM.setFileInputFiles',{nodeId,files:[resolve(save)]});
    await evaluate('document.querySelector("#save").dispatchEvent(new Event("change"))');
    for(let i=0;i<300;i++){
      if(await evaluate('Boolean(document.querySelector("#viewer").contentDocument?.querySelector("#stage svg"))'))break;
      if(i===299)throw new Error(await evaluate('document.querySelector("#message").textContent'));
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    const {frameTree}=await call('Page.getFrameTree');
    contextId=contexts.get(frameTree.childFrames[0].frame.id);
    assert.ok(contextId,'iframe runtime context');passed('real save browser upload');
  }
  for(let i=0;i<100;i++){
    if(await evaluate('Boolean(document.querySelector("#stage svg"))'))break;
    if(i===99)throw new Error('Viewer did not initialize');
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.equal(errors.length,0);passed(serverURL?'server viewer initialization':'file:// initialization');
  const available=await evaluate('Array.from(document.querySelector("#mode").options).filter(o=>!o.disabled).map(o=>o.value)');
  const initial=await evaluate('document.querySelector("#mode").value');
  if(available.includes('army')){
    await evaluate('document.querySelector("#mode").value="army";document.querySelector("#mode").dispatchEvent(new Event("change"))');
    const count=await evaluate('document.querySelectorAll("#stage .army-marker").length');
    if(count){
      const point=await evaluate('(()=>{const r=document.querySelector("#stage .army-marker").getBoundingClientRect();const f=window.frameElement?.getBoundingClientRect() || {x:0,y:0};return{x:r.x+r.width/2+f.x,y:r.y+r.height/2+f.y}})()');
      await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
      await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
      assert.match(await evaluate('document.querySelector("#details").textContent'),/military units/);passed('real pointer click opens unit composition');
      await evaluate('document.querySelector("[data-layer=armies]").click()');
      assert.equal(await evaluate('Array.from(document.querySelectorAll("#stage .army-marker")).every(n=>getComputedStyle(n).display==="none")'),true);
      await evaluate('document.querySelector("[data-layer=armies]").click()');passed('army layer toggle');
    }
  }
  const box=await evaluate('document.querySelector("#stage svg").getAttribute("viewBox")');
  await evaluate('document.querySelector("#zoom-in").click()');
  assert.notEqual(await evaluate('document.querySelector("#stage svg").getAttribute("viewBox")'),box);passed('zoom button');
  await evaluate('document.querySelector("#fit").click()');
  const beforePan=await evaluate('document.querySelector("#stage svg").getAttribute("viewBox")');
  const center=await evaluate('(()=>{const r=document.querySelector("#stage").getBoundingClientRect();const f=window.frameElement?.getBoundingClientRect() || {x:0,y:0};return{x:r.x+r.width/2+f.x,y:r.y+r.height/2+f.y}})()');
  await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...center});
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:center.x+90,y:center.y+40});
  await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:center.x+90,y:center.y+40});
  assert.notEqual(await evaluate('document.querySelector("#stage svg").getAttribute("viewBox")'),beforePan);passed('pointer drag pans map');
  await evaluate('document.querySelector("#fit").click()');
  if(await evaluate('Boolean(document.querySelector(".empire-card"))')){
    await evaluate('document.querySelector(".empire-card").click()');
    assert.equal(await evaluate('Boolean(document.querySelector(".empire-card.active"))'),true);
    assert.equal(await evaluate('Boolean(document.querySelector("#stage .focus-muted"))'),true);passed('summary card highlights empire');
    await evaluate('document.querySelector("#clear-focus").click()');
    assert.equal(await evaluate('document.querySelectorAll("#stage .focus-muted").length'),0);passed('clear empire highlight');
  }
  const cities=await evaluate('JSON.parse(document.querySelector("#world-data").textContent).world.cities');
  if(cities.length){
    await evaluate(`document.querySelector('#search').value=${JSON.stringify(cities[0].name)};document.querySelector('#search').dispatchEvent(new Event('input'))`);
    assert.equal(await evaluate('Boolean(document.querySelector("#search-results button"))'),true);
    await evaluate('document.querySelector("#search-results button").click()');
    assert.equal(await evaluate('document.querySelector("#details h3").textContent'),cities[0].name);
    assert.equal(await evaluate('Boolean(document.querySelector("#stage .search-target"))'),true);passed('city search navigates and shows details');
  }
  for(const mode of available){
    await evaluate(`document.querySelector('#mode').value=${JSON.stringify(mode)};document.querySelector('#mode').dispatchEvent(new Event('change'))`);
    assert.equal(await evaluate('document.querySelector("#mode").value'),mode);
    assert.equal(await evaluate('document.querySelectorAll("#stage>svg").length'),1);
  }
  passed('all available mode switches');
  // Capture the actual download Blob without saving it outside the test report.
  // Verify PNG decoding for each mode plus current clipping and display filters.
  for(const mode of available){
    await evaluate(`document.querySelector('#mode').value=${JSON.stringify(mode)};document.querySelector('#mode').dispatchEvent(new Event('change'));document.querySelector('#zoom-in').click();document.querySelector('[data-layer=cities]').click()`);
    const result=await evaluate(`(async()=>{
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
          clipping:xml.documentElement.getAttribute('viewBox')===original.getAttribute('viewBox'),bytes:png.size,colorCount:colors.size,pngData};
      }finally{URL.createObjectURL=create;HTMLAnchorElement.prototype.click=click;}
    })()`);
    assert.deepEqual(result.header,[137,80,78,71,13,10,26,10]);assert.ok(result.bytes>1000);
    assert.ok(result.width>100 && result.height>100);assert.ok(result.stylesMatch);assert.ok(result.clipping);
    assert.ok(result.filename.endsWith(`-${mode}.png`));assert.ok(result.colorCount>4,'PNG includes visible map colors');
    if(reportPath)await writeFile(reportPath+`-${mode}.png`,Buffer.from(result.pngData,'base64'));
    await evaluate("document.querySelector('[data-layer=cities]').click();document.querySelector('#fit').click()");
    passed(`${mode} PNG download with live layers and viewport`);
  }

  for(const group of ['human','ai']){
    if(await evaluate(`document.querySelector('[data-player-group=${group}]').disabled`))continue;
    await evaluate(`(()=>{const d=JSON.parse(document.querySelector('#world-data').textContent);const option=Array.from(document.querySelector('#empire').options).find(o=>d.playerControls[o.value]===${JSON.stringify(group)});if(option){document.querySelector('#empire').value=option.value;document.querySelector('#empire').dispatchEvent(new Event('change'));}document.querySelector('[data-player-group=${group}]').click()})()`);
    assert.equal(await evaluate('document.querySelector("#empire").value'),'');
    const verify=`(()=>{const d=JSON.parse(document.querySelector('#world-data').textContent), group=${JSON.stringify(group)};return Array.from(document.querySelectorAll('#stage [data-owner],.empire-card')).every(n=>{const excluded=d.playerControls[n.dataset.owner]===group,territory=n.hasAttribute('data-surface');return n.classList.contains('player-hidden')===(excluded&&!territory)&&(!territory||n.classList.contains('player-context')===excluded)})})()`;
    assert.equal(await evaluate(verify),true);
    for(const mode of available){
      await evaluate(`document.querySelector('#mode').value=${JSON.stringify(mode)};document.querySelector('#mode').dispatchEvent(new Event('change'))`);
      assert.equal(await evaluate(verify),true);
    }
    if(!await evaluate('document.querySelector("[data-layer=armies]").disabled')){
      await evaluate('document.querySelector("[data-layer=armies]").click();document.querySelector("[data-layer=armies]").click()');
      assert.equal(await evaluate(verify),true);
    }
    await evaluate(`document.querySelector('[data-player-group=${group}]').click()`);
    assert.equal(await evaluate('document.querySelectorAll(".player-hidden,.player-context").length'),0);
    passed(`${group} player filter, selection reset and persistence across views/layers`);
  }
  await evaluate(`document.querySelector('#mode').value=${JSON.stringify(initial)};document.querySelector('#mode').dispatchEvent(new Event('change'));document.querySelector('#fit').click();document.querySelector('#clear-focus').click()`);
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'),true);passed('mobile layout fits viewport');
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
  assert.equal(errors.length,0);assert.equal(requests.filter(u=>/^https?:/.test(u) && !(serverURL && u.startsWith(file))).length,0);passed('no JavaScript errors or external network requests');
  const report={file:resolve(file),passed:results.length,checks:results,errors,externalRequests:requests.filter(u=>/^https?:/.test(u) && !(serverURL && u.startsWith(file)))};
  if(reportPath){
    await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
    const screenshot=await call('Page.captureScreenshot',{format:'png'});
    await writeFile(reportPath+'.png',Buffer.from(screenshot.data,'base64'));
  }
} finally {
  if(socket)socket.close();
  chrome.kill();await new Promise(resolve=>chrome.exitCode!==null||chrome.signalCode!==null?resolve():chrome.once('exit',resolve));
  await rm(profile,{recursive:true,force:true});
}
