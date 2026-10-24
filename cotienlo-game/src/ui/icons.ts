import { renderAtlasSprite } from '../data/wikiData';

const paths = {
  settings: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2" fill="currentColor"/><circle cx="16" cy="12" r="2" fill="currentColor"/><circle cx="10" cy="18" r="2" fill="currentColor"/>',
  moon: '<path d="M20 14.1A8.3 8.3 0 0 1 9.9 4a8.4 8.4 0 1 0 10.2 10.1Z"/><path d="m17 3 .6 1.7 1.7.6-1.7.6L17 7.6l-.6-1.7-1.7-.6 1.7-.6Z"/>',
  shield: '<path d="m12 3 8 3v6c0 4.2-4.3 7.5-8 9-3.7-1.5-8-4.8-8-9V6Z"/><path d="m8 12 2.5 2.5L16 9"/>',
  strength: '<path d="m12 2 8 7-8 13L4 9Z"/><path d="m8 10 4-4 4 4-4 7Z"/>',
  leaf: '<path d="M20 4C11 2 3 6 4 13c1 8 14 7 16-9Z"/><path d="M3 21 16 8M8 16v-5m0 5h5"/>',
  sword: '<path d="m14 4 6-1-1 6-9 9-5-5Z"/><path d="m4 12 8 8M3 21l5-5M2 20l2 2"/>',
  dash: '<path d="m13 2-8 12h7l-1 8 8-13h-7Z"/>',
  bag: '<path d="M6 7h12l2 13H4Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2M8 12h8M10 16h4"/>',
  flask: '<path d="M9 3h6M10 3v6L4 19a1.3 1.3 0 0 0 1.1 2h13.8a1.3 1.3 0 0 0 1.1-2L14 9V3M7.5 14h9"/><path d="m10 17 1 1m3-3 1 1"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/><path d="M8 7h8M8 11h6"/>',
  gem: '<path d="m3 8 4-5h10l4 5-9 13Z"/><path d="M3 8h18M7 3l5 18 5-18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/>',
  sound: '<path d="m11 4-5 4H3v8h3l5 4Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  'sound-off': '<path d="m11 4-5 4H3v8h3l5 4Z"/><path d="m16 9 6 6m0-6-6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  'chevron-right': '<path d="m9 5 7 7-7 7"/>',
  mountain: '<path d="m2 20 7-15 5 10 3-6 5 11Z"/><path d="m6.7 10 2.3 2 2.3-2M14.5 14l2.5 2 2-1"/>',
  user: '<circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3M8 21v-4m8 4v-4"/>',
  sparkles: '<path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3Z"/><path d="M4 2v4M2 4h4m14 14v4m-2-2h4"/>',
  'arrow-right': '<path d="M3 12h18m-7-7 7 7-7 7"/>',
  check: '<path d="m5 12 4 4L20 5"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3"/>',
} as const;

export type IconName = keyof typeof paths;

export function icon(name: IconName, className = ''): string {
  return `<svg class="ui-icon ${className}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
}

export function guIcon(id: string, size = 34): string {
  const aliases: Readonly<Record<string, string>> = { smalllight: 'gu_tieu_quang', moonbeam: 'gu_nguyet_mang' };
  const sprite = renderAtlasSprite(aliases[id] ?? id, size, 'gu-sprite-icon');
  if (sprite) return sprite;
  const names: Record<string, IconName> = {
    moonlight: 'moon', bronze: 'shield', boar: 'strength', heal: 'leaf',
    moonblade: 'sword', moonbeam: 'moon', smalllight: 'sparkles', starfirefly: 'sparkles', ironskin: 'shield',
  };
  return icon(names[id] ?? 'sparkles');
}

export function itemIcon(id: string, size = 30): string {
  const sprite = renderAtlasSprite(id, size, 'item-sprite-icon');
  if (sprite) return sprite;
  return icon(id === 'herb' ? 'leaf' : id === 'meat' ? 'strength' : 'gem');
}

export function hydrateIcons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-icon]').forEach((element) => {
    const name = element.dataset?.icon;
    if (name && name in paths) element.innerHTML = icon(name as IconName);
  });
  root.querySelectorAll<HTMLElement>('[data-gu-icon]').forEach((element) => {
    const guId = element.dataset?.guIcon;
    const size = Number(element.dataset?.iconSize) || 28;
    if (guId) element.innerHTML = guIcon(guId, size);
  });
}
