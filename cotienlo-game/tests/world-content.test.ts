import { describe, expect, it } from 'vitest';

describe('shared world content', () => {
  it('makes every territory reachable from each origin without inventing a teleport', async () => {
    const { default: content } = await import('../shared/world-content.json');
    expect(new Set(content.places.map((p) => p.id)).size).toBe(30);
    for (const origin of content.origins) {
      const seen = new Set<string>();
      const queue = [origin.placeId];
      while (queue.length) {
        const id = queue.shift()!;
        if (seen.has(id)) continue;
        seen.add(id);
        const place = content.places.find((p) => p.id === id);
        expect(place, `route points at absent place ${id}`).toBeDefined();
        queue.push(...place!.neighbors);
      }
      expect(seen.size).toBe(30);
    }
  });

  it('gives each inheritance a discoverable location, complete contract and consequential choices', async () => {
    const { default: content } = await import('../shared/world-content.json');
    expect(content.inheritances).toHaveLength(12);
    for (const trial of content.inheritances) {
      expect(content.places.some((place) => place.id === trial.placeId)).toBe(true);
      for (const key of ['origin', 'clue', 'requirement', 'commitment', 'success', 'failure', 'reward', 'consequence'] as const) {
        expect(trial[key].length, `${trial.id} missing ${key}`).toBeGreaterThan(12);
      }
      expect(trial.stages.length).toBeGreaterThanOrEqual(3);
      for (const stage of trial.stages) {
        expect(new Set(stage.choices.map((choice) => choice.id)).size).toBe(stage.choices.length);
        expect(stage.choices.some((choice) => choice.effect.danger <= 0)).toBe(true);
        expect(stage.choices.some((choice) => choice.effect.danger > 0)).toBe(true);
      }
    }
  });
});
