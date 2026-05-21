@AGENTS.md
# SG — `src/` 폴더 구조 참고

Expo + React Native 스크롤 게임 앱. `src/`는 **UI 컴포넌트**, **화면**, **Supabase/데이터**로 나뉩니다.  
루트 `App.tsx`가 `src`를 조립합니다 (탭 전환, 데이터 로드).

## 디렉터리 요약

| 폴더 | 역할 |
|------|------|
| `src/component/` | 재사용 UI 조각 (카드, 하단 Navbar) |
| `src/screens/` | 탭별 전체 화면 (Feed, Create) |
| `src/lib/` | Supabase 클라이언트 & DB 호출 로직 |

---

## `src/component/` — UI 컴포넌트

### `GameCard.tsx`
- **역할:** Feed에서 보여줄 **게임 1장 카드** UI.
- **타입:** `Game` (`id`, `title`, `description?`) — 앱 전역에서 쓰는 게임 데이터 형태.
- **props:** `game`, `height`(한 페이지 높이), `onPressPlay?`(미연결).
- **사용처:** `FeedScreen`의 `FlatList` `renderItem`.
- **비고:** 실제 미니게임/플레이 로직은 아직 없음.

### `Navbar.tsx`
- **역할:** 화면 **하단 고정 탭 바** (Games / Create).
- **타입:** `NavbarTab` = `'games' | 'create'`.
- **props:** `active`, `onPressGames`, `onPressCreate`.
- **사용처:** `App.tsx` — 탭 상태와 화면 전환 콜백 연결.

### `index.ts`
- **역할:** component **barrel export**.
- **export:** `Navbar`, `GameCard` (및 `Game` 타입은 `GameCard`에서).
- **사용처:** `import { Navbar, ... } from './src/component'`.

---

## `src/screens/` — 화면

### `FeedScreen.tsx`
- **역할:** **릴스형 게임 피드** — 세로 `FlatList`, 한 장씩 스와이프(`pagingEnabled`, `snapToInterval`).
- **props:** `games?: Game[]` — Supabase에서 받은 목록. 비어 있으면 `DEMO_GAMES` 3개 fallback.
- **레이아웃:** `onLayout`으로 Navbar **위 content 영역 높이**만 측정 → `GameCard` 높이·스냅에 사용 (Navbar에 가리지 않음).
- **사용처:** `App.tsx`에서 `active === 'games'`일 때.

### `CreatScreen.tsx`
- **역할:** **AI 게임 제작** 탭 화면 — 프롬프트 `TextInput`, 글자 수 제한, 「생성하기」 버튼.
- **상태:** 로컬 `prompt` state만 관리.
- **생성:** `aiService.generateGameFromPrompt` → SGS `/api/games/generate` (AI·HTML·Storage). Feed 갱신은 `onGameCreated` → `fetchGames()`.
- **사용처:** `App.tsx`에서 `active === 'create'`일 때.

---

## `src/lib/` — Supabase & 데이터

### `supabase.ts`
- **역할:** Supabase **`createClient` 단일 인스턴스** 생성·export (`supabase`). SDK·env·auth 설정만 담당.
- **환경변수:** `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_KEY` (`SG/.env.local`).
- **auth:** `AsyncStorage`로 세션 유지 (RN/Expo용).
- **import 규칙:** `createClient`는 이 파일에서만. `gameService` 등은 **`supabase.ts`를 직접 import하지 않음**.

### `supabaseClient.ts`
- **역할:** `supabase` **공식 import 입구** — `export { supabase } from './supabase'`.
- **현재 상태:** `gameService.ts`가 `from './supabaseClient'`로 연결됨.
- **import 규칙:** lib·서비스·화면에서 Supabase 클라이언트가 필요하면 **항상 `supabaseClient`만** 사용.

### `gameService.ts`
- **역할:** **Feed용** — Supabase에서 게임 목록·`playUrl` 직접 조회 (SGS 경유 없음).
- **클라이언트:** `import { supabase } from './supabaseClient'`.
- **함수:** `fetchGames()`, `getGamePublicUrl()`.
- **사용처:** `App.tsx` → `FeedScreen` → `GameCard` WebView `playUrl`.

### `aiService.ts`
- **역할:** 게임 **생성만** SGS 호출 (`POST /api/games/generate`). 읽기/플레이는 Supabase 직접.

---

## `src/` 밖과의 연결 (참고)

| 파일 | `src`와의 관계 |
|------|----------------|
| `App.tsx` | 탭 상태, Supabase 로드, `FeedScreen` / `CreatScreen` / `Navbar` 조립 |
| `index.ts` | Expo 진입점 → `App` 등록 |
| `SG/.env.local` | Supabase 키 (lib에서 사용) |

## 데이터 흐름

```
[Feed 읽기 — SGC → Supabase 직접]
App → gameService.fetchGames() → supabase → games + Storage playUrl
     → FeedScreen → GameCard WebView(uri: playUrl)

[게임 생성 — SGC → SGS만]
CreatScreen → aiService → SGS /api/games/generate → AI → HTML → Storage
             → onGameCreated → fetchGames() 다시
```

## 네이밍·파일 규칙

- 화면: `src/screens/*Screen.tsx`
- 재사용 UI: `src/component/*`
- DB/API: `src/lib/gameService.ts` (클라이언트 import: **`supabaseClient`만**)
- `CreatScreen` — 파일명은 Create 오타이지만 컴포넌트명 `CreatScreen` 유지 중
