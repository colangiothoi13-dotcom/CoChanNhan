import { afterEach, describe, expect, it, vi } from 'vitest';
import { SoundEngine } from '../src/engine/SoundEngine';

class TestAudioContext {
  static instances: TestAudioContext[] = [];
  state = 'running';
  currentTime = 0;
  destination = {};
  oscillatorCount = 0;
  constructor() { TestAudioContext.instances.push(this); }
  createOscillator() {
    this.oscillatorCount++;
    return { type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} };
  }
  createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
  async suspend() { this.state = 'suspended'; }
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; }
}

afterEach(() => { vi.unstubAllGlobals(); TestAudioContext.instances = []; });

describe('audio lifecycle', () => {
  it('stops scheduling effects while the game is paused and resumes existing audio', () => {
    vi.stubGlobal('window', { AudioContext: TestAudioContext });
    const sound = new SoundEngine();
    sound.playSlash();
    const context = TestAudioContext.instances[0];
    sound.suspend();
    sound.playSlash();
    expect(context.state).toBe('suspended');
    expect(context.oscillatorCount).toBe(1);
    sound.resume();
    sound.playSlash();
    expect(context.state).toBe('running');
    expect(context.oscillatorCount).toBe(2);
    sound.destroy();
    expect(context.state).toBe('closed');
  });

  it('does not create audio outside a user gesture or lose the mute preference on resume', () => {
    vi.stubGlobal('window', { AudioContext: TestAudioContext });
    const sound = new SoundEngine();
    sound.resume();
    expect(TestAudioContext.instances).toHaveLength(0);
    sound.playSlash();
    const context = TestAudioContext.instances[0];
    sound.toggle();
    sound.suspend();
    sound.resume();
    sound.playSlash();
    expect(context.state).toBe('suspended');
    expect(context.oscillatorCount).toBe(1);
    expect(sound.isEnabled()).toBe(false);
  });

  it('keeps gameplay working when the audio device cannot be opened', () => {
    vi.stubGlobal('window', { AudioContext: class { constructor() { throw new Error('device unavailable'); } } });
    const sound = new SoundEngine();
    expect(() => sound.playSlash()).not.toThrow();
  });
});
