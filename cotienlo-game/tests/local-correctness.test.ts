import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {Cultivator} from '../src/entities/Cultivator';
import type {Projectile} from '../src/entities/Projectile';
import {browserFixture} from './browser-fixture';
describe('playable local correctness',()=>{
  let browser:ReturnType<typeof browserFixture>;let player:Cultivator;let projectiles:Projectile[];
  beforeEach(async()=>{
    vi.useFakeTimers();vi.resetModules();browser=browserFixture();projectiles=[];
    for(const id of ['btn-gu-moonlight','btn-gu-bronze','btn-gu-boar','btn-gu-heal','btn-attack','btn-dash','btn-npc-interact']) {
      const button=browser.addElement(id,'button');Object.assign(button,{click(){if(!button.disabled)button.dispatchEvent(new Event('click'));}});
    }
    browser.addElement('quest-banner');browser.addElement('quest-banner-action');
    const modal=browser.addElement('modal-dialogue');modal.className='game-modal';modal.hidden=true;
    const card=browser.addElement('dialogue-card');card.className='modal-card';modal.appendChild(card);
    card.appendChild(browser.addElement('dialogue-text'));card.appendChild(browser.addElement('dialogue-actions'));card.appendChild(browser.addElement('btn-close-dialogue','button'));
    const {Cultivator}=await import('../src/entities/Cultivator');const {Projectile}=await import('../src/entities/Projectile');const {GameMap}=await import('../src/engine/Map');
    vi.spyOn(Cultivator.prototype,'render').mockImplementation(function(){player=this;});vi.spyOn(Projectile.prototype,'render').mockImplementation(function(){projectiles.push(this);});
    vi.spyOn(GameMap.prototype,'render').mockImplementation(()=>{});vi.spyOn(GameMap.prototype,'renderLighting').mockImplementation(()=>{});
  });
  afterEach(()=>{browser.win.dispatchEvent(new Event('cotienlo:destroy'));vi.restoreAllMocks();vi.useRealTimers();vi.unstubAllGlobals();});
  async function boot(data:Record<string,unknown>={}){browser.storage.setItem('cotienlo_save_v1',JSON.stringify({hp:100,mp:100,stones:50,...data}));await import('../src/main');browser.win.dispatchEvent(new Event('DOMContentLoaded'));browser.frame(performance.now());}
  function delegated(container:string,id:string,attribute?:string,value?:string){const button=browser.addElement(id,'button');if(attribute)button.setAttribute(attribute,value!);browser.elements.get(container)!.appendChild(button);const event=new Event('click');Object.defineProperty(event,'target',{value:button});browser.elements.get(container)!.dispatchEvent(event);}
  function disk(){return JSON.parse(browser.storage.getItem('cotienlo_save_v1')!);}
  it.each(['banner','dialogue'])('completes chapter four through %s with the same fee, reward and realm',async route=>{
    await boot({realm:'Nhất Chuyển Đỉnh Phong',hp:160,mp:160,y:920,chapter:4,chapterRewardClaimed:false,ownedGuIds:['moonblade']});
    if(route==='banner')delegated('quest-banner','btn-claim-banner');
    else {browser.elements.get('btn-npc-interact')!.dispatchEvent(new Event('click'));expect(browser.elements.get('dialogue-actions')!.innerHTML).toContain('Phí 50');delegated('dialogue-actions','npc-complete','data-dialogue-action','breakthrough');}
    expect(player.realm).toBe('Nhị Chuyển Sơ Giai');expect(disk().realm).toBe(player.realm);expect(disk().stones).toBe(80);expect(disk().chapterRewardClaimed).toBe(true);
    if(route==='banner')delegated('quest-banner','btn-claim-banner');else delegated('dialogue-actions','npc-complete-again','data-dialogue-action','breakthrough');expect(disk().stones).toBe(80);
  });
  it('blocks every missing Gu even when a click event bypasses the disabled button',async()=>{
    await boot({realm:'Nhị Chuyển Sơ Giai',hp:200,mp:200,ownedGuIds:[]});
    for(const id of ['moonlight','bronze','boar','heal']){expect(browser.elements.get('btn-gu-'+id)!.disabled).toBe(true);browser.elements.get('btn-gu-'+id)!.dispatchEvent(new Event('click'));}
    expect(player.mp).toBe(200);expect(player.cdMoonlight).toBe(0);expect(player.shieldDuration).toBe(0);expect(player.boarBuffDuration).toBe(0);expect(player.healDuration).toBe(0);expect(projectiles).toHaveLength(0);
  });
  it('uses rank damage and keeps rank plus Gu armor after loading',async()=>{
    await boot({realm:'Nhị Chuyển Sơ Giai',hp:200,mp:200,ownedGuIds:['ironskin']});expect(player.permanentDefense).toBe(33);
    browser.elements.get('btn-attack')!.dispatchEvent(new Event('click'));browser.frame(performance.now()+10);expect(projectiles[0]?.damage).toBe(48);
  });
  it('repairs an already-paid chapter one on load once without another payment or refilling health',async()=>{
    await boot({realm:'Nhất Chuyển Sơ Giai',hp:12,mp:17,questCount:3,hasRefinedGu:true,questRewardClaimed:true,stones:70});
    expect(player.realm).toBe('Nhất Chuyển Trung Giai');expect(disk().stones).toBe(70);expect(disk().hp).toBe(12);expect(disk().mp).toBe(17);
    browser.win.dispatchEvent(new Event('pagehide'));expect(disk().stones).toBe(70);
  });
  it('supports the documented J and Space keys while blocking input fields and held-key repeats',async()=>{
    await boot();browser.win.dispatchEvent(Object.assign(new Event('keydown',{cancelable:true}),{code:'KeyJ',key:'j'}));expect(player.cdAttack).toBe(0.35);
    browser.win.dispatchEvent(Object.assign(new Event('keydown',{cancelable:true}),{code:'Space',key:' '}));expect(player.stamina).toBe(70);
    player.cdAttack=0;const input=browser.addElement('typing','input');input.focus();browser.win.dispatchEvent(Object.assign(new Event('keydown'),{code:'KeyJ',key:'j'}));expect(player.cdAttack).toBe(0);
    browser.doc.activeElement=null;browser.win.dispatchEvent(Object.assign(new Event('keydown'),{code:'KeyJ',key:'j',repeat:true}));expect(player.cdAttack).toBe(0);
  });
});

