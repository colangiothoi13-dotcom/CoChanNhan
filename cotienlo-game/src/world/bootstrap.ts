import { WorldClient } from './WorldClient';
import { WorldPanel } from './WorldPanel';

let activeClient: WorldClient | null = null;
let activePanel: WorldPanel | null = null;

export function getSharedWorldClient(): WorldClient { return activeClient ??= new WorldClient(); }
export function openWorldJourney(trigger?: HTMLElement): void { activePanel?.open(trigger); }

export async function connectVerifiedWorld(authToken: string, authEndpoint: string): Promise<void> {
  if (!activeClient || !activePanel) throw new Error('Màn Ngũ Vực chưa sẵn sàng.');
  await activeClient.linkVerifiedAccount(authToken, authEndpoint);
  if (document.getElementById('game-container')?.getAttribute('data-game-mode') !== 'overworld')
    activePanel.open(document.getElementById('btn-open-world') ?? undefined);
}

export function disconnectVerifiedWorld(): void {
  activeClient?.disconnectVerifiedAccount();
}

function startWorld(): void {
  const root = document.getElementById('modal-world');
  const trigger = document.getElementById('btn-open-world');
  if (!root || !trigger) return;
  const controller = new AbortController();
  const client = getSharedWorldClient();
  const panel = new WorldPanel(root, client);
  activeClient = client;
  activePanel = panel;
  const isOverworld = document.getElementById('game-container')?.getAttribute('data-game-mode') === 'overworld';
  if (!isOverworld) trigger.addEventListener('click', () => panel.open(trigger), { signal: controller.signal });
  window.addEventListener('cotienlo:destroy', () => {
    controller.abort();
    panel.destroy();
    client.destroy();
    activeClient = null;
    activePanel = null;
  }, { once: true });
  window.addEventListener('pageshow', () => {
    if (root.classList.contains('active')) void client.restore();
  }, { signal: controller.signal });
  window.addEventListener('cotienlo:resume', () => {
    if (root.classList.contains('active')) void client.restore();
  }, { signal: controller.signal });
  if (isOverworld) { panel.open(trigger); void client.restore(); }
  else if (new URLSearchParams(window.location.search).get('world') === '1') panel.open(trigger);
}

if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', startWorld, { once: true });
else startWorld();
