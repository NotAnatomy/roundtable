// PDF conversion stays on this computer; only selected agents receive the pages.
function base64(bytes){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
function raster(canvas){return {mime:'image/jpeg',data:canvas.toDataURL('image/jpeg',.88).split(',')[1]};}
export async function prepareFile(file){
 if(/\.(pdf|png|jpe?g|webp)$/i.test(file.name)){
  if(file.size>6*1024*1024)throw new Error('Images and PDFs must be under 6 MB.');
  if(/\.pdf$/i.test(file.name)){
   const bytes=new Uint8Array(await file.arrayBuffer()),original=base64(bytes);
   const pdfjs=await import('./vendor/pdf.min.mjs');pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdf.worker.min.mjs';
   const task=pdfjs.getDocument({data:bytes,isEvalSupported:false,useSystemFonts:true,standardFontDataUrl:'/vendor/standard_fonts/',cMapUrl:'/vendor/cmaps/',cMapPacked:true,wasmUrl:'/vendor/wasm/'});let pdf;
   try{pdf=await task.promise;if(pdf.numPages>6)throw new Error('Attach PDFs with up to six pages. Split larger documents first.');const pages=[],texts=[];
    for(let n=1;n<=pdf.numPages;n++){const page=await pdf.getPage(n),v=page.getViewport({scale:1}),view=page.getViewport({scale:Math.min(2,1600/Math.max(v.width,v.height))}),canvas=document.createElement('canvas');canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);await page.render({canvasContext:canvas.getContext('2d'),viewport:view}).promise;pages.push(raster(canvas));const text=await page.getTextContent();texts.push('Page '+n+': '+text.items.map(i=>i.str||'').join(' '));canvas.width=canvas.height=0;}
    return {name:file.name,mime:'application/pdf',data:original,pages,text:texts.join('\n').slice(0,24000)};
   }finally{await task.destroy();}
  }
  const bitmap=await createImageBitmap(file);try{const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);return {name:file.name.replace(/\.[^.]+$/,'.jpg'),...raster(canvas)};}finally{bitmap.close();}
 }
 if(file.size>96000||! /\.(txt|md|json|csv|lsl|js|mjs|ts|tsx|jsx|py|html|css|yaml|yml|xml|sql|log)$/i.test(file.name))throw new Error('Choose an image, PDF, text or code file.');const text=await file.text();if(text.length>24000||text.includes('\0'))throw new Error('Text files must be under 24,000 characters.');return {name:file.name,text};
}
