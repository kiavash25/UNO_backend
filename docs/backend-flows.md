# Cardix UNO Backend Flows

این سند نقشه فنی بک اند بازی UNO است. تمرکز روی جریان های اصلی اتاق، جستجو، بازی خصوصی/عمومی، WebSocket، تایمر نوبت، دیتای ذخیره شده، قوانین خود بازی، امتیاز و گزارش بازی است.

## نقشه کلی معماری

ورودی برنامه از `src/index.ts` شروع می شود.

در `main` این وابستگی ها ساخته می شوند:

- Mongo: `connectMongo(env.MONGODB_URI)`
- Redis: `createRedis(env.REDIS_URL)`
- Repositoryها:
  - `RoomRepository`
  - `UserRepository`
  - `GameReportRepository`
  - `AdminRepository`
  - `FeedbackRepository`
- Storeهای Redis:
  - `LiveRoomStore`
  - `SessionStore`
- سرویس ها:
  - `RoomService`
  - `UserService`
  - `GameAnalyticsService`
  - `AdminService`
  - `FeedbackService`
- HTTP app: `createHttpApp`
- WebSocket server: `attachWsServer`
- WebSocket hub: `WsHub`

جریان کلی:

```text
HTTP Controller -> Application Service -> Redis/Mongo/Domain
WebSocket Message -> WsDispatcher -> RoomService -> Domain Game Engine -> Redis -> WsHub push
```

## لایه ها

### HTTP Interface

مسیرها در `src/interfaces/http/createHttpApp.ts` ثبت می شوند.

```text
GET  /health
/api/admin/auth
/api/auth
/api/avatars
/api/feedback
/api
/api/games
/api/rooms
```

برای بازی و اتاق، مسیرهای مهم در `src/interfaces/http/routes/roomRoutes.ts` هستند:

```text
POST /api/rooms
POST /api/rooms/join
GET  /api/rooms/public
POST /api/rooms/quick
POST /api/rooms/bot-match
GET  /api/rooms/:code
```

### Application

منطق orchestration در `src/application/roomService.ts` است. این فایل محل اصلی ساخت اتاق، join، start، action، تایمر، بات، reward و projection برای client است.

### Domain

قوانین قابل تعویض بازی در `src/domain/cardGame` تعریف شده اند.

UNO در این فایل هاست:

```text
src/domain/uno/unoGame.ts
src/domain/uno/gameEngine.ts
src/domain/uno/gameState.ts
src/domain/uno/projection.ts
src/domain/uno/card.ts
src/domain/uno/deck.ts
```

`unoGameDefinition` در `gameRegistry.ts` ثبت شده و `RoomService` با `getCardGame(gameId)` آن را پیدا می کند.

### Infrastructure

Redis:

- `LiveRoomStore`: وضعیت زنده اتاق، index اتاق های عمومی، code -> roomId
- `SessionStore`: playerToken -> roomId/playerId/userId

Mongo:

- `RoomModel`: متادیتای اتاق
- `UserModel`: پروفایل، امتیاز، bot profile
- `GameReportModel`: گزارش کامل بازی بعد از پایان

## دیتای اصلی

### RoomSettings

در `src/application/roomTypes.ts`:

```ts
type RoomSettings = {
  gameId: string;
  name: string;
  maxPlayers: number;
  mode: "classic" | "fast";
  isPrivate: boolean;
  turnTimeoutSec: number;
};
```

نکته مهم: مقدار پیش فرض `turnTimeoutSec` در `RoomService.defaultSettings` ساخته می شود. اگر ورودی create room مقدارش را ندهد، مقدار default استفاده می شود.

### LobbyPlayer

بازیکن داخل لابی:

```ts
type LobbyPlayer = {
  id: string;
  displayName: string;
  avatar?: string;
  profile?: PlayerProfile;
  isHost: boolean;
  isBot?: boolean;
  ready: boolean;
  connected: boolean;
};
```

### LiveRoomState

وضعیت زنده اتاق در Redis:

```ts
type LiveRoomState = {
  id: string;
  code: string;
  settings: RoomSettings;
  hostId: string;
  players: LobbyPlayer[];
  phase: "lobby" | "playing" | "finished";
  game: unknown | null;
  turnDeadlineAt: number | null;
  matchRewardsClaimed?: Record<string, boolean>;
  version: number;
};
```

### SessionPayload

هر بازیکن یک `playerToken` دارد. این token در Redis ذخیره می شود و برای WS auth و actionهای بازی استفاده می شود.

```ts
type SessionPayload = {
  roomId: string;
  playerId: string;
  userId?: string;
};
```

### ClientRoomView

خروجی زنده ای که به هر کلاینت داده می شود در `clientRoomView` ساخته می شود:

```ts
{
  type: "room.state",
  version,
  phase,
  code,
  settings,
  players,
  serverNow,
  turnTimeoutMs,
  turnDeadlineAt,
  game: projectedGameForThisPlayer,
  matchRewards
}
```

نکته امنیتی: `game.projectStateForPlayer` فقط دست خود viewer را در `myHand` می فرستد. دست بقیه بازیکن ها ارسال نمی شود.

## فلو ساخت اتاق خصوصی

Endpoint:

```text
POST /api/rooms
```

Controller:

```text
RoomController.create
```

ورودی validation شده:

```ts
{
  gameId?: string;
  hostDisplayName: string;
  avatar?: string;
  name: string;
  maxPlayers?: number;
  mode?: "classic" | "fast";
  isPrivate?: boolean;
}
```

فلو:

1. `RoomController.create` ورودی را validate می کند.
2. `RoomService.createRoom` صدا زده می شود.
3. `defaultSettings` مقدارهای پیش فرض را می سازد:
   - `gameId = "uno"`
   - `maxPlayers = min(4, game.maxPlayers)`
   - `mode = "classic"`
   - `isPrivate = true`
   - `turnTimeoutSec` در همین تابع تعیین می شود. اگر مقدار مثبت باشد، همان مقدار مدت نوبت است؛ اگر صفر یا نامعتبر باشد، `getTurnTimeoutMs` از fallback استفاده می کند.
4. `gameDefinition(settings.gameId)` بازی را از registry می گیرد.
5. تعداد بازیکن ها نسبت به `minPlayers/maxPlayers` بازی validate می شود.
6. `hostId` و `code` ساخته می شوند.
7. سند Mongo در `RoomRepository.create` ساخته می شود.
8. `LiveRoomState` با `phase: "lobby"` در Redis ذخیره می شود.
9. `playerToken` ساخته و در `SessionStore` ذخیره می شود.
10. Analytics event برای room created ثبت می شود.
11. پاسخ HTTP شامل `roomId`, `code`, `playerToken`, `playerId` است.

دیتای ذخیره شده:

- Mongo `rooms`: متادیتای اتاق
- Redis `liveRoom:{roomId}`: وضعیت live
- Redis `roomByCode:{code}`: پیدا کردن roomId
- Redis `session:{playerToken}`: نشست بازیکن
- Redis analytics meta

## فلو ساخت اتاق عمومی

اتاق عمومی همان `createRoom` است، اما با `isPrivate: false`.

وقتی `LiveRoomStore.save` اجرا می شود، `syncPublicLobbyIndex` بررسی می کند:

```ts
eligible =
  !state.settings.isPrivate &&
  state.phase === "lobby" &&
  state.players.length < state.settings.maxPlayers
```

اگر eligible باشد roomId در set عمومی Redis اضافه می شود. اگر نه، از set حذف می شود.

پس اتاق عمومی فقط وقتی در لیست جستجو می آید که:

- private نباشد
- هنوز lobby باشد
- ظرفیت داشته باشد

## فلو جستجو و لیست اتاق عمومی

Endpoint:

```text
GET /api/rooms/public
```

Controller:

```text
RoomController.listPublic
```

Service:

```text
RoomService.listPublicRooms
```

فلو:

1. `LiveRoomStore.listPublicLobbyRoomIds` set اتاق های عمومی را از Redis می خواند.
2. برای هر id، state از Redis load می شود.
3. اگر state وجود نداشته باشد، از index عمومی حذف می شود.
4. اگر اتاق private باشد، lobby نباشد، یا پر باشد، رد می شود.
5. خروجی `PublicRoomSummary[]` ساخته می شود.
6. خروجی بر اساس `currentPlayers` نزولی sort می شود.

خروجی:

```ts
{
  code: string;
  gameId: string;
  name: string;
  maxPlayers: number;
  currentPlayers: number;
  phase: "lobby" | "playing" | "finished";
  mode: "classic" | "fast";
  isPrivate: boolean;
}
```

## فلو پیدا کردن اتاق با کد

Endpoint:

```text
GET /api/rooms/:code
```

Service:

```text
RoomService.getPublicByCode
```

فلو:

1. code به uppercase تبدیل می شود.
2. ابتدا Redis `roomByCode` چک می شود.
3. اگر نبود، Mongo `RoomRepository.findByCode` چک می شود.
4. سپس live state از Redis load می شود.
5. اگر live state نبود، خروجی null است.
6. summary اتاق برگردانده می شود.

نکته: حتی برای private room هم این endpoint خلاصه اتاق را با code برمی گرداند، ولی join فقط با داشتن code ممکن است.

## فلو ورود به اتاق

Endpoint:

```text
POST /api/rooms/join
```

Controller:

```text
RoomController.join
```

Service:

```text
RoomService.joinRoom
```

فلو:

1. code validate و uppercase می شود.
2. `LiveRoomStore.findRoomIdByCode` تلاش می کند roomId را از Redis بگیرد.
3. اگر نبود، Mongo با code چک می شود.
4. live state از Redis خوانده می شود.
5. اگر اتاق وجود نداشت یا live نبود، خطا برمی گردد.
6. اگر ظرفیت پر بود، خطا `full`.
7. `playerId` جدید ساخته می شود.
8. player با `ready: false`, `connected: false` به `state.players` اضافه می شود.
9. `version` زیاد می شود.
10. state persist می شود.
11. `playerToken` در `SessionStore` ذخیره می شود.
12. analytics playerJoined ثبت می شود.

## فلو Quick Play

Endpoint:

```text
POST /api/rooms/quick
```

Service:

```text
RoomService.quickPlay
```

فلو:

1. `listPublicRooms` خوانده می شود.
2. فقط roomهایی که `gameId` برابر ورودی دارند نگه داشته می شوند.
3. اگر اتاق عمومی باز وجود داشته باشد، کاربر به اولین اتاق join می شود.
4. اگر نبود، یک اتاق عمومی جدید ساخته می شود:
   - `name = "بازی سریع"`
   - `maxPlayers = 4`
   - `mode = "fast"`
   - `isPrivate = false`
5. خروجی شامل `created: boolean` است.

## فلو بازی با بات

Endpoint:

```text
POST /api/rooms/bot-match
```

Service:

```text
RoomService.createBotMatch
```

فلو:

1. gameDefinition گرفته می شود.
2. بررسی می شود بازی `chooseBotAction` داشته باشد.
3. totalPlayers باید بین minPlayers و 4 باشد.
4. یک اتاق private classic ساخته می شود.
5. state اتاق از Redis load می شود.
6. بات ها از `UserRepository.listBots` خوانده می شوند.
7. بات هایی که displayName تکراری دارند حذف می شوند.
8. به تعداد لازم `LobbyPlayer` بات ساخته می شود:
   - `isBot: true`
   - `ready: true`
   - `connected: true`
   - `profile` از User bot profile
9. state persist می شود.
10. `startGame` برای token میزبان اجرا می شود.

بعد از شروع بازی، هر بار نوبت به بات برسد، `scheduleBotTurn` یک timeout کوتاه می گذارد و `runBotTurn` اکشن بات را اجرا می کند.

## فلو WebSocket Auth

مسیر WS:

```text
/ws
```

اولین پیام باید این باشد:

```json
{ "type": "auth", "token": "playerToken" }
```

فلو:

1. `wsConnection.authenticateFirstMessage` پیام اول را validate می کند.
2. `WsHub.authenticate` صدا زده می شود.
3. `RoomService.session(token)` نشست را از Redis می خواند.
4. live room load می شود.
5. بررسی می شود player هنوز داخل room وجود دارد.
6. socket داخل `WsHub.sockets` و `WsHub.byRoom` ثبت می شود.
7. disconnect timer قبلی همان بازیکن پاک می شود.
8. `RoomService.setConnected(roomId, playerId, true)` اجرا می شود.
9. device بازیکن برای analytics ثبت می شود.
10. `pushRoom` state جدید را برای همه socketهای اتاق می فرستد.
11. خود socket پیام `authenticated` می گیرد.

## پیام های WebSocket

Schema در `src/interfaces/ws/wsMessages.ts` است.

پیام های مجاز بعد از auth:

```text
lobby.ready
lobby.chat
game.start
game.playCard
game.draw
game.pass
game.uno
game.action
```

Dispatcher در `src/interfaces/ws/wsDispatcher.ts` هر پیام را به متد RoomService وصل می کند.

## فلو Ready در لابی

پیام:

```json
{ "type": "lobby.ready", "ready": true }
```

فلو:

1. `dispatchWsMessage`
2. `RoomService.setReady(token, ready)`
3. session از Redis گرفته می شود.
4. state از Redis load می شود.
5. player پیدا می شود.
6. `p.ready = ready`
7. `version++`
8. persist
9. `onRoomChanged` باعث `WsHub.pushRoom` می شود.

نکته: در کد فعلی `startGame` آماده بودن همه بازیکن ها را enforce نمی کند. فقط host بودن، phase، تعداد بازیکن و محدودیت game را چک می کند.

## فلو Chat

پیام:

```json
{ "type": "lobby.chat", "text": "hi" }
```

فلو:

1. `RoomService.recordChat` برای analytics.
2. `WsHub.broadcastEvent` پیام chat را برای socketهای اتاق می فرستد.

خروجی event:

```ts
{
  type: "lobby.chat",
  fromPlayerId,
  text,
  emoji,
  ts
}
```

## فلو شروع بازی

پیام:

```json
{ "type": "game.start" }
```

Service:

```text
RoomService.startGame
```

فلو:

1. session از token گرفته می شود.
2. live state load می شود.
3. فقط host اجازه start دارد.
4. phase باید `lobby` باشد.
5. gameDefinition از registry گرفته می شود.
6. تعداد بازیکن ها باید بین `game.minPlayers` و `game.maxPlayers` باشد.
7. roster از lobby players ساخته می شود:
   - id
   - displayName
   - avatar
8. `game.createInitialState(roster)` صدا زده می شود.
9. برای UNO این تابع `startNewGame` است.
10. `state.phase = "playing"`
11. `version++`
12. persist با `resetTurnTimer: true`
13. analytics `gameStarted`

## ساخت state اولیه UNO

تابع:

```text
startNewGame در src/domain/uno/gameEngine.ts
```

فلو:

1. تعداد roster باید 2 تا 10 باشد.
2. deck با `createShuffledDeck` ساخته می شود.
3. برای هر بازیکن یک hand خالی ساخته می شود.
4. 7 دور کارت پخش می شود، پس هر بازیکن 7 کارت می گیرد.
5. starter card از deck برداشته می شود، ولی wild نباید starter باشد.
6. اگر wild برداشته شد، برمی گردد اول deck و deck دوباره shuffle می شود.
7. `discardPile = [starter]`
8. `currentColor = starter.color`
9. `players` عمومی ساخته می شود.
10. `turnIndex` تصادفی انتخاب می شود.
11. `direction = 1`
12. `pendingDrawPass = null`
13. `pendingDrawStack = null`
14. `turnTimeoutCounts = {}`
15. `eliminatedPlayerIds = {}`

## Deck و کارت ها

در `src/domain/uno/deck.ts`:

- رنگ ها: red, yellow, green, blue
- عددها: 1 تا 9
- برای هر رنگ:
  - از هر عدد دو کارت
  - دو skip
  - دو reverse
  - دو draw2
- 4 wild
- 4 wild4

هر کارت:

```ts
{
  id: string;
  color: "red" | "yellow" | "green" | "blue" | "black";
  rank: "1" | ... | "9" | "skip" | "reverse" | "draw2" | "wild" | "wild4";
}
```

## تایمر نوبت

تایمر در `RoomService` مدیریت می شود.

توابع مهم:

```text
getTurnTimeoutMs
currentTurnStartedAt
resetTurnDeadline
scheduleTurnTimeout
runTurnTimeout
```

فلو هنگام persist:

1. اگر `resetTurnTimer` true باشد یا بازی در phase playing باشد ولی `turnDeadlineAt` نداشته باشد، `resetTurnDeadline` اجرا می شود.
2. `resetTurnDeadline` active player را از game می گیرد.
3. اگر phase playing و active player وجود داشته باشد:
   ```ts
   state.turnDeadlineAt = Date.now() + getTurnTimeoutMs(state)
   ```
4. state در Redis ذخیره می شود.
5. `scheduleTurnTimeout(roomId)` اجرا می شود.

فلو schedule:

1. timer قبلی همان room پاک می شود.
2. state از Redis load می شود.
3. اگر phase playing، game و deadline معتبر باشد ادامه می دهد.
4. active player گرفته می شود.
5. delay برابر `deadline - Date.now()` است.
6. بعد از delay، `runTurnTimeout(roomId, activePlayerId, deadline)` اجرا می شود.

فلو timeout:

1. state دوباره از Redis load می شود.
2. اگر deadline تغییر کرده باشد، خروجی می دهد.
3. اگر هنوز deadline نرسیده باشد، خروجی می دهد.
4. اگر active player عوض شده باشد، خروجی می دهد.
5. `game.handleTurnTimeout` اجرا می شود.
6. برای UNO این تابع `applyTurnTimeout` است.
7. eventهای timeout/elimination ساخته می شوند.
8. اگر بازی finished شده باشد phase هم finished می شود.
9. state persist می شود و timer نوبت بعدی reset می شود.

نکته مهم: duration هر نوبت اول از `state.settings.turnTimeoutSec` می آید. اگر این مقدار مثبت باشد، تغییر fallback در `getTurnTimeoutMs` اثری ندارد. اگر صفر، منفی یا نامعتبر باشد، fallback استفاده می شود.

## اکشن playCard

پیام:

```json
{
  "type": "game.playCard",
  "cardId": "card-id",
  "chosenColor": "red",
  "declareUno": true
}
```

فلو:

1. `RoomService.playCard`
2. `RoomService.applyGameAction`
3. `requirePlayingSession`
4. `game.applyAction`
5. برای UNO: `unoGameDefinition.applyAction`
6. اکشن validate می شود.
7. اگر playCard باشد، `gameEngine.playCard` صدا زده می شود.
8. نتیجه اگر ok نبود به AppError تبدیل می شود.
9. eventها handle می شوند.
10. اگر game finished شده باشد، phase finished می شود.
11. version زیاد می شود.
12. persist با reset timer
13. bot/reward/analytics بررسی می شوند.

قوانین `playCard`:

- بازی باید playing باشد.
- باید نوبت player باشد.
- کارت باید در دست player باشد.
- اگر draw stack فعال است:
  - فقط player هدف stack می تواند بازی کند.
  - فقط `wild4` یا `draw2` همان رنگ stack قابل بازی است.
- اگر draw stack فعال نیست:
  - کارت باید با top/currentColor match باشد، یا wild باشد.
- wild و wild4 حتما `chosenColor` می خواهند.
- کارت از hand حذف و به discard اضافه می شود.
- timeout count بازیکن reset می شود.
- اگر declareUno و hand بعد از بازی 1 باشد، `saidUno = true`.
- اگر hand صفر شود، بازی finished و winnerId ثبت می شود.
- در غیر این صورت effect کارت اعمال می شود.

Effectها:

- number: نوبت یک قدم جلو می رود.
- skip: نوبت دو قدم جلو می رود.
- reverse: direction برعکس می شود و نوبت جلو می رود.
- draw2: target نفر بعدی می شود و `pendingDrawStack.amount += 2`.
- wild: رنگ انتخابی active می شود و نوبت جلو می رود.
- wild4: رنگ انتخابی active می شود و `pendingDrawStack.amount += 4`.

## اکشن draw

پیام:

```json
{ "type": "game.draw" }
```

قوانین:

- بازی باید playing باشد.
- باید نوبت player باشد.
- اگر draw stack فعال باشد:
  - player هدف stack باید کل `pendingDrawStack.amount` را بکشد.
  - stack پاک می شود.
  - نوبت جلو می رود.
- اگر player قبلا کارت کشیده و باید pass کند، draw دوباره خطاست.
- در حالت عادی یک کارت می کشد.
- timeout count reset می شود.
- نوبت جلو می رود.

نکته: در کد فعلی بعد از draw عادی، `pendingDrawPass` روی null می ماند و نوبت جلو می رود. یعنی draw-and-play همان turn در engine فعلی فعال نیست، هرچند UI متغیر `pendingDrawPass` را پشتیبانی می کند.

## اکشن pass

پیام:

```json
{ "type": "game.pass" }
```

قوانین:

- اگر draw stack فعال باشد، pass به `drawCard` تبدیل می شود و penalty stack را می کشد.
- اگر `pendingDrawPass !== playerId` باشد، خطا می دهد.
- اگر pendingDrawPass باشد، پاک می شود و نوبت جلو می رود.

## اکشن UNO

پیام:

```json
{ "type": "game.uno" }
```

قوانین:

- بازی باید playing باشد.
- player نباید eliminated باشد.
- hand باید دقیقا 1 کارت داشته باشد.
- `saidUno = true`

## جریمه نگفتن UNO

در `unoGameDefinition.applyAction` بعد از playCard موفق:

1. برای همه بازیکن های غیر از actor بررسی می شود.
2. اگر hand بازیکن 1 باشد و `saidUno` false باشد:
   - یک کارت می کشد.
   - event `uno.missedPenalty` ساخته می شود.

پس جریمه missed UNO وقتی trigger می شود که یک نفر دیگر کارت بازی کند.

## Timeout در UNO

تابع:

```text
applyTurnTimeout
```

قوانین:

- فقط active player timeout می شود.
- `turnTimeoutCounts[playerId]++`
- در حالت `classic` اگر count به 2 برسد:
  - `removePlayerFromGame` اجرا می شود.
  - اگر یک بازیکن باقی بماند، بازی تمام می شود.
- در حالت `fast` بازیکن با تکرار timeout حذف نمی شود و هر بار جریمه عادی timeout را می گیرد.
- اگر هنوز حذف نشده:
  - اگر draw stack روی بازیکن باشد، مقدار stack به penalty اضافه می شود.
  - یک کارت اضافه هم جریمه می گیرد.
  - `pendingDrawPass` و `pendingDrawStack` پاک می شوند.
  - نوبت جلو می رود.

Eventها:

- اگر حذف نشده باشد، `game.turnTimedOut` broadcast می شود.
- اگر حذف شود، `uno.playerEliminated` با reason `timeout` broadcast می شود.

## Disconnect و حذف بازیکن

در `WsHub.disconnect`:

1. socket از mapها حذف می شود.
2. اگر player هنوز socket باز دیگری دارد، کاری نمی شود.
3. `RoomService.handleDisconnect` بازیکن را `connected: false` می کند.
4. state push می شود.
5. یک timer چهار ثانیه ای شروع می شود.
6. اگر تا پایان grace period socket باز نشد:
   - `RoomService.eliminateDisconnectedPlayer` اجرا می شود.

در `eliminateDisconnectedPlayer`:

- اگر phase playing باشد، `game.removePlayer` اجرا می شود.
- برای UNO این تابع `removePlayerFromGame` است.
- event `uno.playerEliminated` با reason `disconnect` ساخته می شود.
- اگر بازی finished شود، reward و analytics finish هم ثبت می شود.

## پایان بازی

بازی می تواند در این حالت ها finished شود:

- یک بازیکن آخرین کارت خود را بازی کند.
- بازیکن ها با timeout/disconnect حذف شوند و فقط یک active player بماند.

وقتی domain game finished شود:

1. `state.phase = "finished"`
2. `persist` اجرا می شود.
3. چون phase دیگر playing نیست، `turnDeadlineAt = null`.
4. `clientRoomView` برای finished، `matchRewards` را می فرستد.
5. `GameAnalyticsService.finishGame` گزارش Mongo را upsert می کند.

## Reward و ثبت نتیجه برای کاربر

Rewardها با `buildMatchRewards` در `RoomService` ساخته می شوند.

Ranking:

1. winner اول است.
2. بقیه eligible playerها با handCount کمتر بالاترند.
3. اگر handCount برابر باشد، displayName با locale fa مقایسه می شود.
4. eliminatedها در reward اصلی eligible نیستند.

Reward table در `src/domain/cardGame/gameScoring.ts` است.

Endpoint ثبت نتیجه:

```text
POST /api/me/match
Authorization: Bearer userToken
Body: { playerToken }
```

فلو:

1. `UserController.recordMatch`
2. `RoomService.claimMatchResult(playerToken, userId)`
3. session باید متعلق به همین userId باشد.
4. بازی باید finished باشد.
5. game باید `getPlayerResult` داشته باشد.
6. player نباید eliminated باشد.
7. اگر قبلا claim کرده باشد، خطا می دهد.
8. `matchRewardsClaimed[playerId] = true`
9. context reward برمی گردد.
10. `UserService.recordMatch` آمار user را با `buildMatchRewardPatch` update می کند.

برای بات ها، `applyBotRewardsIfFinished` بعد از finish به صورت خودکار reward را روی user bot اعمال می کند.

## Analytics و Game Report

`GameAnalyticsService` در Redis متادیتا و eventها را نگه می دارد و در پایان بازی گزارش کامل را در Mongo ذخیره می کند.

کلیدهای analytics:

- meta room
- events room

Eventهای مهم:

- `uno.started`
- `uno.action`
- `chat`
- `player.eliminated`

در پایان بازی، `GameReportModel` این دیتا را نگه می دارد:

```ts
{
  roomId,
  code,
  gameId,
  isPrivate,
  hostPlayerId,
  hostUserId,
  createdAtMs,
  startedAtMs,
  finishedAtMs,
  durationMs,
  players,
  winnerId,
  ranking,
  rewards,
  events,
  gameReport
}
```

برای UNO، `gameReport` شامل startingHands، timeoutPenalties، eliminations و chats می شود.

## Projection بازی برای کلاینت

در `src/domain/uno/projection.ts`:

```ts
{
  status,
  turnIndex,
  direction,
  currentColor,
  discardPile,
  drawPileCount,
  players,
  myHand,
  winnerId,
  pendingDrawPass,
  pendingDrawStack
}
```

دست همه بازیکن ها در state واقعی وجود دارد، ولی در projection فقط `myHand` برای viewer ارسال می شود.

## Event Broadcastها

در `src/index.ts`، RoomService با callbackهای زیر ساخته می شود:

- `onRoomChanged`: `hub.pushRoom(roomId)`
- `onGameEvent`: eventهای domain را broadcast می کند، به جز `uno.declared`
- `onUnoDeclared`: event مخصوص `game.unoDeclared` می فرستد
- `onRoomDestroyed`: room را در hub می بندد

Eventهای رایج:

```text
room.state
authenticated
lobby.chat
game.unoDeclared
uno.missedPenalty
uno.playerSkipped
uno.playerEliminated
game.turnTimedOut
error
room.closed
```

## نقاط مهم و رفتارهای قابل توجه

- `RoomService` منبع حقیقت برای phase، timer، persist و push است.
- `gameEngine` منبع حقیقت قوانین UNO است.
- `clientRoomView` مرز privacy بین state واقعی و state کلاینت است.
- public search فقط روی Redis index انجام می شود.
- Mongo room بیشتر metadata/history است؛ live game از Redis می آید.
- برای تغییر مدت نوبت، مقدار موثر `settings.turnTimeoutSec` است.
- اتاق هایی که قبلا ساخته شده اند مقدار `settings.turnTimeoutSec` خودشان را داخل Redis دارند.
- تغییر default فقط روی اتاق های جدید اثر دارد.
- `version` با هر تغییر state زیاد می شود و به کلاینت کمک می کند آپدیت ها را تشخیص دهد.
- تایمرهای bot و turn در حافظه process نگه داشته می شوند؛ state اصلی در Redis است.
- اگر process ریست شود، timerهای in-memory دوباره فقط وقتی schedule می شوند که state persist یا service flow مربوطه اجرا شود.

## مسیرهای مهم برای توسعه

اگر می خواهی behavior شروع بازی را تغییر بدهی:

```text
src/application/roomService.ts -> startGame
src/domain/uno/gameEngine.ts -> startNewGame
```

اگر می خواهی قوانین کارت ها را تغییر بدهی:

```text
src/domain/uno/gameEngine.ts -> playCard / drawCard / applyCardEffect
src/domain/uno/card.ts -> cardMatchesTop
```

اگر می خواهی زمان هر نوبت را تغییر بدهی:

```text
src/application/roomService.ts -> defaultSettings / getTurnTimeoutMs / resetTurnDeadline
```

اگر می خواهی matchmaking عمومی را تغییر بدهی:

```text
src/application/roomService.ts -> quickPlay / listPublicRooms
src/infrastructure/redis/liveRoomStore.ts -> syncPublicLobbyIndex
```

اگر می خواهی payload فرانت را تغییر بدهی:

```text
src/application/roomService.ts -> clientRoomView
src/domain/uno/projection.ts -> projectUnoGameStateForPlayer
```

اگر می خواهی reward را تغییر بدهی:

```text
src/domain/cardGame/gameScoring.ts
src/application/roomService.ts -> buildMatchRewards / claimMatchResult
src/application/matchRewardProgress.ts
```

اگر می خواهی گزارش بازی را تغییر بدهی:

```text
src/application/gameAnalyticsService.ts
src/infrastructure/mongo/models/gameReportModel.ts
```
