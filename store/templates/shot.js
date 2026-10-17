// Places raw captures inside .shot elements.
//   <div class="shot" data-src="blob-preview-light" data-crop="x,y,w,h" style="width:Npx">
// Crop is in CSS pixels of the raw capture (captured at deviceScaleFactor 2).
// Optional data-ring="key[,key]" draws a callout around boxes from raw/<src>.json
// (injected as window.STORE_META by render.mjs).
(() => {
  const RAW_DPR = 2;
  const meta = window.STORE_META ?? {};
  const pending = [];
  for (const el of document.querySelectorAll('.shot')) {
    const src = el.dataset.src;
    const [cx, cy, cw, ch] = el.dataset.crop.split(',').map(Number);
    const width = parseFloat(el.style.width);
    const scale = width / cw;
    el.style.height = `${Math.round(ch * scale)}px`;
    const img = new Image();
    img.className = 'raw';
    img.src = `../raw/${src}.png`;
    pending.push(img.decode().catch(() => { throw new Error(`missing raw ${src}`); }));
    img.style.transform = `translate(${-cx * scale}px, ${-cy * scale}px) scale(${scale / RAW_DPR})`;
    el.appendChild(img);
    const pad = Number(el.dataset.ringPad ?? 4);
    for (const key of (el.dataset.ring ?? '').split(',').filter(Boolean)) {
      const box = meta[src]?.[key];
      if (!box) throw new Error(`missing box ${src}.${key}`);
      const ring = document.createElement('div');
      ring.className = 'ring';
      Object.assign(ring.style, {
        left: `${(box.x - cx) * scale - pad}px`,
        top: `${(box.y - cy) * scale - pad}px`,
        width: `${box.width * scale + pad * 2}px`,
        height: `${box.height * scale + pad * 2}px`,
      });
      el.appendChild(ring);
    }
  }
  window.STORE_READY = Promise.all([document.fonts.ready, ...pending]);
})();
