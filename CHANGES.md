# Better HN - Fork Changes

## Docker Runtime

- **Dockerfile**: Multi-stage build (deps -> build -> runtime) on `node:24.15.0-alpine`. Uses corepack for pnpm, builds with `pnpm build`, runs `node .output/server/index.mjs` as non-root `node` user. Exposes port 3000. Includes a healthcheck hitting `http://127.0.0.1:3000/`.
- **docker-compose.yml**: Single `web` service, builds locally, tagged `better-hn:local`, maps port `3000:3000`, sets `NITRO_HOST=0.0.0.0` and `NITRO_PORT=3000`, restart policy `unless-stopped`.
- **.dockerignore**: Excludes `node_modules`, `.git`, `.github`, build artifacts, `.husky`, `.env`, etc.

## GHCR Image Workflow

- **.github/workflows/docker.yml**: Triggers on push to `master`, tags `v*`, and `workflow_dispatch`. Builds `linux/amd64` image and pushes to `ghcr.io/<owner>/<repo>`. Tags: `latest` on default branch, `sha-<short>` always, semver on release tags. Uses GHA buildx cache. Permissions: `contents: read`, `packages: write`.

## System Theme Mode

The app previously supported only light and dark themes. A third "system" mode was added that follows the OS color scheme preference.

### How it works

- **Three modes**: `system` (default), `light`, `dark`. Toggle cycles `system -> light -> dark -> system`.
- **Cookie**: `bhn.theme` stores the selected mode (`system`, `light`, or `dark`).
- **Resolution**: When mode is `system`, the effective theme resolves to light or dark based on `prefers-color-scheme: dark` media query.
- **Reactivity**: A `matchMedia` listener re-applies the theme live when the OS preference changes while in system mode.
- **SSR**: Server cannot know OS preference, so `system` defaults to light on the server. The inline script corrects it immediately on the client.
- **HTML attributes**: `<html>` gets `class="dark"` for the resolved effective theme, and `data-theme="system|light|dark"` for the selected mode. Icon visibility in the header is driven by `data-theme`.

### Files changed/created

- `src/lib/theme.ts`: Added `Theme.SYSTEM`, changed default to `Theme.SYSTEM`, added `isTheme()`, `getResolvedTheme()`, `getNextTheme()` helpers.
- `src/client/ui.ts`: Rewrote theme switching for three-state cycle, added `prefers-color-scheme` listener, sets `data-theme` on `<html>`.
- `src/components/InlineScript.tsx`: Inline boot script now understands `system` mode, resolves it via media query, sets `data-theme` and `.dark`.
- `src/components/App.tsx`: Added `data-theme` attribute and resolved theme class on `<html>`.
- `src/components/Header.tsx`: Added `SystemIcon` as third icon in the theme toggle button.
- `src/components/icons/SystemIcon.tsx`: New icon component (Heroicons desktop/monitor outline).
- `src/client/styles/header.scss`: Icon visibility now uses `html[data-theme="system|light|dark"]` selectors instead of `.dark` class.
- `src/render.tsx`: Cookie theme value validated with `isTheme()` instead of cast.
- `src/lib/context.ts`: `theme` field is now required (`Theme` instead of `Theme | undefined`).

## Dependency Cleanup

- **Removed `@vercel/analytics`**: Deleted `src/client/analytics.ts`, removed its import from `src/client/index.ts`, removed the Vercel preset from `nitro.config.ts`, removed `.vercel` from clean script.
- **Removed `js-cookie` and `@types/js-cookie`**: Replaced `Cookies.get/set` calls in `src/client/ui.ts` with native `document.cookie` API.
- **Removed `rimraf`**: Replaced `rimraf` in clean script with `rm -rf` (not needed on non-Windows).
- **Removed commit hygiene toolchain**: `@commitlint/cli`, `@commitlint/config-conventional`, `husky`, `lint-staged`, `.husky/`, `commitlint.config.mjs`, `.lintstagedrc.mjs`.
- **Removed `@pajecawav/prettier-config`**: Deleted `.prettierrc.mjs`, now using Prettier defaults.
- **Removed Deno Deploy workflow**: Deleted `.github/workflows/deno-deploy.yml`.
- **Removed GitHub icon**: Removed `<GitHubIcon>` from `src/components/Header.tsx`.
- **Removed `LICENSE`** file (MIT, copyrighted to original author; irrelevant for private fork).

## Comment Navigation And Mobile Layout

- **Smooth comment navigation**: Added `scroll-behavior: smooth` on `html` so comment anchor links like `next`, `prev`, `root`, and `parent` animate instead of jumping.
- **Collapse scroll behavior**: Updated `src/client/comments.ts` so collapsing a thread keeps the parent comment in view with `scrollIntoView({ behavior: "smooth", block: "nearest" })`. This means collapsing via the thread line scrolls smoothly only when needed, while clicking the inline fold button usually does not move the viewport.
- **No sticky mobile header**: Removed the mobile sticky header behavior from `src/client/styles/header.scss` to match original HN more closely.
- **Comment scroll offset**: Added a small `scroll-margin-top: var(--size-2)` to both `.comment` and `.info` in `src/client/styles/comment.scss` so navigated-to comments do not land flush against the top of the viewport.
- **Top-level thread spacing**: Added extra vertical space only between top-level comment threads, using a new `topLevel` prop in `src/components/Comment.tsx`, applied from `src/routes/post/[postId].get.tsx`, and styled via `.topLevelComment + .topLevelComment { margin-top: var(--size-6); }`. Nested replies keep the tighter spacing.
- **Mobile page padding**: Increased horizontal body padding on mobile to `var(--size-4)` in `src/client/styles/index.css` so pages have more breathing room near the edges.

### Files changed

- `src/client/comments.ts`: Smooth collapse scroll using `scrollIntoView` with `behavior: "smooth"` and `block: "nearest"`.
- `src/client/styles/comment.scss`: Added comment scroll offset, restored tight nested spacing, and added larger spacing only between top-level threads.
- `src/client/styles/header.scss`: Removed the mobile sticky header rule.
- `src/client/styles/index.css`: Added smooth anchor scrolling and increased mobile horizontal page padding.
- `src/components/Comment.tsx`: Added optional `topLevel` prop and top-level comment class.
- `src/routes/post/[postId].get.tsx`: Marks root comments as top-level for spacing.

## RSS Feeds

Requested hnrss-style RSS feeds were added under `/rss/*`, using a mix of Algolia and light HN page scraping.

### Implemented feeds

- **Firehose**: `/rss/frontpage`, `/rss/newest`
- **Self-posts**: `/rss/ask`, `/rss/show`, `/rss/polls`
- **Alternative**: `/rss/classic`, `/rss/best`, `/rss/active`
- **Comments**: `/rss/bestcomments`

### How it works

- **Route structure**: A new dynamic Nitro route at `src/routes/rss/[feed].get.ts` serves all requested feed slugs, and `src/routes/rss.get.tsx` renders a human-readable `/rss` index page.
- **Feed sources**:
  - `frontpage`, `newest`, and `polls` use the Algolia HN search API directly.
  - `ask`, `show`, `classic`, `best`, `active`, and `bestcomments` first scrape IDs from live `news.ycombinator.com` pages, then hydrate them through Algolia.
- **Requested behavior over exact hnrss parity**:
  - Feed item discussion links point to this Better HN instance (`/post/:id`) instead of `news.ycombinator.com`.
  - `bestcomments` item titles use `New comment by <author>`.
  - Default `count` is `30`, capped at `100`.
- **Descriptions**:
  - Story feeds include hnrss-style descriptions by default.
  - Link posts show `Article URL`, `Comments URL`, `Points`, and `# Comments`.
  - Self-posts include the HN self-text, then the metadata block.
  - `bestcomments` descriptions contain the comment HTML.
  - `description=0` disables item descriptions.
- **Link mode**:
  - Default item `<link>` is the article URL when present.
  - `link=comments` switches item `<link>` to the local Better HN discussion URL.
  - `<comments>` always points to the local Better HN discussion URL.
- **Activity params**:
  - Story feeds support `points`, `comments`, `count`, `link=comments`, and `description=0`.
  - `bestcomments` supports `count` and `description=0`.
- **Caching**: Feed responses are served with `Cache-Control: public, max-age=120, stale-while-revalidate=120`, and upstream Algolia/HN fetches are memoized in-process for 120 seconds.

### UI integration

- **RSS index page**: `/rss` lists all implemented feeds with short descriptions.
- **Per-topic RSS links**: `/top`, `/new`, `/ask`, and `/show` now render a visible RSS icon beside the page title.
- **Autodiscovery**: Those same topic pages now emit `<link rel="alternate" type="application/rss+xml">` tags for feed readers.
- **Header entry**: The global header now includes an RSS menu linking to the `/rss` index and each implemented feed.

### Files changed/created

- `src/lib/rss.ts`: Feed definitions, categories, topic-to-feed mapping, and shared route helpers.
- `src/lib/hnrss.ts`: Algolia queries, HN page scraping, query param parsing, in-memory caching, and RSS XML generation.
- `src/routes/rss/[feed].get.ts`: Dynamic RSS endpoint for all implemented feed slugs.
- `src/routes/rss.get.tsx`: HTML index page for `/rss`.
- `src/components/icons/RssIcon.tsx`: New RSS icon component.
- `src/components/Header.tsx`: Added global RSS menu in the header.
- `src/components/Meta.tsx`: Added optional RSS autodiscovery link tag support.
- `src/render.tsx`: `renderPage()` now accepts optional RSS metadata for the page `<head>`.
- `src/lib/context.ts`: SSR context now carries optional RSS metadata.
- `src/routes/[topicName].get.tsx`: Added per-topic RSS link and autodiscovery metadata.
- `src/client/styles/rss.scss`: Styles for the `/rss` index page.
- `src/client/styles/topic.scss`: Styles for the topic-page RSS icon/header row.
- `src/client/styles/header.scss`: Styles for the header RSS menu.
- `src/client/styles/index.css`: Imports RSS styles and adds shared screen-reader-only helper class.
- `package.json`, `pnpm-lock.yaml`: Added `node-html-parser` for HN page scraping and HTML normalization.

### Verification

- Ran `pnpm lint:tsc`
- Ran `pnpm lint:eslint`
- Ran `pnpm build`
- Smoke-tested all implemented feeds over HTTP on a local preview server
- Used `agent-browser` against the built preview to verify:
  - topic-page RSS icon presence
  - topic-page autodiscovery `<link rel="alternate">`
  - `/rss` index page contents
  - live XML rendering for feed URLs in the browser

### Follow-up RSS refinements

- **Description cleanup**: RSS item descriptions no longer include relative age text like `5 minutes ago`. Feed readers already show timestamps, so this avoids stale duplicated time metadata inside the item body.
- **Comment permalink label**: `bestcomments` descriptions now label the Better HN permalink as `[comment]` instead of `[comments]`, matching the fact that the link targets a single comment.
- **Docs cleanup**: The `/rss` index page no longer documents the legacy `description=0` parameter alias.
- **Compatibility preserved**: The feed code still accepts `description=0` as an alias for disabling descriptions, to avoid breaking existing RSS consumers.
- **Implementation cleanup**: Refactored `src/lib/hnrss.ts` for clearer query parsing and shared description rendering, and simplified `src/routes/rss.get.tsx` by precomputing feed sections for rendering.

### Follow-up files changed

- `src/lib/hnrss.ts`: Removed relative age text from RSS descriptions, kept `description=0` as a compatibility alias internally, refactored shared description/link helpers, and changed comment-feed permalink text to `[comment]`.
- `src/routes/rss.get.tsx`: Removed the legacy `description=0` docs mention and simplified feed section rendering.

### Follow-up verification

- Re-ran `pnpm lint:tsc` after the RSS follow-up refinements
- Re-ran `pnpm build` after the RSS cleanup changes

## Favicon Refresh

- Replaced the app favicon set with the official Hacker News orange `Y` icon.
- Updated the public icon assets used by the existing metadata and PWA manifest endpoints.

### Files changed

- `src/public/favicon.svg`: Replaced with the official HN `y18.svg` source.
- `src/public/favicon.ico`: Replaced with the provided official ICO asset.
- `src/public/apple-touch-icon.png`: Regenerated from the official HN SVG at `180x180`.
- `src/public/android-chrome-192x192.png`: Regenerated from the official HN SVG at `192x192`.
- `src/public/android-chrome-512x512.png`: Regenerated from the official HN SVG at `512x512`.
