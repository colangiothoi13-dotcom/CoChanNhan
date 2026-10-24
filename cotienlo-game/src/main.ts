import { Camera } from './engine/Camera';
import { GameMap } from './engine/Map';
import { OverworldMap } from './engine/OverworldMap';
import { InputManager } from './engine/InputManager';
import { CombatAimInput } from './engine/CombatAimInput';
import { SoundEngine } from './engine/SoundEngine';
import { ParticleSystem } from './engine/ParticleSystem';
import { Cultivator } from './entities/Cultivator';
import { Monster } from './entities/Monster';
import { Npc } from './entities/Npc';
import { Projectile } from './entities/Projectile';
import { DropItem } from './entities/DropItem';
import { GuSystem } from './systems/GuSystem';
import { InventorySystem } from './systems/InventorySystem';
import { RefinementSystem } from './systems/RefinementSystem';
import { StorageSystem, SAVE_KEY, type LocalOrigin, type SavedLocalLife } from './systems/StorageSystem';
import { QuestSystem } from './systems/QuestSystem';
import { HudView } from './ui/HudView';
import { InventoryModal } from './ui/InventoryModal';
import { RefineModal } from './ui/RefineModal';
import { CultivatorModal } from './ui/CultivatorModal';
import { DialogueModal } from './ui/DialogueModal';
import { WikiModal } from './ui/WikiModal';
import { TutorialModal } from './ui/TutorialModal';
import { RebirthModal } from './ui/RebirthModal';
import { AuthModal } from './ui/AuthModal';
import { AuthClient } from './systems/AuthClient';
import { Remains } from './entities/Remains';
import { SoulChronicle, CHRONICLE_KEY, PastLifeRecord } from './systems/SoulChronicle';
import { createCloudProgress, parseCloudProgress, backupCurrentProgress, type CloudProgress } from './systems/CloudProgress';
import { connectVerifiedWorld, disconnectVerifiedWorld, getSharedWorldClient, openWorldJourney } from './world/bootstrap';
import { FieldClient } from './world/FieldClient';
import { FieldSceneView } from './world/FieldSceneView';
import type { FieldAction } from './world/field-types';
import { ActionSettings, type GameAction } from './systems/ActionSettings';
import { ActionSettingsModal } from './ui/ActionSettingsModal';
import { ActionBarView, SKILL_BUTTON_IDS } from './ui/ActionBarView';
import { OverworldAtlas } from './ui/OverworldAtlas';
import { WorldDeathModal } from './ui/WorldDeathModal';
import { AcademyModal } from './ui/AcademyModal';
import { ResourceModal } from './ui/ResourceModal';
import { GU_DEFINITIONS } from '../shared/cultivation-core.mjs';
import { closeModal } from './ui/Modal';
import { Toast } from './ui/Toast';
import { hydrateIcons, icon } from './ui/icons';
import { observeHudLayout } from './ui/HudLayout';

const PRACTICE_SHORTCUTS: Readonly<Record<string, string>> = {
  KeyJ: 'btn-attack', KeyK: 'btn-gu-moonlight', Space: 'btn-dash', KeyF: 'btn-npc-interact',
  KeyH: 'btn-open-refine', KeyB: 'btn-open-inventory', KeyV: 'btn-open-wiki', KeyC: 'btn-open-cultivator',
};

class CoTienLoGame {
  private readonly overworld: boolean;
  private field?: FieldClient;
  private fieldView?: FieldSceneView;
  private settings?: ActionSettings;
  private settingsModal?: ActionSettingsModal;
  private actionBar?: ActionBarView;
  private atlas?: OverworldAtlas;
  private worldDeath?: WorldDeathModal;
  private academy?: AcademyModal;
  private resourcesModal?: ResourceModal;
  private worldDisposers: (() => void)[] = [];
  private enteredLife = '';
  private lastFieldNotice = -1;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private camera: Camera;
  private map: GameMap;
  private input: InputManager;
  private combatAim: CombatAimInput;
  private sound: SoundEngine;
  private particles: ParticleSystem;

  private cultivator: Cultivator;
  private npc: Npc;
  private monsters: Monster[] = [];
  private projectiles: Projectile[] = [];
  private dropItems: DropItem[] = [];

  private guSystem: GuSystem;
  private inventory: InventorySystem;
  private refinement: RefinementSystem;

  private hud: HudView;
  private cultivatorModal: CultivatorModal;
  private dialogueModal: DialogueModal;
  private lastTime: number = 0;
  private quest: QuestSystem;
  private respawnCountdown: number | null = null;
  private frameId = 0;
  private saveTimer: ReturnType<typeof setInterval>;
  private events = new AbortController();
  private paused = false;
  private nativePaused = false;
  private destroyed = false;
  private saveFailed = false;
  private disposeHudLayout: () => void;
  private sanctuaryHealTimer: number = 0;
  private wasInSanctuary: boolean = false;
  private remainsList: Remains[] = [];
  private rebirthModal: RebirthModal;
  private deathRecord: PastLifeRecord | null = null;
  private localLifeNumber = 1;
  private localOrigin: LocalOrigin = 'clan';
  private pastLifeSurvivedSeconds: number = 0;
  private monstersSlainInLife: number = 0;
  private authClient: AuthClient;
  private authModal: AuthModal;

  constructor() {
    this.overworld = document.getElementById('game-container')?.getAttribute('data-game-mode') === 'overworld';
    hydrateIcons();
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;

    // Resize canvas to match screen DPR
    this.handleResize();
    window.addEventListener('resize', () => this.handleResize(), { signal: this.events.signal });

    // Core Engines
    this.camera = new Camera(window.innerWidth, window.innerHeight);
    this.map = this.overworld ? new OverworldMap() : new GameMap();
    this.camera.worldWidth = this.map.width; this.camera.worldHeight = this.map.height;
    this.input = new InputManager();
    this.sound = new SoundEngine();
    this.particles = new ParticleSystem();

    // Player & Systems
    this.cultivator = new Cultivator();
    this.npc = new Npc(1200, 920);
    this.guSystem = new GuSystem();
    this.inventory = new InventorySystem();
    this.refinement = new RefinementSystem();

    // Load progress from localStorage
    const saved = StorageSystem.loadGame(this.cultivator, this.inventory, this.guSystem);
    this.syncPassiveGu();
    this.quest = new QuestSystem(this.inventory, saved);
    const realmReconciled = this.quest.reconcileRealm(this.cultivator);
    const chronicle = SoulChronicle.load();
    this.localLifeNumber = saved.localLife?.lifeNumber ?? chronicle.totalLives;
    this.localOrigin = saved.localLife?.origin ?? 'clan';
    this.deathRecord = saved.localLife?.death ?? null;
    this.pastLifeSurvivedSeconds = saved.localLife?.timeSurvivedSeconds ?? 0;
    this.monstersSlainInLife = saved.localLife?.monstersSlain ?? 0;
    this.remainsList = saved.localLife?.remains.flatMap(raw => {
      const remains = Remains.restore(raw);
      return remains ? [remains] : [];
    }) ?? [];
    // Older local builds saved HP=0 after already archiving the death, without a life ID.
    if (!saved.localLife && this.cultivator.hp <= 0 && chronicle.pastLives[0]) {
      this.deathRecord = chronicle.pastLives[0];
      this.localLifeNumber = this.deathRecord.lifeNumber;
      this.cultivator.x = this.deathRecord.deathX;
      this.cultivator.y = this.deathRecord.deathY;
      const remains = Remains.restore({
        x: this.deathRecord.deathX, y: this.deathRecord.deathY, lifeNumber: this.localLifeNumber,
        primevalStones: this.deathRecord.primevalStonesLeft, durability: 100,
      });
      this.remainsList = remains ? [remains] : [];
      this.inventory.primevalStones = 0;
      this.inventory.ownedGuIds = [];
      this.inventory.items.clear();
    }

    // UI
    this.hud = new HudView(this.guSystem, this.overworld);
    this.dialogueModal = new DialogueModal(
      this.quest,
      this.cultivator,
      () => {
        this.syncPassiveGu();
        this.updateQuestProgress();
        this.saveProgress();
      },
    );
    new InventoryModal(this.inventory, this.guSystem, () => this.saveProgress(), this.overworld ? () => {
      this.resourcesModal?.open(document.getElementById('btn-open-inventory') ?? undefined, 'gu'); return true;
    } : undefined);
    new RefineModal(
      this.inventory,
      this.guSystem,
      this.refinement,
      this.sound,
      () => {
        this.syncPassiveGu();
        this.quest.recordRefinement();
        this.updateQuestProgress();
        Toast.show('Nhiệm vụ: Đã hoàn thành hợp luyện Cổ!');
      },
      () => this.saveProgress(),
      this.overworld ? resultGu => this.sendFieldAction(resultGu === 'ironskin' ? 'refine-ironskin' : 'refine-moonblade') : undefined,
      this.overworld ? () => { this.resourcesModal?.open(document.getElementById('btn-open-refine') ?? undefined, 'recipes'); return true; } : undefined,
    );
    this.cultivatorModal = new CultivatorModal(this.cultivator, () => this.overworld ? this.field?.snapshot ?? null : null);
    new WikiModal(this.inventory);
    new TutorialModal();
    this.rebirthModal = new RebirthModal();

    this.authClient = new AuthClient();
    this.authModal = new AuthModal(this.authClient, {
      worldOnly: this.overworld,
      onGetProgress: () => this.exportPractice(),
      onProgressLoaded: progress => this.importPractice(progress),
      onConnectWorld: async () => {
        const token = this.authClient.getToken();
        if (!token || !this.authClient.isAuthenticated()) throw new Error('Vui lòng đăng nhập Gmail trước.');
        await connectVerifiedWorld(token, this.authClient.endpoint);
        if (this.overworld) this.authModal.close();
      },
      onDisconnectWorld: () => disconnectVerifiedWorld(),
    });

    window.addEventListener('cotienlo:open-auth', () => {
      this.authModal.open();
    }, { signal: this.events.signal });

    if (this.deathRecord || realmReconciled) this.saveProgress();

    this.spawnInitialMonsters();
    this.combatAim = new CombatAimInput({
      canvas: this.canvas,
      attackButton: document.getElementById('btn-attack'),
      moonlightButton: this.overworld ? null : document.getElementById('btn-gu-moonlight'),
      skillButtons: this.overworld ? SKILL_BUTTON_IDS.map((id, index) => ({ button: document.getElementById(id), action: `slot${index + 1}` as 'slot1' })) : undefined,
      canAct: () => this.canAct(),
      onCast: action => {
        if (!this.canAct()) return;
        if (action === 'attack') this.handleAttack();
        else if (action.startsWith('slot')) this.castSlot(Number(action.slice(4)) - 1);
        else this.handleMoonlightSkill();
      },
    });
    this.bindActionButtons();
    if (this.overworld) this.installWorldMode();
    this.bindAudioToggle();
    this.updateQuestProgress();

    // Auto save periodic timer
    this.saveTimer = setInterval(() => this.saveProgress(), 10000);
    this.bindLifecycle();
    this.hud.update(this.cultivator, this.inventory, this.map, this.quest);
    this.disposeHudLayout = observeHudLayout();

    // Initial greeting
    Toast.show(this.overworld ? 'Chào mừng Cổ Sư đến với Ngũ Vực!' : 'Chào mừng Cổ Sư đến với Thanh Mao Sơn!');

    // Start Game Loop
    this.lastTime = performance.now();
    this.frameId = requestAnimationFrame((t) => this.gameLoop(t));
  }

  private handleResize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.camera) {
      this.camera.resize(window.innerWidth, window.innerHeight);
    }
  }

  private installWorldMode(): void {
    const world = getSharedWorldClient();
    this.deathRecord = null;
    this.cultivator.x = 60000; this.cultivator.y = 60000; this.cultivator.hp = 100;
    this.camera.x = this.cultivator.x - this.camera.viewportWidth / 2;
    this.camera.y = this.cultivator.y - this.camera.viewportHeight / 2;
    this.remainsList = []; this.dropItems = []; this.projectiles = [];
    this.field = new FieldClient({ request: input => world.requestField(input) });
    this.fieldView = new FieldSceneView(this.cultivator, this.inventory, this.map as OverworldMap);
    const academyRoot = document.getElementById('modal-academy');
    if (academyRoot) this.academy = new AcademyModal(academyRoot, {
      snapshot: () => this.field?.snapshot ?? null,
      act: action => world.act(action), error: () => world.state.error,
    });
    const resourceRoot = document.getElementById('modal-resources');
    if (resourceRoot) this.resourcesModal = new ResourceModal(resourceRoot, {
      snapshot: () => this.field?.snapshot ?? null,
      act: action => world.act(action), error: () => world.state.error,
    });
    document.getElementById('btn-open-resources')?.addEventListener('click', () => {
      this.resourcesModal?.open(document.getElementById('btn-open-resources') ?? undefined, 'resources');
    }, { signal: this.events.signal });
    this.settings = new ActionSettings();
    this.actionBar = new ActionBarView(this.settings, this.guSystem);
    const settingsRoot = document.getElementById('modal-action-settings');
    if (settingsRoot) this.settingsModal = new ActionSettingsModal(settingsRoot, this.settings, {
      getOwnedGuIds: () => this.inventory.ownedGuIds,
      getGuDefinition: id => this.guSystem.getGu(id),
    });
    this.worldDisposers.push(this.settings.subscribe(state => {
      this.input.setBindings(state.bindings); this.combatAim.reset();
      this.actionBar?.update(this.cultivator, this.inventory);
    }));
    document.getElementById('btn-open-settings')?.addEventListener('click', () => this.settingsModal?.open(document.getElementById('btn-open-settings') ?? undefined), { signal: this.events.signal });
    const atlasRoot = document.getElementById('modal-overworld-atlas');
    if (atlasRoot) this.atlas = new OverworldAtlas(atlasRoot, {
      getPosition: () => this.field?.snapshot ? { x: this.cultivator.x, y: this.cultivator.y, regionId: this.field.snapshot.regionId, connected: this.field.connected, lifeNumber: this.field.snapshot.lifeNumber } : null,
      onJourney: () => openWorldJourney(),
      onLogin: () => this.authModal.open(),
    });
    document.getElementById('btn-open-world')?.addEventListener('click', () => this.atlas?.open(document.getElementById('btn-open-world') ?? undefined), { signal: this.events.signal });
    const deathRoot = document.getElementById('modal-field-death');
    if (deathRoot) this.worldDeath = new WorldDeathModal(deathRoot, async () => {
      const oldLife = world.state.snapshot?.life.id;
      const originId = world.state.snapshot?.catalog.origins[0]?.id;
      if (!originId) throw new Error('Hãy kết nối lại nhân vật.');
      await world.act({ type: 'rebirth', payload: { originId } });
      if (world.state.snapshot?.life.id === oldLife || world.state.snapshot?.life.dead) throw new Error(world.state.error ?? 'Chưa xác nhận được cuộc đời mới.');
    });
    this.worldDisposers.push(this.field.subscribe(() => {
      const snapshot = this.field?.snapshot;
      if (snapshot) {
        const first = this.fieldView?.snapshot?.lifeId !== snapshot.lifeId;
        this.fieldView?.apply(snapshot);
        for (const [id, definition] of Object.entries(GU_DEFINITIONS)) {
          const gu = this.guSystem.getGu(id);
          if (gu) { gu.mpCost = snapshot.cultivationStats?.energy.unit === 'immortal-unit' ? definition.immortalCostUnits : definition.primevalCostBps / 100; gu.cooldown = definition.cooldownMs / 1000; }
        }
        this.inventory.energyUnitLabel = snapshot.cultivationStats?.energy.unit === 'immortal-unit' ? 'tiên nguyên' : '% khiếu';
        for (const care of snapshot.resources?.catalog.gu ?? []) {
          const gu = this.guSystem.getGu(care.typeId);
          const food = snapshot.resources?.catalog.resources.find(resource => resource.id === care.foodId);
          if (gu && food) { gu.foodType = food.name; gu.foodItemId = food.id; }
        }
        if (document.getElementById('modal-cultivator')?.classList.contains('active')) this.cultivatorModal.render();
        const interact = document.getElementById('btn-npc-interact');
        const facility = this.fieldView?.facility;
        const node = this.fieldView?.resourceNode;
        if (interact) {
          interact.setAttribute('aria-label', node ? 'Khảo sát điểm tài nguyên hoặc bắt Cổ sống' : facility ? `Nói chuyện với ${facility.npc.name} tại ${facility.name}` : 'Đàm đạo với người dẫn đường');
          const label = interact.querySelector<HTMLElement>('span:last-child');
          if (label) label.textContent = `[F] ${node ? 'Khảo sát & thu thập' : facility?.name ?? 'Đàm đạo'}`;
        }
        if (first) {
          this.camera.x = snapshot.x - this.camera.viewportWidth / 2;
          this.camera.y = snapshot.y - this.camera.viewportHeight / 2;
          closeModal(document.getElementById('modal-world'));
          closeModal(document.getElementById('modal-auth'));
          this.worldDeath?.close();
        }
        if (snapshot.dead) { this.input.reset(); this.combatAim.reset(); this.worldDeath?.show(snapshot); }
        if (snapshot.actionResult && snapshot.seq !== this.lastFieldNotice) {
          this.lastFieldNotice = snapshot.seq;
          if (!snapshot.actionResult.ok) {
            const messages: Record<string, string> = {
              COOLDOWN: 'Chiêu đang hồi. Hãy chờ một chút.', GU_REQUIRED: 'Bạn chưa sở hữu Cổ dùng cho chiêu này.',
              INSUFFICIENT_MP: 'Chân nguyên không đủ để dùng chiêu.', INSUFFICIENT_STAMINA: 'Chưa đủ thể lực để lướt.',
              INSUFFICIENT_STONES: 'Chưa đủ nguyên thạch để hợp luyện.', SANCTUARY_REQUIRED: 'Hãy về trạm an toàn để hợp luyện.',
              ALREADY_OWNED: 'Bạn đã sở hữu Cổ kết quả.', REFINEMENT_FAILED: 'Hợp luyện thất bại; máy chủ đã quyết toán chi phí.',
              PROJECTILE_LIMIT: 'Có quá nhiều chiêu đang bay. Hãy chờ một chút.',
              GU_NOT_CONTROLLED: 'Cổ này chưa luyện hóa. Hãy đến học đường hoặc luyện hóa đường.',
              GU_UNCONTROLLED: 'Cổ này chưa luyện hóa. Hãy đến học đường hoặc luyện hóa đường.',
              GU_NOT_TAMED: 'Cổ này chưa luyện hóa. Hãy đến học đường hoặc luyện hóa đường.',
              GU_RANK_UNSUPPORTED: 'Tu vi hiện tại chưa đáp ứng Cổ này.',
              INSUFFICIENT_ESSENCE: 'Chân nguyên đúng phẩm chất chưa đủ để dùng Cổ.',
              GU_BUSY: 'Cổ đang tham gia luyện chế, giao dịch hoặc vận chuyển.',
              GU_STARVING: 'Cổ quá suy yếu vì thiếu thức ăn. Hãy mở bảng Nuôi Cổ.',
              GU_CONDITION: 'Cổ bị thương nặng hoặc nguy kịch vì thiếu ăn. Hãy mở Chăm sóc Cổ.',
              GU_PERMISSION_REQUIRED: 'Bạn chưa được chủ luyện hóa cho phép dùng Cổ này.',
              GU_IN_STORAGE: 'Cổ đang ở trong kho. Hãy lấy ra trước khi dùng chiêu.',
              RECIPE_MENU_REQUIRED: 'Mở Luyện Cổ để chọn cổ phương và đúng các cá thể đầu vào.',
            };
            Toast.show(messages[snapshot.actionResult.code] ?? 'Chưa thực hiện được chiêu. Hãy kiểm tra điều kiện và thử lại.');
          }
          else if (snapshot.actionResult.code.includes('REFIN')) Toast.show('Máy chủ đã ghi nhận kết quả hợp luyện.');
        }
      }
      this.academy?.update(); this.resourcesModal?.update();
      this.updateWorldHUD();
    }));
    this.worldDisposers.push(world.subscribe(state => {
      if (state.snapshot && state.connection === 'online') {
        if (state.snapshot.life.resources) this.field?.acceptResources(state.snapshot.life.resources);
        this.fieldView?.setSelfAccountId(state.snapshot.account.id);
        if (this.enteredLife !== state.snapshot.life.id) {
          this.enteredLife = state.snapshot.life.id;
          void this.field?.start(this.enteredLife);
        }
      } else if (!state.snapshot && this.enteredLife) {
        this.enteredLife = ''; this.field?.stop(); this.fieldView?.reset(); openWorldJourney();
      }
    }));
  }

  private castSlot(index: number): void {
    if (!this.canAct()) return;
    const skill = this.settings?.resolveSlot(index, this.inventory.usableGuIds ?? this.inventory.ownedGuIds);
    if (!skill) return;
    this.sendFieldAction(skill === 'moonblade' ? 'moonlight' : skill);
  }

  private sendFieldAction(action: FieldAction): void {
    if (!this.field?.connected || this.field.snapshot?.dead) return;
    this.field.setInput(this.input.getMoveVector(), this.combatAim.getAngle(this.cultivator, this.camera));
    if (!this.field.cast(action)) { Toast.show('Chưa kết nối nhân vật. Hãy mở bản đồ để thử lại.'); return; }
    if (action === 'attack') this.sound.playSlash();
    else if (action === 'moonlight' || action === 'moonbeam') this.sound.playMoonlightSlash();
  }

  private updateWorld(dt: number): void {
    this.map.update(dt);
    const blocked = !!document.querySelector('.game-modal.active') || this.paused || document.hidden;
    if (blocked) { this.input.reset(); this.combatAim.reset(); }
    this.field?.setInput(blocked ? { x: 0, y: 0 } : this.input.getMoveVector(), this.combatAim.getAngle(this.cultivator, this.camera));
    this.fieldView?.update(dt);
    if (this.field?.snapshot?.dead && !document.querySelector('.game-modal.active')) this.worldDeath?.show(this.field.snapshot);
    this.camera.follow(this.cultivator.x, this.cultivator.y);
    const interact = document.getElementById('btn-npc-interact');
    if (interact) interact.hidden = !this.field?.connected || (!this.fieldView?.resourceNode && !this.fieldView?.npc.isNear(this.cultivator.x, this.cultivator.y, 220));
  }

  private updateWorldHUD(): void {
    const life = getSharedWorldClient().state.snapshot?.life;
    const field = this.field?.snapshot;
    const cultivation = field?.cultivationStats;
    if (cultivation) this.cultivator.displayRealm = `${cultivation.rankLabel} ${cultivation.subrealmLabel ?? ''}`.trim();
    else if (life) this.cultivator.displayRealm = `${life.rank} chuyển`;
    this.hud.update(this.cultivator, this.inventory, this.map);
    this.actionBar?.update(this.cultivator, this.inventory);
    if (cultivation?.energy.unit === 'whole-aperture-bps') {
      const fill = document.getElementById('hud-mp-fill');
      if (fill) fill.style.width = `${Math.max(0, Math.min(100, cultivation.energy.current / 100))}%`;
      const mpText = document.getElementById('hud-mp-text');
      if (mpText) mpText.textContent = `${(cultivation.energy.current / 100).toFixed(1)} / ${cultivation.energy.capacity / 100}%`;
    }
    const name = document.getElementById('hud-name');
    if (name) name.textContent = field?.accountName ?? 'Chưa nhập thế';
    const rank = document.querySelector<HTMLElement>('.avatar-rank');
    const rankNumber = field?.cultivation?.rank ?? life?.rank;
    if (rank && rankNumber) rank.textContent = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'][rankNumber - 1] ?? String(rankNumber);
    const energyLabel = document.querySelector<HTMLElement>('.mp-bar-group .bar-label > span:first-child');
    if (energyLabel && cultivation) energyLabel.textContent = cultivation.energy.label;
    const region = (this.map as OverworldMap).getRegionAt(this.cultivator.x, this.cultivator.y);
    const title = document.getElementById('quest-heading');
    if (title) title.textContent = field ? `Khám phá ${region.name}` : 'Bắt đầu cuộc đời trong Ngũ Vực';
    const text = document.getElementById('quest-text');
    if (text) text.textContent = this.field?.error ?? (field ? `Đời ${field.lifeNumber} · (${Math.round(field.x)}, ${Math.round(field.y)}) · ${field.guIds.length ? 'Luyện hóa Cổ, tu luyện rồi khám phá Ngũ Vực.' : 'Đến học đường: nhận Cổ đầu đời, luyện hóa rồi mới sử dụng.'}` : 'Đăng nhập hoặc tạo nhân vật. Mỗi cuộc đời được sinh ngẫu nhiên trên Ngũ Vực.');
    const location = document.querySelector<HTMLElement>('.location-name');
    if (location) location.textContent = region.name;
    const reward = document.querySelector<HTMLElement>('.quest-reward');
    if (reward) reward.textContent = this.field?.connected ? 'Nhân vật và chiến đấu được lưu trên máy chủ' : 'Đang chờ kết nối nhân vật';
    const actions = document.getElementById('quest-banner-action');
    if (actions && !actions.querySelector('#btn-field-journal')) actions.innerHTML = '<button type="button" class="btn-quest-banner" id="btn-field-journal">Nhật ký & truyền thừa →</button>';
    const pageTitle = `Cổ Tiên Lộ · ${region.name}`;
    if (field && document.title !== pageTitle) document.title = pageTitle;
  }

  private spawnInitialMonsters() {
    this.monsters = [];
    if (this.overworld) return;
    // 4 Bamboo snakes in forest
    this.monsters.push(new Monster(650, 740, 'snake'));
    this.monsters.push(new Monster(750, 750, 'snake'));
    this.monsters.push(new Monster(520, 850, 'snake'));
    this.monsters.push(new Monster(1620, 1600, 'snake'));

    // 2 Frost wolves (Điện Lang)
    this.monsters.push(new Monster(1750, 750, 'wolf'));
    this.monsters.push(new Monster(850, 1750, 'wolf'));

    // Feature 04: Thú Vương (Hào Điện Lang Vương) near Wolf Monument
    this.monsters.push(new Monster(1950, 1870, 'elite_bear'));
  }

  private bindActionButtons() {
    const bind = (id: string, action: () => void) => {
      document.getElementById(id)?.addEventListener('click', () => {
        if (this.canAct()) action();
      }, { signal: this.events.signal });
    };
    // Dash
    bind('btn-dash', () => {
      if (this.overworld) { this.sendFieldAction('dash'); return; }
      if (!this.cultivator.dash(this.sound)) {
        if (this.cultivator.stamina < 30) Toast.show('Thể lực hao kiệt! Hãy nghỉ một chút.');
      }
    });

    if (!this.overworld) {
      bind('btn-gu-bronze', () => this.handleSupportGu('bronze'));
      bind('btn-gu-boar', () => this.handleSupportGu('boar'));
      bind('btn-gu-heal', () => this.handleSupportGu('heal'));
    }

    // NPC Interaction Button (Mobile / Click)
    bind('btn-npc-interact', () => {
      if (this.overworld) {
        const trigger = document.getElementById('btn-npc-interact') ?? undefined;
        if (this.fieldView?.resourceNode) { this.resourcesModal?.open(trigger, 'capture'); return; }
        const facility = this.fieldView?.facility;
        if (facility) this.academy?.open(facility, trigger);
        else openWorldJourney(trigger);
        return;
      }
      if (this.npc.isNear(this.cultivator.x, this.cultivator.y)) {
        this.dialogueModal.open();
      }
    });

    // Documented shortcuts share the same guarded button actions as touch/mouse input.
    window.addEventListener('keydown', (e) => {
      if (this.paused || (!this.overworld && this.deathRecord) || this.cultivator.hp <= 0 || e.repeat || e.ctrlKey || e.altKey || e.metaKey || document.querySelector('.game-modal.active')) return;
      const focused = document.activeElement as HTMLElement | null;
      if (focused?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(focused?.tagName ?? '')) return;
      const code = e.code || (e.key === ' ' ? 'Space' : `Key${e.key?.toUpperCase()}`);
      if (this.overworld && this.settings) {
        const action = this.settings.actionForCode(code);
        if (!action || action.startsWith('move')) return;
        if (['BUTTON', 'A', 'SUMMARY'].includes(focused?.tagName ?? '') && (code === 'Space' || code === 'Enter')) return;
        e.preventDefault();
        if (action.startsWith('slot')) this.castSlot(Number(action.slice(4)) - 1);
        else {
          const buttons: Partial<Record<GameAction, string>> = { attack: 'btn-attack', dash: 'btn-dash', interact: 'btn-npc-interact', inventory: 'btn-open-inventory', refine: 'btn-open-refine', wiki: 'btn-open-wiki', character: 'btn-open-cultivator', settings: 'btn-open-settings' };
          if (buttons[action]) document.getElementById(buttons[action]!)?.click();
        }
        return;
      }
      // HUD clicks keep button focus; combat keys still work after aiming back at the field.
      // Space/Enter remain native activation keys for the focused control.
      if (['BUTTON', 'A', 'SUMMARY'].includes(focused?.tagName ?? '') && code !== 'KeyJ' && code !== 'KeyK') return;
      const action = PRACTICE_SHORTCUTS[code];
      if (!action) return;
      e.preventDefault();
      document.getElementById(action)?.click();
    }, { signal: this.events.signal });

    // Quest Banner delegated clicks
    const questBanner = document.getElementById('quest-banner');
    questBanner?.addEventListener('click', (e) => {
      if (this.overworld) {
        if ((e.target as HTMLElement).closest('#btn-field-journal')) openWorldJourney();
        return;
      }
      if (this.deathRecord || this.cultivator.hp <= 0) return;
      const target = (e.target as HTMLElement).closest<HTMLElement>('button');
      if (!target) return;
      if (target.id === 'btn-claim-banner') {
        const result = this.quest.completeChapter(this.cultivator);
        Toast.show(result.message);
        if (result.success) {
          this.syncPassiveGu();
          this.updateQuestProgress();
          this.saveProgress();
        }
      } else if (target.id === 'btn-next-banner') {
        const nextChapter = this.quest.chapter + 1;
        if (!this.quest.advanceToNextChapter()) return;
        Toast.show(`Tiếp nhận Chương ${nextChapter}: ${this.quest.currentChapter.title}!`);
        this.updateQuestProgress();
        this.saveProgress();
      } else if (target.id === 'btn-talk-elder-hint') {
        this.dialogueModal.open();
      }
    }, { signal: this.events.signal });
  }

  private canAct(): boolean {
    if (this.overworld && (!this.field?.connected || !this.field.snapshot || this.field.snapshot.dead)) return false;
    return !this.paused && !this.destroyed && !document.hidden && !this.deathRecord
      && this.cultivator.hp > 0 && !document.querySelector('.game-modal.active');
  }

  private handleAttack() {
    if (this.overworld) { this.sendFieldAction('attack'); return; }
    if (this.cultivator.cdAttack > 0) return;
    this.cultivator.cdAttack = 0.35;
    this.sound.playSlash();
    const angle = this.combatAim.getAngle(this.cultivator, this.camera);

    // Spawn short range slash projectile
    const slash = new Projectile(
      this.cultivator.x + Math.cos(angle) * 20,
      this.cultivator.y + Math.sin(angle) * 20,
      angle,
      320,
      this.cultivator.attackDamage,
      'slash'
    );
    this.projectiles.push(slash);
  }

  private handleMoonlightSkill() {
    if (this.overworld) { this.sendFieldAction('moonlight'); return; }
    if (this.cultivator.cdMoonlight > 0) return;
    const hasMoonblade = this.inventory.hasGu('moonblade');
    const id = hasMoonblade ? 'moonblade' : 'moonlight';
    const skill = this.guSystem.getGu(id);
    if (!skill || !this.guSystem.canUseGu(id, this.inventory)) {
      Toast.show('Bạn chưa sở hữu Cổ trùng cho kỹ năng này.');
      return;
    }
    if (this.cultivator.mp < skill.mpCost) {
      Toast.show(`Chân nguyên bất túc! Cần ${skill.mpCost} MP.`);
      return;
    }

    this.cultivator.mp -= skill.mpCost;
    this.cultivator.moonlightCooldownDuration = skill.cooldown;
    this.cultivator.cdMoonlight = skill.cooldown;
    this.sound.playMoonlightSlash();

    // Bonus damage if White Boar buff is active or if Tier 2 Moonblade is owned
    const baseDamage = hasMoonblade ? 55 : 32;
    const finalDamage = this.cultivator.boarBuffDuration > 0 ? baseDamage + 12 : baseDamage;
    const angle = this.combatAim.getAngle(this.cultivator, this.camera);

    // Shoot Moon Blade
    const blade = new Projectile(
      this.cultivator.x + Math.cos(angle) * 25,
      this.cultivator.y + Math.sin(angle) * 25,
      angle,
      460,
      finalDamage,
      'moonlight',
      hasMoonblade
    );
    this.projectiles.push(blade);
  }

  private handleSupportGu(id: 'bronze' | 'boar' | 'heal'): void {
    const gu = this.guSystem.getGu(id);
    if (!gu || !this.guSystem.canUseGu(id, this.inventory)) {
      Toast.show('Bạn chưa sở hữu Cổ trùng cho kỹ năng này.');
      return;
    }
    const success = id === 'bronze' ? this.cultivator.castBronzeShield(this.sound, gu)
      : id === 'boar' ? this.cultivator.castBoarBuff(this.sound, gu)
      : this.cultivator.castHeal(this.sound, gu);
    if (success) {
      Toast.show(id === 'bronze' ? 'Thanh Đồng Giáp kích hoạt! Giảm 55% sát thương nhận vào.'
        : id === 'boar' ? 'Bạch Trư chi lực! Tốc độ & sát thương tăng vọt.'
        : 'Thảo Hoàn Cổ tỏa hương: đang liên tục hồi phục sinh lực.');
    } else if (this.cultivator.mp < gu.mpCost) {
      Toast.show(`Chân nguyên bất túc! Cần ${gu.mpCost} MP.`);
    }
  }

  private syncPassiveGu(): void {
    this.cultivator.syncGuDefense(this.inventory.hasGu('ironskin') ? 15 : 0);
  }

  private bindAudioToggle() {
    const btnAudio = document.getElementById('btn-audio-toggle');
    const audioIcon = document.getElementById('audio-icon');
    btnAudio?.addEventListener('click', () => {
      const enabled = this.sound.toggle();
      if (audioIcon) audioIcon.innerHTML = icon(enabled ? 'sound' : 'sound-off');
      btnAudio.setAttribute('aria-pressed', String(enabled));
      btnAudio.setAttribute('aria-label', enabled ? 'Tắt âm thanh' : 'Bật âm thanh');
      Toast.show(enabled ? 'Đã bật âm thanh' : 'Đã tắt âm thanh');
    }, { signal: this.events.signal });
  }

  private updateQuestProgress() {
    if (this.overworld) { this.updateWorldHUD(); return; }
    this.hud.update(this.cultivator, this.inventory, this.map, this.quest);
  }

  private gameLoop(time: number) {
    if (this.paused || this.destroyed) return;
    const dt = Math.min(0.05, (time - this.lastTime) / 1000);
    this.lastTime = time;

    // 1. Update Game Logic
    this.update(dt);

    // 2. Render Frame
    this.render();

    this.frameId = requestAnimationFrame((t) => this.gameLoop(t));
  }

  private update(dt: number) {
    if (this.overworld) { this.updateWorld(dt); return; }
    if (this.deathRecord || this.cultivator.hp <= 0) {
      this.handleDeath();
      this.input.reset();
      this.combatAim.reset();
      return;
    }
    if (document.querySelector('.game-modal.active')) {
      this.input.reset();
      this.combatAim.reset();
      return;
    }
    const moveInput = this.input.getMoveVector();

    // Map & Day/Night
    this.map.update(dt);
    this.pastLifeSurvivedSeconds += dt;
    if (this.map.cataclysmActive) {
      this.camera.shake = 3.0;
    }

    // Update Remains & Excavation (Di Trạch Tiền Kiếp)
    let remainsChanged = false;
    for (let i = this.remainsList.length - 1; i >= 0; i--) {
      const remains = this.remainsList[i];
      const expired = remains.update(dt, this.map.cataclysmActive);
      if (expired) {
        this.remainsList.splice(i, 1);
        remainsChanged = true;
        continue;
      }
      if (remains.isNear(this.cultivator.x, this.cultivator.y) && !remains.isLooted) {
        const stones = remains.excavate(this.cultivator, this.particles, this.sound);
        if (stones > 0) {
          this.inventory.primevalStones += stones;
          Toast.show(`🌟 Đào mộ thành công! Khôi phục ${stones} Nguyên Thạch từ Di Trạch Kiếp ${remains.lifeNumber}!`);
          this.hud.update(this.cultivator, this.inventory, this.map, this.quest);
        }
        this.remainsList.splice(i, 1);
        remainsChanged = true;
      }
    }
    if (remainsChanged) this.saveProgress();

    // Cultivator
    this.cultivator.update(dt, moveInput, this.map, this.particles);

    // Safe Zone Sanctuary Check (Tông Môn Hộ Thần Trận near Elder: 1200, 960, radius 260)
    const inSanctuary = this.map.isInsideSanctuary(this.cultivator.x, this.cultivator.y);

    if (inSanctuary && this.cultivator.hp > 0) {
      // Continuously heal HP & recover MP
      if (this.cultivator.hp < this.cultivator.maxHp) {
        this.cultivator.hp = Math.min(this.cultivator.maxHp, this.cultivator.hp + 20 * dt);
        this.sanctuaryHealTimer += dt;
        if (this.sanctuaryHealTimer >= 1.2) {
          this.sanctuaryHealTimer = 0;
          this.particles.emitHealAura(this.cultivator.x, this.cultivator.y);
          this.particles.addDamageText(this.cultivator.x, this.cultivator.y - 20, '+20 HP 🌿', '#4ade80', 16);
        }
      }
      if (this.cultivator.mp < this.cultivator.maxMp) {
        this.cultivator.mp = Math.min(this.cultivator.maxMp, this.cultivator.mp + 15 * dt);
      }
      if (!this.wasInSanctuary) {
        Toast.show('🛡️ Đã vào Khu Vực An Toàn (Hồi phục Khí Huyết & Chân Nguyên)');
      }
    } else {
      this.sanctuaryHealTimer = 0;
    }
    this.wasInSanctuary = inSanctuary;

    // Feature 05: Phó Bản Thú Huyệt - Thiên Khảm Ngô Công [Tam Chuyển Dị Thú] in Cave
    if (!this.monsters.some((m) => m.type === 'centipede') && this.cultivator.x < 800 && this.cultivator.y > 1700) {
      this.monsters.push(new Monster(550, 1900, 'centipede'));
      Toast.show('⚠️ Phát hiện Dị Thú: Thiên Khảm Ngô Công [Tam Chuyển]!');
    }

    // Elder NPC
    this.npc.update(dt);
    const btnNpc = document.getElementById('btn-npc-interact');
    if (btnNpc) {
      btnNpc.hidden = !this.npc.isNear(this.cultivator.x, this.cultivator.y);
    }

    // Camera follow cultivator
    this.camera.follow(this.cultivator.x, this.cultivator.y);

    // Update Particles
    this.particles.update(dt);

    // Update Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      const expired = proj.update(dt, this.particles);

      // Check collision with obstacles
      if (this.map.checkCollision(proj.x, proj.y, proj.radius)) {
        this.particles.emitHitSparks(proj.x, proj.y);
        this.projectiles.splice(i, 1);
        continue;
      }

      // Check collision with monsters
      let hit = false;
      for (const monster of this.monsters) {
        if (monster.state === 'dead') continue;
        const dist = Math.hypot(proj.x - monster.x, proj.y - monster.y);
        if (dist < proj.radius + monster.radius && proj.registerHit(monster)) {
          const outcome = monster.takeDamage(proj.damage, this.particles, this.sound);
          hit = true;

          if (outcome.died) {
            this.monstersSlainInLife += 1;
            // Drop items
            this.dropItems.push(...outcome.drops);
            Toast.show(`Đã tiêu diệt ${monster.name}!`);

            if (monster.type === 'centipede' && !this.cultivator.hasImmortalGu) {
              this.cultivator.hasImmortalGu = true;
              this.cultivator.immortalGuName = 'Xuân Thu Thiền';
              Toast.show('Đã mở hiệu ứng mô phỏng Xuân Thu Thiền trong luyện tập. Tiên Cổ thật thuộc thế giới Ngũ Vực.');
            }

            if (monster.type === 'snake') {
              const previousKills = this.quest.state.questCount;
              this.quest.recordSnakeKill();
              if (previousKills < this.quest.requiredKills && this.quest.state.questCount === this.quest.requiredKills) {
                Toast.show('Đã hoàn thành tiêu diệt 3 Thanh Trúc Xà!');
              }
            } else if (monster.type === 'wolf') {
              this.quest.recordWolfKill();
            } else if (monster.type === 'elite_bear') {
              this.quest.recordBearKill();
              Toast.show('🌟 Trảm sát Thú Vương! Chiến tích vang dội!');
            } else if (monster.type === 'centipede') {
              this.quest.recordBearKill();
              Toast.show('🌟 Trảm sát Thiên Khảm Ngô Công [Tam Chuyển]!');
            }
            this.updateQuestProgress();
            this.saveProgress();
          }
          if (!proj.piercing) break;
        }
      }

      if ((hit && !proj.piercing) || expired) {
        this.projectiles.splice(i, 1);
      }
    }

    // Update Monsters
    for (const monster of this.monsters) {
      monster.update(dt, this.cultivator, this.particles, this.sound);
    }
    if (this.cultivator.hp <= 0) {
      this.handleDeath();
      return;
    }

    // Respawn dead monsters after time
    if (this.monsters.every((m) => m.state === 'dead')) {
      this.respawnCountdown = (this.respawnCountdown ?? 5) - dt;
      if (this.respawnCountdown <= 0) {
        this.spawnInitialMonsters();
        this.respawnCountdown = null;
        Toast.show('Dị thú trong rừng lại sinh sôi nảy nở...');
      }
    } else {
      this.respawnCountdown = null;
    }

    // Update Drop Items & Collection
    let collectedLoot = false;
    for (let i = this.dropItems.length - 1; i >= 0; i--) {
      const drop = this.dropItems[i];
      const collected = drop.update(dt, this.cultivator, this.sound);
      if (collected) {
        collectedLoot = true;
        if (drop.type === 'stone') {
          this.inventory.addStones(drop.value);
          this.particles.addDamageText(this.cultivator.x, this.cultivator.y, `+${drop.value} Nguyên thạch`, '#ffd700', 14);
        } else if (drop.type === 'herb') {
          this.inventory.addItem({
            id: 'herb',
            name: 'Thảo Dược',
            icon: '🌿',
            count: 1,
            description: 'Dược thảo tươi.',
          });
          this.quest.recordHerbCollect();
          this.particles.addDamageText(this.cultivator.x, this.cultivator.y, '+1 Thảo dược', '#52b788', 14);
          this.updateQuestProgress();
        } else {
          this.inventory.addStones(5);
          Toast.show('Luyện hóa được Cổ trùng tàn dư: +5 Nguyên Thạch!');
        }
        this.dropItems.splice(i, 1);
      }
    }
    if (collectedLoot) this.saveProgress();

    // Update HUD
    this.hud.update(this.cultivator, this.inventory, this.map, this.quest);
  }

  private handleDeath(): void {
    this.combatAim.reset();
    this.cultivator.hp = 0;
    if (!this.deathRecord) {
      const remains = new Remains(this.cultivator.x, this.cultivator.y, this.localLifeNumber, this.inventory.primevalStones);
      this.remainsList.push(remains);
      this.deathRecord = {
        lifeNumber: this.localLifeNumber, causeOfDeath: 'Trọng thương tạ thế giữa thảo nguyên / rừng độc',
        deathX: this.cultivator.x, deathY: this.cultivator.y, realmReached: this.cultivator.realm,
        monstersSlain: this.monstersSlainInLife, timeSurvivedSeconds: this.pastLifeSurvivedSeconds,
        primevalStonesLeft: remains.primevalStones, timestamp: Date.now(),
      };
      this.inventory.primevalStones = 0;
      this.inventory.ownedGuIds = [];
      this.inventory.items.clear();
      this.projectiles = [];
      this.dropItems = [];
      this.cultivator.hp = 0;
      this.saveProgress();
      this.sound.playMonsterHit();
    }
    SoulChronicle.recordDeath(this.deathRecord);
    if (!document.querySelector('.game-modal.active')) {
      this.rebirthModal.show(this.deathRecord, this.deathRecord.primevalStonesLeft, origin => this.startNewLife(origin));
    }
    this.hud.update(this.cultivator, this.inventory, this.map, this.quest);
  }

  private startNewLife(origin: string): void {
    if (!this.deathRecord) return;
    this.combatAim.reset();
    this.localLifeNumber = this.deathRecord.lifeNumber + 1;
    this.localOrigin = origin === 'hunter' || origin === 'scholar' ? origin : 'clan';
    // Existing panels keep these object references, so replace state in place.
    Object.assign(this.cultivator, new Cultivator());
    Object.assign(this.inventory, new InventorySystem());
    Object.assign(this.guSystem, new GuSystem());
    Object.assign(this.quest, new QuestSystem(this.inventory));
    StorageSystem.applyOrigin(this.cultivator, this.localOrigin);
    this.cultivator.mp = this.cultivator.maxMp;
    if (this.localOrigin === 'hunter') { this.cultivator.x = 650; this.cultivator.y = 700; }
    else if (this.localOrigin === 'scholar') this.cultivator.y = 960;
    this.inventory.primevalStones = 15;
    this.deathRecord = null;
    this.pastLifeSurvivedSeconds = 0;
    this.monstersSlainInLife = 0;
    this.projectiles = [];
    this.dropItems = [];
    this.respawnCountdown = null;
    this.sanctuaryHealTimer = 0;
    this.wasInSanctuary = false;
    this.spawnInitialMonsters();
    this.camera.follow(this.cultivator.x, this.cultivator.y);
    this.hud.update(this.cultivator, this.inventory, this.map, this.quest);
    this.saveProgress();
    Toast.show(`Kiếp mới: ${this.cultivator.originTitle}!`);
  }

  private localLifeSnapshot(): SavedLocalLife {
    return {
      lifeNumber: this.localLifeNumber, origin: this.localOrigin, death: this.deathRecord,
      timeSurvivedSeconds: this.pastLifeSurvivedSeconds, monstersSlain: this.monstersSlainInLife,
      remains: this.remainsList.filter(remains => !remains.isLooted && remains.durability > 0).map(remains => remains.snapshot()),
    };
  }

  private exportPractice(): CloudProgress {
    return createCloudProgress(StorageSystem.captureGame(
      this.cultivator, this.inventory, this.quest.state, this.guSystem, this.localLifeSnapshot(),
    ), SoulChronicle.exportSnapshot());
  }

  private importPractice(value: CloudProgress): void {
    const progress = parseCloudProgress(value);
    const user = this.authClient.getUser();
    if (!user || !this.authClient.isAuthenticated()) throw new Error('Vui lòng đăng nhập Gmail trước.');
    const previous = this.exportPractice();
    backupCurrentProgress(localStorage, { endpoint: this.authClient.endpoint, accountId: user.id }, previous);

    // Validate and reconstruct off-screen before changing any live object used by a panel.
    const player = new Cultivator();
    const inventory = new InventorySystem();
    const gu = new GuSystem();
    const saved = StorageSystem.restoreGame(progress.localSave, player, inventory, gu);
    const quest = new QuestSystem(inventory, saved);
    quest.reconcileRealm(player);
    if (inventory.primevalStones !== progress.localSave.stones ||
      Object.entries(quest.state).some(([key, actual]) => actual !== progress.localSave[key as keyof typeof progress.localSave])) {
      throw new Error('Bản lưu nhiệm vụ không nhất quán. Tiến trình hiện tại được giữ nguyên.');
    }
    const rawSave = localStorage.getItem(SAVE_KEY);
    const rawChronicle = localStorage.getItem(CHRONICLE_KEY);
    try {
      if (!StorageSystem.saveGame(player, inventory, quest.state, gu, saved.localLife)) throw new Error('Không ghi được bản luyện tập trên thiết bị.');
      SoulChronicle.replaceSnapshot(progress.soulChronicle);
    } catch (error) {
      // The verified backup remains available even if the browser also rejects rollback writes.
      try {
        if (rawSave === null) localStorage.removeItem(SAVE_KEY); else localStorage.setItem(SAVE_KEY, rawSave);
        if (rawChronicle === null) localStorage.removeItem(CHRONICLE_KEY); else localStorage.setItem(CHRONICLE_KEY, rawChronicle);
      } catch { /* Mandatory recovery snapshot was retained before the attempted import. */ }
      throw error;
    }
    Object.assign(this.cultivator, player);
    Object.assign(this.inventory, inventory);
    Object.assign(this.guSystem, gu);
    Object.assign(this.quest, new QuestSystem(this.inventory, saved));
    const life = progress.localSave.localLife;
    this.localLifeNumber = life.lifeNumber;
    this.localOrigin = life.origin;
    this.deathRecord = life.death;
    this.pastLifeSurvivedSeconds = life.timeSurvivedSeconds;
    this.monstersSlainInLife = life.monstersSlain;
    this.remainsList = life.remains.flatMap(raw => { const remains = Remains.restore(raw); return remains ? [remains] : []; });
    this.projectiles = [];
    this.dropItems = [];
    this.respawnCountdown = null;
    this.sanctuaryHealTimer = 0;
    this.wasInSanctuary = false;
    this.rebirthModal.close();
    this.input.reset();
    this.combatAim.reset();
    this.syncPassiveGu();
    this.spawnInitialMonsters();
    this.camera.follow(this.cultivator.x, this.cultivator.y);
    this.hud.update(this.cultivator, this.inventory, this.map, this.quest);
  }

  private saveProgress(): void {
    if (this.overworld) return; // The field service checkpoints this avatar; preserve historical device saves.
    if (this.deathRecord) this.cultivator.hp = 0;
    const saved = StorageSystem.saveGame(this.cultivator, this.inventory, this.quest.state, this.guSystem, this.localLifeSnapshot());
    if (!saved && !this.saveFailed) {
      Toast.show('Không thể lưu tiến trình trên thiết bị. Hãy kiểm tra dung lượng và quyền lưu trữ.', 5000);
    }
    this.saveFailed = !saved;
  }

  private bindLifecycle(): void {
    const options = { signal: this.events.signal };
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
      else this.resume();
    }, options);
    window.addEventListener('pagehide', () => this.pause(), options);
    window.addEventListener('pageshow', () => this.resume(), options);
    window.addEventListener('cotienlo:pause', () => { this.nativePaused = true; this.pause(); }, options);
    window.addEventListener('cotienlo:resume', () => { this.nativePaused = false; this.resume(); }, options);
    window.addEventListener('cotienlo:destroy', () => this.destroy(), options);
  }

  private pause(): void {
    this.paused = true;
    cancelAnimationFrame(this.frameId);
    this.input.reset();
    this.combatAim.reset();
    this.field?.setInput({ x: 0, y: 0 }, 0);
    this.saveProgress();
    this.sound.suspend();
  }

  private resume(): void {
    if (!this.paused || this.destroyed || document.hidden || this.nativePaused) return;
    this.paused = false;
    this.lastTime = performance.now();
    this.sound.resume();
    this.frameId = requestAnimationFrame((t) => this.gameLoop(t));
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.pause();
    this.destroyed = true;
    clearInterval(this.saveTimer);
    this.events.abort();
    this.disposeHudLayout();
    this.rebirthModal.destroy();
    this.authModal.destroy();
    this.authClient.destroy();
    disconnectVerifiedWorld();
    this.input.destroy();
    this.combatAim.destroy();
    this.field?.destroy(); this.settingsModal?.destroy(); this.settings?.destroy(); this.atlas?.destroy(); this.worldDeath?.destroy(); this.academy?.destroy(); this.resourcesModal?.destroy();
    this.worldDisposers.forEach(dispose => dispose());
    this.sound.destroy();
  }

  private render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // 1. Render Map terrain and obstacles
    this.map.render(this.ctx, this.camera);
    if (this.overworld) {
      this.fieldView?.render(this.ctx, this.camera);
      if (this.field?.snapshot) { this.cultivator.render(this.ctx, this.camera); this.renderCombatAim(); }
      this.map.renderLighting(this.ctx, window.innerWidth, window.innerHeight);
      return;
    }

    // 1b. Render Remains (Mộ Phần Tiền Kiếp)
    for (const remains of this.remainsList) {
      remains.render(this.ctx, this.camera);
    }

    // 2. Render Drop Items
    for (const drop of this.dropItems) {
      drop.render(this.ctx, this.camera);
    }

    // 3. Render Monsters
    for (const monster of this.monsters) {
      monster.render(this.ctx, this.camera);
    }

    // 3.5 Render Elder NPC
    this.npc.render(this.ctx, this.camera, this.npc.isNear(this.cultivator.x, this.cultivator.y));

    // 4. Render Cultivator (Player)
    this.cultivator.render(this.ctx, this.camera);
    this.renderCombatAim();

    // 5. Render Projectiles
    for (const proj of this.projectiles) {
      proj.render(this.ctx, this.camera);
    }

    // 6. Render Particles & Floating Damage Numbers
    this.particles.render(this.ctx, this.camera);

    // 7. Day / Night ambient lighting overlay
    this.map.renderLighting(this.ctx, window.innerWidth, window.innerHeight);
  }

  private renderCombatAim(): void {
    if (!this.canAct() || !this.combatAim.hasAim()) return;
    const ctx = this.ctx;
    const player = this.camera.worldToScreen(this.cultivator.x, this.cultivator.y);
    const angle = this.combatAim.getAngle(this.cultivator, this.camera);
    const endX = player.x + Math.cos(angle) * 82;
    const endY = player.y + Math.sin(angle) * 82;
    ctx.save();
    ctx.strokeStyle = '#f6d789'; ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(player.x + Math.cos(angle) * 28, player.y + Math.sin(angle) * 28);
    ctx.lineTo(endX, endY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(endX, endY, 6, 0, Math.PI * 2); ctx.stroke();
    const drag = this.combatAim.getDragPreview();
    if (drag) {
      const rect = this.canvas.getBoundingClientRect();
      const dx = drag.x - drag.startX, dy = drag.y - drag.startY;
      const distance = Math.hypot(dx, dy);
      const scale = distance > 60 ? 60 / distance : 1;
      const x = drag.startX - rect.left, y = drag.startY - rect.top;
      ctx.strokeStyle = '#70cfab';
      ctx.beginPath(); ctx.arc(x, y, 42, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx * scale, y + dy * scale); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + dx * scale, y + dy * scale, 8, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
}

// Bootstrap when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  new CoTienLoGame();
}, { once: true });
