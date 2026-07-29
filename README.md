# PRism

PRism is a web app that authenticates with your GitHub account and displays your open pull requests in a kanban-style board.

## Features

- **GitHub Device Flow Authentication** — sign in via a one-time code, no callback URLs or client secrets
- **Team-based PR Board** — Alpha Review, Beta Review, Your Review, Waiting on Checks, Ready to Merge columns
- **Team Filter** — switch between Alpha, Beta, and Gamma teams with persisted selection
- **Rich PR Details** — labels with colors, CI check squares, Cursor bot comment indicators, size dots, conflict badges
- **Drag-and-Drop** — reorder PRs within a section or move them between sections (auto-updates labels)
- **Create PR** — create new PRs from recent branches directly in the dashboard
- **Checks Polling** — automatically monitors pending CI checks and moves PRs to "Ready to Merge" when they pass
- **Draft View** — toggle between ready PRs and drafts
- **Dark Theme** — GitHub-inspired dark UI

## Tech Stack

- **Frontend**: Vue 3 + TypeScript + Vite, class components via `vue-facing-decorator`, Vue Single File Components
- **Server**: Express + `http-proxy-middleware`, proxies all GitHub API and device-flow calls
- **Auth**: GitHub Device Flow through the Express server, token stored in `localStorage`

## Setup

### 1. Create a GitHub App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Open **GitHub Apps**
3. Click **"New GitHub App"**
4. Fill in the basic app details:
    - **GitHub App name**: `PRism`
    - **Homepage URL**: `https://prism.localhost:8888` for the Docker proxy startup, or `http://localhost:5173` for Vite-only development
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

### 3. Install and Run with the Local Proxy

The default local startup is Docker Compose behind the shared web proxy. The proxy must already be running on this host and must provide the external Docker network named `web-proxy`.

```bash
npm install
npm run start:docker
```

This builds the PRism image, starts the `prism` service on the shared `web-proxy` network, and lets the host proxy serve it at `https://prism.localhost:8888`.

Git checkout actions run inside the PRism server process. The Docker Compose files mount the host checkout workspace at `/checkout-workspace` by default, and PRism detects whether that mounted directory is a Git checkout itself or a parent containing worktree subdirectories. Override `PRISM_CHECKOUT_HOST_DIR` for the host path, or `PRISM_CHECKOUT_WORKSPACE_DIR` if the in-container mount point needs to change.

Useful compose commands:

```bash
npm run logs:docker
npm run stop:docker
```

For Vite development with hot reload through the same proxy URL, stop the production container first, then:

```bash
npm run dev:docker
```

Open `https://prism.localhost:8888`. Express proxies `/api` directly and forwards everything else to the Vite dev server inside the container, so client changes appear without rebuilding the image.

```bash
npm run logs:dev:docker
npm run stop:dev:docker
```

Dev and production share the same hostname (`prism.localhost`) and container name (`prism`). Only one can run at a time.

For Vite development without the proxy, you can still run:

```bash
npm run dev
```

That starts the Vite dev server on port 5173 and the Express API proxy on port 3002. Open `http://localhost:5173` in your browser.

### 4. Production Build Without Docker

```bash
npm run build    # builds frontend to dist/
npm start        # runs Express serving dist/ + API proxy
```

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
GITHUB_CLIENT_ID=YOUR_GITHUB_CLIENT_ID npm run start:docker
```

Open `https://prism.localhost:8888`.

Stop it with:

```bash
npm run stop:docker
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

Deploy with the helper script:

```bash
GITHUB_CLIENT_ID=YOUR_GITHUB_CLIENT_ID ./scripts/deploy-image.sh user@YOUR_SERVER_IP_OR_DOMAIN
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
GITHUB_CLIENT_ID=YOUR_GITHUB_CLIENT_ID IMAGE_TAG=2026-05-11 TARGET_PLATFORM=linux/amd64 REMOTE_APP_DIR=/home/ubuntu/frontlobby/prism ./scripts/deploy-image.sh user@YOUR_SERVER_IP_OR_DOMAIN
```

If the remote SSH user cannot run Docker directly, the deploy script automatically falls back to passwordless `sudo -E docker`. If a server requires the whole remote script to run through sudo, enable remote elevation:

```bash
GITHUB_CLIENT_ID=YOUR_GITHUB_CLIENT_ID REMOTE_USE_SUDO_SU=1 ./scripts/deploy-image.sh user@YOUR_SERVER_IP_OR_DOMAIN
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
  docker-compose.yml            Runs PRism behind the shared web-proxy network
  docker-compose.dev.yml        Same proxy URL with Vite hot reload in development
  scripts/
    deploy-image.sh             Build locally, upload, load, and run via Docker Compose
  tsconfig.json
  vite.config.ts
  eslint.config.js
  src/
    server/
      tsconfig.json              Build/editor/lint config for server TypeScript
      index.ts                   Express: GitHub App auth proxy + GitHub API proxy + static serving
    client/
      index.html                 Vite SPA entry point
      main.ts                    Creates Vue app, registers components, mounts
      App.vue                    Root component — auth flow, data fetching, polling
      env.d.ts                   TypeScript shims
      assets/
        dashboard.css            All styles (GitHub dark theme)
      lib/
        githubClient.ts          GitHub REST + GraphQL client, caches
        icons.ts                 SVG icon definitions
      services/
        auth.ts                  Device flow auth via /api/auth/* endpoints
      components/
        AppHeader.vue            Header with repo select, type filter, team select, user info
        AuthScreen.vue           Sign-in screen
        CreatePrSection.vue      Create PRs from recent branches
        DeviceScreen.vue         Device code verification UI
        ErrorScreen.vue          Error display with retry
        LoadingScreen.vue        Loading spinner
        PrBoard.vue              Main board layout, PR categorization, drag-and-drop
        PrColumn.vue             Reusable column with drag-and-drop support
        PrItem.vue               Single PR card with labels, checks, stats
        RateLimitBanner.vue      Rate limit warning banner
        ...
```

## Architecture

```
Browser (Vite SPA)              Express Server               GitHub
┌──────────────────┐     ┌────────────────────────┐    ┌──────────────┐
│  App.vue         │     │  POST /api/auth/*      │───>│ Device Flow  │
│  GitHubClient.ts │────>│  ALL  /api/github/*    │───>│ REST + GQL   │
│  auth.ts         │     │  Static dist/ serving  │    │ api.github.com│
└──────────────────┘     └────────────────────────┘    └──────────────┘
```

All GitHub API calls go through the Express proxy at `/api/github/*`, which forwards the `Authorization` header to `api.github.com`. GitHub App device-flow calls go through `/api/auth/*`.

## Scripts

| Command                | Description                                                       |
| ---------------------- | ----------------------------------------------------------------- |
| `npm run dev`             | Start Vite dev server + Express server on localhost               |
| `npm run dev:docker`      | Start Vite dev through Docker Compose and the shared proxy        |
| `npm run start:docker`    | Start production PRism through Docker Compose and the shared proxy |
| `npm run stop:docker`     | Stop the production Docker Compose PRism service                  |
| `npm run stop:dev:docker` | Stop the development Docker Compose PRism service                 |
| `npm run logs:docker`     | Follow production Docker Compose logs for the PRism service       |
| `npm run logs:dev:docker` | Follow development Docker Compose logs for the PRism service      |
| `npm run build`        | Build frontend to `dist/`                                   |
| `npm start`            | Run Express serving `dist/` + API proxy without Docker      |
| `npm run typecheck`    | Run `vue-tsc` type checking                                 |

## Security Notes

- Only the GitHub App client ID is configured server-side — no client secret needed for device flow
- The token is stored in the browser's `localStorage`
- The Express server proxies requests without storing tokens
- Repository access is controlled by the GitHub App installation and permissions

## Troubleshooting

| Issue                         | Solution                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------ |
| "Failed to start device flow" | Verify your GitHub App Client ID in `GITHUB_CLIENT_ID` and that Device Flow is enabled |
| "The device code has expired" | Codes expire after ~15 minutes — click sign in again                           |
| "Authorization was denied"    | You clicked Cancel on the GitHub page — try again                              |
| "Session expired"             | Sign out and sign in again                                                     |
| No PRs showing                | Ensure the GitHub App is installed on the repositories and has pull request access |
| CORS errors                   | Make sure the Express server is running (`npm run dev` starts both)            |
| HMR not updating in dev:docker | Confirm `VITE_DEV_ORIGIN` matches your proxy URL (`https://prism.localhost:8888`) |
| `web-proxy` network missing  | Start the shared proxy stack first; PRism's Compose file expects that external network |
| `prism.localhost:8888` fails | Confirm the shared proxy is running and the PRism container is attached to `web-proxy` |

## License

MIT
