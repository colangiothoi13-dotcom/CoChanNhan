/** Pure, server-clock lifecycle. All numbers come from explicitly labelled game
 * balance. No I/O, browser timers, random generation or global mutable state. */
import { GU_DEFINITIONS, addGuInstance, canUseGuInstance, compactGuHistory, CULTIVATION_BALANCE, spendPrimeval, spendImmortal } from './cultivation-core.mjs';
import { RESOURCE_BALANCE, RESOURCE_DEFINITIONS, GU_CARE_DEFINITIONS, RECIPE_DEFINITIONS, CROP_DEFINITIONS } from './resource-catalogs.mjs';
export { RESOURCE_BALANCE, RESOURCE_DEFINITIONS, GU_CARE_DEFINITIONS, RECIPE_DEFINITIONS, CROP_DEFINITIONS };
export class ResourceError extends Error { constructor(code,message) { super(message);this.name='ResourceError';this.code=code; } }
const requireThat=(condition,code,message)=>{if(!condition)throw new ResourceError(code,message);};
const integer=(n,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const own=(object,key)=>Object.hasOwn(object,key);
const clone=value=>structuredClone(value);
const quantity=value=>{requireThat(integer(value,1,RESOURCE_BALANCE.maxQuantity),'INVALID_QUANTITY','Số lượng phải là số nguyên dương hợp lệ.');return value;};
const held=(profile,gu)=>gu.alive&&(gu.holderLifeId??gu.ownerLifeId)===profile.lifeId;
const notice=(resources,message)=>{resources.notices.push(message);resources.notices=resources.notices.slice(-16);};
const result=(stones,code,events=[],critical=true)=>({stones,code,events,critical});
const careFor=gu=>GU_CARE_DEFINITIONS[gu.typeId];

export function createResourceState({lifeId,clockMs=0}) {
  requireThat(typeof lifeId==='string'&&lifeId.length>0&&integer(clockMs),'INVALID_RESOURCE_STATE','Không xác định được đời hoặc đồng hồ tài nguyên.');
  return {version:1,lifeId,lastClockMs:clockMs,items:{},discoveredNodes:[],knownResources:[],knownGuTypes:[],
    recipes:Object.fromEntries(Object.keys(RECIPE_DEFINITIONS).map(id=>[id,{progressBps:id.startsWith('legacy-')?10000:0,known:id.startsWith('legacy-'),source:id.startsWith('legacy-')?'Cổ phương phóng tác được giữ tương thích':'Tàn phương tại học đường'}])),
    jobs:[],farms:[],nextJobSequence:1,nextFarmSequence:1,settings:{autoFeed:false,budget:0,priority:[]},notices:[],taming:null,research:null};
}
export function migrateResourceState(raw,options) {
  if(raw==null)return createResourceState(options);
  const state=clone(raw);state.taming??=null;state.research??=null;validateResourceState(state);
  requireThat(state.lifeId===options.lifeId,'RESOURCE_LIFE_MISMATCH','Kho tài nguyên thuộc cuộc đời khác.');return state;
}
export function addResource(resources,resourceId,count) {
  quantity(count);requireThat(own(RESOURCE_DEFINITIONS,resourceId),'UNKNOWN_RESOURCE','Tài nguyên không nằm trong danh mục.');
  const next=(resources.items[resourceId]??0)+count;
  requireThat(integer(next,0,RESOURCE_BALANCE.maxQuantity),'RESOURCE_CAPACITY','Kho đã đầy loại tài nguyên này.');
  resources.items[resourceId]=next;if(!resources.knownResources.includes(resourceId))resources.knownResources.push(resourceId);
}
export function removeResource(resources,resourceId,count) {
  quantity(count);requireThat(own(RESOURCE_DEFINITIONS,resourceId),'UNKNOWN_RESOURCE','Tài nguyên không nằm trong danh mục.');
  requireThat((resources.items[resourceId]??0)>=count,'RESOURCE_REQUIRED',`Chưa đủ ${RESOURCE_DEFINITIONS[resourceId].name}.`);
  resources.items[resourceId]-=count;
}
function initializeOne(profile,gu,clockMs) {
  gu.holderLifeId??=gu.ownerLifeId;gu.controllerLifeId??=gu.controlled?gu.ownerLifeId:null;
  gu.authorizedLifeIds??=[];gu.healthBps??=gu.alive?10000:0;gu.vitalForLifeId??=null;
  gu.willBps??=gu.controlled?0:5000;gu.tamingProgressBps??=gu.controlled?10000:0;
  gu.oldControllerLifeId??=null;gu.storage??='bag';gu.lock??=null;
  if(!gu.feeding)gu.feeding={remainingMs:careFor(gu).intervalMs,lastClockMs:clockMs,state:gu.alive?'fed':'dead'};
  if(!gu.alive)gu.feeding.state='dead';
}
export function initializeGuLifecycle(profile,clockMs) {
  requireThat(integer(clockMs),'INVALID_RESOURCE_TIME','Đồng hồ tài nguyên không hợp lệ.');
  for(const gu of profile.guInstances)initializeOne(profile,gu,clockMs);
}
export function createCapturedGu(profile,typeId,{clockMs=0,rank=GU_DEFINITIONS[typeId]?.rank,healthBps=10000,willBps=5000,oldControllerLifeId=null}={}) {
  requireThat(integer(healthBps,1,10000)&&integer(willBps,0,10000)&&integer(clockMs),'INVALID_CAPTURE','Tình trạng Cổ bị bắt không hợp lệ.');
  const gu=addGuInstance(profile,typeId,{controlled:false,rank});initializeOne(profile,gu,clockMs);
  gu.holderLifeId=profile.lifeId;gu.controllerLifeId=null;gu.healthBps=healthBps;gu.willBps=willBps;
  gu.oldControllerLifeId=oldControllerLifeId;return gu;
}
function available(profile,instanceId,{controller=false,allowLocked=false}={}) {
  const gu=profile.guInstances.find(g=>g.id===instanceId&&held(profile,g));
  requireThat(gu,'GU_NOT_HELD','Không giữ cá thể Cổ còn sống này.');
  requireThat(allowLocked||!gu.lock&&!gu.tamingByLifeId,'GU_BUSY','Cổ đang bị khóa cho một hoạt động khác.');
  if(controller)requireThat(gu.controlled&&gu.controllerLifeId===profile.lifeId,'CONTROLLER_REQUIRED','Cần quyền của chủ luyện hóa.');
  return gu;
}
function payMaterials(resources,materials) { for(const[id,count]of Object.entries(materials))requireThat((resources.items[id]??0)>=count,'RESOURCE_REQUIRED',`Chưa đủ ${RESOURCE_DEFINITIONS[id]?.name??id}.`);for(const[id,count]of Object.entries(materials))removeResource(resources,id,count); }
const canPay=(resources,materials)=>Object.entries(materials).every(([id,n])=>(resources.items[id]??0)>=n);
function foodState(gu) {
  if(!gu.alive)return'dead';const care=careFor(gu),remaining=gu.feeding.remainingMs;
  if(remaining>care.intervalMs/4)return'fed';if(remaining>0)return'due-soon';
  if(remaining> -care.starvationMs/3)return'hungry';if(remaining> -care.starvationMs*2/3)return'weak';return'critical';
}
function killGu(profile,gu) {
  gu.alive=false;gu.healthBps=0;gu.controlled=false;gu.authorizedLifeIds=[];gu.lock=null;gu.tamingByLifeId=null;gu.feeding.state='dead';
  if(gu.vitalForLifeId===profile.lifeId){profile.body.woundBps=Math.min(10000,profile.body.woundBps+4000);profile.soul.woundBps=Math.min(10000,profile.soul.woundBps+4000);}
}
export function destroyGuInstance(profile,instanceId,{controllerLifeId=profile.lifeId}={}) {
  const gu=available(profile,instanceId,{allowLocked:true});
  requireThat(gu.controlled&&gu.controllerLifeId===controllerLifeId,'CONTROLLER_REQUIRED','Chỉ chủ luyện hóa có thể ra lệnh tự hủy Cổ.');
  const backlashLifeId=gu.vitalForLifeId??null;killGu(profile,gu);
  return{instanceId:gu.id,backlashLifeId:backlashLifeId===profile.lifeId?null:backlashLifeId};
}
function manualFeed(resources,gu) {
  const care=careFor(gu);payMaterials(resources,{[care.foodId]:care.amount});
  gu.feeding.remainingMs=care.intervalMs;gu.feeding.state='fed';
}
function autoFeed(resources,gu,stones) {
  const care=careFor(gu);let needed=Math.floor(Math.max(0,-gu.feeding.remainingMs)/care.intervalMs)+1;
  const stocked=Math.min(needed,Math.floor((resources.items[care.foodId]??0)/care.amount));
  if(stocked){removeResource(resources,care.foodId,stocked*care.amount);needed-=stocked;gu.feeding.remainingMs+=stocked*care.intervalMs;}
  const price=RESOURCE_DEFINITIONS[care.foodId].buyPrice*care.amount;
  const purchased=price?Math.min(needed,Math.floor(Math.min(stones,resources.settings.budget)/price)):0;
  if(purchased){stones-=price*purchased;resources.settings.budget-=price*purchased;gu.feeding.remainingMs+=purchased*care.intervalMs;}
  return stones;
}
function cancelRecipe(profile,resources,job,message) {
  for(const[id,count]of Object.entries(job.reservedMaterials??{}))if(count)addResource(resources,id,count);
  for(const gu of profile.guInstances)if(gu.lock?.id===job.id)gu.lock=null;
  job.reservedMaterials={};job.status='cancelled';job.message=message;notice(resources,message);
}
function finishRecipe(profile,resources,job,context) {
  const recipe=RECIPE_DEFINITIONS[job.recipeId];const inputs=job.inputIds.map(id=>profile.guInstances.find(g=>g.id===id));
  const valid=inputs.every(gu=>gu&&held(profile,gu)&&gu.lock?.id===job.id);
  const unique=recipe.resultRank<6||context.isUniqueAvailable?.(recipe.uniqueTypeId??recipe.resultTypeId,recipe.resultRank,recipe.kind==='upgrade'?inputs[0]?.id:undefined)===true;
  const mastery=Math.min(1500,Math.floor((profile.pathAttainment.refinement??0)/10));
  const succeeds=valid&&unique&&job.roll<Math.min(9800,recipe.successBps+mastery);
  if(succeeds){
    const vital=inputs.find(gu=>gu.vitalForLifeId===profile.lifeId);
    for(const gu of inputs){gu.alive=false;gu.healthBps=0;gu.controlled=false;gu.authorizedLifeIds=[];gu.lock=null;gu.feeding.state='dead';}
    const output=addGuInstance(profile,recipe.resultTypeId,{rank:recipe.resultRank,controlled:true});initializeOne(profile,output,context.clockMs);
    output.vitalForLifeId=vital?profile.lifeId:null;job.resultInstanceId=output.id;job.status='success';job.message=`Luyện thành ${GU_DEFINITIONS[recipe.resultTypeId].name}.`;
    profile.pathAttainment.refinement=Math.min(1000000000,(profile.pathAttainment.refinement??0)+100);
  }else{
    const sacrifice=inputs.find(gu=>gu?.typeId==='smalllight'&&gu.vitalForLifeId!==profile.lifeId)??inputs.find(gu=>gu&&gu.vitalForLifeId!==profile.lifeId);
    for(const gu of inputs){if(!gu)continue;gu.lock=null;if(gu.vitalForLifeId===profile.lifeId)continue;if(gu===sacrifice)killGu(profile,gu);else gu.healthBps=Math.max(1,gu.healthBps-2500);}
    job.status='failed';job.message='Luyện chế thất bại; cá thể và nguyên liệu đã tham gia chịu tổn thất theo cổ phương.';
  }
  job.reservedMaterials={};notice(resources,job.message);return true;
}

export function advanceResources(profile,resources,clockMs,{stones,inSanctuary=false,isUniqueAvailable}={}) {
  requireThat(integer(clockMs,resources.lastClockMs)&&integer(stones,0,1000000000),'INVALID_RESOURCE_TIME','Đồng hồ hoặc số dư tài nguyên không hợp lệ.');
  initializeGuLifecycle(profile,clockMs);const delta=clockMs-resources.lastClockMs;let critical=false;const events=[];
  resources.lastClockMs=clockMs;
  const ordered=[...profile.guInstances].sort((a,b)=>{const x=resources.settings.priority.indexOf(a.id),y=resources.settings.priority.indexOf(b.id);return(x<0?10000:x)-(y<0?10000:y);});
  for(const gu of ordered){
    if(!held(profile,gu)){gu.feeding.lastClockMs=clockMs;continue;}
    const elapsed=Math.max(0,clockMs-gu.feeding.lastClockMs);gu.feeding.lastClockMs=clockMs;
    const rate=gu.storage==='preservation'&&gu.rank<6?RESOURCE_BALANCE.preservationRateBps/10000:gu.storage==='aperture'?(profile.immortal?.timeRatio??1):1;
    gu.feeding.remainingMs-=Math.floor(elapsed*rate);
    if(resources.settings.autoFeed&&gu.feeding.remainingMs<=0){const before=stones;const remaining=gu.feeding.remainingMs;stones=autoFeed(resources,gu,stones);critical||=before!==stones||remaining!==gu.feeding.remainingMs;}
    const previous=gu.feeding.state;gu.feeding.state=foodState(gu);
    if(gu.feeding.remainingMs<= -careFor(gu).starvationMs){killGu(profile,gu);critical=true;events.push(`${GU_DEFINITIONS[gu.typeId].name} đã chết do thiếu thức ăn.`);}
    else if(previous!==gu.feeding.state){critical=true;if(['hungry','weak','critical'].includes(gu.feeding.state))events.push(`${GU_DEFINITIONS[gu.typeId].name} cần ${RESOURCE_DEFINITIONS[careFor(gu).foodId].name}.`);}
    if(resources.taming?.instanceId!==gu.id&&(!gu.controlled||gu.controllerLifeId!==profile.lifeId)&&gu.tamingProgressBps>0)gu.tamingProgressBps=Math.max(0,gu.tamingProgressBps-Math.floor(delta*RESOURCE_BALANCE.tamingDecayPerSecondBps/1000));
  }
  if(!delta){for(const event of events)notice(resources,event);return result(stones,'RESOURCE_UNCHANGED',events,critical);}
  if(resources.taming){
    const gu=profile.guInstances.find(g=>g.id===resources.taming.instanceId&&held(profile,g));
    if(!gu||gu.lock||!inSanctuary){if(gu)gu.tamingByLifeId=null;resources.taming=null;critical=true;events.push('Luyện hóa bị gián đoạn; ý chí Cổ có thể đẩy lùi tiến độ.');}
    else{
      const speed=10000/(5000+gu.willBps);gu.tamingProgressBps=Math.min(10000,gu.tamingProgressBps+Math.floor(delta*speed));
      if(gu.tamingProgressBps>=10000){gu.controlled=true;gu.controllerLifeId=profile.lifeId;gu.authorizedLifeIds=[];gu.willBps=0;gu.oldControllerLifeId=null;gu.tamingByLifeId=null;resources.taming=null;critical=true;events.push(`Đã luyện hóa ${GU_DEFINITIONS[gu.typeId].name}.`);}
    }
  }
  if(resources.research&&clockMs>=resources.research.finishClockMs){const knowledge=resources.recipes[resources.research.recipeId];knowledge.progressBps=10000;knowledge.known=true;knowledge.source='Nghiên cứu cổ phương tại cơ sở luyện chế';resources.research=null;critical=true;events.push('Đã nghiên cứu hoàn chỉnh cổ phương.');}
  for(const job of resources.jobs){
    if(job.status!=='running')continue;
    if(!inSanctuary){cancelRecipe(profile,resources,job,'Luyện chế gián đoạn do rời môi trường; hoàn trả nguyên liệu chưa tham gia.');critical=true;continue;}
    const recipe=RECIPE_DEFINITIONS[job.recipeId];const progress=Math.min(3,Math.floor((clockMs-job.startedClockMs)*3/recipe.durationMs));
    if(progress>job.stage){
      const entries=Object.entries(recipe.materials);for(let stage=job.stage+1;stage<=progress;stage++){const entry=entries[stage-1];if(entry)job.reservedMaterials[entry[0]]=0;}
      job.stage=progress;critical=true;
    }
    if(clockMs>=job.finishClockMs)critical=finishRecipe(profile,resources,job,{clockMs,isUniqueAvailable})||critical;
  }
  for(const farm of resources.farms){
    const definition=CROP_DEFINITIONS[farm.cropId];const farmDelta=(clockMs-farm.lastClockMs)*(farm.clock==='aperture'?(profile.immortal?.timeRatio??1):1);farm.lastClockMs=clockMs;
    if(farm.stored>=definition.capacity)continue;
    if(!farm.running){if(canPay(resources,definition.inputs)){payMaterials(resources,definition.inputs);for(const[id,n]of Object.entries(definition.inputs))farm.consumed[id]=(farm.consumed[id]??0)+n;farm.running=true;farm.growthMs=0;critical=true;}else continue;}
    farm.growthMs+=Math.floor(farmDelta*farm.qualityBps/10000);
    let guard=0;while(farm.growthMs>=definition.durationMs&&farm.stored<definition.capacity&&guard++<100){
      farm.growthMs-=definition.durationMs;const produced=Math.min(definition.capacity-farm.stored,definition.yield);farm.stored+=produced;farm.produced+=produced;critical=true;
      if(farm.stored>=definition.capacity||!canPay(resources,definition.inputs)){farm.running=false;farm.growthMs=0;break;}
      payMaterials(resources,definition.inputs);for(const[id,n]of Object.entries(definition.inputs))farm.consumed[id]=(farm.consumed[id]??0)+n;
    }
  }
  for(const event of events)notice(resources,event);
  compactGuHistory(profile);
  return result(stones,'RESOURCES_ADVANCED',events,critical);
}

export function applyResourceAction(profile,resources,action,context) {
  const{clockMs,inSanctuary=false,facilityRole='',randomRoll=0}=context;let{stones}=context;
  requireThat(profile.alive,'LIFE_DEAD','Cuộc đời này đã kết thúc.');
  requireThat(action&&typeof action.option==='string'&&integer(clockMs,resources.lastClockMs)&&integer(stones,0,1000000000),'INVALID_RESOURCE_ACTION','Yêu cầu tài nguyên không hợp lệ.');
  initializeGuLifecycle(profile,clockMs);const option=action.option;
  const safe=()=>requireThat(inSanctuary,'SANCTUARY_REQUIRED','Hãy đến cơ sở trong khu an toàn.');
  if(option==='buy-resource'||option==='sell-resource'){
    safe();const count=quantity(action.quantity??1),definition=RESOURCE_DEFINITIONS[action.resourceId];requireThat(definition&&own(RESOURCE_DEFINITIONS,action.resourceId),'UNKNOWN_RESOURCE','Không có tài nguyên này trong cửa hàng.');
    requireThat(definition.grade<6||profile.rank>=6,'IMMORTAL_ACCESS_REQUIRED','Cần quyền tiếp cận giao dịch tiên cảnh.');
    if(option==='buy-resource'){const cost=definition.buyPrice*count;requireThat(stones>=cost,'INSUFFICIENT_STONES','Chưa đủ nguyên thạch.');addResource(resources,action.resourceId,count);stones-=cost;}
    else{removeResource(resources,action.resourceId,count);stones+=definition.sellPrice*count;}
    return result(stones,'RESOURCE_TRADED');
  }
  if(option==='buy-gu'){
    safe();const definition=GU_DEFINITIONS[action.guId];requireThat(definition?.rank===1&&definition.purchaseStones!==null,'INVALID_SHOP_GU','Cổ khố chỉ bán loại Cổ nhất chuyển có nguồn cung.');
    requireThat(stones>=definition.purchaseStones,'INSUFFICIENT_STONES','Chưa đủ nguyên thạch mua Cổ.');createCapturedGu(profile,action.guId,{clockMs});profile.firstGuClaimed=true;resources.knownGuTypes=[...new Set([...resources.knownGuTypes,action.guId])];return result(stones-definition.purchaseStones,'GU_BOUGHT_UNTAMED');
  }
  if(option==='restore-essence'){
    safe();const count=quantity(action.quantity??1);requireThat(profile.mortal&&profile.mortal.wall!=='shattered','MORTAL_REQUIRED','Nguyên thạch chỉ bổ sung chân nguyên phàm nhân.');
    const aperture=profile.mortal;requireThat(aperture.amountBps<aperture.capacityBps,'ESSENCE_FULL','Biển chân nguyên đã đầy.');const quality=(profile.rank-1)*4+['initial','middle','upper','peak'].indexOf(profile.subrealm)+1;
    const restored=Math.min(aperture.capacityBps-aperture.amountBps,count*RESOURCE_BALANCE.primevalRecoveryBpsPerStone);const used=Math.ceil(restored/RESOURCE_BALANCE.primevalRecoveryBpsPerStone);requireThat(stones>=used,'INSUFFICIENT_STONES','Chưa đủ nguyên thạch.');const bucket=aperture.essence.find(b=>b.quality===quality);if(bucket)bucket.amountBps+=restored;else aperture.essence.push({quality,amountBps:restored});aperture.amountBps+=restored;return result(stones-used,'PRIMEVAL_RESTORED');
  }
  if(option==='convert-immortal-stone'){
    safe();const count=quantity(action.quantity??1);requireThat(profile.immortal,'IMMORTAL_REQUIRED','Cần tiên khiếu để tạo tiên nguyên cá nhân.');removeResource(resources,'immortal-stone',count);
    if(profile.immortal.kind==='green-grape')profile.immortal.units+=count;else{profile.immortal.reserves??=[];const pool=profile.immortal.reserves.find(p=>p.kind==='green-grape'&&p.ownerLifeId===profile.lifeId);if(pool)pool.units+=count;else profile.immortal.reserves.push({ownerLifeId:profile.lifeId,kind:'green-grape',units:count});}return result(stones,'PERSONAL_GREEN_GRAPE_CREATED');
  }
  if(option==='feed') {const gu=available(profile,action.instanceId,{allowLocked:true});manualFeed(resources,gu);return result(stones,'GU_FED');}
  if(option==='feed-all') {let fed=0;for(const gu of profile.guInstances.filter(g=>held(profile,g))){if(canPay(resources,{[careFor(gu).foodId]:careFor(gu).amount})){manualFeed(resources,gu);fed++;}}requireThat(fed>0,'FOOD_REQUIRED','Chưa có đủ thức ăn phù hợp cho Cổ.');return result(stones,'GU_FED');}
  if(option==='auto-feed'){
    requireThat(typeof action.enabled==='boolean'&&integer(action.budget??0,0,RESOURCE_BALANCE.autoFeedBudgetMax)&&Array.isArray(action.priority??[])&&(action.priority??[]).length<=256&&(action.priority??[]).every(id=>typeof id==='string'),'INVALID_AUTO_FEED','Cài đặt ngân sách và ưu tiên không hợp lệ.');
    resources.settings={autoFeed:action.enabled,budget:action.budget??0,priority:[...new Set(action.priority??[])]};return result(stones,'AUTO_FEED_UPDATED');
  }
  if(option==='store-gu'){
    safe();const gu=available(profile,action.instanceId);requireThat(['bag','vault','preservation','aperture'].includes(action.mode),'INVALID_STORAGE','Nơi cất giữ không hợp lệ.');
    requireThat(action.mode!=='preservation'||gu.rank<6&&careFor(gu).preservationAllowed,'PRESERVATION_UNSUPPORTED','Cơ sở bảo tồn này chỉ hỗ trợ các Phàm Cổ phù hợp.');requireThat(action.mode!=='aperture'||profile.immortal,'IMMORTAL_REQUIRED','Chưa có tiên khiếu để cất giữ.');gu.storage=action.mode;return result(stones,'GU_STORED');
  }
  if(option==='heal-gu') {safe();const gu=available(profile,action.instanceId);requireThat(gu.healthBps<10000,'GU_HEALTH_FULL','Cổ không bị thương.');removeResource(resources,'spirit-herb',1);gu.healthBps=Math.min(10000,gu.healthBps+RESOURCE_BALANCE.healingPerHerbBps);return result(stones,'GU_HEALED');}
  if(option==='set-vital'){
    safe();const gu=available(profile,action.instanceId,{controller:true});requireThat(!profile.guInstances.some(g=>g.alive&&g.vitalForLifeId===profile.lifeId),'VITAL_ALREADY_SET','Đã có Cổ bản mệnh; thay đổi cần cơ chế chuyên biệt có rủi ro.');gu.vitalForLifeId=profile.lifeId;return result(stones,'VITAL_GU_SET');
  }
  if(option==='tame'){
    safe();requireThat(!profile.activity&&!resources.taming,'ACTIVITY_BUSY','Đang thực hiện một hoạt động khác.');const gu=available(profile,action.instanceId);
    requireThat(!gu.controlled||gu.controllerLifeId!==profile.lifeId,'GU_ALREADY_CONTROLLED','Bạn đã là chủ luyện hóa của Cổ.');requireThat(gu.rank<=profile.rank,'GU_RANK_UNSUPPORTED','Tu vi chưa đáp ứng việc luyện hóa.');requireThat(stones>=RESOURCE_BALANCE.tamingStones,'INSUFFICIENT_STONES','Luyện hóa cần nguyên thạch.');
    if(profile.mortal)spendPrimeval(profile,RESOURCE_BALANCE.tamingEssenceBps,(gu.rank-1)*4+1);else spendImmortal(profile,1,gu.rank);
    if(gu.controllerLifeId&&gu.controllerLifeId!==profile.lifeId&&gu.oldControllerLifeId!==gu.controllerLifeId){gu.oldControllerLifeId=gu.controllerLifeId;gu.willBps=Math.max(gu.willBps,RESOURCE_BALANCE.oldControllerWillBps);gu.tamingProgressBps=0;}
    gu.tamingByLifeId=profile.lifeId;resources.taming={instanceId:gu.id,startedClockMs:clockMs};return result(stones-RESOURCE_BALANCE.tamingStones,'TAMING_STARTED');
  }
  if(option==='cancel-taming'){requireThat(resources.taming,'NO_ACTIVITY','Không có quá trình luyện hóa đang chạy.');const gu=profile.guInstances.find(gu=>gu.id===resources.taming.instanceId);if(gu)gu.tamingByLifeId=null;resources.taming=null;return result(stones,'TAMING_INTERRUPTED');}
  if(option==='research'){
    safe();requireThat(!resources.research,'RESEARCH_BUSY','Đang nghiên cứu một cổ phương.');const recipe=RECIPE_DEFINITIONS[action.recipeId];requireThat(recipe&&own(RECIPE_DEFINITIONS,action.recipeId),'UNKNOWN_RECIPE','Chưa có dữ liệu cổ phương này.');requireThat(!resources.recipes[action.recipeId].known,'RECIPE_ALREADY_KNOWN','Đã hiểu cổ phương này.');requireThat(stones>=RESOURCE_BALANCE.researchStones,'INSUFFICIENT_STONES','Nghiên cứu cần nguyên thạch.');resources.research={recipeId:action.recipeId,finishClockMs:clockMs+RESOURCE_BALANCE.researchMs};return result(stones-RESOURCE_BALANCE.researchStones,'RESEARCH_STARTED');
  }
  if(option==='start-refine'){
    safe();requireThat(['refining-hall','academy'].includes(facilityRole),'FACILITY_REQUIRED','Cần đến tịnh thất luyện hóa.');const recipe=RECIPE_DEFINITIONS[action.recipeId];requireThat(recipe&&own(RECIPE_DEFINITIONS,action.recipeId),'UNKNOWN_RECIPE','Không có cổ phương này.');requireThat(resources.recipes[action.recipeId]?.known,'RECIPE_NOT_KNOWN','Cần nghiên cứu hoặc nhận cổ phương hoàn chỉnh.');
    requireThat(profile.rank>=recipe.minRank&&(profile.pathAttainment.refinement??0)>=recipe.minRefinement,'REFINEMENT_SKILL_REQUIRED','Tu vi hoặc năng lực Luyện đạo chưa đáp ứng.');
    requireThat(resources.jobs.filter(job=>job.status==='running').length<RESOURCE_BALANCE.maxJobs,'REFINEMENT_CAPACITY','Đã đủ số mẻ luyện đồng thời.');
    requireThat(Array.isArray(action.inputIds)&&new Set(action.inputIds).size===action.inputIds.length&&action.inputIds.length===recipe.inputs.reduce((n,input)=>n+input.count,0),'INVALID_RECIPE_INPUTS','Cần đúng các cá thể Cổ đầu vào khác nhau.');
    const inputs=action.inputIds.map(id=>available(profile,id,{controller:true}));requireThat(recipe.inputs.every(input=>inputs.filter(g=>g.typeId===input.typeId).length===input.count),'INVALID_RECIPE_INPUTS','Loại hoặc số cá thể Cổ không đúng cổ phương.');
    requireThat(inputs.every(g=>g.healthBps>=2500),'GU_CONDITION','Cổ đầu vào bị thương quá nặng.');requireThat(stones>=recipe.stones,'INSUFFICIENT_STONES','Chưa đủ nguyên thạch luyện chế.');requireThat(canPay(resources,recipe.materials),'RESOURCE_REQUIRED','Chưa đủ nguyên liệu theo cổ phương.');requireThat(integer(randomRoll,0,9999),'INVALID_RANDOM','Kết quả mô phỏng không hợp lệ.');
    requireThat(recipe.resultRank<6||context.isUniqueAvailable?.(recipe.uniqueTypeId??recipe.resultTypeId,recipe.resultRank,recipe.kind==='upgrade'?inputs[0].id:undefined)===true,'REFINEMENT_CONDITION','Điều kiện luyện chế chưa đáp ứng.');
    if(profile.mortal)spendPrimeval(profile,recipe.essenceBps,1);else spendImmortal(profile,1,Math.max(...inputs.map(gu=>gu.rank)));
    payMaterials(resources,recipe.materials);const id=`${profile.lifeId}:recipe:${resources.nextJobSequence++}`;for(const gu of inputs)gu.lock={kind:'refining',id};
    const job={id,recipeId:action.recipeId,inputIds:[...action.inputIds],startedClockMs:clockMs,finishClockMs:clockMs+recipe.durationMs,stage:0,roll:randomRoll,status:'running',message:'Đang luyện chế theo cổ phương.',reservedMaterials:clone(recipe.materials)};
    const first=Object.keys(job.reservedMaterials)[0];if(first)job.reservedMaterials[first]=0;if(resources.jobs.length>=RESOURCE_BALANCE.maxJobs){const old=resources.jobs.findIndex(existing=>existing.status!=='running');if(old>=0)resources.jobs.splice(old,1);}resources.jobs.push(job);return result(stones-recipe.stones,'REFINEMENT_STARTED');
  }
  if(option==='cancel-refine'){
    const job=resources.jobs.find(j=>j.id===action.instanceId&&j.status==='running')??resources.jobs.find(j=>j.recipeId===action.recipeId&&j.status==='running');requireThat(job,'NO_REFINEMENT','Không có mẻ luyện đang chạy.');cancelRecipe(profile,resources,job,'Đã dừng; hoàn trả phần nguyên liệu chưa tham gia.');return result(stones,'REFINEMENT_CANCELLED');
  }
  if(option==='plant'){
    safe();const definition=CROP_DEFINITIONS[action.cropId];requireThat(definition&&own(CROP_DEFINITIONS,action.cropId),'UNKNOWN_CROP','Không có mô hình sản xuất này.');requireThat(action.mode===definition.environment&&(context.availableEnvironments===undefined||context.availableEnvironments.includes(definition.environment)),'ENVIRONMENT_REQUIRED',`Cần môi trường ${definition.environment}.`);requireThat(resources.farms.length<RESOURCE_BALANCE.maxFarms,'FARM_CAPACITY','Không còn chỗ cho điểm sản xuất.');
    const needed={...definition.inputs,[definition.seedId]:(definition.inputs[definition.seedId]??0)+1};payMaterials(resources,needed);
    // Game convention: newly planted immortal farms use the owner's aperture;
    // existing settlement farms retain their original outer-world location.
    const farm={id:`${profile.lifeId}:farm:${resources.nextFarmSequence++}`,cropId:definition.id,environment:action.mode,clock:profile.immortal?'aperture':'outer',plantedClockMs:clockMs,lastClockMs:clockMs,growthMs:0,stored:0,qualityBps:10000,running:true,costStones:0,produced:0,consumed:clone(needed)};resources.farms.push(farm);return result(stones,'FARM_PLANTED');
  }
  if(option==='harvest-farm'){
    const farm=resources.farms.find(f=>f.id===action.farmId);requireThat(farm&&farm.stored>0,'NOT_READY','Điểm sản xuất chưa có sản vật để thu.');const definition=CROP_DEFINITIONS[farm.cropId];
    if(definition.sourceGuTypeId){requireThat(profile.guInstances.filter(g=>g.alive).length+farm.stored<=256,'GU_CAPACITY','Không đủ chỗ giữ Cổ mới.');for(let n=0;n<farm.stored;n++)createCapturedGu(profile,definition.sourceGuTypeId,{clockMs});}
    else addResource(resources,definition.productId,farm.stored);farm.stored=0;return result(stones,definition.sourceGuTypeId?'GU_SOURCE_HARVESTED':'FARM_HARVESTED');
  }
  if(option==='improve-farm'){
    safe();const farm=resources.farms.find(f=>f.id===action.farmId);requireThat(farm,'UNKNOWN_FARM','Không có điểm sản xuất này.');requireThat(farm.qualityBps<15000,'FARM_ALREADY_IMPROVED','Môi trường đã đạt giới hạn cải tạo hiện tại.');requireThat(stones>=RESOURCE_BALANCE.farmingImprovementStones,'INSUFFICIENT_STONES','Chưa đủ nguyên thạch cải tạo.');farm.qualityBps=Math.min(15000,farm.qualityBps+1000);farm.costStones+=RESOURCE_BALANCE.farmingImprovementStones;return result(stones-RESOURCE_BALANCE.farmingImprovementStones,'FARM_IMPROVED');
  }
  throw new ResourceError('UNKNOWN_RESOURCE_ACTION','Hoạt động tài nguyên chưa được hỗ trợ.');
}

export function resourceSnapshot(profile,resources,clockMs) {
  const visibleRecipe=definition=>resources.recipes[definition.id]?.known?clone(definition):{
    id:definition.id,name:definition.name,resultTypeId:definition.resultTypeId,resultRank:definition.resultRank,kind:definition.kind,
    inputs:[],materials:{},preservedMaterials:{},stones:0,essenceBps:0,durationMs:0,minRank:0,minRefinement:0,
    environment:'Chưa rõ',successBps:0,redacted:true,classification:definition.classification,balance:definition.balance,
  };
  const heldInstances=profile.guInstances.filter(g=>(g.holderLifeId??g.ownerLifeId)===profile.lifeId);
  const recentDeadIds=new Set(heldInstances.filter(gu=>!gu.alive&&!gu.lock).slice(-CULTIVATION_BALANCE.maxDeadGuHistory).map(gu=>gu.id));
  const gu=heldInstances.filter(gu=>gu.alive||gu.lock||recentDeadIds.has(gu.id)).map(g=>{
    const care=careFor(g);return{id:g.id,typeId:g.typeId,name:GU_DEFINITIONS[g.typeId].name,rank:g.rank,holderLifeId:g.holderLifeId??g.ownerLifeId,controllerLifeId:g.controllerLifeId??(g.controlled?g.ownerLifeId:null),authorizedLifeIds:[...(g.authorizedLifeIds??[])],controlled:g.controlled,usable:canUseGuInstance(profile,g),healthBps:g.healthBps??(g.alive?10000:0),vitalForLifeId:g.vitalForLifeId??null,...(g.starterGrantLifeId?{starterGrantLifeId:g.starterGrantLifeId}:{}),willBps:g.willBps??(g.controlled?0:5000),tamingProgressBps:g.tamingProgressBps??(g.controlled?10000:0),feeding:{foodId:care.foodId,amount:care.amount,remainingMs:g.feeding?.remainingMs??care.intervalMs,state:g.feeding?.state??(g.alive?'fed':'dead')},storage:g.storage??'bag',lock:g.lock?clone(g.lock):null,care:clone(care)};
  });
  return{lifeId:profile.lifeId,clockMs,items:Object.entries(resources.items).filter(([,n])=>n>0).map(([id,count])=>({id,name:RESOURCE_DEFINITIONS[id].name,quantity:count,definition:clone(RESOURCE_DEFINITIONS[id]),known:resources.knownResources.includes(id)})),gu,
    recipes:Object.values(RECIPE_DEFINITIONS).map(definition=>({id:definition.id,known:resources.recipes[definition.id]?.known??false,progressBps:resources.recipes[definition.id]?.progressBps??0,definition:visibleRecipe(definition),missing:resources.recipes[definition.id]?.known?[...definition.inputs.flatMap(input=>{const count=profile.guInstances.filter(g=>held(profile,g)&&g.controlled&&g.controllerLifeId===profile.lifeId&&!g.lock&&g.typeId===input.typeId).length;return count<input.count?[`${GU_DEFINITIONS[input.typeId].name}: ${count}/${input.count}`]:[];}),...Object.entries(definition.materials).filter(([id,n])=>(resources.items[id]??0)<n).map(([id,n])=>`${RESOURCE_DEFINITIONS[id].name}: ${resources.items[id]??0}/${n}`)]:[]})),
    jobs:resources.jobs.map(({id,recipeId,startedClockMs,finishClockMs,stage,status,message,resultInstanceId})=>({id,recipeId,startedClockMs,finishClockMs,stage,status,message,...(resultInstanceId?{resultInstanceId}:{})})),farms:resources.farms.map(farm=>({...clone(farm),definition:clone(CROP_DEFINITIONS[farm.cropId]),ready:farm.stored>0})),settings:clone(resources.settings),notices:[...resources.notices],
    activity:resources.taming?{kind:'taming',instanceId:resources.taming.instanceId}:resources.research?{kind:'research',recipeId:resources.research.recipeId,finishClockMs:resources.research.finishClockMs}:null,
    catalog:{resources:Object.values(RESOURCE_DEFINITIONS).map(clone),gu:Object.values(GU_CARE_DEFINITIONS).map(care=>({...clone(care),purchaseStones:GU_DEFINITIONS[care.typeId].purchaseStones})),recipes:Object.values(RECIPE_DEFINITIONS).map(visibleRecipe),crops:Object.values(CROP_DEFINITIONS).map(clone)}};
}
export const getResourceView=resourceSnapshot;

export function validateResourceState(state,profile) {
  const valid=condition=>requireThat(condition,'INVALID_RESOURCE_STATE','Dữ liệu tài nguyên không hợp lệ.');
  valid(state&&state.version===1&&typeof state.lifeId==='string'&&state.lifeId.length>0&&integer(state.lastClockMs)&&state.items&&typeof state.items==='object'&&!Array.isArray(state.items));
  valid(state.treasureAccessUntilMs===undefined||integer(state.treasureAccessUntilMs));
  if(profile)valid(profile.lifeId===state.lifeId);
  for(const[id,count]of Object.entries(state.items))valid(own(RESOURCE_DEFINITIONS,id)&&integer(count,0,RESOURCE_BALANCE.maxQuantity));
  for(const key of['discoveredNodes','knownResources','knownGuTypes'])valid(Array.isArray(state[key])&&state[key].length<=4096&&new Set(state[key]).size===state[key].length&&state[key].every(id=>typeof id==='string'&&id.length<=200));
  valid(state.recipes&&typeof state.recipes==='object'&&!Array.isArray(state.recipes));for(const[id,knowledge]of Object.entries(state.recipes))valid(own(RECIPE_DEFINITIONS,id)&&knowledge&&integer(knowledge.progressBps,0,10000)&&typeof knowledge.known==='boolean'&&typeof knowledge.source==='string');
  valid(Array.isArray(state.jobs)&&state.jobs.length<=RESOURCE_BALANCE.maxJobs&&integer(state.nextJobSequence,1)&&Array.isArray(state.farms)&&state.farms.length<=RESOURCE_BALANCE.maxFarms&&integer(state.nextFarmSequence,1));
  const ids=new Set();for(const job of state.jobs){valid(job&&typeof job.id==='string'&&!ids.has(job.id)&&own(RECIPE_DEFINITIONS,job.recipeId)&&Array.isArray(job.inputIds)&&new Set(job.inputIds).size===job.inputIds.length&&job.inputIds.every(id=>typeof id==='string')&&integer(job.startedClockMs)&&integer(job.finishClockMs,job.startedClockMs)&&integer(job.roll,0,9999)&&integer(job.stage,0,3)&&['running','success','failed','cancelled'].includes(job.status)&&typeof job.message==='string');ids.add(job.id);if(job.reservedMaterials)for(const[id,n]of Object.entries(job.reservedMaterials))valid(own(RESOURCE_DEFINITIONS,id)&&integer(n,0,RESOURCE_BALANCE.maxQuantity));}
  const farmIds=new Set();for(const farm of state.farms){valid(farm&&typeof farm.id==='string'&&!farmIds.has(farm.id)&&own(CROP_DEFINITIONS,farm.cropId)&&farm.environment===CROP_DEFINITIONS[farm.cropId].environment&&(farm.clock===undefined||['outer','aperture'].includes(farm.clock))&&integer(farm.plantedClockMs)&&integer(farm.lastClockMs)&&integer(farm.growthMs)&&integer(farm.stored,0,CROP_DEFINITIONS[farm.cropId].capacity)&&integer(farm.qualityBps,0,15000)&&typeof farm.running==='boolean'&&integer(farm.costStones)&&integer(farm.produced)&&farm.consumed&&typeof farm.consumed==='object');farmIds.add(farm.id);for(const[id,n]of Object.entries(farm.consumed))valid(own(RESOURCE_DEFINITIONS,id)&&integer(n));}
  valid(state.settings&&typeof state.settings.autoFeed==='boolean'&&integer(state.settings.budget,0,RESOURCE_BALANCE.autoFeedBudgetMax)&&Array.isArray(state.settings.priority)&&state.settings.priority.length<=256&&state.settings.priority.every(id=>typeof id==='string'));
  valid(Array.isArray(state.notices)&&state.notices.length<=16&&state.notices.every(line=>typeof line==='string'&&line.length<=1000));
  valid(state.taming===null||state.taming&&typeof state.taming.instanceId==='string'&&integer(state.taming.startedClockMs));valid(state.research===null||state.research&&own(RECIPE_DEFINITIONS,state.research.recipeId)&&integer(state.research.finishClockMs));
  return true;
}
