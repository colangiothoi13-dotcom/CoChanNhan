import test from 'node:test';
import assert from 'node:assert/strict';
import { createCultivationState, addGuInstance, usableGuIds, useGu, validateCultivationState } from './cultivation-core.mjs';
import { createResourceState, initializeGuLifecycle, createCapturedGu, applyResourceAction, advanceResources, resourceSnapshot, addResource, validateResourceState, destroyGuInstance, RECIPE_DEFINITIONS, GU_CARE_DEFINITIONS } from './resource-core.mjs';
const fixture = (rank=1) => { const profile=createCultivationState({lifeId:'a',rank,now:0});const resources=createResourceState({lifeId:'a',clockMs:0});return {profile,resources}; };
const action=(f,option,extra={},ctx={})=>applyResourceAction(f.profile,f.resources,{option,...extra},{clockMs:f.resources.lastClockMs,stones:100,inSanctuary:true,facilityRole:'refining-hall',randomRoll:0,...ctx});

test('new resource state grants no Gu and keeps items distinct from activation energy',()=>{const f=fixture();assert.deepEqual(f.profile.guInstances,[]);assert.equal(validateResourceState(f.resources,f.profile),true);assert.equal(f.resources.items['moon-orchid-petal']??0,0);});
test('capture creates held but uncontrolled individual with old will and correct clock',()=>{const f=fixture();const gu=createCapturedGu(f.profile,'smalllight',{clockMs:900000,oldControllerLifeId:'old',willBps:7000});assert.equal(gu.holderLifeId,'a');assert.equal(gu.controllerLifeId,null);assert.equal(gu.oldControllerLifeId,'old');assert.equal(gu.feeding.lastClockMs,900000);assert.deepEqual(usableGuIds(f.profile),[]);assert.equal(validateCultivationState(f.profile),true);});
test('two Small Light Gu are independent individuals rather than an owned type flag',()=>{const f=fixture();addGuInstance(f.profile,'smalllight');addGuInstance(f.profile,'smalllight');assert.equal(f.profile.guInstances.length,2);assert.notEqual(f.profile.guInstances[0].id,f.profile.guInstances[1].id);});
test('feeding uses actual matching food and never spends activation essence',()=>{const f=fixture();const gu=addGuInstance(f.profile,'moonlight');initializeGuLifecycle(f.profile,0);gu.feeding.remainingMs=0;addResource(f.resources,'moon-orchid-petal',2);const essence=f.profile.mortal.amountBps;action(f,'feed',{instanceId:gu.id});assert.equal(f.resources.items['moon-orchid-petal'],0);assert.equal(gu.feeding.remainingMs,GU_CARE_DEFINITIONS.moonlight.intervalMs);assert.equal(f.profile.mortal.amountBps,essence);});
test('starvation kills a Gu after its own grace interval and blocks use',()=>{const f=fixture();const gu=addGuInstance(f.profile,'moonlight');initializeGuLifecycle(f.profile,0);const care=GU_CARE_DEFINITIONS.moonlight;advanceResources(f.profile,f.resources,care.intervalMs+care.starvationMs+1,{stones:0});assert.equal(gu.alive,false);assert.deepEqual(usableGuIds(f.profile),[]);assert.equal(f.profile.guInstances[0].feeding.state,'dead');});
test('preservation slows only eligible mortal Gu and moving storage cannot reset deadline',()=>{const f=fixture();const gu=addGuInstance(f.profile,'moonlight');initializeGuLifecycle(f.profile,0);const initial=gu.feeding.remainingMs;action(f,'store-gu',{instanceId:gu.id,mode:'preservation'});advanceResources(f.profile,f.resources,10000,{stones:0,inSanctuary:true});assert.equal(gu.feeding.remainingMs,initial-1000);action(f,'store-gu',{instanceId:gu.id,mode:'bag'});assert.equal(gu.feeding.remainingMs,initial-1000);gu.rank=6;assert.throws(()=>action(f,'store-gu',{instanceId:gu.id,mode:'preservation'}),{code:'PRESERVATION_UNSUPPORTED'});});
test('authorization and physical custody remain separate when a borrowed Gu changes hands',()=>{const f=fixture();const gu=addGuInstance(f.profile,'moonlight');initializeGuLifecycle(f.profile,0);gu.ownerLifeId='owner';gu.controllerLifeId='owner';assert.deepEqual(usableGuIds(f.profile),[]);gu.authorizedLifeIds=['a'];assert.deepEqual(usableGuIds(f.profile),['moonlight']);useGu(f.profile,'moonlight');gu.authorizedLifeIds=[];assert.throws(()=>useGu(f.profile,'moonlight'),{code:'GU_PERMISSION_REQUIRED'});});
test('taming progresses over server time and interruption loses progress',()=>{const f=fixture();const gu=createCapturedGu(f.profile,'smalllight',{clockMs:0,willBps:5000});action(f,'tame',{instanceId:gu.id});advanceResources(f.profile,f.resources,4000,{stones:100,inSanctuary:true});assert.ok(gu.tamingProgressBps>0&&gu.tamingProgressBps<10000);action(f,'cancel-taming');const progress=gu.tamingProgressBps;advanceResources(f.profile,f.resources,6000,{stones:100,inSanctuary:true});assert.ok(gu.tamingProgressBps<progress);action(f,'tame',{instanceId:gu.id});advanceResources(f.profile,f.resources,20000,{stones:100,inSanctuary:true});assert.equal(gu.controllerLifeId,'a');assert.ok(usableGuIds(f.profile).includes('smalllight'));});
test('newly initialized Gu at an old world clock do not starve from time before their creation',()=>{const f=fixture();f.resources.lastClockMs=900000;const gu=addGuInstance(f.profile,'moonlight');initializeGuLifecycle(f.profile,900000);advanceResources(f.profile,f.resources,901000,{stones:100});assert.equal(gu.feeding.remainingMs,GU_CARE_DEFINITIONS.moonlight.intervalMs-1000);});
test('auto feeding consumes owned stock then only its explicit purchase budget',()=>{const f=fixture();const gu=addGuInstance(f.profile,'moonlight');initializeGuLifecycle(f.profile,0);gu.feeding.remainingMs=10;action(f,'auto-feed',{enabled:true,budget:2,priority:[gu.id]});const result=advanceResources(f.profile,f.resources,1000,{stones:100});assert.equal(result.stones,98);assert.equal(f.resources.settings.budget,0);assert.ok(gu.feeding.remainingMs>0);});
test('recipe requires two distinct Small Light instances and rejects a duplicated ID atomically',()=>{const f=fixture();const a=addGuInstance(f.profile,'moonlight'),b=addGuInstance(f.profile,'smalllight');initializeGuLifecycle(f.profile,0);f.resources.recipes.moonbeam={progressBps:10000,known:true,source:'test'};for(const [id,n]of Object.entries(RECIPE_DEFINITIONS.moonbeam.materials))addResource(f.resources,id,n);const before=structuredClone(f);assert.throws(()=>action(f,'start-refine',{recipeId:'moonbeam',inputIds:[a.id,b.id,b.id]}),{code:'INVALID_RECIPE_INPUTS'});assert.deepEqual(f,before);});
function recipeFixture(){const f=fixture();const inputs=[addGuInstance(f.profile,'moonlight'),addGuInstance(f.profile,'smalllight'),addGuInstance(f.profile,'smalllight')];initializeGuLifecycle(f.profile,0);f.resources.recipes.moonbeam={progressBps:10000,known:true,source:'test'};for(const [id,n]of Object.entries(RECIPE_DEFINITIONS.moonbeam.materials))addResource(f.resources,id,n);return{...f,inputs};}
test('recipe locks actual inputs, consumes materials by stage and produces a new individual once',()=>{const f=recipeFixture();action(f,'start-refine',{recipeId:'moonbeam',inputIds:f.inputs.map(g=>g.id)});assert.ok(f.inputs.every(g=>g.lock?.kind==='refining'));assert.throws(()=>useGu(f.profile,'moonlight'),{code:'GU_BUSY'});advanceResources(f.profile,f.resources,12000,{stones:100,inSanctuary:true});assert.equal(f.profile.guInstances.filter(g=>g.alive&&g.typeId==='moonbeam').length,1);assert.ok(f.inputs.every(g=>!g.alive));advanceResources(f.profile,f.resources,13000,{stones:100,inSanctuary:true});assert.equal(f.profile.guInstances.filter(g=>g.alive&&g.typeId==='moonbeam').length,1);assert.equal(validateResourceState(f.resources,f.profile),true);});
test('natural recipe failure injures surviving inputs, destroys a nonvital Small Light and preserves vital input',()=>{const f=recipeFixture();action(f,'set-vital',{instanceId:f.inputs[1].id});action(f,'start-refine',{recipeId:'moonbeam',inputIds:f.inputs.map(g=>g.id)},{randomRoll:9999});advanceResources(f.profile,f.resources,12000,{stones:100,inSanctuary:true});assert.equal(f.inputs[1].alive,true);assert.equal(f.inputs[2].alive,false);assert.ok(f.inputs[0].healthBps<10000);assert.equal(f.resources.jobs[0].status,'failed');});
test('source recipe knowledge is not gifted by owning the result; research is timed and separately costs resources',()=>{const f=fixture();addGuInstance(f.profile,'moonbeam');initializeGuLifecycle(f.profile,0);assert.equal(f.resources.recipes.moonbeam.known,false);action(f,'research',{recipeId:'moonbeam'});advanceResources(f.profile,f.resources,6000,{stones:100,inSanctuary:true});assert.equal(f.resources.recipes.moonbeam.known,true);});
test('farm chain distinguishes ordinary fireflies from Gu formation and consumes environment inputs',()=>{const f=fixture();addResource(f.resources,'stargrass-seed',1);addResource(f.resources,'water',10);action(f,'plant',{cropId:'stargrass',mode:'star-meadow'});advanceResources(f.profile,f.resources,35000,{stones:100});action(f,'harvest-farm',{farmId:f.resources.farms[0].id});assert.equal(f.resources.items.stargrass,3);assert.equal(f.profile.guInstances.length,0);addResource(f.resources,'firefly-eggs',1);action(f,'plant',{cropId:'firefly-colony',mode:'star-meadow'});advanceResources(f.profile,f.resources,80000,{stones:100});action(f,'harvest-farm',{farmId:f.resources.farms[1].id});assert.equal(f.resources.items['firefly-colony'],1);assert.equal(f.profile.guInstances.length,0);addResource(f.resources,'stargrass',3);action(f,'plant',{cropId:'starfirefly-source',mode:'star-meadow'});advanceResources(f.profile,f.resources,140000,{stones:100});action(f,'harvest-farm',{farmId:f.resources.farms[2].id});assert.ok(f.profile.guInstances.some(g=>g.typeId==='starfirefly'&&!g.controlled));});
test('wrong farming environment fails without consuming seeds or supplies',()=>{const f=fixture();addResource(f.resources,'stargrass-seed',1);addResource(f.resources,'water',1);const before=structuredClone(f);assert.throws(()=>action(f,'plant',{cropId:'stargrass',mode:'moon-garden'}),{code:'ENVIRONMENT_REQUIRED'});assert.deepEqual(f,before);});
test('immortal stone conversion adds personal green-grape reserves and never upgrades to red-date',()=>{const f=fixture(7);addResource(f.resources,'immortal-stone',1);action(f,'convert-immortal-stone');assert.equal(f.profile.immortal.units,0);assert.equal(f.profile.immortal.reserves[0].kind,'green-grape');assert.equal(f.profile.immortal.reserves[0].units,1);assert.equal(validateCultivationState(f.profile),true);});
test('public resource snapshot hides crafting rolls and separates knowledge, rarity and grade',()=>{const f=recipeFixture();action(f,'start-refine',{recipeId:'moonbeam',inputIds:f.inputs.map(g=>g.id)},{randomRoll:9999});const view=resourceSnapshot(f.profile,f.resources,0);assert.equal(Object.hasOwn(view.jobs[0],'roll'),false);assert.ok(view.catalog.resources.every(d=>typeof d.grade==='number'&&typeof d.rarity==='string'));assert.equal(view.gu.length,3);});

test('vital Gu is protected from all refinement-failure injury, not merely destruction',()=>{
  const f=recipeFixture();const vital=f.inputs[0];vital.healthBps=8300;vital.willBps=200;
  action(f,'set-vital',{instanceId:vital.id});
  action(f,'start-refine',{recipeId:'moonbeam',inputIds:f.inputs.map(g=>g.id)},{randomRoll:9999});
  advanceResources(f.profile,f.resources,12000,{stones:100,inSanctuary:true});
  assert.equal(vital.alive,true);assert.equal(vital.healthBps,8300);assert.equal(vital.willBps,200);
  assert.ok(f.inputs.some(g=>g!==vital&&!g.alive));
});
test('leaving the refinement environment interrupts the job, unlocks inputs and returns only unspent reserves',()=>{
  const f=recipeFixture();action(f,'start-refine',{recipeId:'moonbeam',inputIds:f.inputs.map(g=>g.id)});
  advanceResources(f.profile,f.resources,1000,{stones:100,inSanctuary:false});
  assert.equal(f.resources.jobs[0].status,'cancelled');assert.ok(f.inputs.every(g=>!g.lock));
  assert.equal(f.resources.items['moon-orchid-petal'],0);
  assert.equal(f.resources.items['spirit-herb'],1);assert.equal(f.resources.items['copper-ore'],1);
  advanceResources(f.profile,f.resources,20000,{stones:100,inSanctuary:true});
  assert.equal(f.profile.guInstances.filter(g=>g.alive&&g.typeId==='moonbeam').length,0);
});
test('the running-job capacity rejects a new recipe before consuming or evicting any active input lock',()=>{
  const f=recipeFixture();f.resources.jobs=Array.from({length:32},(_,i)=>({id:'existing'+i,status:'running'}));
  const before=structuredClone(f);
  assert.throws(()=>action(f,'start-refine',{recipeId:'moonbeam',inputIds:f.inputs.map(g=>g.id)}),{code:'REFINEMENT_CAPACITY'});
  assert.deepEqual(f,before);
});
test('farm environment is authorized by server context, not merely a requested mode string',()=>{
  const f=fixture();addResource(f.resources,'stargrass-seed',1);addResource(f.resources,'water',1);
  const before=structuredClone(f);
  assert.throws(()=>action(f,'plant',{cropId:'stargrass',mode:'star-meadow'},{availableEnvironments:[]}),{code:'ENVIRONMENT_REQUIRED'});
  assert.deepEqual(f,before);
});
test('farm improvement changes actual growth speed without changing crop identity',()=>{
  const f=fixture();addResource(f.resources,'stargrass-seed',1);addResource(f.resources,'water',2);
  action(f,'plant',{cropId:'stargrass',mode:'star-meadow'});const farm=f.resources.farms[0];
  action(f,'improve-farm',{farmId:farm.id});advanceResources(f.profile,f.resources,10000,{stones:100});
  assert.equal(farm.growthMs,11000);assert.equal(farm.cropId,'stargrass');
});
test('unknown recipe formulas and deficiencies are not disclosed by the public snapshot',()=>{
  const f=fixture();addGuInstance(f.profile,'moonbeam');initializeGuLifecycle(f.profile,0);
  const view=resourceSnapshot(f.profile,f.resources,0);const recipe=view.recipes.find(recipe=>recipe.id==='moonbeam');
  assert.equal(recipe.known,false);assert.equal(recipe.definition.redacted,true);assert.deepEqual(recipe.definition.inputs,[]);
  assert.deepEqual(recipe.missing,[]);assert.deepEqual(view.catalog.recipes.find(recipe=>recipe.id==='moonbeam').materials,{});
});
test('consumed recipe inputs have zero health, no use permission and coherent dead public state',()=>{
  const f=recipeFixture();action(f,'start-refine',{recipeId:'moonbeam',inputIds:f.inputs.map(g=>g.id)});
  advanceResources(f.profile,f.resources,12000,{stones:100,inSanctuary:true});
  for(const gu of f.inputs){assert.equal(gu.alive,false);assert.equal(gu.healthBps,0);assert.deepEqual(gu.authorizedLifeIds,[]);}
  const consumed=resourceSnapshot(f.profile,f.resources,12000).gu.filter(gu=>f.inputs.some(input=>input.id===gu.id));
  assert.ok(consumed.every(gu=>gu.healthBps===0&&!gu.usable&&gu.feeding.state==='dead'));
});
test('a moved old Gu settles its own feeding deadline even when the recipient resource clock is already current',()=>{
  const f=fixture();f.resources.lastClockMs=3000000;
  const gu=addGuInstance(f.profile,'moonlight');initializeGuLifecycle(f.profile,0);
  const settled=advanceResources(f.profile,f.resources,3000000,{stones:0});
  assert.equal(gu.alive,false);assert.equal(gu.feeding.state,'dead');assert.equal(settled.critical,true);
});
test('hostile retaming restores old-controller resistance and cannot use loan permission during the attempt',()=>{
  const f=fixture();const gu=addGuInstance(f.profile,'moonlight');initializeGuLifecycle(f.profile,0);
  gu.controllerLifeId='old-controller';gu.authorizedLifeIds=['a'];gu.willBps=0;gu.tamingProgressBps=10000;
  action(f,'tame',{instanceId:gu.id});assert.equal(gu.willBps,8000);assert.equal(gu.tamingProgressBps,0);
  assert.deepEqual(usableGuIds(f.profile),[]);assert.throws(()=>useGu(f.profile,'moonlight'),{code:'GU_BUSY'});
  advanceResources(f.profile,f.resources,4000,{stones:100,inSanctuary:true});assert.equal(gu.controllerLifeId,'old-controller');
  action(f,'cancel-taming');const progress=gu.tamingProgressBps;
  advanceResources(f.profile,f.resources,5000,{stones:100,inSanctuary:true});assert.ok(gu.tamingProgressBps<progress);
  assert.equal(gu.tamingByLifeId,null);assert.equal(gu.controllerLifeId,'old-controller');
});
test('only the controller can destroy Gu and a vital Gu causes backlash exactly once',()=>{
  const f=fixture();const gu=addGuInstance(f.profile,'moonlight');initializeGuLifecycle(f.profile,0);action(f,'set-vital',{instanceId:gu.id});
  assert.throws(()=>destroyGuInstance(f.profile,gu.id,{controllerLifeId:'other'}),{code:'CONTROLLER_REQUIRED'});assert.equal(gu.alive,true);
  destroyGuInstance(f.profile,gu.id);assert.equal(gu.alive,false);assert.equal(gu.healthBps,0);assert.equal(f.profile.body.woundBps,4000);
  assert.throws(()=>destroyGuInstance(f.profile,gu.id),{code:'GU_NOT_HELD'});assert.equal(f.profile.body.woundBps,4000);
});
test('remote vital destruction reports the actual owner backlash instead of injuring the physical holder',()=>{
  const f=fixture();const gu=addGuInstance(f.profile,'moonlight');initializeGuLifecycle(f.profile,0);gu.controllerLifeId='owner';gu.vitalForLifeId='owner';
  const outcome=destroyGuInstance(f.profile,gu.id,{controllerLifeId:'owner'});assert.equal(outcome.backlashLifeId,'owner');assert.equal(f.profile.body.woundBps,0);assert.equal(gu.alive,false);
});
test('immortal taming may spend compatible personally owned old-kind reserves without upgrading their quality',()=>{
  const f=fixture(7);f.profile.immortal.reserves=[{ownerLifeId:'a',kind:'green-grape',units:2}];
  const gu=createCapturedGu(f.profile,'smalllight',{clockMs:0});action(f,'tame',{instanceId:gu.id});
  assert.equal(f.profile.immortal.units,0);assert.equal(f.profile.immortal.reserves[0].units,1);assert.equal(f.profile.immortal.reserves[0].kind,'green-grape');
});
test('more than 256 lifetime recipe instances remain playable with bounded terminal history and no reused IDs',()=>{
  const f=fixture();f.resources.recipes.moonbeam={progressBps:10000,known:true,source:'test'};
  const seen=new Set();let clockMs=0;
  for(let cycle=0;cycle<90;cycle++){
    f.profile.mortal.amountBps=4400;f.profile.mortal.essence=[{quality:1,amountBps:4400}];
    const inputs=[addGuInstance(f.profile,'moonlight'),addGuInstance(f.profile,'smalllight'),addGuInstance(f.profile,'smalllight')];
    for(const gu of inputs){assert.ok(!seen.has(gu.id));seen.add(gu.id);}
    initializeGuLifecycle(f.profile,clockMs);
    for(const[id,count]of Object.entries(RECIPE_DEFINITIONS.moonbeam.materials))addResource(f.resources,id,count);
    action(f,'start-refine',{recipeId:'moonbeam',inputIds:inputs.map(gu=>gu.id)});
    clockMs+=12000;advanceResources(f.profile,f.resources,clockMs,{stones:100,inSanctuary:true});
    const output=f.profile.guInstances.find(gu=>gu.alive&&gu.typeId==='moonbeam');assert.ok(output);assert.ok(!seen.has(output.id));seen.add(output.id);
    destroyGuInstance(f.profile,output.id);
    assert.ok(f.profile.guInstances.length<=35);assert.ok(f.resources.jobs.length<=32);
    const view=resourceSnapshot(f.profile,f.resources,clockMs);assert.ok(view.gu.filter(gu=>gu.feeding.state==='dead').length<=32);
    assert.equal(validateCultivationState(f.profile),true);assert.equal(validateResourceState(f.resources,f.profile),true);
  }
  assert.equal(seen.size,360);assert.equal(f.profile.nextGuSequence,361);
});
test('compaction never removes live or locked provenance and keeps the Gu identity sequence monotonic',()=>{
  const f=fixture();const live=addGuInstance(f.profile,'moonlight');initializeGuLifecycle(f.profile,0);
  for(let n=0;n<80;n++){const gu=addGuInstance(f.profile,'smalllight');gu.alive=false;}
  const locked=addGuInstance(f.profile,'smalllight');locked.alive=false;locked.lock={kind:'refining',id:'protected-job'};
  const next=f.profile.nextGuSequence;const added=addGuInstance(f.profile,'smalllight');
  assert.ok(f.profile.guInstances.includes(live));assert.ok(f.profile.guInstances.includes(locked));
  assert.equal(live.ownerLifeId,'a');assert.equal(added.id,`a:gu:${next}`);assert.equal(f.profile.nextGuSequence,next+1);
});
test('assisted-market access expiry persists only as a nonnegative integer in the server clock domain',()=>{
  const f=fixture();f.resources.treasureAccessUntilMs=900000;assert.equal(validateResourceState(f.resources),true);
  f.resources.treasureAccessUntilMs=-1;assert.throws(()=>validateResourceState(f.resources),{code:'INVALID_RESOURCE_STATE'});
  f.resources.treasureAccessUntilMs=Infinity;assert.throws(()=>validateResourceState(f.resources),{code:'INVALID_RESOURCE_STATE'});
});
test('an outer settlement farm keeps outer time after its cultivator ascends, including legacy farms without a clock field',()=>{
  for(const legacy of [false,true]){
    const f=fixture();addResource(f.resources,'stargrass-seed',1);addResource(f.resources,'water',2);
    action(f,'plant',{cropId:'stargrass',mode:'star-meadow'});const farm=f.resources.farms[0];assert.equal(farm.clock,'outer');
    advanceResources(f.profile,f.resources,10000,{stones:100});assert.equal(farm.growthMs,10000);
    if(legacy)delete farm.clock;
    Object.assign(f.profile,createCultivationState({lifeId:'a',rank:6,now:0}));f.profile.immortal.timeRatio=4;
    advanceResources(f.profile,f.resources,20000,{stones:100});
    assert.equal(farm.growthMs,20000);assert.equal(farm.stored,0);assert.equal(validateResourceState(f.resources,f.profile),true);
  }
});
test('an aperture farm uses its current inner ratio while Gu feeding follows each individual storage location',()=>{
  const f=fixture(6);f.profile.immortal.timeRatio=4;addResource(f.resources,'stargrass-seed',1);addResource(f.resources,'water',3);
  action(f,'plant',{cropId:'stargrass',mode:'star-meadow'});const farm=f.resources.farms[0];assert.equal(farm.clock,'aperture');
  const inner=addGuInstance(f.profile,'moonlight'),outer=addGuInstance(f.profile,'moonlight');initializeGuLifecycle(f.profile,0);
  action(f,'store-gu',{instanceId:inner.id,mode:'aperture'});
  advanceResources(f.profile,f.resources,10000,{stones:100});
  assert.equal(farm.stored,3);assert.equal(farm.growthMs,5000);
  assert.equal(inner.feeding.remainingMs,GU_CARE_DEFINITIONS.moonlight.intervalMs-40000);
  assert.equal(outer.feeding.remainingMs,GU_CARE_DEFINITIONS.moonlight.intervalMs-10000);
  f.profile.immortal.timeRatio=2;advanceResources(f.profile,f.resources,15000,{stones:100});assert.equal(farm.growthMs,15000);
});
