import { RANK_ENERGY_LABELS, SUBREALM_LABELS, SIM_YEAR_TICKS, type MortalAperture, type MortalSubrealm, type RulesActor } from './types';

export class RuleViolation extends Error {
  constructor(public code: string, message: string, public category: 'validation' | 'permission' | 'resources' | 'unique' = 'validation') { super(message); }
}
export function requireRule(condition: unknown, code: string, message: string, category: RuleViolation['category'] = 'validation'): asserts condition {
  if (!condition) throw new RuleViolation(code, message, category);
}
export function integer(value: number, minimum: number, maximum: number, label: string): void {
  requireRule(Number.isSafeInteger(value) && value >= minimum && value <= maximum, 'INVALID_NUMBER', `${label} cần là số nguyên từ ${minimum} đến ${maximum}.`);
}
export const SUBREALMS: MortalSubrealm[] = ['initial', 'middle', 'upper', 'peak'];
export function aptitudeLabel(bps: number): string {
  integer(bps, 2000, 10000, 'Dung lượng khiếu');
  return bps === 10000 ? 'Thập Tuyệt' : bps >= 8000 ? 'Giáp' : bps >= 6000 ? 'Ất' : bps >= 4000 ? 'Bính' : 'Đinh';
}
export function qualityLabel(quality: number): string {
  integer(quality, 1, 20, 'Phẩm chất');
  const rank = Math.floor((quality - 1) / 4) + 1 as 1 | 2 | 3 | 4 | 5;
  return `${RANK_ENERGY_LABELS[rank]} · ${SUBREALM_LABELS[SUBREALMS[(quality - 1) % 4]!]}`;
}
export function naturalQuality(actor: RulesActor): number {
  requireRule(actor.rank <= 5 && actor.subrealm !== null, 'MORTAL_REQUIRED', 'Phương pháp này cần không khiếu phàm nhân.');
  return (actor.rank - 1) * 4 + SUBREALMS.indexOf(actor.subrealm) + 1;
}
export function syncEssence(aperture: MortalAperture): void {
  aperture.essence = aperture.essence.filter(b => b.amountBps > 0).sort((a, b) => a.quality - b.quality);
  aperture.amountBps = aperture.essence.reduce((sum, b) => sum + b.amountBps, 0);
}
export function addEssence(aperture: MortalAperture, quality: number, amountBps: number): void {
  const available = Math.min(amountBps, aperture.capacityBps - aperture.amountBps);
  if (available <= 0) return;
  const bucket = aperture.essence.find(b => b.quality === quality);
  if (bucket) bucket.amountBps += available;
  else aperture.essence.push({ quality, amountBps: available });
  syncEssence(aperture);
}
/** Costs use whole-aperture units. Proposed quality bonus: 4/(4+quality difference). */
export function spendPrimeval(actor: RulesActor, costBps: number, requiredQuality = 1): void {
  integer(costBps, 1, 10000, 'Chi phí chân nguyên'); integer(requiredQuality, 1, 20, 'Phẩm chất yêu cầu');
  const aperture = actor.mortal;
  requireRule(aperture && aperture.wall !== 'shattered', 'APERTURE_UNAVAILABLE', 'Không khiếu không còn dùng được.');
  let remainingPower = costBps * 4;
  const next = structuredClone(aperture.essence).sort((a, b) => b.quality - a.quality);
  for (const bucket of next) {
    if (bucket.quality < requiredQuality || remainingPower <= 0) continue;
    const powerPerUnit = 4 + bucket.quality - requiredQuality;
    const consumed = Math.min(bucket.amountBps, Math.ceil(remainingPower / powerPerUnit));
    bucket.amountBps -= consumed; remainingPower -= consumed * powerPerUnit;
  }
  requireRule(remainingPower <= 0, 'INSUFFICIENT_ESSENCE', 'Chưa đủ chân nguyên đúng phẩm chất; không trừ một phần.', 'resources');
  aperture.essence = next; syncEssence(aperture);
}
export function makeMortal(id: string, capacityBps: number, quality: number, pressure = 0): MortalAperture {
  aptitudeLabel(capacityBps); integer(pressure, 0, 9999, 'Áp lực ban đầu');
  return { id, capacityBps, amountBps: capacityBps, essence: [{ quality, amountBps: capacityBps }], wall: 'stable', wallProgress: 0,
    recoveryRemainder: 0, pressureRemainder: 0, tenExtreme: capacityBps === 10000 ? { pressure, suppressedUntilAge: 0 } : null };
}
/** Uses experienced body time. Return a cause if age or extreme pressure ends this life. */
export function ageAndRecover(actor: RulesActor, delta: number): string | null {
  if (!actor.alive) return null;
  const aperture = actor.mortal;
  let experienced = Math.min(delta, Math.max(0, actor.lifespanTicks - actor.ageTicks));
  const extreme = aperture?.tenExtreme;
  if (extreme && aperture.wall !== 'shattered') {
    const safeTicks = Math.max(0, extreme.suppressedUntilAge - actor.ageTicks);
    const pressureTicks = Math.ceil(((10000 - extreme.pressure) * SIM_YEAR_TICKS - aperture.pressureRemainder) / 200);
    experienced = Math.min(experienced, safeTicks + pressureTicks);
  }
  const previousAge = actor.ageTicks;
  actor.ageTicks += experienced;
  if (aperture && aperture.wall !== 'shattered') {
    const recovery = aperture.recoveryRemainder + experienced * 400;
    addEssence(aperture, naturalQuality(actor), Math.floor(recovery / SIM_YEAR_TICKS));
    aperture.recoveryRemainder = recovery % SIM_YEAR_TICKS;
    if (extreme) {
      const active = Math.max(0, actor.ageTicks - Math.max(previousAge, extreme.suppressedUntilAge));
      const pressure = aperture.pressureRemainder + active * 200;
      extreme.pressure = Math.min(10000, extreme.pressure + Math.floor(pressure / SIM_YEAR_TICKS));
      aperture.pressureRemainder = pressure % SIM_YEAR_TICKS;
      aperture.wall = extreme.pressure >= 7000 ? 'strained' : 'stable';
      if (extreme.pressure >= 10000) return 'Áp lực Thập Tuyệt thể vượt sức chịu của khiếu.';
    }
  }
  return actor.ageTicks >= actor.lifespanTicks ? 'Thân thể đã hết thọ nguyên mô phỏng.' : null;
}
