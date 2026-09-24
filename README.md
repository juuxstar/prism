# PRism

PRism is a web app that authenticates with your GitHub account, shows your open pull requests on a
kanban-style board, and reviews them in a side-by-side diff viewer backed by an optional local checkout.

## Features

### Dashboard

- **GitHub Device Flow Authentication** — sign in via a one-time code, no callback URLs or client secrets
- **Team-based PR Board** — Other PRs, Alpha Review, Beta Review, Your Review, Waiting on Checks, Ready to Merge and Drafts columns
- **Team Filter** — switch between Alpha, Beta, and Gamma teams with persisted selection
- **Rich PR Details** — labels with colors, CI check squares, Cursor bot comment indicators, size dots, conflict badges
- **Drag-and-Drop** — reorder PRs within a section or move them between sections (auto-updates labels)
- **Create PR** — create new PRs from recent branches directly in the dashboard
- **Checks Polling** — automatically monitors pending CI checks and moves PRs to "Ready to Merge" when they pass
- **Pinned PRs** — keep the ones you are shepherding in the header, with their check state, from any screen
- **Worktree Overview** — local checkouts with their branch, divergence from the remote, and staged/unstaged counts

### Pull Request Detail

- **Overview Tab** — checks, labels, review decision, and review plus issue comments in one thread list
- **PR Actions** — approve, merge, close, toggle draft, and edit the title without leaving the app
- **Local Checkout** — check a PR out into a worktree, then commit or push from the Overview tab
- **PR Files and Local Files Tabs** — review the pushed diff, or whatever is currently on disk in the worktree
- **Open in Cursor** — jump from the file you are reading to the same file in the local checkout

### Diff Viewer

- **Aligned Split Diff** — both panes move on one virtual scroll axis so matching code stays level, with ribbons drawn between them
- **Minimap** — whole-file change overview; click or drag it to jump
- **Word-level Highlighting** — intra-line diffs on paired changes, via a Myers shortest-edit-script
- **Rendered Markdown Diff** — diff markdown as rendered blocks instead of source lines
- **Image and Media Diffs** — before/after panes for renderable media, rather than "binary file not shown"
- **Find in File** — Cmd/Ctrl+F searches the open file and scrolls each hit into view, sideways on long lines too
- **Inline Review Comments** — comment from the gutter, batch them into a pending review, submit when ready
- **Viewed Tracking** — mark files viewed, skip to the next unviewed one, or clear all whitespace-only files at once
- **Appearance** — light, dark or system, with a choice of syntax theme, diff font size and tab width

## Tech Stack

- **Frontend**: Vue 3 + TypeScript + Vite, class components via `vue-facing-decorator`, Vue Single File Components
- **Server**: Express + `http-proxy-middleware`, proxies the GitHub API and device-flow calls, and runs `git` for local checkouts
- **Auth**: GitHub Device Flow through the Express server, token stored in `localStorage`
- **Rendering**: `highlight.js` for syntax highlighting, `marked` + `dompurify` for markdown, hand-rolled Myers diffs for the split and word-level views

## Setup

### 1. Create a GitHub App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Open **GitHub Apps**
3. Click **"New GitHub App"**
4. Fill in the basic app details:
    - **GitHub App name**: `PRism`
    - **Homepage URL**: `https://prism.localhost:8888`
    - **Callback URL**: use the same URL as the homepage if GitHub asks for one; it is not used by the device flow
5. Disable **Webhook** unless you plan to add webhook handling separately
6. Set repository permissions for the dashboard features you want:
    - **Metadata**: read-only
    - **Contents**: read-only
    - **Pull requests**: read and write
    - **Issues**: read and write
    - **Checks**: read-only
    - **Commit statuses**: read-only
7. Click **"Create GitHub App"**
8. On the app settings page, enable **Device Flow**
9. Install the GitHub App on the repositories or organization you want the dashboard to access
10. Note the app's **Client ID**. This is different from the App ID.

### 2. Configure the Client ID

Set the `GITHUB_CLIENT_ID` environment variable to your GitHub App's Client ID:

```bash
export GITHUB_CLIENT_ID=YOUR_GITHUB_CLIENT_ID
```

For local development only, `src/server/index.ts` includes a fallback Client ID.

### 3. Install and Run

PRism only runs in Docker, behind the shared web proxy. The proxy must already be running on this host and must provide the external Docker network named `web-proxy`.
Every command goes through `npm start <command>`; `npm start -- --help` lists them.

```bash
npm install
npm start up
```

That starts the development stack from `docker-compose.dev.yml`: Vite with hot reload and the Express server in one container, served at `https://prism.localhost:8888`.
Express proxies `/api` itself and forwards everything else to Vite inside the container, so client changes appear without rebuilding the image.

To run the production image instead (built from the `Dockerfile`):

```bash
npm start up prod
```

Dev and production share the same hostname (`prism.localhost`) and container name (`prism`), so only one can run at a time. Stop one before starting the other:

```bash
npm start logs [dev|prod]
npm start down [dev|prod]
```

Git checkout actions run inside the PRism server process. The Docker Compose files mount the host checkout workspace at `/checkout-workspace` by default, and PRism detects whether that mounted directory is a Git checkout itself or a parent containing worktree subdirectories. Override `PRISM_CHECKOUT_HOST_DIR` for the host path, or `PRISM_CHECKOUT_WORKSPACE_DIR` if the in-container mount point needs to change.

`npm install` on the host is still needed for the editor and for `npm start lint` and `npm start typecheck`, which read the source rather than run it.

## Docker Production Deployment

The project includes a multi-stage Dockerfile and a `docker-compose.yml` that attaches PRism to the external `web-proxy` Docker network. PRism serves plain HTTP inside the Docker network on port `3002`; the shared proxy terminates HTTPS and serves the app at `https://prism.localhost:8888`.

### Local Compose Startup

Prerequisites:

- Docker and Docker Compose installed
- The shared proxy server running on this host
- The external Docker network `web-proxy` created by the shared proxy stack
- `GITHUB_CLIENT_ID` set in your shell

Start PRism through the proxy:

```bash
GITHUB_CLIENT_ID=YOUR_GITHUB_CLIENT_ID npm start up prod
```

Open `https://prism.localhost:8888`.

Stop it with:

```bash
npm start down prod
```

### Deploy to Ubuntu

The image is built locally for `linux/amd64` by default, exported to a compressed Docker archive, uploaded over SSH, loaded on the server, and started with the uploaded `docker-compose.yml`. The default remote application directory is `/home/ubuntu/frontlobby/prism`.

Prerequisites:

- Docker installed locally
- Docker and Docker Compose installed on the Ubuntu server
- The shared proxy running on the Ubuntu server
- The external Docker network `web-proxy` available on the Ubuntu server
- SSH access to the server
- The remote user can run Docker directly, or can become root with passwordless `sudo -E docker`

Deploy with `npm start deploy`, which runs `scripts/deploy-image.sh`:

```bash
GITHUB_CLIENT_ID=YOUR_GITHUB_CLIENT_ID npm start deploy user@YOUR_SERVER_IP_OR_DOMAIN
```

By default this:

- Builds `prism:latest` locally for `linux/amd64`
- Creates `/home/ubuntu/frontlobby/prism` on the server
- Uploads the image archive and `docker-compose.yml`
- Loads the image on the server
- Verifies that the `web-proxy` Docker network exists
- Starts PRism with `docker compose up -d --no-build`

You can override the defaults:

```bash
GITHUB_CLIENT_ID=YOUR_GITHUB_CLIENT_ID IMAGE_TAG=2026-05-11 TARGET_PLATFORM=linux/amd64 REMOTE_APP_DIR=/home/ubuntu/frontlobby/prism npm start deploy user@YOUR_SERVER_IP_OR_DOMAIN
```

If the remote SSH user cannot run Docker directly, the deploy script automatically falls back to passwordless `sudo -E docker`. If a server requires the whole remote script to run through sudo, enable remote elevation:

```bash
GITHUB_CLIENT_ID=YOUR_GITHUB_CLIENT_ID REMOTE_USE_SUDO_SU=1 npm start deploy user@YOUR_SERVER_IP_OR_DOMAIN
```

### Manual Compose Deployment

The same deployment can be run manually:

```bash
docker build -t prism:latest .
docker save prism:latest | gzip > prism.tar.gz
ssh user@YOUR_SERVER_IP_OR_DOMAIN "mkdir -p /home/ubuntu/frontlobby/prism"
scp prism.tar.gz docker-compose.yml user@YOUR_SERVER_IP_OR_DOMAIN:/home/ubuntu/frontlobby/prism/
ssh user@YOUR_SERVER_IP_OR_DOMAIN "cd /home/ubuntu/frontlobby/prism && docker load < prism.tar.gz"
ssh user@YOUR_SERVER_IP_OR_DOMAIN "cd /home/ubuntu/frontlobby/prism && PRISM_IMAGE=prism:latest GITHUB_CLIENT_ID=YOUR_GITHUB_CLIENT_ID docker compose up -d --no-build"
```

### GitHub App for Production

Update the GitHub App settings before deployment:

- **Homepage URL**: `https://prism.localhost:8888`, or the public HTTPS hostname provided by the shared proxy
- **Callback URL**: use the same URL as the homepage if configured
- **Device Flow**: enabled

The app uses GitHub's device flow, so the callback URL is not used by the login flow. Make sure the GitHub App is installed on the repositories or organization you want to manage.

## Project Structure

```
PRism/
  Dockerfile
  package.json
  npmStart.mts                  `npm start <command>`: every command this project has
  .npmrc                        Lets npm 12 install the git-hosted lint config
  docker-compose.yml            Runs PRism behind the shared web-proxy network
  docker-compose.dev.yml        Same proxy URL with Vite hot reload in development
  scripts/
    deploy-image.sh             Build locally, upload, load, and run via Docker Compose
    prepare-http-decorators.mjs Postinstall step for the http-decorators dependency
  tsconfig.json
  vite.config.ts
  eslint.config.js
  src/
    server/
      tsconfig.json             Build/editor/lint config for server TypeScript
      index.ts                  Express: mounts the API routers, proxies GitHub, serves the SPA
      api/
        AuthApi.ts              Device-flow endpoints under /api/auth
        GitApi.ts               Local checkout endpoints under /api/git
      lib/
        GitService.ts           Runs git against the mounted checkout workspace
    client/
      index.html                Vite SPA entry point
      env.d.ts                  TypeScript shims
      app/
        main.ts                 Creates the Vue app, registers global components, mounts
        AppShell.vue            Root shell that renders the active route
        App.vue                 Dashboard route — auth flow, data fetching, polling
        router.ts               Dashboard and /pull-request/:owner/:repo/:number routes
      styles/
        dashboard.css           Theme tokens and dashboard styles
        pr-diff.css             Diff viewer styles
        utilities.css           Utility classes (u-*)
      lib/
        api/
          githubClient.ts       GitHub REST + GraphQL client, caches
          gitCheckoutClient.ts  Client for the /api/git endpoints
          auth.ts               Device flow auth via /api/auth/*
        diff/
          diffLineBuilder.ts    Builds split diff lines from a patch or from whole files
          patchDiff.ts          Patch parsing and common-block detection
          myers.ts              Shortest-edit-script, shared by the word and block diffs
          wordDiff.ts           Intra-line word-level highlighting
          markdownBlocks.ts     Block-level diff of rendered markdown
          diffVirtualScroll.ts  Measured-height scroll geometry for the markdown diff
          fileSearch.ts         Find-in-file match collection and highlight painting
        theme/                  Color scheme, syntax theme, and diff display settings
        icons.ts                SVG icon definitions
        githubMarkdown.ts       Markdown rendering via marked + DOMPurify
        pinnedPrs.ts            Pinned PR storage
        localViewedFiles.ts     Viewed-file state for the Local Files tab
        pendingReviewStorage.ts Unsubmitted review comments, keyed by head SHA
      components/
        screens/
          AuthScreen.vue        Sign-in screen
          PrDetailView.vue      PR detail route — header, tabs, PR actions
          PrOverviewTab.vue     Checks, labels, comments, and local checkout actions
          PrFilesTab.vue        Diff viewer behind both the PR Files and Local Files tabs
        pr/
          AppHeader.vue         Header with repo select, type filter, team select, user info
          PrBoard.vue           Board layout, PR categorization, drag-and-drop, worktrees
          PrColumn.vue          Reusable column with drag-and-drop support
          PrItem.vue            Single PR card with labels, checks, stats
          PrFilesNavBar.vue     File picker, prev/next, and viewed controls
          PrDiffTable.vue       One side of a split diff
          DiffMinimap.vue       Whole-file change overview
          PrMarkdownDiff.vue    Rendered-markdown split diff
          PrMediaViewer.vue     Before/after panes for images and other media
          PrFileSearchBar.vue   Find-in-file bar
          CommentPopover.vue    Inline review comment thread
          PinnedPrBar.vue       Pinned PRs in the header
          SettingsPopup.vue     Appearance, syntax theme, font and tab size
          ...
```

## Architecture

```
Browser (Vite SPA)             Express Server                 GitHub
┌────────────────────┐   ┌──────────────────────────┐   ┌────────────────┐
│  App.vue           │   │  POST /api/auth/*        │──>│  Device Flow   │
│  PrDetailView.vue  │──>│  ALL  /api/github/*      │──>│  REST + GraphQL│
│  githubClient.ts   │   │  POST /api/git/*         │   │  api.github.com│
│  gitCheckoutClient │   │  Static dist/ serving    │   └────────────────┘
└────────────────────┘   └────────────┬─────────────┘
                                      │ git CLI
                                      v
                         Mounted checkout workspace
```

All GitHub API calls go through the Express proxy at `/api/github/*`, which forwards the
`Authorization` header to `api.github.com`. GitHub App device-flow calls go through `/api/auth/*`.
Local checkout actions go through `/api/git/*`, where the server runs `git` against the checkout
workspace mounted into the container.

## Commands

Every command is `npm start <command>`; `npm start -- --help` lists them with their options.

| Command                        | Description                                                               |
| ------------------------------ | ------------------------------------------------------------------------- |
| `npm start up [dev\|prod]`     | Start PRism in Docker behind the shared proxy (default `dev`, hot reload) |
| `npm start up prod`            | Build and start the production image                                      |
| `npm start -- up --detach`     | Start in the background instead of following the output                   |
| `npm start down [dev\|prod]`   | Stop and remove the PRism container                                       |
| `npm start logs [dev\|prod]`   | Follow the PRism container's logs                                         |
| `npm start build`              | Build the production Docker image                                         |
| `npm start deploy <user@host>` | Build, upload and restart the image on a server over SSH                  |
| `npm start lint`               | Run ESLint (`npm start -- lint --fix` to apply fixes)                     |
| `npm start typecheck`          | Typecheck the client (`vue-tsc`) and the server (`tsc`)                   |

## Security Notes

- Only the GitHub App client ID is configured server-side — no client secret needed for device flow
- The token is stored in the browser's `localStorage`
- The Express server proxies requests without storing tokens
- Repository access is controlled by the GitHub App installation and permissions

## Troubleshooting

| Issue                         | Solution                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| "Failed to start device flow" | Verify your GitHub App Client ID in `GITHUB_CLIENT_ID` and that Device Flow is enabled |
| "The device code has expired" | Codes expire after ~15 minutes — click sign in again                                   |
| "Authorization was denied"    | You clicked Cancel on the GitHub page — try again                                      |
| "Session expired"             | Sign out and sign in again                                                             |
| No PRs showing                | Ensure the GitHub App is installed on the repositories and has pull request access     |
| HMR not updating in dev       | Confirm `VITE_DEV_ORIGIN` matches your proxy URL (`https://prism.localhost:8888`)      |
| `web-proxy` network missing   | Start the shared proxy stack first; PRism's Compose file expects that external network |
| `prism.localhost:8888` fails  | Confirm the shared proxy is running and the PRism container is attached to `web-proxy` |

## License

MIT
