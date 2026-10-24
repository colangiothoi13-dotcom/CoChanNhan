/** Catalog names/examples are user-provided canon claims. Every price, yield,
 * interval, chance and capacity here is proposed game balance, not novel data. */
const freeze = value => Object.freeze(value);
export const RESOURCE_BALANCE = freeze({ basis: 'proposed-game-balance', maxQuantity: 1000000, maxFarms: 8, maxJobs: 32,
  researchMs: 6000, researchStones: 2, tamingMs: 10000, tamingEssenceBps: 500, tamingStones: 2,
  tamingDecayPerSecondBps: 300, primevalRecoveryBpsPerStone: 2000, healingPerHerbBps: 2500,
  oldControllerWillBps: 8000,
  preservationRateBps: 1000, farmingImprovementStones: 4, autoFeedBudgetMax: 10000 });
const resource = (id, name, uses, extras = {}) => freeze({ id, name, description: name, grade: 1, rarity: 'common', uses: freeze(uses), path: 'none', source: 'Thu hái, sản xuất hoặc cửa hàng', harvestCondition: 'Có phương tiện và quyền tiếp cận nguồn', renewable: true, storage: 'Kho khô, bảo quản theo loại', buyPrice: 1, sellPrice: 1, classification: 'proposed-game-balance', balance: 'proposed-game-balance', ...extras });
export const RESOURCE_DEFINITIONS = freeze(Object.fromEntries([
  resource('moon-orchid-petal','Cánh Nguyệt Lan',['food','refining'],{path:'moon',classification:'user-supplied-canon',buyPrice:1,sellPrice:1,storage:'Hộp hoa thoáng, tránh ẩm'}),
  resource('spirit-herb','Linh thảo',['food','medicine','refining'],{path:'wood',buyPrice:2,sellPrice:1}),
  resource('copper-ore','Thanh đồng khoáng',['refining'],{path:'metal',renewable:false,buyPrice:2,sellPrice:1}),
  resource('capture-net','Lưới giữ Cổ',['capture'],{buyPrice:2,sellPrice:1,renewable:false}),
  resource('bait','Mồi dẫn Cổ',['bait'],{buyPrice:1,sellPrice:1}),
  resource('moon-orchid-seed','Giống Nguyệt Lan',['seed'],{path:'moon',buyPrice:2,sellPrice:1}),
  resource('stargrass-seed','Giống Tinh Tiết Thảo',['seed'],{path:'star',buyPrice:3,sellPrice:1,classification:'user-supplied-canon'}),
  resource('stargrass','Tinh Tiết Thảo',['food','habitat'],{path:'star',buyPrice:2,sellPrice:1,classification:'user-supplied-canon'}),
  resource('firefly-eggs','Giống Tinh Huỳnh Trùng',['colony'],{path:'star',buyPrice:4,sellPrice:2,classification:'user-supplied-canon'}),
  resource('firefly-colony','Đàn Tinh Huỳnh Trùng thường',['habitat'],{path:'star',buyPrice:8,sellPrice:4,classification:'user-supplied-canon'}),
  resource('water','Nước sạch',['irrigation'],{buyPrice:1,sellPrice:0}),
  resource('meat','Thịt thú',['food'],{path:'strength',buyPrice:2,sellPrice:1,storage:'Bảo quản mát'}),
  resource('light-dust','Quang phấn',['food','refining'],{path:'light',buyPrice:1,sellPrice:1}),
  resource('immortal-stone','Tiên nguyên thạch',['immortal-currency','essence-conversion'],{grade:6,rarity:'rare',buyPrice:500,sellPrice:400,renewable:false,classification:'user-supplied-canon'}),
].map(item => [item.id,item])));
const care = (typeId,name,foodId,amount,intervalMs,extras={}) => freeze({typeId,name,foodId,amount,intervalMs,starvationMs:intervalMs*3,substitutes:freeze([]),useHungerMs:1000,preservationAllowed:true,classification:'proposed-game-balance',balance:'proposed-game-balance',...extras});
export const GU_CARE_DEFINITIONS = freeze(Object.fromEntries([
  care('moonlight','Nguyệt Quang Cổ','moon-orchid-petal',2,600000,{classification:'user-supplied-canon'}),
  care('smalllight','Tiểu Quang Cổ','light-dust',1,600000),
  care('moonbeam','Nguyệt Mang Cổ','moon-orchid-petal',3,480000),
  care('moonblade','Nguyệt Nhận Cổ [phóng tác cũ]','moon-orchid-petal',3,480000),
  care('bronze','Thanh Đồng Giáp Cổ','copper-ore',1,720000),
  care('boar','Bạch Trư Cổ [hiệu ứng game]','meat',2,600000),
  care('heal','Thảo Hoàn Cổ','spirit-herb',2,540000),
  care('ironskin','Thiết Bì Cổ [phóng tác cũ]','copper-ore',2,720000),
  care('starfirefly','Tinh Huỳnh Cổ','stargrass',1,660000,{classification:'user-supplied-canon'}),
].map(item=>[item.typeId,item])));
const recipe = (value) => freeze({materials:freeze({}),preservedMaterials:freeze({}),minRank:1,minRefinement:0,environment:'refining-hall',successBps:8000,classification:'proposed-game-balance',balance:'proposed-game-balance',...value});
export const RECIPE_DEFINITIONS = freeze({
  'moonbeam': recipe({id:'moonbeam',name:'Nguyệt Mang Cổ phương',resultTypeId:'moonbeam',resultRank:2,kind:'combine',inputs:freeze([{typeId:'moonlight',count:1},{typeId:'smalllight',count:2}]),materials:freeze({'moon-orchid-petal':2,'spirit-herb':1,'copper-ore':1}),stones:4,essenceBps:1000,durationMs:12000,successBps:8000,classification:'user-supplied-canon'}),
  'reverse-moonbeam': recipe({id:'reverse-moonbeam',name:'Nghịch luyện Nguyệt Mang [quy ước game]',resultTypeId:'moonlight',resultRank:1,kind:'reverse',inputs:freeze([{typeId:'moonbeam',count:1}]),materials:freeze({'spirit-herb':1}),stones:2,essenceBps:500,durationMs:8000,successBps:9000}),
  'legacy-moonblade': recipe({id:'legacy-moonblade',name:'Nguyệt Nhận cổ phương [phóng tác cũ]',resultTypeId:'moonblade',resultRank:2,kind:'combine',inputs:freeze([{typeId:'moonlight',count:1},{typeId:'boar',count:1}]),stones:10,essenceBps:500,durationMs:10000,successBps:8500}),
  'legacy-ironskin': recipe({id:'legacy-ironskin',name:'Thiết Bì cổ phương [phóng tác cũ]',resultTypeId:'ironskin',resultRank:2,kind:'combine',inputs:freeze([{typeId:'bronze',count:1},{typeId:'boar',count:1}]),stones:15,essenceBps:500,durationMs:10000,successBps:8000}),
});
const crop = value=>freeze({inputs:freeze({water:1}),capacity:10,classification:'proposed-game-balance',balance:'proposed-game-balance',...value});
export const CROP_DEFINITIONS = freeze({
  'moon-orchid':crop({id:'moon-orchid',name:'Vườn Nguyệt Lan',seedId:'moon-orchid-seed',productId:'moon-orchid-petal',durationMs:30000,yield:3,environment:'moon-garden'}),
  'stargrass':crop({id:'stargrass',name:'Luống Tinh Tiết Thảo',seedId:'stargrass-seed',productId:'stargrass',durationMs:35000,yield:3,environment:'star-meadow',classification:'user-supplied-canon'}),
  'firefly-colony':crop({id:'firefly-colony',name:'Đàn Tinh Huỳnh Trùng thường',seedId:'firefly-eggs',productId:'firefly-colony',durationMs:45000,yield:1,capacity:4,inputs:freeze({stargrass:2,water:1}),environment:'star-meadow',classification:'user-supplied-canon'}),
  'starfirefly-source':crop({id:'starfirefly-source',name:'Sinh cảnh Tinh Huỳnh Cổ',seedId:'firefly-colony',productId:'stargrass',durationMs:60000,yield:1,capacity:3,inputs:freeze({stargrass:3,water:1}),environment:'star-meadow',sourceGuTypeId:'starfirefly',classification:'user-supplied-canon'}),
});
