# Exploding Kittens Backend Technical Documentation

این سند، داکیومنت اجرایی و فنی کامل بک‌اند بازی `Exploding Kittens` در این پروژه است.

هدف سند:

- توضیح معماری ماژول بازی
- توضیح ورودی و خروجی هر لایه
- توضیح روند اجرای بازی از ساخت state تا پایان match
- توضیح actionها، stateها و pending flowها
- توضیح این‌که logic هر کارت کجا نوشته شده
- توضیح نحوه‌ی حذف، اضافه یا تغییر کارت‌ها

این سند برای فهم کد نوشته شده است؛ یعنی علاوه بر توضیح رفتار بازی، توضیح می‌دهد که هر رفتار در کدام فایل و با چه قراردادهایی پیاده شده است.

---

## 1. نمای کلی معماری

بازی `Exploding Kittens` در بک‌اند روی همان معماری generic بازی‌های پروژه سوار شده است.

جریان کلی:

```text
RoomService
  -> getCardGame("exploding_kittens")
  -> explodingKittensGameDefinition
  -> gameEngine
  -> card registry / card definitions
  -> updated game state
  -> projection for player
```

فایل‌های اصلی:

```text
src/domain/explodingKittens/
  card.ts
  deck.ts
  engineHelpers.ts
  explodingKittensGame.ts
  gameEngine.ts
  gameState.ts
  projection.ts
  types.ts
  cards/
    index.ts
    config.ts
    types.ts
    helpers.ts
    attack.ts
    skip.ts
    favor.ts
    shuffle.ts
    seeFuture.ts
    nope.ts
    defuse.ts
    explodingKitten.ts
    catTaco.ts
    catMelon.ts
    catPotato.ts
    catBeard.ts
    catRainbow.ts
```

نقش هر فایل به‌صورت خلاصه:

- `explodingKittensGame.ts`
  نقطه‌ی اتصال بازی به interface عمومی سیستم بازی‌ها. این فایل actionها را validate می‌کند و آن‌ها را به engine می‌فرستد.

- `gameEngine.ts`
  orchestration اصلی gameplay. تصمیم می‌گیرد هر action چطور اجرا شود، turn چه‌طور جابه‌جا شود، کارت‌ها چه‌طور از hand به discard بروند، و pending flowها چه‌طور resolve شوند.

- `engineHelpers.ts`
  helperهای عمومی gameplay. این فایل باید فاقد منطق وابسته به یک کارت خاص باشد. مثل:
  - shuffle
  - draw card
  - remove card from hand
  - change turn
  - eliminate player
  - sync player public state

- `cards/*.ts`
  منطق هر کارت در فایل خودش. اگر بخواهی رفتار یک کارت را عوض کنی یا کارت جدید اضافه کنی، اول باید همین پوشه را نگاه کنی.

- `cards/index.ts`
  registry کارت‌ها. همه‌ی card definitionها اینجا register می‌شوند.

- `cards/config.ts`
  محل override برای فعال/غیرفعال کردن کارت یا تغییر تعداد نسخه‌ی آن در deck.

- `deck.ts`
  deck را بر اساس registry کارت‌ها و config نهایی می‌سازد. این فایل hardcoded به نوع کارت‌ها نیست؛ از registry می‌خواند.

- `gameState.ts`
  shape کامل state داخلی بازی و shape خروجی projection.

- `projection.ts`
  state خصوصی-عمومی را برای بازیکن viewer تبدیل می‌کند. یعنی هر بازیکن فقط hand خود را می‌بیند.

- `types.ts`
  actionها، effectها و pending actionهای خاص این بازی را تعریف می‌کند.

---

## 2. اتصال به زیرساخت عمومی پروژه

این بازی از طریق `gameRegistry.ts` در سیستم بازی‌ها ثبت شده است.

```text
RoomService -> getCardGame(gameId) -> explodingKittensGameDefinition
```

در نتیجه هر جایی که `RoomService` با `gameId = "exploding_kittens"` کار کند:

- ایجاد room
- start game
- apply action
- turn timeout
- finish timed match
- remove disconnected player
- match result

همه از همین definition استفاده می‌کنند.

فایل درگیر:

- `src/domain/cardGame/gameRegistry.ts`
- `src/domain/explodingKittens/explodingKittensGame.ts`

---

## 3. ورودی و خروجی سطح بالا

### 3.1 ورودی‌های اصلی بازی

ورودی اصلی gameplay از طریق `CardGameAction` به بازی می‌رسد. در این بازی، actionهای معتبر در `src/domain/explodingKittens/types.ts` تعریف شده‌اند.

actionهای فعلی:

```ts
type ExplodingKittensAction =
  | { type: "draw" }
  | {
      type: "play";
      cardId: string;
      targetPlayerId?: string;
      requestedCardType?: string;
    }
  | {
      type: "playCard";
      cardId: string;
      targetPlayerId?: string;
      requestedCardType?: string;
    }
  | {
      type: "combo";
      cardIds: string[];
      targetPlayerId?: string;
      requestedCardType?: string;
      discardCardId?: string;
    }
  | { type: "giveFavorCard"; cardId: string }
  | { type: "resolveNope"; allow?: boolean }
  | { type: "defuse"; insertIndex?: number };
```

توضیح:

- `draw`
  بازیکن current turn از draw pile کارت می‌کشد.

- `play` و `playCard`
  بازی یک کارت تکی. هر دو فعلاً پشتیبانی می‌شوند تا backend با کلاینت فعلی یا کلاینت آینده سازگار بماند.

- `combo`
  اجرای comboهای cat cards.

- `giveFavorCard`
  پاسخ بازیکن هدف به effect کارت `Favor`.

- `resolveNope`
  پایان‌دادن به پنجره‌ی nope chain. در backend فعلی از وجود این action برای finalize کردن pending effect استفاده می‌شود.

- `defuse`
  بازیکنی که `Exploding Kitten` کشیده، محل قرارگیری مجدد آن در draw pile را تعیین می‌کند.

### 3.2 خروجی اصلی

خروجی هر action در سطح domain از نوع `CardGameActionResult` است:

```ts
type CardGameActionResult =
  | { ok: true; events?: CardGameEvent[]; penaltyCards?: number }
  | { ok: false; code: string; message: string };
```

معنای خروجی:

- `ok: true`
  action معتبر بوده و state با موفقیت آپدیت شده است.

- `events`
  eventهای domain که برای لایه‌های بالاتر، analytics یا broadcast مفید هستند.

- `ok: false`
  action نامعتبر بوده و هیچ جریان معتبری از gameplay اجرا نشده است.

---

## 4. state داخلی بازی

فایل:

- `src/domain/explodingKittens/gameState.ts`

### 4.1 ExplodingKittensGameState

state اصلی:

```ts
type ExplodingKittensGameState = {
  status: "playing" | "finished";
  players: ExplodingKittensPlayerState[];
  turnIndex: number;
  remainingTurns: number;
  drawPileCount: number;
  drawPile: ExplodingKittensCard[];
  discardPile: ExplodingKittensCard[];
  hands: Record<string, ExplodingKittensCard[]>;
  winnerId: string | null;
  eliminatedPlayerIds: Record<string, boolean>;
  pendingAttackStacks: number;
  pendingAction: ExplodingKittensPendingAction | null;
  peekByPlayerId: Record<string, ExplodingKittensCard[]>;
  enabledCardTypes: string[];
  lastAction?: {
    type: string;
    playerId: string;
    at: number;
  };
};
```

### 4.2 توضیح هر فیلد

- `status`
  وضعیت کل بازی. تا زمانی که حداقل دو بازیکن alive باشند و match timeout نشده باشد، `playing` است.

- `players`
  نسخه‌ی public بازیکنان:
  - `id`
  - `displayName`
  - `avatar`
  - `handCount`
  - `alive`

- `turnIndex`
  اندیس بازیکن فعلی در آرایه‌ی `players`.

- `remainingTurns`
  تعداد turn باقی‌مانده برای بازیکن current. این فیلد مخصوص پشتیبانی از `Attack` است.
  در حالت عادی `1` است.

- `drawPileCount`
  تعداد کارت‌های باقی‌مانده در draw pile. برای اینکه projection و کلاینت مستقیم تعداد را بگیرند.

- `drawPile`
  deck واقعی بازی.

- `discardPile`
  pile کارت‌های discard شده.

- `hands`
  دست خصوصی هر بازیکن.

- `winnerId`
  شناسه‌ی برنده وقتی بازی تمام شود.

- `eliminatedPlayerIds`
  set منطقی بازیکنان حذف‌شده.

- `pendingAttackStacks`
  نمایش فشرده‌ای از فشار turnهای حمله. الان از `remainingTurns - 1` مشتق می‌شود.

- `pendingAction`
  مهم‌ترین فیلد state machine. اگر چیزی در بازی نیازمند پاسخ/resolve باشد، اینجا ذخیره می‌شود.

- `peekByPlayerId`
  خروجی موقت کارت‌های دیده‌شده از `See the Future`.

- `enabledCardTypes`
  لیست کارت‌هایی که در config نهایی این match فعال بوده‌اند.

- `lastAction`
  آخرین action ثبت‌شده برای debugging یا tracing.

---

## 5. projection و خروجی برای کلاینت

فایل:

- `src/domain/explodingKittens/projection.ts`

تابع:

```ts
projectExplodingKittensGameStateForPlayer(state, viewerId)
```

این تابع state داخلی را به خروجی مخصوص viewer تبدیل می‌کند.

خروجی:

```ts
type ExplodingKittensPlayerProjection = {
  status: "playing" | "finished";
  turnIndex: number;
  currentPlayerId: string | null;
  remainingTurns: number;
  drawPileCount: number;
  discardPile: ExplodingKittensCard[];
  players: ExplodingKittensPlayerState[];
  myHand: ExplodingKittensCard[];
  winnerId: string | null;
  pendingAttackStacks: number;
  peekedCards: ExplodingKittensCard[];
  pendingAction: ExplodingKittensPendingAction | null;
  enabledCardTypes: string[];
};
```

نکته‌ی مهم:

- `myHand` فقط برای همان viewer برگردانده می‌شود.
- hand بقیه‌ی بازیکن‌ها از طریق `handCount` دیده می‌شود، نه از طریق لیست واقعی کارت‌ها.

---

## 6. pending flowها و state machine

بازی فقط turn-based ساده نیست. چند نوع state میانی دارد که باید قبل از ادامه‌ی turn resolve شوند.

این stateها در `pendingAction` ذخیره می‌شوند.

فایل:

- `src/domain/explodingKittens/types.ts`

### 6.1 nope_window

```ts
{
  type: "nope_window";
  effect: ExplodingKittensPendingEffect;
  nopeCount: number;
  resolverPlayerId: string;
  respondedPlayerIds: string[];
}
```

معنی:

- یک effect در صف اجرا است
- کارت `Nope` می‌تواند آن را لغو یا un-nope کند
- اگر تعداد `nope`ها فرد باشد، effect لغو می‌شود
- اگر زوج باشد، effect اجرا می‌شود

این state برای کارت‌های action و comboهای nope-able استفاده می‌شود.

### 6.2 favor_response

```ts
{
  type: "favor_response";
  actorId: string;
  targetPlayerId: string;
  resolverPlayerId: string;
}
```

معنی:

- بازیکن `actorId` کارت `Favor` بازی کرده
- `targetPlayerId` باید یکی از کارت‌های دستش را بدهد

تا وقتی این action resolve نشود، turn کامل نشده است.

### 6.3 defuse

```ts
{
  type: "defuse";
  playerId: string;
  resolverPlayerId: string;
  explodingKittenCard: ExplodingKittensCard;
  remainingTurnsAfterDefuse: number;
}
```

معنی:

- بازیکن `Exploding Kitten` کشیده
- چون `Defuse` داشته، حذف نشده
- باید محل قرارگیری دوباره‌ی kitten را در draw pile مشخص کند

---

## 7. شروع بازی

فایل‌های درگیر:

- `explodingKittensGame.ts`
- `gameEngine.ts`
- `deck.ts`
- `cards/index.ts`
- `cards/config.ts`

### 7.1 ورودی start

`RoomService.startGame` یک roster از بازیکنان می‌سازد:

```ts
[{ id, displayName, avatar }]
```

و آن را به:

```ts
createInitialState(roster)
```

می‌دهد.

### 7.2 روند ساخت initial state

تابع:

```ts
createExplodingKittensInitialState(roster)
```

مراحل:

1. تعداد بازیکنان validate می‌شود.
   فعلاً: `2..5`

2. `buildExplodingKittensSetup(playerIds)` اجرا می‌شود.

3. `buildExplodingKittensSetup`:
   - registry کارت‌ها را از `cards/index.ts` می‌خواند
   - overrideها را از `cards/config.ts` اعمال می‌کند
   - فقط کارت‌های `enabled` را نگه می‌دارد
   - کارت‌های `defuse` و `exploding_kitten` را از pool اصلی جدا در نظر می‌گیرد
   - به هر بازیکن:
     - ۱ `defuse`
     - ۴ کارت دیگر
     می‌دهد
   - باقی defuseها را دوباره به deck برمی‌گرداند
   - به تعداد `players - 1` عدد `exploding_kitten` داخل draw pile می‌گذارد
   - draw pile را shuffle می‌کند

4. state نهایی ساخته می‌شود:
   - `status = "playing"`
   - `remainingTurns = 1`
   - `pendingAction = null`
   - `winnerId = null`
   - `turnIndex` تصادفی

---

## 8. registry کارت‌ها

### 8.1 registry مرکزی

فایل:

- `src/domain/explodingKittens/cards/index.ts`

این فایل تمام کارت‌ها را import می‌کند و خروجی‌های زیر را می‌دهد:

- `listExplodingKittensCardDefinitions()`
- `getExplodingKittensCardDefinition(type)`
- `listConfiguredExplodingKittensCardDefinitions()`

### 8.2 ساختار Card Definition

فایل:

- `src/domain/explodingKittens/cards/types.ts`

ساختار:

```ts
type ExplodingKittensCardDefinition = {
  type: string;
  label: string;
  copies: number;
  enabledByDefault: boolean;
  category: "action" | "cat" | "special";
  comboFamily?: string;
  canBeNoped?: boolean;
  playMode: "normal" | "response_only" | "never";
  onPlay?: (context) => CardPlayResult;
  resolveEffect?: (context) => CardEffectResolutionResult;
};
```

معنی فیلدها:

- `type`
  id منطقی کارت

- `label`
  عنوان انسانی

- `copies`
  تعداد نسخه‌های پیش‌فرض در deck

- `enabledByDefault`
  آیا به‌صورت پیش‌فرض در deck فعال است؟

- `category`
  کاربرد کلی کارت:
  - `action`
  - `cat`
  - `special`

- `comboFamily`
  فقط برای cat cardها. برای تشخیص combo pair/triple/five استفاده می‌شود.

- `canBeNoped`
  آیا effect کارت می‌تواند وارد `nope_window` شود؟

- `playMode`
  مشخص می‌کند این کارت مستقیم از دست قابل بازی است یا نه:
  - `normal`
  - `response_only`
  - `never`

- `onPlay`
  مرحله‌ی اول بازی کارت. این تابع هنوز effect را مستقیماً resolve نمی‌کند؛ فقط می‌تواند:
  - خطا بدهد
  - event بدهد
  - `pendingEffect` بسازد

- `resolveEffect`
  مرحله‌ی resolve نهایی بعد از عبور از `nope_window` یا در حالتی که nope ندارد.

---

## 9. منطق actionهای اصلی

فایل اصلی:

- `src/domain/explodingKittens/gameEngine.ts`

### 9.1 applyExplodingKittensAction(state, playerId, action)

این entry point اصلی gameplay است.

روند:

1. اگر بازی finished باشد، خطا
2. اگر بازیکن eliminated باشد، خطا
3. اگر `pendingAction` وجود داشته باشد، اول آن resolve می‌شود
4. اگر pending نداشته باشیم:
   - `draw`
   - `play/playCard`
   - `combo`
   به handler مناسب می‌روند

### 9.2 draw

تابع:

```ts
handleDrawAction(state, playerId)
```

روند:

1. validate نوبت
2. draw pile را چک می‌کند
3. یک کارت از بالای deck می‌کشد
4. اگر کارت `exploding_kitten` باشد:
   - اگر player `defuse` داشته باشد:
     - defuse از hand حذف می‌شود
     - به discard می‌رود
     - `pendingAction = defuse`
   - اگر نداشته باشد:
     - بازیکن eliminate می‌شود
     - اگر یک نفر بماند winner مشخص می‌شود
5. اگر کارت عادی باشد:
   - کارت به hand بازیکن اضافه می‌شود
   - turn consume می‌شود
   - در صورت نیاز turn به نفر بعدی می‌رود

### 9.3 play / playCard

تابع:

```ts
handlePlayAction(state, playerId, action)
```

روند:

1. validate نوبت
2. پیدا کردن کارت در hand
3. پیدا کردن definition از registry
4. check `playMode`
5. اجرای `definition.onPlay(...)`
6. حذف کارت از hand و انتقال به discard
7. اگر `pendingEffect` داشته باشد:
   - اگر کارت `canBeNoped` باشد:
     - `pendingAction = nope_window`
   - اگر nope نپذیرد:
     - effect مستقیم resolve می‌شود
8. اگر `pendingEffect` نداشته باشد:
   - صرفاً eventها برمی‌گردند

### 9.4 combo

تابع:

```ts
handleComboAction(state, playerId, action)
```

روند:

1. validate نوبت
2. بررسی یکتایی cardIdها
3. بررسی تعداد مجاز `2 / 3 / 5`
4. بررسی اینکه همه‌ی کارت‌ها cat card باشند
5. ساخت `ComboEffect`
6. حذف کارت‌های combo از hand
7. انتقال آن‌ها به discard
8. قرار دادن combo effect در `nope_window`

---

## 10. منطق کارت‌ها

### 10.1 Attack

فایل:

- `cards/attack.ts`

کار:

- effect نوع `attack` می‌سازد
- در resolve:
  - turn به بازیکن بعدی می‌رود
  - `remainingTurns` برای او حداقل `2` یا `remainingTurns + 1` می‌شود

### 10.2 Skip

فایل:

- `cards/skip.ts`

کار:

- effect نوع `skip` می‌سازد
- در resolve:
  - یک turn از `remainingTurns` مصرف می‌کند
  - اگر turn دیگری باقی نماند، نوبت به نفر بعد می‌رود

### 10.3 Favor

فایل:

- `cards/favor.ts`

کار:

- نیازمند `targetPlayerId`
- effect نوع `favor` می‌سازد
- در resolve:
  - اگر target hand خالی داشته باشد، effect بی‌اثر تمام می‌شود
  - در غیر این صورت `pendingAction = favor_response`

### 10.4 Shuffle

فایل:

- `cards/shuffle.ts`

کار:

- draw pile را shuffle می‌کند
- peek state را پاک می‌کند

### 10.5 See the Future

فایل:

- `cards/seeFuture.ts`

کار:

- سه کارت بالای deck را برای همان بازیکن در `peekByPlayerId[playerId]` ذخیره می‌کند

### 10.6 Nope

فایل:

- `cards/nope.ts`

نکته:

- این کارت `response_only` است
- مستقیم به‌عنوان action عادی از turn اصلی بازی نمی‌شود
- فقط وقتی `pendingAction.type === "nope_window"` باشد، از hand قابل استفاده است

### 10.7 Defuse

فایل:

- `cards/defuse.ts`

نکته:

- `playMode = "never"`
- backend خودش هنگام کشیدن `exploding_kitten` و وجود `defuse` در hand آن را مصرف می‌کند

### 10.8 Exploding Kitten

فایل:

- `cards/explodingKitten.ts`

نکته:

- `playMode = "never"`
- هرگز به‌صورت مستقیم بازی نمی‌شود
- فقط وقتی draw شود منطقش فعال می‌شود

### 10.9 Cat Cards

فایل‌ها:

- `catTaco.ts`
- `catMelon.ts`
- `catPotato.ts`
- `catBeard.ts`
- `catRainbow.ts`

همه با helper زیر ساخته شده‌اند:

- `cards/helpers.ts`

این کارت‌ها:

- `category = "cat"`
- `comboFamily` دارند
- مستقیم play نمی‌شوند
- فقط برای combo استفاده می‌شوند

---

## 11. منطق comboها

### 11.1 combo دوتایی

ورودی:

```ts
{
  type: "combo",
  cardIds: [a, b],
  targetPlayerId
}
```

شرط:

- هر دو کارت cat باشند
- هر دو از یک `comboFamily` باشند

خروجی effect:

```ts
{
  type: "combo_steal",
  actorId,
  cardIds,
  targetPlayerId
}
```

resolve:

- یک کارت تصادفی از target گرفته می‌شود

### 11.2 combo سه‌تایی

ورودی:

```ts
{
  type: "combo",
  cardIds: [a, b, c],
  targetPlayerId,
  requestedCardType
}
```

شرط:

- هر سه cat card باشند
- هر سه از یک family باشند

resolve:

- اگر target آن نوع کارت را داشته باشد، همان کارت منتقل می‌شود
- اگر نداشته باشد، effect بدون انتقال کارت تمام می‌شود

### 11.3 combo پنج‌تایی

ورودی:

```ts
{
  type: "combo",
  cardIds: [...5 cards...],
  discardCardId
}
```

شرط:

- هر ۵ کارت cat باشند
- از ۵ family متفاوت باشند

resolve:

- کارت انتخاب‌شده از discard pile برداشته می‌شود
- به دست بازیکن برمی‌گردد

---

## 12. nope chain

این بازی یک implementation ساده و قابل‌فهم از `Nope` دارد.

روند:

1. یک کارت یا combo effect که `canBeNoped` باشد، وارد `pendingAction = nope_window` می‌شود.
2. هر بازیکنی که کارت `Nope` داشته باشد می‌تواند آن را play کند.
3. هر `Nope` شمارنده‌ی `nopeCount` را یکی زیاد می‌کند.
4. وقتی `resolveNope` فرستاده شود یا timeout رخ دهد:
   - اگر `nopeCount` فرد باشد، effect لغو می‌شود
   - اگر `nopeCount` زوج باشد، effect اجرا می‌شود

این behavior در:

- `resolvePendingNopeWindow`
- `playNopeCard`

پیاده شده است.

نکته:

- این implementation برای توسعه مناسب است، ولی اگر بعداً خواستی behavior رسمی‌تر و چندمرحله‌ای‌تر داشته باشی، بهترین جا برای توسعه همین `pendingAction.type === "nope_window"` است.

---

## 13. timeout handling

تابع:

```ts
handleExplodingKittensTurnTimeout(state, playerId)
```

رفتار:

- اگر `nope_window` باز باشد:
  آن را resolve می‌کند

- اگر `favor_response` باز باشد:
  اولین کارت target را به‌صورت خودکار می‌دهد

- اگر `defuse` باز باشد:
  `exploding_kitten` را در جای تصادفی deck قرار می‌دهد

- اگر هیچ pending خاصی نباشد:
  معادل `draw` رفتار می‌کند

این تصمیم باعث می‌شود بازی روی timeout متوقف نماند.

---

## 14. پایان بازی و winner

### 14.1 پایان طبیعی

وقتی بازیکنی منفجر شود و فقط یک نفر alive بماند:

- `status = "finished"`
- `winnerId = alivePlayerId`

### 14.2 پایان با match timeout

تابع:

```ts
finishExplodingKittensTimedMatch(state)
```

روند:

1. بازی finished می‌شود
2. `pendingAction = null`
3. winner با `pickTimedWinner` انتخاب می‌شود

معیار winner در timed match:

1. کمترین `handCount`
2. اگر مساوی بود، `displayName` lexicographical

---

## 15. remove player / disconnect

تابع:

```ts
removePlayerFromExplodingKittens(state, playerId)
```

کار:

- بازیکن را eliminated می‌کند
- اگر لازم باشد winner را مشخص می‌کند
- state را sync می‌کند

این تابع از `RoomService.eliminateDisconnectedPlayer` فراخوانی می‌شود.

---

## 16. deck configuration و فعال/غیرفعال کردن کارت‌ها

فایل:

- `src/domain/explodingKittens/cards/config.ts`

ساختار:

```ts
export const EXPLODING_KITTENS_CARD_OVERRIDES: Record<
  string,
  {
    enabled?: boolean;
    copies?: number;
  }
> = {};
```

مثال:

```ts
export const EXPLODING_KITTENS_CARD_OVERRIDES = {
  shuffle: { enabled: false },
  see_future: { copies: 2 },
};
```

نتیجه:

- `shuffle` از deck حذف می‌شود
- `see_future` فقط ۲ نسخه خواهد داشت

این overrideها در:

- `cards/index.ts -> listConfiguredExplodingKittensCardDefinitions`

اعمال می‌شوند.

---

## 17. اضافه کردن کارت جدید

اگر بخواهی کارت جدید اضافه کنی، این مسیر پیشنهادی است:

### قدم 1: فایل کارت بساز

مثلاً:

```text
src/domain/explodingKittens/cards/stealTop.ts
```

### قدم 2: definition کارت را بنویس

اسکلت:

```ts
import type { ExplodingKittensCardDefinition } from "./types.js";

export const stealTopCardDefinition: ExplodingKittensCardDefinition = {
  type: "steal_top",
  label: "Steal Top",
  copies: 2,
  enabledByDefault: true,
  category: "action",
  canBeNoped: true,
  playMode: "normal",
  onPlay(context) {
    return {
      ok: true,
      pendingEffect: {
        type: "custom_effect",
        actorId: context.actorId,
        sourceCardId: context.card.id,
        sourceCardType: context.card.type,
      },
    };
  },
  resolveEffect({ state, effect }) {
    return { ok: true, events: [] };
  },
};
```

### قدم 3: در registry ثبتش کن

در `cards/index.ts`:

```ts
import { stealTopCardDefinition } from "./stealTop.js";

const baseDefinitions = [
  ...,
  stealTopCardDefinition,
];
```

### قدم 4: اگر effect جدید لازم دارد، type آن را تعریف کن

در `types.ts`:

- به `SingleCardEffect` یا `ComboEffect` اضافه‌اش کن

### قدم 5: اگر helper جدید لازم دارد، در engineHelpers بگذار

منطق reusable را داخل فایل کارت ننویس اگر احتمال استفاده‌ی مجدد دارد.

---

## 18. تغییر logic کارت موجود

اگر بخواهی behavior کارت را عوض کنی:

- کارت‌های ساده:
  فایل خود همان کارت را تغییر بده

مثلاً:

- `cards/attack.ts`
- `cards/favor.ts`

اگر تغییر فقط مربوط به resolve است:

- `resolveEffect`

اگر تغییر مربوط به validate ورودی کارت است:

- `onPlay`

اگر تغییر مربوط به حرکت turn، draw، یا helperهای اشتراکی است:

- `engineHelpers.ts`

اگر تغییر مربوط به action contract است:

- `types.ts`
- در صورت نیاز `explodingKittensGame.ts` برای validation ورودی

---

## 19. نقش explodingKittensGame.ts

این فایل adapter بین سیستم generic بازی‌ها و implementation خاص Exploding Kittens است.

وظایف:

- تشخیص معتبر بودن action ورودی
- ثبت `lastAction`
- صدا زدن engine
- تعیین `getActivePlayerId`
- تعیین `isFinished`
- تعیین `getPlayerResult`

نکته‌ی مهم:

`getActivePlayerId` فقط از `turnIndex` استفاده نمی‌کند. اگر pending action خاصی فعال باشد، active player واقعی را از همان pending state برمی‌گرداند:

- در `favor_response`: target player
- در `defuse`: player منفجرشده
- در `nope_window`: resolverPlayerId

این باعث می‌شود timerها و UI بدانند در حال حاضر چه کسی باید تصمیم بعدی را بگیرد.

---

## 20. نقش engineHelpers.ts

این فایل برای جلوگیری از پخش‌شدن logic پایه در همه‌جای engine ساخته شده است.

توابع مهم:

- `shuffleCards`
- `syncPlayers`
- `clearPeekState`
- `setPeekForPlayer`
- `alivePlayerIds`
- `currentPlayerId`
- `advanceTurn`
- `consumeCurrentTurn`
- `markWinnerIfNeeded`
- `eliminatePlayer`
- `drawTopCard`
- `giveCardToPlayer`
- `insertCardIntoDrawPile`
- `removeCardFromHand`
- `removeCardsFromHand`
- `discardCards`
- `revealTopCards`
- `stealRandomCard`
- `stealNamedCard`
- `takeDiscardCard`
- `pickTimedWinner`
- `makeEvent`

قاعده‌ی طراحی:

- اگر چیزی generic و reusable است، اینجا قرار بگیرد
- اگر چیزی مخصوص یک کارت خاص است، در فایل همان کارت بماند

---

## 21. Eventهای مهم بازی

نمونه eventهایی که backend تولید می‌کند:

- `exploding_kittens.effectPending`
- `exploding_kittens.nopePlayed`
- `exploding_kittens.cardNoped`
- `exploding_kittens.attackResolved`
- `exploding_kittens.skipResolved`
- `exploding_kittens.favorRequested`
- `exploding_kittens.favorResolved`
- `exploding_kittens.favorSkipped`
- `exploding_kittens.shuffleResolved`
- `exploding_kittens.seeFutureResolved`
- `exploding_kittens.defuseRequired`
- `exploding_kittens.defuseResolved`
- `exploding_kittens.playerExploded`
- `exploding_kittens.comboPending`
- `exploding_kittens.comboStealResolved`
- `exploding_kittens.comboRequestResolved`
- `exploding_kittens.comboRetrieveResolved`
- `exploding_kittens.matchFinished`
- `exploding_kittens.playerRemoved`

این eventها برای:

- analytics
- debug
- live UI feedback

مفید هستند.

---

## 22. محدودیت‌ها و تصمیم‌های فعلی

این implementation عمداً چند تصمیم ساده‌ساز دارد:

1. `Nope` window به‌صورت state ساده پیاده شده، نه round-robin رسمی با turn ownership پیچیده
2. timed winner بر اساس hand count تعیین می‌شود
3. cat cardها فقط در combo استفاده می‌شوند
4. config کارت‌ها global و code-based است، نه DB-based

این‌ها برای توسعه و نگهداری ساده انتخاب شده‌اند و بعداً قابل ارتقا هستند.

---

## 23. پیشنهاد برای توسعه‌های بعدی

اگر بعداً خواستی این ماژول را حرفه‌ای‌تر کنی، بهترین ارتقاها این‌ها هستند:

- اضافه کردن `gameSettings` مخصوص Exploding Kittens برای هر room
- اضافه کردن کارت‌های جدید در فایل‌های جدا
- اضافه کردن phaseهای رسمی‌تر برای `Nope`
- اضافه کردن eventهای richer برای client UX
- اضافه کردن tests برای:
  - draw + defuse
  - nope odd/even
  - favor response
  - combo validation
  - winner selection

---

## 24. خلاصه‌ی سریع برای فهم کد

اگر بخواهی خیلی سریع کد را بفهمی، این ترتیب را بخوان:

1. `explodingKittensGame.ts`
   برای فهم contract بازی با سیستم

2. `types.ts`
   برای فهم actionها و pending stateها

3. `gameState.ts`
   برای فهم shape کامل state

4. `gameEngine.ts`
   برای فهم flow کلی gameplay

5. `cards/index.ts`
   برای فهم registry

6. `cards/attack.ts`, `favor.ts`, `seeFuture.ts`
   برای دیدن pattern منطق کارت‌ها

7. `deck.ts`
   برای فهم build شدن deck

8. `cards/config.ts`
   برای فهم فعال/غیرفعال‌سازی کارت‌ها

---

## 25. نتیجه

معماری فعلی طوری چیده شده که:

- منطق کارت‌ها به هم نچسبد
- deck بر اساس registry ساخته شود
- تغییر behavior هر کارت به فایل خودش محدود بماند
- pending flowهای پیچیده مثل `Nope`, `Favor`, `Defuse` قابل‌ردیابی باشند
- اضافه کردن کارت جدید بدون بازنویسی کل engine ممکن باشد

اگر بخواهی، قدم بعدی می‌توانم یک سند دوم هم بنویسم با عنوان:

```text
Exploding Kittens Action Cookbook
```

که داخلش برای هر action نمونه payload واقعی WebSocket و state قبل/بعد بگذارم تا از روی آن راحت‌تر کلاینت یا تست بنویسی.
