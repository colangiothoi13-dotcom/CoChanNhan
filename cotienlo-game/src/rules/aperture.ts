import { SIM_YEAR_TICKS, TRIBULATION_LABELS, type RulesAperture, type RulesSnapshot, type RuleEvent, type TribulationKind } from './types';

const cycles: Record<6 | 7 | 8 | 9, readonly [TribulationKind, number][]> = {
  6: [['earth', 10], ['heaven', 100]],
  7: [['earth', 10], ['heaven', 50], ['grand', 100]],
  8: [['heaven', 10], ['grand', 50], ['myriad', 100]],
  // Rank nine's complete calendar is deliberately not inferred from the attachment.
  9: [],
};
const damage: Record<TribulationKind, number> = { earth: 200, heaven: 800, grand: 1500, myriad: 2500 };

export function makeAperture(id: string, ownerId: string, outerTicks: number, ratio: number, grade: RulesAperture['grade'] = 'middle'): RulesAperture {
  return { id, ownerId, rank: 6, grade, innerTicks: 0, lastOuterTicks: outerTicks, ratio, placed: true, daoMarks: 0,
    ecology: { water: 1000, food: 20, plants: 0, plantCapacity: 10000, habitatBps: 10000, growthPerYear: 4, foodDemandPerYear: 1, shortageYears: 0 } };
}

/** A completed inner year is the lab's declared discrete ecology step. */
function settleEcology(state: RulesSnapshot, aperture: RulesAperture, innerOffset: number): void {
  const eco = aperture.ecology;
  const growth = Math.min(Math.floor(eco.growthPerYear * eco.habitatBps / 10000), eco.water, eco.plantCapacity - eco.plants);
  eco.water -= growth; eco.plants += growth; eco.food += growth * 2;
  if (eco.food < eco.foodDemandPerYear) eco.shortageYears++;
  eco.food = Math.max(0, eco.food - eco.foodDemandPerYear);
  const owner = state.actors[aperture.ownerId];
  // Production cannot credit a person's essence after their body dies midway through a long advance.
  const bodyRatio = owner?.location === 'outer' ? 1 : state.apertures[owner?.location ?? '']?.ratio ?? 1;
  const beforeDeath = owner && innerOffset * bodyRatio < (owner.lifespanTicks - owner.ageTicks) * aperture.ratio;
  if (growth > 0 && owner?.alive && owner.immortalEssence && beforeDeath) owner.immortalEssence.units++;
}

export function settleAperture(state: RulesSnapshot, aperture: RulesAperture, deltaOuterTicks: number, events: RuleEvent[]): number {
  const innerDelta = deltaOuterTicks * aperture.ratio;
  const oldInnerTicks = aperture.innerTicks;
  const oldYear = Math.floor(aperture.innerTicks / SIM_YEAR_TICKS);
  const newYear = Math.floor((aperture.innerTicks + innerDelta) / SIM_YEAR_TICKS);
  for (let year = oldYear + 1; year <= newYear; year++) {
    settleEcology(state, aperture, year * SIM_YEAR_TICKS - oldInnerTicks);
    for (const [kind, period] of cycles[aperture.rank]) {
      if (year % period !== 0) continue;
      const id = `${aperture.id}:${aperture.rank}:${kind}:${year}`;
      if (state.tribulations.some(t => t.id === id)) continue;
      const habitatDamageBps = damage[kind];
      state.tribulations.push({ id, apertureId: aperture.id, kind, dueInnerYear: year, status: 'pending', habitatDamageBps });
      aperture.ecology.habitatBps = Math.max(0, aperture.ecology.habitatBps - habitatDamageBps);
      aperture.ecology.plants = Math.floor(aperture.ecology.plants * (10000 - habitatDamageBps) / 10000);
      events.push({ type: 'tribulation-due', message: `${TRIBULATION_LABELS[kind]} đến hạn ở năm nội khiếu ${year}; thiệt hại sinh cảnh đã được ghi.` });
    }
  }
  aperture.innerTicks += innerDelta;
  aperture.lastOuterTicks = state.outerTicks;
  return innerDelta;
}
