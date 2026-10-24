#!/usr/bin/env node
/** Browser measurements and screenshots against the running game. No dependencies.
 * node tools/check-game-ui.mjs [--sizes=375x812,812x375,1440x900]
 *   [--states=game,inventory,refine,cultivator,wiki] [--text-scale=2]
 *   [--reduced-motion] [--out=.tmp/ui-qa] [--resume]
 */
import { mkdir, writeFile, readFile, lstat, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...value] = arg.replace(/^--/, '').split('=');
  return [key, value.length ? value.join('=') : true];
}));
const base = args['base-url'] || 'http://127.0.0.1:5173';
const chrome = args.chrome || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const out = path.resolve(root, args.out || '.tmp/ui-qa');
const tempRoot = path.resolve(root, 'cotienlo-game/.tmp');
const artifactRoot = path.resolve(root, '.tmp');
if (out !== artifactRoot && !out.startsWith(artifactRoot + path.sep)) {
  throw new Error('QA artifacts must remain inside the workspace root .tmp directory, outside Vite watch scope.');
}
const sizes = String(args.sizes || '375x812,812x375,568x320,1440x900').split(',').map((v) => v.split('x').map(Number));
const states = String(args.states || 'game,inventory,refine,cultivator,wiki').split(',');
if(sizes.some(size=>size.length!==2||size.some(value=>!Number.isInteger(value)||value<=0||value>20000)))throw new Error('Sizes must be positive integer widthxheight pairs.');
if(states.some(state=>!['game','inventory','refine','cultivator','wiki'].includes(state)))throw new Error('Unknown QA state.');
const scale = Number(args['text-scale'] || 1);
if(args.resume&&args['wiki-keyboard-audit'])throw new Error('Keyboard audits must run fresh, without --resume.');
const fixturePath = path.join(tempRoot, 'ui-qa-fixture.html');
await mkdir(out, { recursive: true });

// Hidden results are emitted into dump-dom while the iframe fills the screenshot.
// All assertions observe actual DOM state/computed geometry, never source strings.
await writeFile(fixturePath, String.raw`<!doctype html><html><head><meta charset="UTF-8"><style>html,body{margin:0;padding:0;overflow:hidden;background:#081511}iframe{position:absolute;left:0;top:0;border:0}#qa-results{display:none}</style></head><body><iframe id="app" title="Game under test" src="/"></iframe><pre id="qa-results">{"status":"loading"}</pre><script>
(async () => {
  const params = new URLSearchParams(location.search);
  const width = Number(params.get('width')), height = Number(params.get('height'));
  const state = params.get('state'), textScale = Number(params.get('textScale'));
  const frame = document.getElementById('app');
  frame.style.width = width + 'px'; frame.style.height = height + 'px';
  const result = { status:'running', state, requestedViewport:{width,height}, textScale, failures:[], checks:{} };
  const finish = () => { document.getElementById('qa-results').textContent=JSON.stringify(result); document.documentElement.dataset.qaReady='true'; };
  const wait = (ms) => new Promise(resolve => setTimeout(resolve,ms));
  try {
    await new Promise(resolve => { if(frame.contentDocument.readyState==='complete' && frame.contentDocument.querySelector('#top-hud')) resolve(); else frame.addEventListener('load',resolve,{once:true}); });
    const w=frame.contentWindow,d=w.document;
    await wait(350);
    // Remove the initial greeting only in this throwaway QA document so it cannot
    // obstruct the UI being reviewed. Production toast behavior is unchanged.
    d.getElementById('toast-container')?.replaceChildren();
    result.checks.transientToastCleared=true;
    const settle=()=>{for(const animation of d.getAnimations()){try{if(Number.isFinite(animation.effect.getComputedTiming().endTime))animation.finish();}catch{}}};
    const flushLayout=async()=>{for(let pass=0;pass<3;pass++){await new Promise(resolve=>w.requestAnimationFrame(resolve));settle();}};
    const fail=(kind,details)=>result.failures.push({kind,...details});
    const name=(e)=>e.id ? '#'+e.id : e.tagName.toLowerCase()+(e.className&&typeof e.className==='string'?'.'+e.className.trim().replace(/\s+/g,'.'):'');
    const rect=(e)=>{const r=e.getBoundingClientRect();return {x:Math.round(r.x*10)/10,y:Math.round(r.y*10)/10,width:Math.round(r.width*10)/10,height:Math.round(r.height*10)/10,right:Math.round(r.right*10)/10,bottom:Math.round(r.bottom*10)/10};};
    const visible=(e)=>{if(!e||!e.getClientRects().length)return false;for(let p=e;p&&p.nodeType===1;p=p.parentElement){const s=w.getComputedStyle(p);if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0||p.hidden)return false;if(p.tagName==='DETAILS'&&!p.open){const summary=p.querySelector(':scope > summary');if(!summary||!(summary===e||summary.contains(e)))return false;}}return true;};
    const intersect=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y));
    const inViewport=(r)=>r.x>=-1&&r.y>=-1&&r.right<=width+1&&r.bottom<=height+1;
    const opener=state==='game'?null:d.getElementById('btn-open-'+state);
    if(opener){opener.focus({preventScroll:true});opener.click();await wait(300);settle();}
    const modal=state==='game'?null:d.getElementById('modal-'+state);
    if(modal&&!modal.classList.contains('active'))fail('modal-did-not-open',{element:name(modal)});
    if(textScale!==1){
      const fonts=[...d.querySelectorAll('body,body *')].filter(e=>!['CANVAS','SVG','PATH'].includes(e.tagName)).map(e=>[e,parseFloat(w.getComputedStyle(e).fontSize)]);
      for(const [e,size] of fonts)e.style.setProperty('font-size',(size*textScale)+'px','important');
      await wait(100);
    }
    await flushLayout();
    result.viewport={width:w.innerWidth,height:w.innerHeight,dpr:w.devicePixelRatio};
    result.checks.canvas={...rect(d.getElementById('game-canvas')),pixels:[d.getElementById('game-canvas').width,d.getElementById('game-canvas').height]};
    result.checks.horizontalOverflow={document:d.documentElement.scrollWidth,body:d.body.scrollWidth,viewport:width};
    if(d.documentElement.scrollWidth>width+1||d.body.scrollWidth>width+1)fail('page-horizontal-overflow',result.checks.horizontalOverflow);
    const game=d.getElementById('game-container'),gameStyle=w.getComputedStyle(game);
    const scrollGame=!modal&&/auto|scroll/.test(gameStyle.overflowY)&&game.scrollHeight>game.clientHeight+1;
    result.checks.gameScroll={enabled:scrollGame,overflowY:gameStyle.overflowY,scrollHeight:game.scrollHeight,clientHeight:game.clientHeight,scrollWidth:game.scrollWidth,clientWidth:game.clientWidth};
    if(game.scrollWidth>game.clientWidth+1)fail('game-horizontal-overflow',result.checks.gameScroll);
    const initialGameScroll=game.scrollTop;
    const hitAtCenter=e=>{const r=rect(e),hit=d.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {hit:hit?name(hit):null,inside:hit===e||e.contains(hit)};};
    const reach=e=>{
      e.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
      const centered=rect(e),hit=hitAtCenter(e),horizontal=centered.x>=-1&&centered.right<=width+1;
      e.scrollIntoView({block:'start',inline:'nearest',behavior:'instant'});const top=rect(e);
      e.scrollIntoView({block:'end',inline:'nearest',behavior:'instant'});const bottom=rect(e);
      const reachable=horizontal&&top.y>=-1&&top.y<=height+1&&bottom.bottom>=-1&&bottom.bottom<=height+1;
      e.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
      return {element:name(e),reachable,fullyVisible:inViewport(centered),rect:centered,scrollTop:game.scrollTop,topReachable:top.y>=-1&&top.y<=height+1,bottomReachable:bottom.bottom>=-1&&bottom.bottom<=height+1,...hit};
    };
    const scope=modal||d.getElementById('game-container');
    const controls=[...scope.querySelectorAll('button,input,select,textarea,summary,[role="button"],#btn-open-cultivator,.furnace-slot:not(.result-slot),.gu-mini-chip,.wiki-ben a,.wiki-featured-gu')].filter(visible);
    result.checks.controlColors=controls.map(e=>{const style=w.getComputedStyle(e);return {element:name(e),color:style.color,border:style.borderTopColor,background:style.backgroundColor};});
    result.controls=controls.map(e=>({element:name(e),text:(e.getAttribute('aria-label')||e.innerText||e.title||'').replace(/\s+/g,' ').trim().slice(0,80),rect:rect(e),disabled:!!e.disabled}));
    result.checks.scrollControls=[];
    for(const e of controls){
      if(scrollGame){const reached=reach(e);result.checks.scrollControls.push(reached);if(!reached.reachable||!reached.fullyVisible)fail('scroll-control-unreachable',reached);}
      const r=rect(e);
      if(r.width<43.9||r.height<43.9)fail('target-under-44px',{element:name(e),rect:r});
      if(e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+1)fail('control-content-overflow',{element:name(e),scroll:[e.scrollWidth,e.scrollHeight],client:[e.clientWidth,e.clientHeight]});
      // Scrollable modal-body descendants can sit outside the viewport until scrolled.
      if(!e.closest('.modal-body')&&!inViewport(r))fail('control-outside-viewport',{element:name(e),rect:r});
      if(e.closest('.modal-body')){const body=e.closest('.modal-body'),br=rect(body);if(r.x<br.x-1||r.right>br.right+1)fail('modal-control-horizontal-clipping',{element:name(e),rect:r,container:br});}
      const center={x:r.x+r.width/2,y:r.y+r.height/2},scrollBody=e.closest('.modal-body'),scrollRect=scrollBody?rect(scrollBody):null;
      if(center.x>=0&&center.x<width&&center.y>=0&&center.y<height&&(!scrollRect||(center.y>=scrollRect.y&&center.y<=scrollRect.bottom))){const hit=d.elementFromPoint(center.x,center.y);if(hit!==e&&!e.contains(hit))fail('control-center-obscured',{element:name(e),hit:hit?name(hit):null});}
      if(scrollGame)game.scrollTop=initialGameScroll;
    }
    if(!modal){
      // Text ranges catch overflowing glyphs even when flex item boxes shrink.
      result.checks.statusText=[...d.querySelectorAll('.bar-label')].filter(visible).map(group=>{
        const lines=[...group.children].map(e=>{const range=d.createRange();range.selectNodeContents(e);return {element:name(e),lines:[...range.getClientRects()].map(r=>({x:r.x,y:r.y,right:r.right,bottom:r.bottom}))};});
        for(let i=0;i<lines.length;i++)for(let j=i+1;j<lines.length;j++)if(lines[i].lines.some(a=>lines[j].lines.some(b=>intersect(a,b)>1)))fail('status-label-value-overlap',{first:lines[i],second:lines[j]});
        return lines;
      });
      const groups=['#btn-open-cultivator','.status-bars-container','.top-right-group','#quest-banner','#zone-indicator','#joystick-zone','#action-wheel'];
      result.groups=groups.map(selector=>d.querySelector(selector)).filter(visible).map(e=>({element:name(e),rect:rect(e)}));
      result.checks.scrollGroups=[];
      for(const group of result.groups){
        if(scrollGame){const element=groups.map(selector=>d.querySelector(selector)).find(e=>e&&name(e)===group.element);const reached=reach(element);result.checks.scrollGroups.push(reached);if(!reached.reachable)fail('scroll-group-unreachable',reached);if(w.getComputedStyle(element).pointerEvents!=='none'&&!reached.inside)fail('scroll-group-center-obscured',reached);game.scrollTop=initialGameScroll;}
        else if(!inViewport(group.rect))fail('group-outside-viewport',group);
      }
      for(let i=0;i<result.groups.length;i++)for(let j=i+1;j<result.groups.length;j++)if(intersect(result.groups[i].rect,result.groups[j].rect)>2)fail('group-overlap',{first:result.groups[i],second:result.groups[j]});
      for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){if(controls[i].contains(controls[j])||controls[j].contains(controls[i]))continue;const a=rect(controls[i]),b=rect(controls[j]);if(intersect(a,b)>2)fail('control-overlap',{first:name(controls[i]),second:name(controls[j]),firstRect:a,secondRect:b});}
      if(scrollGame){
        game.scrollTop=game.scrollHeight;
        result.checks.canvasAfterScroll=rect(d.getElementById('game-canvas'));
        const cr=result.checks.canvasAfterScroll;
        if(Math.abs(cr.x)>1||Math.abs(cr.y)>1||Math.abs(cr.width-width)>1||Math.abs(cr.height-height)>1)fail('canvas-moved-after-scroll',cr);
        // Exercise a real feedback-producing action while the game is scrolled.
        d.getElementById('btn-gu-heal').click();
        await wait(50);await flushLayout();
        const toastContainer=d.getElementById('toast-container'),toast=toastContainer.lastElementChild;
        if(!toast)fail('skill-toast-missing-after-scroll',{});
        else {
          if(textScale!==1)toast.style.setProperty('font-size',(parseFloat(w.getComputedStyle(toast).fontSize)*textScale)+'px','important');
          await flushLayout();
          result.checks.toastAfterScroll={text:toast.textContent,visible:visible(toast),rect:rect(toast),containerPosition:w.getComputedStyle(toastContainer).position,scrollTop:game.scrollTop};
          if(!visible(toast)||!inViewport(rect(toast)))fail('skill-toast-outside-viewport',result.checks.toastAfterScroll);
        }
        toastContainer.replaceChildren();
        game.scrollTop=initialGameScroll;
      }
      if(params.get('cooldownAudit')==='1'){
        const button=d.getElementById('btn-gu-heal'),overlay=d.getElementById('cd-heal');
        button.click();await wait(50);await flushLayout();
        const overlayStyle=w.getComputedStyle(overlay),labels=[...button.querySelectorAll('.btn-sub,.gu-cost')].map(label=>({text:label.textContent,zIndex:w.getComputedStyle(label).zIndex,color:w.getComputedStyle(label).color,rect:rect(label)}));
        result.checks.cooldownLabels={overlay:{display:overlayStyle.display,zIndex:overlayStyle.zIndex,rect:rect(overlay)},labels};
        if(overlayStyle.display==='none')fail('cooldown-overlay-inactive',result.checks.cooldownLabels);
        for(const label of labels)if(!(Number(label.zIndex)>Number(overlayStyle.zIndex)))fail('cooldown-label-under-overlay',{label,overlay:result.checks.cooldownLabels.overlay});
        d.getElementById('toast-container')?.replaceChildren();
      }
    } else {
      const card=modal.querySelector('.modal-card'),body=modal.querySelector('.modal-body');
      const dialog=modal.matches('[role="dialog"]')?modal:modal.querySelector('[role="dialog"]');
      result.checks.dialog={role:dialog?.getAttribute('role'),ariaModal:dialog?.getAttribute('aria-modal'),labelledBy:dialog?.getAttribute('aria-labelledby'),card:rect(card),body:{...rect(body),scrollHeight:body.scrollHeight,clientHeight:body.clientHeight,scrollWidth:body.scrollWidth,clientWidth:body.clientWidth},focused:d.activeElement?.id||d.activeElement?.className};
      if(!dialog||dialog.getAttribute('aria-modal')!=='true'||!d.getElementById(dialog.getAttribute('aria-labelledby')))fail('dialog-semantics',{});
      if(!inViewport(rect(card)))fail('modal-outside-viewport',{rect:rect(card)});
      if(body.scrollWidth>body.clientWidth+1)fail('modal-horizontal-overflow',{scrollWidth:body.scrollWidth,clientWidth:body.clientWidth});
      const lastBodyControl=[...body.querySelectorAll('button,[role="button"]')].filter(visible).at(-1);
      if(lastBodyControl){const initialScroll=body.scrollTop;lastBodyControl.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});const target=rect(lastBodyControl),viewport=rect(body);result.checks.lastBodyControlReachable=target.y>=viewport.y-1&&target.bottom<=viewport.bottom+1;if(!result.checks.lastBodyControlReachable)fail('last-modal-control-unreachable',{element:name(lastBodyControl),target,viewport});body.scrollTop=initialScroll;}
      const header=modal.querySelector('.modal-header'),close=modal.querySelector('.btn-close'),title=header.querySelector('h2');
      if(intersect(rect(close),rect(title))>2)fail('dialog-heading-close-overlap',{title:rect(title),close:rect(close)});
      if(!modal.contains(d.activeElement))fail('focus-not-in-modal',{focused:d.activeElement?.id||d.activeElement?.tagName});
      if(state==='wiki'){
        const toc=modal.querySelector('.wiki-ben');
        if(toc){
          const wasOpen=toc.open,scrollPositions=[...modal.querySelectorAll('*')].filter(e=>e.scrollHeight>e.clientHeight+1).map(e=>[e,e.scrollTop]);
          toc.open=true;await flushLayout();
          result.checks.wikiExpandedTargets=[];
          for(const target of toc.querySelectorAll('a'))if(visible(target)){
            target.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
            const bounds=rect(target),hit=hitAtCenter(target),entry={text:target.textContent.trim(),rect:bounds,...hit};
            result.checks.wikiExpandedTargets.push(entry);
            if(bounds.width<43.9||bounds.height<43.9)fail('target-under-44px',{element:'Wiki contents: '+entry.text,rect:bounds});
            if(!inViewport(bounds)||!hit.inside)fail('expanded-wiki-navigation-unreachable',entry);
          }
          toc.open=wasOpen;for(const [element,top] of scrollPositions)element.scrollTop=top;await flushLayout();
        }
        const paperButton=modal.querySelector('.wiki-pill-btn:not(.active)');
        if(paperButton){
          paperButton.focus({preventScroll:true});
          const style=w.getComputedStyle(paperButton),ancestors=[];
          for(let parent=paperButton;parent;parent=parent.parentElement){const background=w.getComputedStyle(parent).backgroundColor;ancestors.push({element:name(parent),background});}
          const rgb=value=>{const values=value.match(/[\d.]+/g)?.map(Number);return values&&values.length>=3?values:null;};
          const surface=ancestors.slice(1).find(value=>{const color=rgb(value.background);return color&&(color.length===3||color[3]>=.99);});
          const luminance=value=>rgb(value).slice(0,3).map(channel=>{const scaled=channel/255;return scaled<=.04045?scaled/12.92:((scaled+.055)/1.055)**2.4;}).reduce((sum,channel,index)=>sum+channel*[.2126,.7152,.0722][index],0);
          const outline=rgb(style.outlineColor),contrast=surface&&outline?(Math.max(luminance(style.outlineColor),luminance(surface.background))+.05)/(Math.min(luminance(style.outlineColor),luminance(surface.background))+.05):null;
          result.checks.wikiFocus={element:name(paperButton),focusVisible:paperButton.matches(':focus-visible'),outlineColor:style.outlineColor,outlineWidth:style.outlineWidth,outlineStyle:style.outlineStyle,background:style.backgroundColor,surface,contrast,ancestors};
          if(paperButton.matches(':focus-visible')&&parseFloat(style.outlineWidth)>0&&contrast!==null&&contrast<3)fail('focus-indicator-low-contrast',result.checks.wikiFocus);
        }
      }
      const focusable=[...modal.querySelectorAll('button,[href],input,select,textarea,[tabindex]')].filter(e=>visible(e)&&!e.disabled&&e.tabIndex>=0);
      if(focusable.length>1){const first=focusable[0],last=focusable.at(-1);last.focus({preventScroll:true});d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));const forward=d.activeElement===first;first.focus({preventScroll:true});d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));const backward=d.activeElement===last;result.checks.focusTrap={forward,backward};if(!forward||!backward)fail('focus-trap-failed',{forward,backward});}
      d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
      result.checks.escapeClosed=!modal.classList.contains('active');
      result.checks.focusRestored=d.activeElement===opener;
      if(!result.checks.escapeClosed)fail('escape-did-not-close',{});
      if(!result.checks.focusRestored)fail('focus-not-restored',{focused:d.activeElement?.id||d.activeElement?.tagName});
      opener.focus({preventScroll:true});opener.click();await wait(300);settle();await flushLayout();
    }
    result.checks.reducedMotion=w.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(result.checks.reducedMotion){
      result.checks.animations=[...d.querySelectorAll('*')].filter(visible).flatMap(e=>{const s=w.getComputedStyle(e);return s.animationName==='none'&&s.transitionDuration.split(',').every(v=>parseFloat(v)<=.001)?[]:[{element:name(e),animation:s.animationName,duration:s.animationDuration,transition:s.transitionDuration}];});
      for(const a of result.checks.animations)if(a.animation!=='none'&&parseFloat(a.duration)>.001)fail('animation-with-reduced-motion',a);
    }
    result.status='complete';
  } catch(error){result.status='error';result.error=String(error&&error.stack||error);}
  finish();
})();
</script></body></html>`);

async function runChrome(options, url, width, height, screenshot) {
  const child = spawn(chrome, [...options,'--remote-debugging-port=0','about:blank'], { windowsHide: true });
  let chromeClosed=false;
  const closed=new Promise(resolve=>child.once('close',()=>{chromeClosed=true;resolve();}));
  let stderr='';
  const delay=(ms)=>new Promise(resolve=>{const timeout=setTimeout(resolve,ms);timeout.unref();});
  let socket,shutdownRequested=false;
  const timer=setTimeout(()=>child.kill(),30000);
  try {
    const endpoint=await new Promise((resolve,reject)=>{
      child.on('error',reject);
      child.on('close',code=>reject(new Error('Chrome exited before DevTools was ready: '+code+' '+stderr)));
      child.stderr.on('data',part=>{stderr+=part;const match=stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match)resolve(match[1]);});
    });
    socket=new WebSocket(endpoint);
    await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
    let nextId=0;
    const pending=new Map();
    const runtime={exceptions:[],consoleErrors:[],logErrors:[],failedGameRequests:[],ignored:[]};
    const requests=new Map(),inFlightAssets=new Set(),seenDiagnostics=new Set(),successfulDocuments=[];
    let pageSession,collecting=true;
    const localOrigin=new URL(base).origin;
    const benignFavicon=value=>{try{return new URL(value).pathname==='/favicon.ico';}catch{return false;}};
    const gameAsset=value=>{try{const parsed=new URL(value);return parsed.origin===localOrigin&&!parsed.pathname.startsWith('/.tmp/')&&!benignFavicon(value);}catch{return false;}};
    const benignAutoplay=message=>/AudioContext.*(not allowed|user gesture|user.*interact|autoplay)|autoplay.*(AudioContext|audio)/i.test(message);
    const addDiagnostic=(bucket,value)=>{const key=bucket+':'+JSON.stringify(value);if(!seenDiagnostics.has(key)){seenDiagnostics.add(key);runtime[bucket].push(value);}};
    socket.addEventListener('message',event=>{
      const message=JSON.parse(String(event.data));
      if(message.id){const request=pending.get(message.id);if(!request)return;pending.delete(message.id);message.error?request.reject(new Error(JSON.stringify(message.error))):request.resolve(message.result);return;}
      if(!collecting||message.sessionId!==pageSession)return;
      const params=message.params||{};
      if(message.method==='Runtime.exceptionThrown'){
        const details=params.exceptionDetails||{};
        addDiagnostic('exceptions',{message:details.exception?.description||details.text||'Uncaught exception',url:details.url||'',line:details.lineNumber,column:details.columnNumber,stack:details.stackTrace});
      } else if(message.method==='Runtime.consoleAPICalled'){
        const value={type:params.type,message:(params.args||[]).map(arg=>String(arg.value??arg.description??arg.type)).join(' '),stack:params.stackTrace};
        if(benignAutoplay(value.message))addDiagnostic('ignored',{reason:'host-audio-autoplay',...value});
        else if(params.type==='error'||params.type==='assert')addDiagnostic('consoleErrors',value);
      } else if(message.method==='Log.entryAdded'){
        const entry=params.entry||{},value={source:entry.source,level:entry.level,message:entry.text||'',url:entry.url||'',line:entry.lineNumber};
        if(benignFavicon(value.url))addDiagnostic('ignored',{reason:'favicon',...value});
        else if(benignAutoplay(value.message))addDiagnostic('ignored',{reason:'host-audio-autoplay',...value});
        else if(entry.level==='error'&&entry.source!=='network')addDiagnostic('logErrors',value);
      } else if(message.method==='Network.requestWillBeSent'){
        requests.set(params.requestId,{url:params.request.url,type:params.type,frameId:params.frameId,timestamp:params.timestamp});
        if(gameAsset(params.request.url)&&params.type!=='WebSocket')inFlightAssets.add(params.requestId);
      } else if(message.method==='Network.responseReceived'){
        const response=params.response||{},request=requests.get(params.requestId)||{};
        if(params.type==='Document'&&response.status>=200&&response.status<400)successfulDocuments.push({url:response.url,frameId:params.frameId,timestamp:params.timestamp});
        if(response.status>=400){const value={url:response.url||request.url,type:params.type||request.type,status:response.status,statusText:response.statusText};if(benignFavicon(value.url))addDiagnostic('ignored',{reason:'favicon',...value});else if(gameAsset(value.url))addDiagnostic('failedGameRequests',value);}
      } else if(message.method==='Network.loadingFailed'){
        inFlightAssets.delete(params.requestId);
        const request=requests.get(params.requestId)||{},value={url:request.url||'',type:params.type||request.type,error:params.errorText,canceled:!!params.canceled,frameId:request.frameId,timestamp:params.timestamp};
        if(benignFavicon(value.url))addDiagnostic('ignored',{reason:'favicon',...value});else if(gameAsset(value.url))addDiagnostic('failedGameRequests',value);
      } else if(message.method==='Network.loadingFinished')inFlightAssets.delete(params.requestId);
    });
    const command=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
    const target=await command('Target.createTarget',{url:'about:blank'});
    const attached=await command('Target.attachToTarget',{targetId:target.targetId,flatten:true});
    pageSession=attached.sessionId;
    const page=(method,params)=>command(method,params,attached.sessionId);
    await page('Page.enable');
    await page('Runtime.enable');
    await page('Log.enable');
    await page('Network.enable');
    await page('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    if(args['reduced-motion'])await page('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await page('Page.navigate',{url});
    const evaluate=async(expression)=>{const response=await page('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(response.exceptionDetails)throw new Error(response.exceptionDetails.exception?.description||response.exceptionDetails.text);return response.result?.value;};
    let ready=false;
    for(let attempt=0;attempt<150;attempt++){await delay(100);ready=await evaluate('document.documentElement.dataset.qaReady === "true"');if(ready)break;}
    if(!ready)throw new Error('QA fixture did not finish within 15 seconds.');
    await delay(200);
    for(let attempt=0;attempt<20&&inFlightAssets.size;attempt++)await delay(100);
    // Measurements and image now observe naturally rendered frames instead of
    // CLI virtual timers, which can starve ResizeObserver/rAF layout updates.
    const stdout=await evaluate('document.documentElement.outerHTML');
    const shot=await page('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await writeFile(screenshot,Buffer.from(shot.data,'base64'));
    let bottomScreenshot;
    if(await evaluate('JSON.parse(document.getElementById("qa-results").textContent).checks.gameScroll?.enabled')){
      await evaluate('(async()=>{const game=document.getElementById("app").contentDocument.getElementById("game-container");game.scrollTop=game.scrollHeight;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));})()');
      const bottom=await page('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      bottomScreenshot=screenshot.replace(/\.png$/,'-bottom.png');
      await writeFile(bottomScreenshot,Buffer.from(bottom.data,'base64'));
    }
    let wikiKeyboard;
    if(args['wiki-keyboard-audit']&&new URL(url).searchParams.get('state')==='wiki'){
      const press=async(key,code,number)=>{await page('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:number,nativeVirtualKeyCode:number,...(key==='Enter'?{text:'\r',unmodifiedText:'\r'}:{})});await page('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:number,nativeVirtualKeyCode:number});};
      const frames='await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));';
      const before=await evaluate('(async()=>{const w=document.getElementById("app").contentWindow,d=w.document;d.querySelector("[data-wiki-tab=co]").click();'+frames+'const target=d.querySelector("[data-loc]:not(.chon)");w.focus();target.focus();return {target:target.getAttribute("data-loc"),text:target.textContent,activeTag:d.activeElement.tagName,activeClass:d.activeElement.className,activeFilter:d.activeElement.getAttribute("data-loc")};})()');
      await press('Enter','Enter',13);
      const after=await evaluate('(async()=>{const d=document.getElementById("app").contentDocument;'+frames+'return {activeTag:d.activeElement.tagName,activeId:d.activeElement.id,activeClass:d.activeElement.className,activeFilter:d.activeElement.getAttribute("data-loc"),selectedFilter:d.querySelector("[data-loc].chon")?.getAttribute("data-loc")};})()');
      const filterShot=await page('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      const filterScreenshot=screenshot.replace(/\.png$/,'-filter-keyboard.png');
      await writeFile(filterScreenshot,Buffer.from(filterShot.data,'base64'));
      const count=await evaluate('(async()=>{const w=document.getElementById("app").contentWindow,d=w.document,input=d.getElementById("wiki-tim");w.focus();input.focus();input.value="cổ";input.dispatchEvent(new w.Event("input",{bubbles:true}));'+frames+'return d.querySelectorAll("#wiki-tim-kq [data-search-idx]").length;})()');
      for(let index=0;index<count;index++)await press('ArrowDown','ArrowDown',40);
      const search=await evaluate('(async()=>{const d=document.getElementById("app").contentDocument;'+frames+'const list=d.getElementById("wiki-tim-kq"),selected=list.querySelector(".chon"),box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};return {count:d.querySelectorAll("#wiki-tim-kq [data-search-idx]").length,selectedIndex:selected?.getAttribute("data-search-idx"),list:box(list),selected:selected?box(selected):null,scrollTop:list.scrollTop,clientHeight:list.clientHeight,scrollHeight:list.scrollHeight,activeId:d.activeElement.id};})()');
      const searchShot=await page('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      const searchScreenshot=screenshot.replace(/\.png$/,'-search-keyboard.png');
      await writeFile(searchScreenshot,Buffer.from(searchShot.data,'base64'));
      wikiKeyboard={filter:{before,after,focusPreserved:after.activeFilter===before.target&&after.selectedFilter===before.target,screenshot:filterScreenshot},search:{...search,highlightVisible:!!search.selected&&search.selected.y>=search.list.y-1&&search.selected.bottom<=search.list.bottom+1,screenshot:searchScreenshot}};
    }
    runtime.pendingGameRequests=[...inFlightAssets].map(id=>requests.get(id));
    runtime.failedGameRequests=runtime.failedGameRequests.filter(request=>{
      const replaced=request.type==='Document'&&request.canceled&&request.error==='net::ERR_ABORTED'&&successfulDocuments.some(document=>document.url===request.url&&document.frameId===request.frameId&&document.timestamp>request.timestamp);
      if(replaced)addDiagnostic('ignored',{reason:'superseded-document-navigation',...request});
      return !replaced;
    });
    collecting=false;
    shutdownRequested=true;
    await Promise.race([command('Browser.close'),delay(200)]);
    return {code:0,stdout,stderr,bottomScreenshot,runtime,wikiKeyboard};
  } finally {
    clearTimeout(timer);
    socket?.close();
    if(!shutdownRequested)child.kill();
    await Promise.race([closed,delay(shutdownRequested?10000:5000)]);
    if(!chromeClosed){child.kill();await Promise.race([closed,delay(5000)]);}
    if(!chromeClosed)throw new Error('Chrome has not exited; its profile was retained for safety.');
  }
}

async function removeOwnProfile(profile,id){
  const resolved=path.resolve(profile);
  if(!resolved.startsWith(out+path.sep)||path.dirname(resolved)!==out||path.basename(resolved)!=='profile-'+id)throw new Error('Unsafe profile cleanup path: '+resolved);
  const entry=await lstat(resolved).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(!entry)return;
  if(!entry.isDirectory()||entry.isSymbolicLink())throw new Error('Profile cleanup target is not an ordinary directory: '+resolved);
  // Only this case's verified child directory is removed after Chrome exits.
  await rm(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}

const results=[];
for(const [width,height] of sizes)for(const state of states){
  const id=width+'x'+height+'-'+state;
  const screenshot=path.join(out,id+'.png');
  const profile=path.join(out,'profile-'+id);
  const url=new URL('/.tmp/ui-qa-fixture.html',base);
  url.search=new URLSearchParams({width:String(width),height:String(height),state,textScale:String(scale),cooldownAudit:args['cooldown-label-audit']?'1':'0'}).toString();
  const flags=['--headless=new','--no-sandbox','--disable-gpu','--disable-gpu-sandbox','--disable-software-rasterizer','--no-first-run','--no-default-browser-check','--hide-scrollbars','--force-device-scale-factor=1','--user-data-dir='+profile,'--window-size='+width+','+height];
  if(args['reduced-motion'])flags.push('--force-prefers-reduced-motion');
  let output,reused=false;
  if(args.resume){
    try{
      const stdout=await readFile(path.join(out,id+'.html'),'utf8'),runtime=JSON.parse(await readFile(path.join(out,id+'.runtime.json'),'utf8'));
      const raw=stdout.match(/<pre id="qa-results">([\s\S]*?)<\/pre>/)?.[1];
      const probe=JSON.parse(raw.replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&'));
      const imageFile=await lstat(screenshot);
      if(probe.status==='complete'&&probe.state===state&&probe.viewport.width===width&&probe.viewport.height===height&&probe.textScale===scale&&probe.checks.reducedMotion===Boolean(args['reduced-motion'])&&probe.failures.length===0&&imageFile.isFile()&&runtime.exceptions.length===0&&runtime.consoleErrors.length===0&&runtime.logErrors.length===0&&runtime.failedGameRequests.length===0&&runtime.pendingGameRequests.length===0){
        const bottom=screenshot.replace(/\.png$/,'-bottom.png');
        output={code:0,stdout,runtime,bottomScreenshot:await lstat(bottom).then(()=>bottom).catch(()=>undefined)};
        reused=true;
      }
    }catch(error){if(error.code!=='ENOENT')console.warn(id+': cached evidence not reusable; running fresh ('+error.message+').');}
  }
  if(!output){
    output=await runChrome(flags,url.href,width,height,screenshot);
    await removeOwnProfile(profile,id);
    await writeFile(path.join(out,id+'.html'),output.stdout);
    await writeFile(path.join(out,id+'.chrome.log'),output.stderr);
    await writeFile(path.join(out,id+'.runtime.json'),JSON.stringify(output.runtime,null,2));
  }
  const match=output.stdout.match(/<pre id="qa-results">([\s\S]*?)<\/pre>/);
  let result;
  try{result=JSON.parse(match?.[1].replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')||'null');}catch(error){throw new Error(id+': Invalid QA JSON: '+error);}
  if(!result||result.status!=='complete')throw new Error(id+': Probe did not complete: '+JSON.stringify(result));
  result.id=id;result.screenshot=screenshot;result.chromeExitCode=output.code;
  if(reused)result.reusedRecordedBrowserEvidence=true;
  result.runtime=output.runtime;
  if(output.wikiKeyboard){result.wikiKeyboard=output.wikiKeyboard;if(!output.wikiKeyboard.filter.focusPreserved)result.failures.push({kind:'wiki-filter-keyboard-focus-lost',...output.wikiKeyboard.filter});if(!output.wikiKeyboard.search.highlightVisible)result.failures.push({kind:'wiki-search-highlight-outside-listbox',...output.wikiKeyboard.search});}
  for(const exception of output.runtime.exceptions)result.failures.push({kind:'runtime-exception',...exception});
  for(const error of [...output.runtime.consoleErrors,...output.runtime.logErrors])result.failures.push({kind:'runtime-error',...error});
  for(const request of output.runtime.failedGameRequests)result.failures.push({kind:'failed-game-asset',...request});
  if(output.bottomScreenshot)result.bottomScreenshot=output.bottomScreenshot;
  results.push(result);
  await writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify({id,viewport:result.viewport,failures:result.failures.length,kinds:[...new Set(result.failures.map(f=>f.kind))],screenshot}));
}
await writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify({cases:results.length,failures:results.reduce((total,r)=>total+r.failures.length,0),results:path.join(out,'results.json')}));
process.exitCode=results.some(r=>r.failures.length)?1:0;
