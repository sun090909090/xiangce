// Embedded into each generated album; no network, account or screen capture required.
const toolsDialog=$('#toolsDialog'),toolsTitle=$('#toolsTitle'),toolsBody=$('#toolsBody');
let autoplayTimer=null,playing=false,exporting=false,exportJob=null,videoURL=null;
const portableRoot=document.documentElement.cloneNode(true);
portableRoot.querySelector('#albumGrid').replaceChildren();portableRoot.querySelector('#albumPicker').replaceChildren();
portableRoot.querySelectorAll('#left,#right,#toolsBody').forEach(e=>e.replaceChildren());
portableRoot.querySelector('#viewer').hidden=true;portableRoot.querySelector('#toolsDialog').removeAttribute('open');
portableRoot.querySelector('body').style.overflow='';
function safeName(value){return (value||'旅行相册').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,100)}
function downloadBlob(blob,name){const a=node('a');const url=URL.createObjectURL(blob);a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
function currentPortableHTML(){const root=portableRoot.cloneNode(true);root.querySelectorAll('script').forEach(script=>{if(script.textContent.includes('const albums='))script.textContent=script.textContent.replace(/^const albums=.*;$/m,()=> 'const albums='+JSON.stringify(albums).replace(/</g,'\\u003c')+';')});return '<!doctype html>\n'+root.outerHTML}
function saveAlbum(){downloadBlob(new Blob([currentPortableHTML()],{type:'text/html;charset=utf-8'}),safeName(document.title)+'.html')}
function stopPlayback(){playing=false;clearTimeout(autoplayTimer);$('#play').textContent='自动播放';$('#play').setAttribute('aria-pressed','false')}
function schedulePlayback(){if(!playing)return;autoplayTimer=setTimeout(async()=>{if(!playing||!album)return;if(document.hidden){schedulePlayback();return}if(page>=pageCount()-1){stopPlayback();return}if(!turning)await turn(1);schedulePlayback()},4000)}
function togglePlayback(){if(playing){stopPlayback();return}if(!album||turning||exporting||editingPhotos)return;if(page===pageCount()-1){page=0;update()}playing=true;$('#play').textContent='暂停播放';$('#play').setAttribute('aria-pressed','true');schedulePlayback()}
function showTools(title){stopPlayback();toolsTitle.textContent=title;toolsBody.replaceChildren();toolsDialog.showModal()}
function toolButton(label,action){const b=node('button','tool-button',label);b.type='button';b.onclick=action;toolsBody.append(b);return b}
function note(text){toolsBody.append(node('p','tool-note',text))}
function publicLocation(){const h=location.hostname.toLowerCase();if(!/^https?:$/.test(location.protocol)||!h||h==='localhost'||h.endsWith('.localhost')||h.endsWith('.local')||h==='[::1]'||/^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h))return null;return location.href}
function showShare(){showTools('分享这本旅行相册');note('下载完整相册文件，发给朋友。照片已经包含在里面，下载后用浏览器打开即可翻页。');toolButton('下载完整相册 HTML',saveAlbum);const url=publicLocation();if(url){note('相册已通过网页地址打开。分享此地址前，确认朋友也能访问。');const input=node('input','share-url');input.value=url;input.readOnly=true;input.setAttribute('aria-label','相册网页地址');toolsBody.append(input);toolButton('复制网页地址',async()=>{try{await navigator.clipboard.writeText(url);$('#toolsStatus').textContent='网页地址已复制'}catch{input.focus();input.select();$('#toolsStatus').textContent='请复制上面的地址'}})}else{note('这份相册目前在本地。发布到网站之后，才能通过网址分享给别人。')}}
$('#saveAlbum').onclick=saveAlbum;$('#shareAlbum').onclick=showShare;$('#play').onclick=togglePlayback;
$('#toolsClose').onclick=()=>{if(exportJob)exportJob.cancelled=true;else toolsDialog.close()};
toolsDialog.addEventListener('cancel',e=>{if(exporting){e.preventDefault();exportJob.cancelled=true}});
toolsDialog.addEventListener('close',()=>{if(videoURL){URL.revokeObjectURL(videoURL);videoURL=null}$('#toolsStatus').textContent='';$('#toolsClose').textContent='关闭'});

// Render the same CSS layout into video frames. Text positions come from DOM Ranges;
// images retain their measured natural aspect ratio, including on narrow screens.
async function snapshotPage(target){
  await Promise.all([...target.querySelectorAll('img')].map(img=>img.decode()));
  const bounds=target.getBoundingClientRect(),out=document.createElement('canvas');out.width=720;out.height=960;
  const ctx=out.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,720,960);
  const sx=720/bounds.width,sy=960/bounds.height;ctx.scale(sx,sy);
  for(const img of target.querySelectorAll('img')){const r=img.getBoundingClientRect();if(!r.width||!r.height)continue;const fit=Math.min(r.width/img.naturalWidth,r.height/img.naturalHeight),w=img.naturalWidth*fit,h=img.naturalHeight*fit;ctx.drawImage(img,r.left-bounds.left+(r.width-w)/2,r.top-bounds.top+(r.height-h)/2,w,h)}
  const walker=document.createTreeWalker(target,NodeFilter.SHOW_TEXT);let text;
  while(text=walker.nextNode()){
    const parent=text.parentElement,style=getComputedStyle(parent);if(parent.closest('.sr-only')||style.display==='none'||!text.textContent.trim())continue;
    ctx.fillStyle=style.color;ctx.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const range=document.createRange();let offset=0;
    for(const char of text.textContent){range.setStart(text,offset);offset+=char.length;range.setEnd(text,offset);if(!char.trim())continue;const r=range.getBoundingClientRect();if(!r.width||!r.height)continue;const m=ctx.measureText(char),asc=m.actualBoundingBoxAscent,desc=m.actualBoundingBoxDescent;ctx.fillText(char,r.left-bounds.left,r.top-bounds.top+(r.height-asc-desc)/2+asc)}
  }
  return out;
}
async function filmPages(job){
  const saved=sheets;filmLayout=true;buildPlan();const plan=sheets.slice();filmLayout=false;sheets=saved;
  const frames=new Array(plan.length);
  frames.ensure=async i=>{
    if(i>=frames.length||frames[i])return;if(job.cancelled)throw new Error('已取消导出');
    const savedSheets=sheets,host=node('div','film-layout'),a=node('div','page left'),b=node('div','page right');
    host.append(a,b);document.body.append(host);filmLayout=true;sheets=plan;
    try{fill(a,'left',i);fill(b,'right',i);frames[i]=[await snapshotPage(a),await snapshotPage(b)]}
    finally{host.remove();filmLayout=false;sheets=savedSheets}
  };
  $('#toolsStatus').textContent='正在准备书页';await frames.ensure(0);await frames.ensure(1);return frames;
}
function drawFilm(ctx,frames,index,t=null){
  const W=1920,H=1080,bw=1320,bh=880,x=(W-bw)/2,y=(H-bh)/2,half=bw/2;
  ctx.fillStyle='#303230';ctx.fillRect(0,0,W,H);ctx.fillStyle='#e9ece6';ctx.font='16px Arial, "PingFang SC", sans-serif';ctx.textAlign='left';ctx.fillText(album.name,110,57);ctx.textAlign='right';ctx.fillText('A PERSONAL TRAVEL JOURNAL',1810,57);ctx.textAlign='left';
  ctx.save();ctx.shadowColor='#0007';ctx.shadowBlur=36;ctx.shadowOffsetY=16;ctx.fillStyle='#cbd0c7';ctx.fillRect(x,y+5,bw,bh);ctx.restore();
  ctx.drawImage(frames[index][0],x,y,half,bh);ctx.drawImage(t===null?frames[index][1]:frames[index+1][1],x+half,y,half,bh);
  if(t!==null){
    // Spine stays fixed; perspective and a small bow vary continuously through 180°.
    const eased=t*t*(3-2*t),angle=Math.PI*eased,cos=Math.cos(angle),sin=Math.sin(angle),rightSide=cos>=0;
    const sheet=rightSide?frames[index][1]:frames[index+1][0],N=120;
    ctx.save();
    for(let j=0;j<N;j++){
      const u=j/N,u2=(j+1)/N,z=sin*u*half*.45,p=1/(1-z/2800),p2=1/(1-sin*u2*half*.45/2800),px=x+half+cos*u*half*p,px2=x+half+cos*u2*half*p2;
      const top=y-bh*(p-1)/2-Math.sin(u*Math.PI)*sin*9,height=bh*p;
      ctx.drawImage(sheet,(rightSide?u:1-u2)*720,0,720/N,960,Math.min(px,px2),top,Math.abs(px2-px)+.8,height);
    }
    ctx.restore();
    ctx.fillStyle=`rgba(30,30,30,${sin*.13})`;const end=x+half+cos*half/(1-sin*half*.45/2800);ctx.fillRect(Math.min(x+half,end),y,Math.abs(end-x-half),bh);
  }
  const fold=ctx.createLinearGradient(x+half-9,0,x+half+9,0);fold.addColorStop(0,'#0000');fold.addColorStop(.5,'#0002');fold.addColorStop(1,'#0000');ctx.fillStyle=fold;ctx.fillRect(x+half-9,y,18,bh);
  ctx.textAlign='center';ctx.font='16px Arial';ctx.fillStyle='#e9ece6';ctx.fillText(`${pad(index+1)} / ${pad(frames.length)}`,W/2,1035);ctx.textAlign='left';
}
function animateFilm(duration,job,draw){return new Promise((resolve,reject)=>{let start=null;function tick(now){if(job.cancelled){reject(new Error('已取消导出'));return}if(document.hidden){reject(new Error('导出已停止：请保持相册页面在前台，再重新导出。'));return}if(start===null)start=now;const t=Math.min(1,(now-start)/duration);draw(t);if(t<1)requestAnimationFrame(tick);else resolve()}requestAnimationFrame(tick)})}
async function exportFilm(seconds){
  if(exporting||!album||turning)return;
  exporting=true;const job={cancelled:false};exportJob=job;const selectedAlbum=album;let stream,recorder;
  toolsBody.querySelectorAll('.film-preview,.film-download').forEach(e=>e.remove());
  if(videoURL){URL.revokeObjectURL(videoURL);videoURL=null}
  $('#startFilm').disabled=true;$('#toolsClose').textContent='取消导出';$('#close').disabled=true;$('#filmSeconds').disabled=true;
  try{
    if(typeof MediaRecorder==='undefined'||!HTMLCanvasElement.prototype.captureStream)throw new Error('此浏览器不支持视频导出，请用桌面版 Chrome 或 Edge 打开相册。');
    const mime=['video/mp4;codecs=avc1.42001E','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));if(!mime)throw new Error('此浏览器没有可用的视频编码器，请用桌面版 Chrome 或 Edge。');
    const frames=await filmPages(job),canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080;canvas.className='film-preview';canvas.setAttribute('aria-label','视频导出预览');toolsBody.append(canvas);const ctx=canvas.getContext('2d');drawFilm(ctx,frames,0);
    stream=canvas.captureStream(30);recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:8000000});const chunks=[];
    const done=new Promise((resolve,reject)=>{recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.onstop=()=>resolve(new Blob(chunks,{type:recorder.mimeType}));recorder.onerror=e=>reject(e.error||new Error('视频编码失败'))});
    // Mark rejection handled until animation completes, while preserving propagation below.
    done.catch(()=>{});recorder.start(1000);let animationError;
    try{for(let i=0;i<frames.length;i++){await frames.ensure(i+1);$('#toolsStatus').textContent=`正在导出 ${i+1} / ${frames.length} · 请保持页面在前台`;await animateFilm(seconds*1000,job,()=>drawFilm(ctx,frames,i));if(i<frames.length-1)await animateFilm(1100,job,t=>drawFilm(ctx,frames,i,t));frames[i]=null}}
    catch(error){animationError=error}
    if(recorder.state!=='inactive')recorder.stop();const blob=await done;if(animationError)throw animationError;if(!blob.size)throw new Error('视频文件为空，请重新导出。');
    videoURL=URL.createObjectURL(blob);const isMP4=blob.type.startsWith('video/mp4'),ext=isMP4?'mp4':'webm',link=node('a','tool-button film-download','下载翻页视频 '+ext.toUpperCase());link.href=videoURL;link.download=safeName(selectedAlbum.name)+'-翻页视频.'+ext;toolsBody.append(link);$('#toolsStatus').textContent=`视频已生成 · ${(blob.size/1024/1024).toFixed(1)} MB`;
    if(!isMP4)note('此浏览器导出为 WebM。如需发朋友圈等平台，可以让 Codex 将下载的视频转成 MP4。');
  }catch(error){$('#toolsStatus').textContent=error.message||'导出失败，请重试。'}
  finally{if(recorder&&recorder.state!=='inactive')recorder.stop();if(stream)stream.getTracks().forEach(t=>t.stop());exporting=false;exportJob=null;$('#startFilm').disabled=false;$('#filmSeconds').disabled=false;$('#close').disabled=false;$('#toolsClose').textContent='关闭';const photoIndex=sheets[page].start;buildPlan();page=Math.max(0,sheets.findIndex(p=>photoIndex>=p.start&&photoIndex<p.start+p.count));update()}
}
function showFilm(){if(turning||exporting)return;showTools('导出翻页视频');note('将当前相册从第一页开始，生成 1920 × 1080 的翻页视频。照片完整显示，保留杂志排版。');const label=node('label','tool-label','每页停留 '),select=node('select');select.id='filmSeconds';select.setAttribute('aria-label','每页停留秒数');[1,3,4,6].forEach(n=>{const o=node('option','',n+' 秒');o.value=n;o.selected=n===4;select.append(o)});label.append(select);toolsBody.append(label);const button=toolButton('开始导出',()=>exportFilm(Number(select.value)));button.id='startFilm';note('请保持页面在前台，导出所需时间与视频长度接近。默认无音乐。');}
$('#exportFilm').onclick=showFilm;

// Editing operates on photo order, so page layouts and downloaded files agree.
let editingPhotos=false,selectedPhoto=null,photoUndo=[],resizingPhotos=false,sizeGesture=null,suppressSizeClick=false;
function refreshPhotoSelection(){spread.querySelectorAll('.size-controls').forEach(e=>e.remove());if($('#undoSwap'))$('#undoSwap').hidden=!editingPhotos||!photoUndo.some(h=>h.album===album);spread.querySelectorAll('.photo').forEach(e=>{e.classList.toggle('selected',editingPhotos&&Number(e.dataset.photoIndex)===selectedPhoto);if(resizingPhotos&&Number(e.dataset.photoIndex)===selectedPhoto)attachSizeControls(e);e.setAttribute('aria-label',(resizingPhotos?'调整大小':editingPhotos?'选择交换':'放大查看')+'第'+(Number(e.dataset.photoIndex)+1)+'张照片')})}
function endPhotoEdit(){resizingPhotos=false;sizeGesture=null;$('#resizePhotos').textContent='调整大小';$('#resizePhotos').setAttribute('aria-pressed','false');viewer.classList.remove('resizing');editingPhotos=false;selectedPhoto=null;viewer.classList.remove('editing');$('#editPhotos').textContent='调整照片';$('#editPhotos').setAttribute('aria-pressed','false');$('#editHint').hidden=true;refreshPhotoSelection()}
function refreshCoverImages(){const index=albums.indexOf(album),scene=$('#albumGrid').children[index];scene.querySelector('.cover-photo img').src=album.photos[0].src;const candidates=album.photos.slice(1),landscape=candidates.filter(p=>p.w>=p.h),extras=(landscape.length>=2?landscape:candidates).slice(0,2);scene.querySelectorAll('.loose-photo img').forEach((img,i)=>{if(extras[i])img.src=extras[i].src})}
function swapPhotos(first,second){if(!album||turning||exporting||first===second)return;stopPlayback();photoUndo.push({album,photos:album.photos.slice()});[album.photos[first],album.photos[second]]=[album.photos[second],album.photos[first]];selectedPhoto=null;update();refreshCoverImages();$('#editHint').textContent='位置已交换。继续选两张照片，或点击「完成调整」；下载相册可保存修改。'}
function showPhoto(index){if(!album||turning||exporting)return;showTools((album.kind==='document'?'查看书页 · ':'查看照片 · ')+pad(index+1));const wrap=node('div','photo-zoom'),img=node('img'),actions=node('div','zoom-actions');img.src=album.photos[index].src;img.alt=album.name+'第'+(index+1)+'张照片';wrap.append(img);toolsBody.append(wrap,actions);let scale=1;function apply(){const p=album.photos[index],w=wrap.clientWidth,h=wrap.clientHeight,base=Math.min(w/p.w,h/p.h);img.style.width=p.w*base*scale+'px';img.style.height=p.h*base*scale+'px';wrap.style.placeItems=scale===1?'center':'start center'}function action(label,fn){const b=node('button','tool-button',label);b.type='button';b.onclick=fn;actions.append(b)}action('− 缩小',()=>{scale=Math.max(1,scale-.5);apply()});action('+ 放大',()=>{scale=Math.min(4,scale+.5);apply()});action('完整显示',()=>{scale=1;apply()});if(album.kind!=='document')action('交换位置',()=>showSwapPicker(index));requestAnimationFrame(apply);note('放大后可滚动查看细节，原照片不会被裁切。')}
function showSwapPicker(index){showTools('与哪张照片交换位置？');const grid=node('div','swap-grid');toolsBody.append(grid);album.photos.forEach((p,i)=>{const b=node('button','swap-choice'),img=node('img');b.type='button';b.disabled=i===index;b.setAttribute('aria-label','与第'+(i+1)+'张照片交换');img.src=p.src;img.alt='';b.append(img,node('span','',pad(i+1)));b.onclick=()=>{swapPhotos(index,i);toolsDialog.close()};grid.append(b)});note('可选择相册内任意照片，包括其他页面。下载相册后保留修改。');if(photoUndo.some(h=>h.album===album))toolButton('撤销上次交换',undoPhotoSwap)}
function undoPhotoSwap(){const i=photoUndo.findLastIndex(h=>h.album===album);if(i<0)return;album.photos=photoUndo.splice(i,1)[0].photos;selectedPhoto=null;update();refreshCoverImages();$('#editHint').textContent='已撤销交换。依次选择两张照片可继续调整。';toolsDialog.close()}
$('#editPhotos').onclick=()=>{if(turning||exporting)return;stopPlayback();if(resizingPhotos)endPhotoEdit();if(editingPhotos){endPhotoEdit();return}editingPhotos=true;selectedPhoto=null;viewer.classList.add('editing');$('#editPhotos').textContent='完成调整';$('#editPhotos').setAttribute('aria-pressed','true');$('#editHint').hidden=false;$('#editHint').textContent='依次点击两张照片交换位置，也可拖动照片到另一张上；可翻页选择。';refreshPhotoSelection()};
function activatePhoto(e){if(e.target.closest('.size-controls'))return;if(suppressSizeClick){suppressSizeClick=false;return}const figure=e.target.closest('.photo,.document-page');if(!figure||turning||exporting)return;const index=Number(figure.dataset.photoIndex);stopPlayback();if(!editingPhotos){showPhoto(index);return}if(resizingPhotos){selectedPhoto=index;refreshPhotoSelection();$('#editHint').textContent='拖动绿色边角调整大小；保持照片比例，不裁切。完成后保存相册。';return}if(selectedPhoto===null){selectedPhoto=index;refreshPhotoSelection();$('#editHint').textContent='已选第 '+pad(index+1)+' 张，请选择另一张；可翻页继续选择。'}else if(selectedPhoto===index){selectedPhoto=null;refreshPhotoSelection()}else swapPhotos(selectedPhoto,index)}
spread.addEventListener('click',activatePhoto);spread.addEventListener('keydown',e=>{if(e.target.closest('.photo,.document-page')&&['Enter',' '].includes(e.key)){e.preventDefault();activatePhoto(e)}});
spread.addEventListener('dragstart',e=>{const photo=e.target.closest('.photo');if(!editingPhotos||resizingPhotos||turning||exporting||!photo){e.preventDefault();return}selectedPhoto=Number(photo.dataset.photoIndex);e.dataTransfer.setData('text/plain',String(selectedPhoto));e.dataTransfer.effectAllowed='move';refreshPhotoSelection()});
spread.addEventListener('dragover',e=>{if(editingPhotos&&e.target.closest('.photo'))e.preventDefault()});spread.addEventListener('drop',e=>{const photo=e.target.closest('.photo');if(!editingPhotos||!photo||selectedPhoto===null)return;e.preventDefault();swapPhotos(selectedPhoto,Number(photo.dataset.photoIndex))});

$('#saveReader').onclick=saveAlbum;$('#undoSwap').onclick=undoPhotoSwap;

function photoScale(figure){if(figure.classList.contains('full-page'))return 1;const base=JSON.parse(figure.dataset.baseBox);return parseFloat(figure.style.width)/base.w}
function fitPhotoScale(figure,wanted){const base=JSON.parse(figure.dataset.baseBox),cx=base.x+base.w/2,cy=base.y+base.h/2,parent=figure.parentElement,rect=parent.getBoundingClientRect();const blockers=[...parent.querySelectorAll('.photo,.section-title,.display-title,.editorial-copy,.wide-word')].filter(e=>e!==figure).map(e=>{const r=e.getBoundingClientRect();return {x:(r.left-rect.left)/rect.width*100,y:(r.top-rect.top)/rect.height*100,w:r.width/rect.width*100,h:r.height/rect.height*100}});
 function fits(scale){const x=cx-base.w*scale/2,y=cy-base.h*scale/2,w=base.w*scale,h=base.h*scale;if(x<4||x+w>96||y<11||y+h>91)return false;return blockers.every(b=>x+w<=b.x-1||x>=b.x+b.w+1||y+h<=b.y-1||y>=b.y+b.h+1)}
 let scale=Math.max(.35,Math.min(2.5,wanted));if(fits(scale))return scale;let lo=.35,hi=scale;for(let i=0;i<18;i++){const mid=(lo+hi)/2;if(fits(mid))lo=mid;else hi=mid}return Math.min(scale,lo)}
function applyPhotoScale(figure,scale){if(figure.classList.contains('full-page')){figure.classList.remove('full-page');figure.parentElement.classList.remove('full-page-layout')}const base=JSON.parse(figure.dataset.baseBox);scale=fitPhotoScale(figure,scale);Object.assign(figure.style,{left:base.x+base.w*(1-scale)/2+'%',top:base.y+base.h*(1-scale)/2+'%',width:base.w*scale+'%',height:base.h*scale+'%'});const data=album.photos[Number(figure.dataset.photoIndex)];data.sizes??={};data.sizes[mobile()?'mobile':'desktop']=scale;const label=figure.querySelector('.size-label');if(label)label.textContent=Math.round(scale*100)+'%';return scale}
function attachSizeControls(figure){const controls=node('div','size-controls'),actions=node('div','size-actions'),label=node('span','size-label',figure.classList.contains('full-page')?'整页':Math.round(photoScale(figure)*100)+'%');function action(text,title,fn){const b=node('button','',text);b.type='button';b.setAttribute('aria-label',title);b.onclick=e=>{e.stopPropagation();fn()};actions.append(b)}action('−','缩小画册照片',()=>applyPhotoScale(figure,photoScale(figure)-.1));actions.append(label);action('+','放大画册照片',()=>applyPhotoScale(figure,photoScale(figure)+.1));action('整页','照片设为整页大小',()=>setPhotoFullPage(figure));action('复原','恢复照片排版大小',()=>{delete album.photos[Number(figure.dataset.photoIndex)].sizes?.[mobile()?'mobile':'desktop'];update()});controls.append(actions);['nw','ne','sw','se'].forEach(corner=>{const handle=node('button','size-handle');handle.type='button';handle.dataset.corner=corner;handle.setAttribute('aria-label','拖动'+({nw:'左上',ne:'右上',sw:'左下',se:'右下'}[corner])+'角调整照片大小');controls.append(handle)});figure.append(controls)}
$('#resizePhotos').onclick=()=>{if(turning||exporting)return;stopPlayback();if(resizingPhotos){endPhotoEdit();return}endPhotoEdit();editingPhotos=resizingPhotos=true;viewer.classList.add('editing','resizing');$('#resizePhotos').textContent='完成缩放';$('#resizePhotos').setAttribute('aria-pressed','true');$('#editHint').hidden=false;$('#editHint').textContent='点击一张照片，再拖动绿色边角调整大小。';refreshPhotoSelection()};
spread.addEventListener('pointerdown',e=>{const handle=e.target.closest('.size-handle');if(!handle||!resizingPhotos||turning||exporting)return;e.preventDefault();e.stopPropagation();const figure=handle.closest('.photo'),r=figure.getBoundingClientRect();sizeGesture={figure,handle,id:e.pointerId,cx:r.left+r.width/2,cy:r.top+r.height/2,dx:e.clientX-(r.left+r.width/2),dy:e.clientY-(r.top+r.height/2),scale:photoScale(figure)};handle.setPointerCapture(e.pointerId)});
spread.addEventListener('pointermove',e=>{if(!sizeGesture||e.pointerId!==sizeGesture.id)return;e.preventDefault();const g=sizeGesture,dx=e.clientX-g.cx,dy=e.clientY-g.cy,mult=(dx*g.dx+dy*g.dy)/(g.dx*g.dx+g.dy*g.dy);applyPhotoScale(g.figure,g.scale*mult)});
function endSizeGesture(e){if(!sizeGesture||e.pointerId!==sizeGesture.id)return;suppressSizeClick=true;const g=sizeGesture;sizeGesture=null;if(g.handle.hasPointerCapture(e.pointerId))g.handle.releasePointerCapture(e.pointerId);setTimeout(()=>suppressSizeClick=false,0)}
spread.addEventListener('pointerup',endSizeGesture);spread.addEventListener('pointercancel',endSizeGesture);

function setPhotoFullPage(figure){const index=Number(figure.dataset.photoIndex),mode=mobile()?'mobile':'desktop';figure.parentElement.querySelectorAll('.photo').forEach(other=>{const data=album.photos[Number(other.dataset.photoIndex)];if(data.sizes?.[mode]==='page')delete data.sizes[mode]});const data=album.photos[index];data.sizes??={};data.sizes[mode]='page';selectedPhoto=index;update();$('#editHint').textContent='照片已设为整页大小，完整显示原图；点击「复原」返回原排版。';}

// Small depth cues, only on precise pointers and when motion is welcome.
$('#albumGrid').querySelectorAll('.album-scene').forEach(scene=>{scene.addEventListener('pointermove',e=>{if(album||!matchMedia('(hover:hover) and (pointer:fine)').matches||reducedMotion())return;const r=scene.getBoundingClientRect();scene.style.setProperty('--scene-x',((e.clientX-r.left)/r.width-.5)*8+'px');scene.style.setProperty('--scene-y',((e.clientY-r.top)/r.height-.5)*6+'px')});scene.addEventListener('pointerleave',()=>{scene.style.setProperty('--scene-x','0px');scene.style.setProperty('--scene-y','0px')})});
