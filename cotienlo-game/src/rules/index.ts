export * from './types';
export { aptitudeLabel, qualityLabel } from './cultivation';
export { RulesSimulation, validateRulesSnapshot } from './RulesSimulation';
import { RulesSimulation } from './RulesSimulation';
import { demoState } from './demo';
import type { DemoOptions } from './types';

export function createRulesDemo(options: DemoOptions = {}): RulesSimulation {
  return new RulesSimulation(demoState(options), options);
}
