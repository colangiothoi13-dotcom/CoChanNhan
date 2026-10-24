# Game nhập vai 2D Vertical Slice Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Tạo một bản chơi thử online hoàn chỉnh trong khoảng bốn tuần theo đội ngũ trong đặc tả, cho phép hai người cùng chơi, làm nhiệm vụ, chiến đấu, nâng cấp và khôi phục tiến trình.

**Architecture:** React quản lý UI, Phaser quản lý thế giới 2D, GameBridge nối hai phía. Colyseus chạy mô phỏng có thẩm quyền; PostgreSQL lưu danh tính và giao dịch bền vững. Client chỉ gửi ý định.

**Tech Stack:** TypeScript, Vite, React, Zustand, Phaser, Colyseus, Node.js, PostgreSQL, Vitest và Playwright. Phiên bản chính xác được chốt ở Task 1 bằng thử nghiệm tích hợp.

**Spec:** ../specs/2026-10-23-game-rpg-2d-design.md, đặc biệt các mục 4, 6, 7 và 10. Kế hoạch này triển khai lát cắt bốn tuần đầu; các phần mở rộng tuần 5 đến 16 được phân thành các gói ở cuối tài liệu.

Đây là danh sách công việc sẽ thực hiện sau khi chủ sản phẩm chốt phạm vi. Các câu lệnh dưới đây là lệnh kiểm chứng dự kiến trong repository sẽ tạo, không phải kết quả kiểm thử đã chạy.

## Global Constraints

- Sản phẩm đầu tiên là web/PWA hoạt động tốt trên điện thoại và máy tính.
- Nội dung slice gồm 1 bản đồ, 3 linh thú gồm 2 chủ động và 1 bị động, 1 quái thường, 1 tinh anh, 6 định nghĩa vật phẩm, chuỗi nhiệm vụ 3 bước, 1 lần lên cấp và 1 lần nâng cấp.
- Thông số thử ban đầu là simulation 20 Hz, state patch 10 Hz, 20 người và tối đa 40 quái đang hoạt động trong một room kiểm thử.
- Thời gian giữ chỗ kết nối lại đề xuất 30 giây.
- Một nhân vật chỉ được có một chủ thể đang có quyền ghi.
- Retry cùng operationId và cùng nội dung phải trả lại kết quả đã ghi. Dùng lại operationId với nội dung khác phải bị từ chối.
- Không truyền tồn kho do client gửi sang room mới.
- Chỉ sau commit mới trả kết quả thành công và cập nhật bản chiếu trong room.
- Slice không bao gồm tổ đội, nhiều khu vực, chợ, PvP, thanh toán hoặc bản mobile trên cửa hàng.

## Review Focus

1. Gửi lại lệnh hoặc gửi đồng thời sau mất phản hồi không được nhân đôi thưởng hay trừ tài nguyên hai lần. Chủ trì Task 6 và Task 7.
2. Hai tab cùng mở, session cũ hoặc request tới sai nhân vật không được cùng có quyền ghi. Chủ trì Task 3 và Task 8.
3. Ngắt mạng, reload hoặc crash quanh thời điểm commit phải phục hồi trạng thái đúng. Chủ trì Task 6 và Task 8.
4. Chat, modal, thao tác cảm ứng và khởi tạo lại React không được làm rò listener hoặc điều khiển xuyên giao diện. Chủ trì Task 1 và Task 7.
5. Content hoặc protocol lệch phiên bản phải bị phát hiện trước khi làm hỏng state; client khác không thấy dữ liệu riêng. Chủ trì Task 2, Task 4 và Task 9.

## Bản đồ trách nhiệm và hợp đồng chung

Đường dẫn dưới đây là đường dẫn tương đối trong repository mới. Không có mã nguồn có sẵn cần chỉnh sửa. Các file test được đặt cạnh module hoặc trong tests/integration theo phạm vi.

| Nhóm | File trọng tâm | Giao tiếp |
| --- | --- | --- |
| Client | apps/client/src/main.tsx và game/WorldScene.ts | Khởi tạo một game và một UI root |
| Bridge | apps/client/src/bridge/GameBridge.ts | Gửi ClientCommand và nhận HudSnapshot |
| Protocol | packages/protocol/src/commands.ts và errors.ts | Kiểu message, validation runtime, mã lỗi |
| Nội dung | packages/content/src/schema.ts và tools/content/validate.ts | ContentBundle có contentVersion |
| Chuyển động | packages/simulation/src/movement.ts | Hàm thuần cho mô phỏng và prediction |
| Server | apps/server/src/rooms/WorldRoom.ts | Danh tính đã xác thực, room state và hành động |
| Kinh tế | apps/server/src/modules/economy/EconomyService.ts | Giao dịch có idempotency, không nhận số thưởng từ client |
| Lưu trữ | apps/server/src/db/migrations và repositories | Khóa ownership, tài sản, kết quả giao dịch |

Hợp đồng nội bộ được chốt trước khi phân công song song:

~~~ts
type Vec2 = { x: number; y: number };
type AuthContext = { accountId: string; characterId: string; sessionEpoch: number };
type MoveInput = { seq: number; direction: Vec2 };
type CastIntent = { seq: number; skillId: string; targetId: string };
type ClaimIntent = { operationId: string; questInstanceId: string };
type UpgradeIntent = {
  operationId: string; itemInstanceId: string; expectedItemVersion: number
};
type NpcIntent = { operationId: string; npcId: string; choiceId: string };
type SpiritSlots = { active1: string; active2: string; passive: string };
type LoadoutIntent = {
  operationId: string; expectedLoadoutVersion: number; slots: SpiritSlots
};
type ClientCommand =
  | { type: 'move'; payload: MoveInput }
  | { type: 'cast'; payload: CastIntent }
  | { type: 'claim'; payload: ClaimIntent }
  | { type: 'upgrade'; payload: UpgradeIntent }
  | { type: 'interact'; payload: NpcIntent }
  | { type: 'setLoadout'; payload: LoadoutIntent };
type HudSnapshot = {
  hp: number; energy: number; level: number; currency: number;
  questStep: number; connection: 'online' | 'reconnecting' | 'offline'
};
type PrivateCharacterSnapshot = {
  characterId: string; contentVersion: string; inventoryVersion: number;
  level: number; xpIntoLevel: number; currency: number;
  inventory: { instanceId: string; itemDefId: string; count: number; version: number }[];
  loadoutVersion: number; slots: SpiritSlots;
  quests: { questInstanceId: string; step: number; completed: boolean }[]
};
type ActionError =
  | 'UNAUTHORIZED' | 'STALE_SESSION' | 'INVALID_INPUT'
  | 'NOT_READY' | 'OUT_OF_RANGE' | 'INSUFFICIENT_RESOURCE'
  | 'ALREADY_CLAIMED' | 'IDEMPOTENCY_CONFLICT' | 'VERSION_MISMATCH';
~~~

Runtime validation phải loại giá trị NaN, Infinity, ID quá dài, payload thừa không hợp lệ và kiểu dữ liệu sai. Định danh người thực hiện lấy từ AuthContext do server cấp; client không chọn accountId hoặc characterId qua message.

## Task 1 Nền tảng và vòng đời client

**Files:** tạo pnpm-workspace.yaml, package.json; apps/client/src/main.tsx; apps/client/src/bridge/GameBridge.ts; apps/server/src/main.ts; packages/protocol/src/commands.ts; tests/e2e/client-lifecycle.spec.ts.

**Interfaces:** GameBridge.send(command: ClientCommand): void; GameBridge.subscribe(listener: (snapshot: HudSnapshot) => void): () => void; bootstrapGame(container: HTMLElement): { destroy(): void }. Tiêu thụ các kiểu hợp đồng chung; cung cấp điểm khởi tạo và cơ chế dọn tài nguyên cho các task sau.

GameBridge.subscribeCharacter(listener: (snapshot: PrivateCharacterSnapshot) => void): () => void cung cấp dữ liệu riêng cho túi đồ và loadout. Server chỉ gửi snapshot này cho đúng chủ nhân vật khi join, nối lại và sau thay đổi bền vững; UI dùng version để bỏ bản chiếu cũ.

- [ ] Tạo workspace và các package cần cho build, lint, typecheck, test. Khóa phiên bản sau khi kiểm tra React, Phaser, Colyseus và trình duyệt mục tiêu cùng hoạt động.
- [ ] Viết kiểm thử vòng đời: mount một canvas, mở và đóng scene hai lần, unmount sạch; một command chỉ được nhận một lần sau khi remount.
- [ ] Chạy pnpm exec playwright test tests/e2e/client-lifecycle.spec.ts; kiểm tra thất bại ban đầu đúng do thiếu hành vi cần triển khai.
- [ ] Triển khai bootstrapGame và GameBridge; listener phải được gỡ khi scene hoặc component hủy. UI chặn input xuống canvas khi mở modal.
- [ ] Chạy lại test, build và typecheck; thử canvas/cảm ứng trên một Android và một iPhone có sẵn trong đội; ghi thiết bị, trình duyệt và kết quả. Commit một thay đổi có thể review độc lập.

## Task 2 Nội dung có phiên bản và map dùng chung

**Files:** tạo packages/content/src/schema.ts; packages/content/src/load.ts; content/source/slice/map.json; content/source/slice/catalog.json; tools/content/validate.ts; packages/content/src/schema.test.ts.

**Interfaces:** validateContent(raw: unknown): ContentBundle; loadContent(version: string): Promise<ContentBundle>. ContentBundle gồm contentVersion, map với width/height/tileSize/blockedCells/spawns, itemDefs, skillDefs, questDefs, texts và visualIndex. blockedCells là mảng chỉ số ô một chiều.

- [ ] Viết test cho ID trùng, tham chiếu item không tồn tại, spawn trong vật cản, thiếu khóa tiếng Việt và contentVersion không khớp.
- [ ] Chạy pnpm exec vitest run packages/content/src/schema.test.ts và xác nhận mỗi fixture lỗi bị phát hiện theo kỳ vọng.
- [ ] Triển khai schema và bộ xuất public/server. Tạo đúng bộ nội dung slice; server dùng collision và spawn từ cùng nguồn xuất của client.
- [ ] Chạy pnpm content:validate; toàn bộ fixture hợp lệ phải qua, fixture sai phải báo lỗi kèm đường dẫn dữ liệu. Xem map trực tiếp để kiểm tra vùng an toàn và đường đi.
- [ ] Commit schema, fixture và nội dung; giao ContentBundle ổn định cho Task 4, 5 và 7.

## Task 3 Danh tính guest và một quyền ghi cho nhân vật

**Files:** tạo apps/server/src/modules/auth/GuestService.ts; modules/character/CharacterService.ts; modules/character/OwnershipService.ts; db/migrations/001_identity.sql; tests/integration/identity.test.ts.

**Interfaces:** createGuest(): Promise<{ accessToken: string; accountId: string }>; authorizeCharacter(token: string): Promise<AuthContext>; acquireCharacter(characterId: string, sessionId: string): Promise<AuthContext>; releaseCharacter(ctx: AuthContext): Promise<void>. AuthContext chỉ được tạo sau kiểm tra server.

- [ ] Viết test: token thiếu/hết hạn bị từ chối; guest nạp lại đúng nhân vật; token A không truy cập B; hai yêu cầu acquire đồng thời chỉ một yêu cầu thắng.
- [ ] Chạy pnpm exec vitest run tests/integration/identity.test.ts với PostgreSQL test và xác nhận hành vi chưa triển khai thất bại.
- [ ] Triển khai guest có ID bền vững, kiểm tra room auth, ownership nguyên tử và epoch. Tạo cơ chế thu hồi lease/session để nhân vật không bị khóa vĩnh viễn khi server chết.
- [ ] Chạy lại bộ test, thêm tình huống owner cũ release sau khi owner mới đã nhận quyền: thao tác cũ không được xóa ownership mới.
- [ ] Commit; tài liệu hóa cách liên kết guest vào tài khoản xác thực trong gói tiến triển sau slice, giữ nguyên characterId và kiểm tra xung đột tài khoản.

## Task 4 Di chuyển có thẩm quyền và đồng bộ hai client

**Files:** tạo packages/simulation/src/movement.ts; packages/simulation/src/movement.test.ts; apps/server/src/rooms/WorldRoom.ts; apps/client/src/network/WorldConnection.ts; apps/client/src/game/WorldScene.ts; tests/integration/world-movement.test.ts.

**Interfaces:** stepMovement(position: Vec2, input: MoveInput, dtMs: number, speed: number, map: CollisionMap): Vec2; connectWorld(token: string, protocolVersion: string, contentVersion: string): Promise<WorldConnection>. CollisionMap được chuyển từ ContentBundle; dtMs dùng thời gian server. WorldConnection cung cấp send(command), subscribeState(listener) và close().

- [ ] Viết test cho hướng chéo không tăng tốc, đi xuyên tường bị chặn, seq cũ không áp dụng lại, tọa độ hoặc thời gian tự khai không thay đổi quyền tính chuyển động.
- [ ] Chạy pnpm exec vitest run packages/simulation/src/movement.test.ts tests/integration/world-movement.test.ts và kiểm tra thất bại dự kiến.
- [ ] Triển khai tick 20 Hz và patch cấu hình 10 Hz; giới hạn tốc độ gửi input. Đưa vị trí vào Phaser, nội suy nhân vật khác và không đưa cả world state vào Zustand.
- [ ] Kiểm thử hai client thực, room đầy phải có kết quả rõ ràng; client sai protocol/content version bị từ chối trước khi chơi. Xác nhận state chung không chứa inventory hoặc credential.
- [ ] Chạy lại test và đo cả patch 10/20 Hz ở RTT 50/150/300 ms. Ghi quyết định vào docs/adr/network-baseline.md, khóa cấu hình sau review rồi commit.

## Task 5 Chiến đấu và AI tối thiểu

**Files:** tạo apps/server/src/modules/combat/CombatService.ts; modules/combat/MonsterAI.ts; modules/combat/combat.test.ts; apps/client/src/game/CombatView.ts.

**Interfaces:** tryCast(ctx: AuthContext, intent: CastIntent, nowMs: number): CastResult; stepMonsterAI(world: CombatWorld, dtMs: number): void. CastResult là kết quả chấp nhận hoặc ActionError. Sự kiện chết nội bộ có eventId, defeatedEntityId và danh sách characterId đủ điều kiện; client không phát sinh sự kiện thưởng.

eventId do server tạo một lần cho mỗi lần chết của một entity instance; hai người đủ điều kiện dùng cùng eventId nhưng có khóa thưởng riêng theo characterId. Task 6 lưu bằng chứng cấp thưởng cùng kết quả transaction. Sự kiện chưa commit và chưa được xác nhận thưởng có thể bị mất khi process chết; không được mất hoặc tạo lại phần thưởng đã xác nhận.

- [ ] Viết fixture kỹ năng có tầm 64 px, cooldown 1000 ms, tốn 2 năng lượng, gây 10 sát thương. Assert ngoài tầm bị từ chối, chưa hết cooldown không tiêu thêm năng lượng, mục tiêu đã chết không rơi thưởng lại.
- [ ] Chạy pnpm exec vitest run apps/server/src/modules/combat/combat.test.ts, xác nhận lỗi ban đầu liên quan đúng logic còn thiếu.
- [ ] Triển khai tìm mục tiêu, một AI đi tuần/đuổi/đánh/trở về, một tinh anh có tín hiệu báo đòn; server tính HP và sự kiện chết. Đây là fixture kiểm thử, không khóa vĩnh viễn balance thương mại.
- [ ] Chạy test và thử hai người cùng đánh một quái; sự kiện chết chỉ tạo một lần. Client phát hiệu ứng từ sự kiện có ID, tránh hiển thị lặp khi nhận lại snapshot.
- [ ] Commit module combat và hợp đồng sự kiện để Task 6 cấp thưởng.

## Task 6 Tồn kho và giao dịch thưởng có thể retry

**Files:** tạo apps/server/src/modules/economy/EconomyService.ts; db/migrations/002_inventory_operations.sql; db/EconomyRepository.ts; tests/integration/economy.test.ts.

**Interfaces:** grantDefeatReward(ctx: AuthContext, eventId: string): Promise<EconomyReceipt>; upgradeItem(ctx: AuthContext, intent: UpgradeIntent): Promise<EconomyReceipt>. EconomyReceipt gồm operationId, inventoryVersion, currency và changes. Hàm thưởng chỉ nhận eventId đã được server ghi nhận; tra số thưởng từ catalog.

EconomyRepository.withCharacterOperation<T>(ctx: AuthContext, operationId: string, requestHash: string, work: (tx: CharacterTx) => Promise<T>): Promise<T> là transaction primitive dùng chung. Nó khóa hàng ownership trước khi kiểm tra epoch, replay receipt đã commit hoặc từ chối hash xung đột, chạy work và lưu receipt trong cùng transaction. OwnershipService.acquireCharacter dùng cùng hàng khóa để takeover không chen giữa kiểm tra và ghi tài sản.

CharacterTx cung cấp claimBusinessKey(key: string): Promise<boolean>; applyAssetDelta(delta: AssetDelta): Promise<void>; readProgress(): Promise<{ level: number; xpIntoLevel: number }>; writeProgress(next: { level: number; xpIntoLevel: number }): Promise<void>. AssetDelta gồm currencyDelta, các item delta có itemDefId/countDelta và thay đổi item instance có expectedVersion. Mọi giá trị delta được tính từ nội dung và luật server. claimBusinessKey là ràng buộc duy nhất trong DB; false không được cấp lại tài sản. Task 7 thực hiện cập nhật nhiệm vụ trong chính transaction này qua repository của nhiệm vụ nhận cùng transaction handle.

Khóa thưởng quái là defeat:eventId:characterId, dùng làm operationId nội bộ ổn định. Lưu eventId, characterId đủ điều kiện, contentVersion, định nghĩa thưởng và receipt trong bảng defeat_rewards/economy_operations. Retry sau restart và với epoch mới hợp lệ đọc lại receipt mà không cần object sự kiện của room cũ; người không có quyền nhận không được cấp thưởng.

Thêm progression tối thiểu: fixture cấp 1 cần 20 XP để lên cấp 2; mỗi lần hạ quái hợp lệ cho 10 XP. XP và level cập nhật cùng transaction thưởng, không cấp lại XP khi replay. EconomyReceipt.changes chứa cả thay đổi progression để tạo PrivateCharacterSnapshot mới.

- [ ] Viết test với phần thưởng fixture 10 tiền: gọi hai lần hoặc đồng thời cùng event chỉ tăng 10. Cùng operationId nhưng nội dung khác phải báo IDEMPOTENCY_CONFLICT. Phiên cũ phải báo STALE_SESSION.
- [ ] Viết test hai người đủ điều kiện mỗi người được một phần thưởng, người không đủ điều kiện không được thưởng, và replay sau restart dưới epoch mới trả receipt cũ. Hai event hợp lệ khác nhau cho tổng 20 XP, lên cấp 2 đúng một lần.
- [ ] Viết test nâng cấp fixture tốn 10 tiền và 2 nguyên liệu: từ 50 tiền/5 nguyên liệu thành 40/3 và itemVersion tăng một. Hai request cùng expectedItemVersion chỉ một request được thực thi.
- [ ] Chạy pnpm exec vitest run tests/integration/economy.test.ts; sau đó triển khai transaction, khóa hoặc cập nhật có điều kiện, ràng buộc nghiệp vụ và lưu kết quả idempotency.
- [ ] Kiểm thử lỗi trước commit và sau commit nhưng trước phản hồi. Trước commit không thay đổi tài sản; sau commit retry trả kết quả cũ. DB hỏng phải trả lỗi, không báo thưởng thành công.
- [ ] Tạm dừng một transaction sau khi khóa ownership; cho phiên mới acquire đồng thời. Takeover phải chờ transaction hoàn tất, sau đó mọi ghi từ epoch cũ bị từ chối. Chạy thêm thứ tự takeover trước transaction để xác nhận transaction cũ không thay đổi tài sản.
- [ ] Chạy lại test với PostgreSQL thực của môi trường test; cập nhật projection sau commit và commit mã nguồn. Không thay bằng test chỉ mock database.

## Task 7 Nhiệm vụ và vòng chơi qua giao diện

**Files:** tạo apps/server/src/modules/quests/QuestService.ts; apps/client/src/ui/hud/Hud.tsx; ui/inventory/InventoryPanel.tsx; ui/spirits/LoadoutPanel.tsx; ui/quests/QuestPanel.tsx; tests/e2e/first-run.spec.ts; tests/integration/quest-rewards.test.ts.

**Interfaces:** recordObjective(ctx: AuthContext, serverEventId: string): Promise<QuestProgress>; claimQuest(ctx: AuthContext, intent: ClaimIntent): Promise<EconomyReceipt>. QuestProgress gồm questInstanceId, step và completed. QuestService dùng transaction primitive của EconomyRepository, không trừ/cộng tài sản trực tiếp trong UI.

Task này sở hữu thêm interactNpc(ctx: AuthContext, intent: NpcIntent): Promise<PrivateCharacterSnapshot> và setLoadout(ctx: AuthContext, intent: LoadoutIntent): Promise<PrivateCharacterSnapshot>. Kiểm tra khoảng cách NPC, lựa chọn hội thoại hợp lệ, linh thú thuộc nhân vật, loại ô, trạng thái được phép đổi và loadoutVersion; lưu tiến độ nhận nhiệm vụ hoặc loadout qua transaction primitive trước khi gửi snapshot riêng. Không cho thay loadout giữa lúc kỹ năng đang xử lý.

- [ ] Viết test nhiệm vụ ba bước: gặp NPC, đánh hai quái đủ điều kiện để lên cấp 2, quay về nhận thưởng rồi nâng cấp. Nhận lại cùng questInstanceId với operationId mới vẫn không được thưởng lần hai. Reload phải giữ cấp 2, XP, inventory và bộ linh thú đã chọn; message đổi linh thú sai quyền hoặc sai phiên bản bị từ chối.
- [ ] Chạy pnpm exec vitest run tests/integration/quest-rewards.test.ts và pnpm exec playwright test tests/e2e/first-run.spec.ts; xác nhận chưa có hành trình thì test thất bại.
- [ ] Triển khai HUD, túi đồ, đổi 2 linh thú chủ động và 1 bị động, nhiệm vụ và nâng cấp. Khi UI chưa nhận xác nhận server, thể hiện đang xử lý, không tự tăng số dư.
- [ ] Chạy cả test và thao tác trên điện thoại: nút chạm mục tiêu 44 CSS px, modal không điều khiển nhân vật, tên/văn bản tiếng Việt không bị cắt. Chơi lại với dữ liệu nhân vật mới.
- [ ] Commit; telemetry gửi sự kiện bước đầu, thưởng và đổi bộ kỹ năng, dùng event server cho tiến trình quan trọng.

## Task 8 Kết nối lại và phục hồi từ dữ liệu đã lưu

**Files:** tạo apps/client/src/network/ReconnectController.ts; apps/server/src/modules/character/CheckpointService.ts; tests/integration/reconnect.test.ts; tests/integration/crash-recovery.test.ts.

**Interfaces:** resumeSession(token: string, reconnectToken?: string): Promise<SessionResumeResult>; saveCheckpoint(ctx: AuthContext, safePosition: Vec2): Promise<void>. SessionResumeResult trả kết nối hợp lệ hoặc yêu cầu nạp lại nhân vật; không lấy inventory từ client.

- [ ] Viết test ngắt 2/10 giây trong cửa sổ 30 giây và 45 giây vượt cửa sổ; test reload, token cũ và hai lần reconnect đồng thời.
- [ ] Chạy pnpm exec vitest run tests/integration/reconnect.test.ts tests/integration/crash-recovery.test.ts; xác nhận test crash thực sự dừng process server ở thời điểm xác định.
- [ ] Triển khai grace period, lấy lại snapshot riêng, checkpoint vị trí khoảng 15 giây và về điểm an toàn khi room mất. Trong grace period, nhân vật không được nhận trạng thái bất tử chỉ vì ngắt mạng.
- [ ] Kill process ngay sau một phần thưởng đã commit; khởi động lại và xác nhận tiền/vật phẩm giữ nguyên. Kiểm tra owner cũ không tiếp tục ghi và lỗi DB không tạo bản lưu rỗng đè dữ liệu đúng.
- [ ] Nạp PrivateCharacterSnapshot mới sau restart; kiểm tra level, XP, nhiệm vụ và loadout khớp DB. Replay phần thưởng quái dưới epoch mới phải giữ nguyên tiền và XP đã commit.
- [ ] Chạy lại toàn bộ test liên quan dữ liệu và mạng, ghi phạm vi phục hồi quan sát được rồi commit.

## Task 9 Build thử nghiệm và đánh giá vòng chơi

**Files:** tạo apps/client/public/manifest.webmanifest; apps/client/src/pwa/updatePolicy.ts; tools/load/world-bots.ts; tests/e2e/version-mismatch.spec.ts; infra/staging; docs/playtests/vertical-slice-results.md.

**Interfaces:** runWorldLoad({ players, activeMonsters, durationSeconds }): Promise<LoadSummary>. LoadSummary có thời gian tick p95/p99, bytes mỗi client mỗi giây, lỗi kết nối và bộ nhớ; không suy ra sức chứa bằng số socket kết nối rỗng.

- [ ] Tạo build staging HTTPS/WSS, manifest và cache asset theo contentVersion; session/API riêng không bị cache chung. Cập nhật chỉ ở thời điểm an toàn ngoài trận hoặc tại màn hình xác nhận tải lại.
- [ ] Viết và chạy test client cũ/server mới: hiển thị yêu cầu cập nhật thay vì cố giải mã schema không tương thích. Lệnh dự kiến pnpm exec playwright test tests/e2e/version-mismatch.spec.ts.
- [ ] Chạy bot 20 người/40 quái trong một room, thời lượng ban đầu 15 phút; đo điện thoại thật cùng tải. Bài tải 100 CCU/60 phút thuộc gói trước beta, không yêu cầu hoàn tất ở tuần 4.
- [ ] Mời 5 đến 8 người ngoài đội thử vòng chơi, ghi thiết bị, lỗi, thời gian nhận thưởng đầu, tỷ lệ hoàn tất và người tự chơi lượt tiếp. Không dùng người phát triển làm mẫu duy nhất.
- [ ] Chạy pnpm typecheck, pnpm build và các bài test hành vi bắt buộc. Review kết quả, ghi việc phải sửa, commit rồi quyết định tiếp tục hoặc điều chỉnh vòng chơi. Chưa gắn nhãn beta nếu chỉ đạt slice.

## Các gói triển khai tiếp theo

Mỗi gói sau cần một đặc tả ngắn về luật chơi và một checklist kỹ thuật riêng trước khi giao việc. Lộ trình tổng thể vẫn theo tài liệu thiết kế.

| Gói | Phụ thuộc | Tiêu chí nghiệm thu chính |
| --- | --- | --- |
| Nhiều khu vực và tài khoản liên kết | Ownership, checkpoint, auth | Không có hai owner; guest liên kết không mất nhân vật; transfer lỗi vẫn phục hồi |
| Tiến triển và bộ 8 linh thú | Content, combat, economy | Đổi cách đánh có tác dụng; trang bị sai quyền hoặc sai ô bị từ chối |
| Tổ đội và boss | Combat ổn định, chuyển khu vực | 4 người vào đúng instance, quyền thưởng rõ, reconnect không nhận thưởng lặp |
| Chế tạo và ngoại tuyến | Economy transaction | Không âm nguyên liệu; thời gian server; nhận ngoại tuyến một lần và không chồng lợi ích online |
| Chat và moderation | Auth, UI, admin audit | Chặn spam, block/report; nội dung chat render như text; thao tác quản trị có log |
| Beta và vận hành | Tất cả module được khóa nội dung | Tải 100 CCU mục tiêu, thử phục hồi, không còn lỗi dữ liệu nghiêm trọng, có dashboard |
| Android và iOS | Web beta đạt chất lượng | Hiệu năng thiết bị thật, resume, input, âm thanh và phiên đăng nhập; kế hoạch phát hành riêng |

## Cách tổ chức thực hiện theo Superpowers

Client engineer và họa sĩ có thể làm Task 1/2 song song với phần identity của backend khi hợp đồng chung đã chốt. Task 4 phụ thuộc 1/2/3; Task 5 phụ thuộc 4; Task 6 có thể chuẩn bị schema đồng thời với 5 nhưng chỉ nối thưởng sau khi hợp đồng sự kiện chết ổn định. Task 7 tích hợp 2/5/6, Task 8 củng cố 3/4/6, Task 9 kiểm chứng bản slice hoàn chỉnh.

Khi dùng agent, giao mỗi nhiệm vụ với spec, các Interfaces liên quan và file được sở hữu. Review tính đúng yêu cầu trước, sau đó review chất lượng và rủi ro. Các module dùng chung như protocol và migration cần một người giữ quyền tích hợp để tránh mỗi nhánh tự đặt kiểu dữ liệu khác nhau. Sau khi sửa phải chạy lại đúng kiểm thử bị ảnh hưởng; không coi việc viết test trong kế hoạch là đã kiểm chứng sản phẩm.

Trước khi bắt đầu viết mã, chủ sản phẩm chốt bản đề xuất, nguồn lực và thiết bị sàn. Có thể chọn subagent-driven-development khi nhiều module được phân công rõ, hoặc executing-plans khi một người triển khai tuần tự. Tài liệu hiện tại hoàn thành yêu cầu lập kế hoạch, chưa khởi tạo sản phẩm hay phát hành dịch vụ.
