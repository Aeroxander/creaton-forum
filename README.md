# Creaton Forum

Cross-platform ATProto forum client built with [One](https://onestack.dev) and [Tamagui](https://tamagui.dev). Forum data lives on user PDS repos and is discovered via Microcosm (Constellation + Slingshot).

Derived from [tamagui/takeout-free](https://github.com/tamagui/takeout-free) with Zero, Better Auth, Drizzle/Postgres, and the todo demo removed.

## Prerequisites

- **Bun** 1.3+
- **Node.js** 24+ (see `engines` in package.json)

For native builds: Xcode 16+ (iOS) or Android Studio + JDK 17+ (Android).

## Quick start

```bash
cd creaton-forum
bun install
bun dev
```

Web dev server: `http://localhost:8082` by default (see `ONE_SERVER_URL` in `.env.development`; One may pick the next free port).

No Docker or Postgres required for the app shell.

## Stack

- **One** — file routes, web + native
- **Tamagui** — cross-platform UI
- **TanStack Query** — client cache
- **@creaton/forum-core** — forum repository, sort, permissions (ported from red-dwarf)
- **ATProto auth** — OAuth (web) + app password

## Local forum graph (optional)

To list/create boards against a local PDS graph, run Microcosm from [red-dwarf](../red-dwarf):

```bash
cd ../red-dwarf
npm run dev:microcosm
```

Defaults in the app: Constellation `http://localhost:6789`, Slingshot `http://localhost:8080`.

## Commands

```bash
bun dev              # web + native dev
bun ios              # iOS simulator
bun android          # Android emulator
bun check            # TypeScript check
bun lint             # oxlint
bun test:unit        # vitest (includes forum-core)
bun validate:lexicons
bun build            # production web build
```

## Environment

Copy `.env.example` to `.env.local` for overrides. Key variables:

- `ONE_SERVER_URL` — dev server URL (OAuth client metadata)
- `VITE_CREATON_FORUM_APPVIEW_URL` — optional forum appview
- `VITE_CREATON_INTROSPECT_URL` — local appview discovery

## Project layout

```
creaton-forum/
├── app/                      # One routes
├── packages/forum-core/      # ATProto forum logic + lexicons
├── src/features/forums/      # Tamagui forum UI
├── src/providers/            # Auth + Query
└── public/                   # OAuth client metadata
```

## OAuth dev

Update `public/client-metadata.json` with your tunnel URL when testing OAuth locally (same pattern as red-dwarf).
