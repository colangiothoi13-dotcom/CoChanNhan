import type { CultivationState, GuInstance } from './cultivation-core.mjs';
export type SourceClassification = 'user-supplied-canon' | 'simulation-interpretation' | 'proposed-game-balance';
export interface ResourceDefinition { id: string; name: string; description: string; grade: number; rarity: string; uses: readonly string[]; path: string; source: string; harvestCondition: string; renewable: boolean; storage: string; buyPrice: number; sellPrice: number; classification: SourceClassification; balance: 'proposed-game-balance' }
export interface GuCareDefinition { typeId: string; name: string; foodId: string; amount: number; intervalMs: number; starvationMs: number; substitutes: readonly string[]; useHungerMs: number; preservationAllowed: boolean; purchaseStones?:number|null; classification: SourceClassification; balance: 'proposed-game-balance' }
export interface RecipeDefinition { id: string; name: string; resultTypeId: string; resultRank: number; kind: 'combine' | 'upgrade' | 'reverse'; inputs: readonly {typeId: string; count: number}[]; materials: Readonly<Record<string,number>>; preservedMaterials: Readonly<Record<string,number>>; stones: number; essenceBps: number; durationMs: number; minRank: number; minRefinement: number; environment: string; successBps: number; uniqueTypeId?: string;redacted?:boolean; classification: SourceClassification; balance: 'proposed-game-balance' }
export interface CropDefinition { id: string; name: string; seedId: string; productId: string; durationMs: number; yield: number; capacity: number; inputs: Readonly<Record<string,number>>; environment: string; sourceGuTypeId?: string; classification: SourceClassification; balance: 'proposed-game-balance' }
export interface ResourceState {
  version: 1; lifeId: string; lastClockMs: number; items: Record<string,number>; discoveredNodes: string[];
  knownResources: string[]; knownGuTypes: string[]; recipes: Record<string,{progressBps:number;known:boolean;source:string}>;
  jobs: RecipeJob[]; farms: FarmState[]; nextJobSequence: number; nextFarmSequence: number;
  settings: {autoFeed:boolean;budget:number;priority:string[]}; notices:string[];
  treasureAccessUntilMs?:number;
  taming:{instanceId:string;startedClockMs:number}|null;research:{recipeId:string;finishClockMs:number;anchorFacilityId?:string}|null;
}
export interface RecipeJob { id:string; recipeId:string; inputIds:string[]; startedClockMs:number; finishClockMs:number; stage:number; roll:number; status:'running'|'success'|'failed'|'cancelled'; resultInstanceId?:string; message:string;reservedMaterials?:Record<string,number>;anchorFacilityId?:string }
export interface FarmState { id:string; cropId:string; environment:string; clock?:'outer'|'aperture'; plantedClockMs:number; lastClockMs:number; growthMs:number; stored:number; qualityBps:number; running:boolean; costStones:number; produced:number; consumed:Record<string,number> }
export interface ResourceAction { option:string; resourceId?:string;quantity?:number;instanceId?:string;guId?:string;recipeId?:string;inputIds?:string[];cropId?:string;farmId?:string;mode?:string;enabled?:boolean;budget?:number;priority?:string[];nodeId?:string;targetId?:string;targetAccountId?:string;listingId?:string;price?:number }
export interface ResourceContext { clockMs:number;stones:number;inSanctuary?:boolean;facilityRole?:string;randomRoll?:number;availableEnvironments?:string[];isUniqueAvailable?:(typeId:string,rank:number,existingInstanceId?:string)=>boolean }
export interface ResourceResult { stones:number;critical:boolean;code:string;events:string[] }
export interface ResourceStackView { id:string;name:string;quantity:number;definition:ResourceDefinition;known:boolean }
export interface GuCareView { id:string;typeId:string;name:string;rank:number;holderLifeId:string;controllerLifeId:string|null;authorizedLifeIds:string[];controlled:boolean;usable:boolean;healthBps:number;vitalForLifeId:string|null;starterGrantLifeId?:string;willBps:number;tamingProgressBps:number;feeding:{foodId:string;amount:number;remainingMs:number;state:'fed'|'due-soon'|'hungry'|'weak'|'critical'|'dead'};storage:string;lock:GuInstance['lock'];care:GuCareDefinition }
export interface RecipeView { id:string;known:boolean;progressBps:number;definition:RecipeDefinition;missing:string[] }
export interface RecipeJobView { id:string;recipeId:string;startedClockMs:number;finishClockMs:number;stage:number;status:RecipeJob['status'];message:string;resultInstanceId?:string }
export type FarmView = FarmState & {definition:CropDefinition;ready:boolean};
export interface ResourceNodeView {id:string;name:string;kind:'harvest'|'wild';x:number;y:number;discovered:boolean;description:string;resourceId?:string;stock?:number;readyInMs?:number}
export interface WildTargetView {id:string;nodeId:string;typeId:string;name:string;rank?:number;x?:number;y?:number;healthBps:number;resistanceBps:number;baited:boolean}
export interface ResourceListingView {id:string;sellerName:string;kind:'gu'|'resource';resourceId?:string;quantity:number;price:number;fee:number;own:boolean;hubId?:string;channel?:string;currency?:'stones'|'immortal-stone';gu?:GuCareView}
export interface ResourcePlayerView {accountId:string;lifeId:string;name:string}
export interface ResourceLoanView {instanceId:string;controllerLifeId:string;holderLifeId:string;status:'active'|'revoked';borrowerName:string;own:boolean}
export interface ResourceSnapshot {
  revision?:number;
  lifeId:string;clockMs:number;items:ResourceStackView[];gu:GuCareView[];recipes:RecipeView[];jobs:RecipeJobView[];farms:FarmView[];
  settings:ResourceState['settings'];notices:string[];catalog:{resources:ResourceDefinition[];gu:GuCareDefinition[];recipes:RecipeDefinition[];crops:CropDefinition[]};
  activity?:{kind:'taming'|'research';instanceId?:string;recipeId?:string;finishClockMs?:number}|null;
  nearbyNodes?:ResourceNodeView[];wildTargets?:WildTargetView[];market?:ResourceListingView[];players?:ResourcePlayerView[];loans?:ResourceLoanView[];
  marketAccess?:{treasureHeavenUntilMs:number;active:boolean;serviceFee:number;currency:'immortal-stone'};
}
export class ResourceError extends Error {code:string;constructor(code:string,message:string)}
export const RESOURCE_BALANCE: Readonly<Record<string,number|string>>;
export const RESOURCE_DEFINITIONS: Readonly<Record<string,ResourceDefinition>>;
export const GU_CARE_DEFINITIONS: Readonly<Record<string,GuCareDefinition>>;
export const RECIPE_DEFINITIONS: Readonly<Record<string,RecipeDefinition>>;
export const CROP_DEFINITIONS: Readonly<Record<string,CropDefinition>>;
export function createResourceState(options:{lifeId:string;clockMs?:number}):ResourceState;
export function migrateResourceState(raw:unknown,options:{lifeId:string;clockMs?:number}):ResourceState;
export function validateResourceState(state:unknown,profile?:CultivationState):true;
export function initializeGuLifecycle(profile:CultivationState,clockMs:number):void;
export function createCapturedGu(profile:CultivationState,typeId:string,options?:{clockMs?:number;rank?:number;healthBps?:number;willBps?:number;oldControllerLifeId?:string|null}):GuInstance;
export function advanceResources(profile:CultivationState,resources:ResourceState,clockMs:number,context:{stones:number;inSanctuary?:boolean;isUniqueAvailable?:ResourceContext['isUniqueAvailable']}):ResourceResult;
export function applyResourceAction(profile:CultivationState,resources:ResourceState,action:ResourceAction,context:ResourceContext):ResourceResult;
export function resourceSnapshot(profile:CultivationState,resources:ResourceState,clockMs:number):ResourceSnapshot;
export function getResourceView(profile:CultivationState,resources:ResourceState,clockMs:number):ResourceSnapshot;
export function addResource(resources:ResourceState,resourceId:string,quantity:number):void;
export function removeResource(resources:ResourceState,resourceId:string,quantity:number):void;
export function destroyGuInstance(profile:CultivationState,instanceId:string,context?:{controllerLifeId?:string}):{instanceId:string;backlashLifeId:string|null};
