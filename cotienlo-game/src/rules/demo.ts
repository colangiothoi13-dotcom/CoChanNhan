import { DEMO_IDS as ID, RANK_ENERGY_LABELS, SIM_YEAR_TICKS, type DemoOptions, type GuInstance, type RulesActor, type RulesSnapshot } from './types';
import { makeMortal, requireRule, integer } from './cultivation';
import { makeAperture } from './aperture';

function mortal(id: string, name: string, rank: 1 | 5 = 1, capacity = 4400): RulesActor {
  return { id, name, rank, subrealm: rank === 5 ? 'peak' : 'initial', aptitudeBps: capacity, ageTicks: 20 * SIM_YEAR_TICKS,
    lifespanTicks: 80 * SIM_YEAR_TICKS, alive: true, hp: 100, stones: 200, location: 'outer',
    mortal: makeMortal(`ap-${id}`, capacity, rank === 5 ? 20 : 1), immortalEssence: null, ascension: null };
}
function gu(id: string, ownerId: string, typeId: string, name: string, vitalApertureId: string | null = null): GuInstance {
  return { id, typeId, name, rank: 1, immortal: false, alive: true, ownerId, holderId: ownerId,
    location: { kind: 'actor', id: ownerId }, controllerId: ownerId, vitalApertureId };
}
export function demoState(options: DemoOptions): RulesSnapshot {
  const capacity = options.aptitudeBps ?? 4400;
  const ratio = options.ratio ?? 10;
  requireRule([1, 10, 20, 30].includes(ratio), 'INVALID_RATIO', 'Tỷ lệ đề xuất chỉ gồm ×1, ×10, ×20, ×30.');
  integer(options.extremePressure ?? 0, 0, 9999, 'Áp lực ban đầu');
  const actors: RulesSnapshot['actors'] = {
    [ID.mortal]: mortal(ID.mortal, 'Người tu 44%', 1, capacity),
    [ID.borrower]: mortal(ID.borrower, 'Người mượn Cổ'),
    [ID.ascender]: mortal(ID.ascender, 'Người thử thăng tiên', 5, 8800),
    [ID.immortal]: { ...mortal(ID.immortal, 'Chủ phúc địa'), rank: 6, subrealm: null, mortal: null,
      immortalEssence: { ownerId: ID.immortal, kind: RANK_ENERGY_LABELS[6], units: 0 }, stones: 1000 },
  };
  actors[ID.mortal]!.name = capacity === 4400 ? 'Người tu 44%' : `Người tu ${capacity / 100}%`;
  if (actors[ID.mortal]!.mortal!.tenExtreme) actors[ID.mortal]!.mortal!.tenExtreme!.pressure = options.extremePressure ?? 0;
  const instances = [
    gu(ID.moonGu, ID.mortal, 'lab-moon', 'Nguyệt Cổ mô phỏng [ĐX]', `ap-${ID.mortal}`),
    gu(ID.boarGu, ID.mortal, 'lab-boar', 'Trư Cổ mô phỏng [ĐX]'),
    gu(ID.wineGu, ID.mortal, 'lab-wine', 'Tửu Trùng trong bài thử [ĐX]'),
    gu(ID.secondMoonGu, ID.borrower, 'lab-moon', 'Nguyệt Cổ thứ hai [ĐX]'),
    gu(ID.secondBoarGu, ID.borrower, 'lab-boar', 'Trư Cổ thứ hai [ĐX]'),
    gu(ID.ascensionGu, ID.ascender, 'lab-moon', 'Cổ phóng khi thăng tiên [ĐX]', `ap-${ID.ascender}`),
  ];
  return { metadata: { mode: 'isolated-rules-lab', version: 1, balance: 'proposed', yearTicks: SIM_YEAR_TICKS,
    notice: 'Dữ liệu mô phỏng; không thay đổi nhân vật, tài sản hay thời gian Ngũ Vực. Phối phương và thông số là đề xuất thiết kế.' },
    revision: 0, outerTicks: 0, actors, gu: Object.fromEntries(instances.map(g => [g.id, g])), grants: [], jobs: {}, reservations: {},
    apertures: { [ID.aperture]: makeAperture(ID.aperture, ID.immortal, 0, ratio) }, tribulations: [] };
}
