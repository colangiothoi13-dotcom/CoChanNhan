import { describe, it, expect, beforeEach } from 'vitest';
import { Cultivator } from '../src/entities/Cultivator';
import { Monster } from '../src/entities/Monster';
import { ParticleSystem } from '../src/engine/ParticleSystem';
import { SoundEngine } from '../src/engine/SoundEngine';
import { GameMap } from '../src/engine/Map';

describe('Cultivator & Combat Mechanics', () => {
  let cultivator: Cultivator;
  let particles: ParticleSystem;
  let sound: SoundEngine;
  let map: GameMap;

  beforeEach(() => {
    cultivator = new Cultivator();
    particles = new ParticleSystem();
    sound = new SoundEngine();
    map = new GameMap();
  });

  it('initializes Cultivator with full HP, MP, and Stamina', () => {
    expect(cultivator.hp).toBe(100);
    expect(cultivator.mp).toBe(100);
    expect(cultivator.stamina).toBe(100);
    expect(cultivator.cdMoonlight).toBe(0);
  });

  it('Thanh Đồng Giáp reduces incoming damage by ~55%', () => {
    // Normal damage
    const normalDmg = cultivator.takeDamage(40, particles);
    expect(normalDmg).toBe(40);
    expect(cultivator.hp).toBe(60);

    // Cast shield
    cultivator.castBronzeShield(sound);
    expect(cultivator.shieldDuration).toBe(5.0);

    // Damage with shield active
    const shieldedDmg = cultivator.takeDamage(40, particles);
    expect(shieldedDmg).toBe(18); // 40 * 0.45 = 18
    expect(cultivator.hp).toBe(42);
  });

  it('Dash consumes stamina and grants dash velocity', () => {
    expect(cultivator.stamina).toBe(100);
    const dashed = cultivator.dash(sound);

    expect(dashed).toBe(true);
    expect(cultivator.isDashing).toBe(true);
    expect(cultivator.stamina).toBe(70);
    expect(cultivator.cdDash).toBe(cultivator.MAX_CD_DASH);
  });

  it('Monster takes damage, dies and drops loot', () => {
    const snake = new Monster(500, 500, 'snake');
    expect(snake.hp).toBe(60);
    expect(snake.state).toBe('patrol');

    // Inflict fatal damage
    const outcome = snake.takeDamage(60, particles, sound);
    expect(outcome.died).toBe(true);
    expect(snake.state).toBe('dead');
    expect(outcome.drops.length).toBeGreaterThanOrEqual(2); // At least 2 primeval stones
  });

  it('Map detects collision with ancient pillars and boundaries', () => {
    // World boundary
    expect(map.checkCollision(10, 10, 20)).toBe(true);

    // Clear open ground
    expect(map.checkCollision(1200, 1200, 20)).toBe(false);

    // Pillar at 1000, 1000
    expect(map.checkCollision(1000, 1000, 20)).toBe(true);
  });

  it('honors partial joystick movement instead of always running at full speed', () => {
    cultivator.update(0.1, { x: 1, y: 0, length: 0.5 }, map, particles);
    expect(cultivator.x).toBeCloseTo(1208);
  });

  it('does not heal a defeated cultivator before the respawn handler can run', () => {
    cultivator.hp = 0;
    cultivator.healDuration = 1;
    cultivator.update(0.1, { x: 0, y: 0, length: 0 }, map, particles);
    expect(cultivator.hp).toBe(0);
  });

  it('only heals for the remaining buff duration', () => {
    cultivator.hp = 50;
    cultivator.healDuration = 0.05;
    cultivator.update(0.2, { x: 0, y: 0, length: 0 }, map, particles);
    expect(cultivator.hp).toBeCloseTo(50.75);
  });

  it('cannot generate a second set of loot from a defeated monster', () => {
    const snake = new Monster(500, 500, 'snake');
    expect(snake.takeDamage(60, particles, sound).died).toBe(true);
    const repeated = snake.takeDamage(60, particles, sound);
    expect(repeated.died).toBe(false);
    expect(repeated.drops).toEqual([]);
  });
});
