'use strict';
(() => {
  const config=JSON.parse(document.getElementById('upload-config').textContent);
  const input=document.getElementById('save'), drop=document.getElementById('drop');
  const message=document.getElementById('message'), style=document.getElementById('style');
  let busy=false;
  async function openSave(file) {
    if(busy || !file)return;
    if(!file.name.toLowerCase().endsWith('.civ5save')){message.textContent='Choose a .Civ5Save file.';return;}
    if(!file.size || file.size>config.maxBytes){message.textContent='Save must be between 1 byte and 64 MiB.';return;}
    busy=true;input.disabled=true;style.disabled=true;
    message.textContent=`Reading ${file.name}…`;
    try {
      const response=await fetch(`/upload?style=${encodeURIComponent(style.value)}`,{
        method:'POST',headers:{'Content-Type':'application/octet-stream','X-CivMapper-Token':config.token},body:file
      });
      const documentText=await response.text();
      if(!response.ok)throw new Error(documentText);
      const viewer=document.getElementById('viewer');
      viewer.onload=()=>{
        const child=viewer.contentWindow;
        child.addEventListener('dragover',e=>e.preventDefault());
        child.addEventListener('drop',e=>{e.preventDefault();openSave(e.dataTransfer.files[0]);});
      };
      viewer.srcdoc=documentText;viewer.hidden=false;document.getElementById('welcome').hidden=true;
      message.textContent=file.name;
    } catch(error){message.textContent=error.message || 'Save upload failed.';}
    finally{busy=false;input.disabled=false;style.disabled=false;input.value='';}
  }
  input.addEventListener('change',()=>openSave(input.files[0]));
  // Catch drops over the iframe as well as the welcome panel.
  let depth=0;
  window.addEventListener('dragenter',e=>{e.preventDefault();depth++;drop.classList.add('dropping');});
  window.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('dropping');});
  window.addEventListener('dragleave',e=>{e.preventDefault();if(--depth<=0){depth=0;drop.classList.remove('dropping');}});
  window.addEventListener('drop',e=>{e.preventDefault();depth=0;drop.classList.remove('dropping');openSave(e.dataTransfer.files[0]);});
})();
