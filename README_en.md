# Model Token Usage Monitor

English | [简体中文](./README.md)

A Manifest V3 browser extension for Microsoft Edge / Chromium to monitor model token and quota usage across **Antigravity**, **Gemini Web**, **Tencent Cloud TokenHub**, and **Goose Token (token.woa.com)** in a single popup dashboard.

## Features

- **Unified Multi-Channel Dashboard**: Adaptive two-column layout displaying quota progress bars, used/remaining amounts, reset times, and status badges across providers.
- **Instant Snapshot & Live Refresh**: Displays cached usage immediately when opening the popup while silently refreshing live data in the background; supports both global and per-channel refresh.
- **Supported Providers**:
  - **Antigravity**: Queries `GetUserQuotaSummary` using browser session cookies (`SAPISIDHASH` authentication), automatically discovers the query API key from the official client, and shows 5-hour and weekly quota windows grouped by model. No manual key configuration is needed.
  - **Gemini Web**: Reads quota data embedded in the usage page using browser session cookies, displaying subscription tier and 5-hour / weekly usage pools. Captured `GEMINI_WEB_GRAPHQL` parameters serve as a fallback.
  - **Tencent Cloud TokenHub**: Connects directly to `DescribeTokenPlanPersonalPackage` with TC3-HMAC-SHA256 signing, supporting `personal` and `personal-hunyuan` product types with built-in credential testing.
  - **Goose Token**: Reuses the browser's OA session, fetches a fresh `X-Page-Token` from the homepage in the background, and calls `query-quota?platform=all` directly without opening the dashboard. Only if the background session fails does it query within an existing signed-in tab, or create a temporary inactive tab that closes afterwards. Displays monthly spending quota usage and used/remaining amounts in RMB. Uses the dashboard's `personal.usage_rate`, which represents spending rather than raw token counts. No reset countdown is shown when the API provides no reset timestamp.
- **Automatic Parameter Capture**: The background service worker listens to requests from regular browser tabs to Antigravity and Gemini Web, automatically syncing `authUser`, `apiKey`, `querySignature`, and `x-goog-ext-525001261-bin` headers to minimize manual setup.
- **Customizable Settings**: Enable or disable individual channels and reorder cards in the settings view; all settings and cached snapshots are stored locally in `chrome.storage.local`.
- **Developer Options**: Disabled by default. Enable and save this option to show the expandable raw response section in channel cards.

## Tech Stack

- **UI**: React 19, TypeScript, Tailwind CSS v4, Lucide React
- **Build**: Vite (separate builds for Popup and Background Service Worker)
- **Testing**: Vitest
- **Platform**: Manifest V3 (`cookies`, `storage`, `declarativeNetRequestWithHostAccess`, `webRequest`, `scripting`)

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Build the Extension

```bash
npm run build
```

The built extension will be output to `dist/`. For watch mode during development:

```bash
npm run dev
```

### 3. Load into Edge / Chrome

1. Open `edge://extensions` (or `chrome://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `dist/` directory.
4. Click the extension icon in the browser toolbar to open the dashboard.

## Usage

- **Antigravity**: Make sure you are signed in to the web app in the same browser. If authentication fails or parameters expire, visiting the web app once allows the extension to auto-capture updated request parameters.
- **Gemini Web**: Sign in to Gemini in the same browser, then open or refresh the extension to query usage. There is no need to click Usage limits. The extension reads the quota data embedded in `/usage` in the background without opening a tab. Previously captured query parameters remain stored locally as a fallback if the page format changes.
- **Tencent Cloud TokenHub**: Open the Settings view from the top-right gear icon, enter your Tencent Cloud `SecretId`, `SecretKey`, region (default `ap-guangzhou`), and select product types. You can test the credentials before saving.
- **Goose Token**: Sign in to `https://token.woa.com/` via OA in the same browser, then refresh the extension; no API key is required. The channel is enabled by default and can be disabled or reordered in Settings. Expired sessions show a login button; hidden or unlimited quotas show an explanation instead of a percentage.
- **Updating an existing extension**: Rebuild and reload `dist/` on the extensions management page, allowing access to `token.woa.com` and `www.gstatic.com`. The new `scripting` permission enables queries within the dashboard page; Google's static resource permission enables automatic Antigravity client parameter discovery.

Normal Tencent dashboard refreshes make two background HTTP requests: fetch the homepage token, then call the quota API, without opening a tab. The API rejects `Sec-Fetch-Site: none` generated by extension requests; a DNR rule removes that header only for this extension's exact quota request while retaining OA cookies and `X-Page-Token`. Expired sessions still require OA authentication in a browser page.

## Scripts

```bash
npm run typecheck   # Run TypeScript type checking (tsc --noEmit)
npm test            # Run Vitest unit tests
npm run build       # Type-check and build both Popup and Background bundles
```

## Project Structure

```text
├── public/                   # manifest.json and extension icons
├── src/
│   ├── background/           # Service worker, DNR header rules, and auto-capture
│   ├── popup/                # Popup dashboard and settings UI components
│   ├── providers/            # Antigravity / Gemini Web / TokenHub / Goose Token adapters
│   ├── types/                # Shared usage, settings, and runtime message types
│   └── utils/                # Crypto/signing, formatting, layout, and storage helpers
├── tests/                    # Vitest unit tests
├── vite.config.ts            # Popup Vite configuration
└── vite.background.config.ts # Background service worker Vite configuration
```

## Privacy & Security

All credentials (such as Tencent Cloud `SecretId` / `SecretKey`) and cached usage snapshots are stored strictly locally in `chrome.storage.local`. Requests are sent directly to the respective provider endpoints without any third-party relay server.
