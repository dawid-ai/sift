// apps/desktop/src/main/auth/sign-in-browser.ts
import { BrowserWindow, session } from "electron";

// The one Electron-heavy piece: a minimal browser (address bar + <webview>) the user
// drives to log into any site. Cookies land in the shared `persist:auth` partition,
// which the auth manager reads. webviewTag is enabled ONLY here, never on the main window.
//
// The guest hosts arbitrary remote content, so it runs under an explicit policy rather
// than Electron's defaults:
//   - navigation and popups are confined to http(s); every other scheme is denied so the
//     guest can't hand a URL to another application through the OS;
//   - downloads are cancelled — this window exists to obtain cookies, not files;
//   - every permission request (camera, microphone, geolocation, notifications, MIDI,
//     USB, …) is denied: signing in never needs one;
//   - popups inherit a locked-down webPreferences instead of the opener's.

const AUTH_PARTITION = "persist:auth";

/** Sentinel the toolbar's "Clear site data" button opens. The toolbar page has no preload
 * (it is a data: URL, so there is no build entry for one), so a denied `window.open` is
 * the cheapest channel back to the main process.
 * ponytail: swap for a real preload + IPC if this toolbar ever grows a second action. */
const CLEAR_SENTINEL = "about:blank#sift-clear-site-data";

let current: BrowserWindow | null = null;
let currentClose: Promise<void> | null = null;
/** Set once per process: the auth partition's session is shared across windows. */
let partitionPolicyApplied = false;

function isHttp(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** Denies downloads and permission requests for everything on the auth partition. */
function applyPartitionPolicy(): void {
  if (partitionPolicyApplied) return;
  partitionPolicyApplied = true;
  const authSession = session.fromPartition(AUTH_PARTITION);
  authSession.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false);
  });
  authSession.setPermissionCheckHandler(() => false);
  authSession.on("will-download", (event) => {
    // A sign-in flow has no reason to write files to disk, and the user never chose a
    // download target here.
    event.preventDefault();
  });
}

/** Wipes cookies, storage, and cache for the auth partition, then resets the guest. */
async function clearSiteData(win: BrowserWindow): Promise<void> {
  const authSession = session.fromPartition(AUTH_PARTITION);
  await authSession.clearStorageData();
  await authSession.clearCache();
  if (win.isDestroyed()) return;
  await win.webContents.executeJavaScript(
    `(() => {
      const wv = document.getElementById('wv');
      const url = document.getElementById('url');
      if (wv) wv.loadURL('about:blank');
      if (url) url.value = '';
      const s = document.getElementById('status');
      if (s) { s.textContent = 'Site data cleared'; setTimeout(() => { s.textContent = ''; }, 4000); }
    })()`,
  );
}

/** Inline toolbar page: an address bar driving a <webview> on the auth partition.
 * Loaded from a data: URL so there's no separate build entry/asset. The inline script
 * runs in the page (no Node needed) and only touches the <webview> DOM element. */
function toolbarHtml(): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
  html,body{margin:0;height:100%;display:flex;flex-direction:column;font-family:system-ui,sans-serif}
  #bar{display:flex;gap:6px;padding:6px;background:#222;align-items:center}
  #bar button{background:#333;color:#eee;border:1px solid #555;border-radius:4px;padding:4px 8px;cursor:pointer}
  #url{flex:1;padding:6px 8px;border-radius:4px;border:1px solid #555;background:#111;color:#eee}
  #status{color:#9ae6b4;font-size:12px;min-width:0;white-space:nowrap}
  webview{flex:1;border:0}
</style></head><body>
  <div id="bar">
    <button id="back">‹</button><button id="fwd">›</button>
    <input id="url" placeholder="Enter a site, e.g. youtube.com" />
    <button id="go">Go</button>
    <span id="status"></span>
    <button id="clear" title="Sign out everywhere and delete all cookies, storage, and cache for this browser">Clear site data</button>
  </div>
  <webview id="wv" partition="${AUTH_PARTITION}" allowpopups src="about:blank"></webview>
  <script>
    const wv = document.getElementById('wv');
    const url = document.getElementById('url');
    function norm(v){ v=v.trim(); if(!v) return ''; return /^https?:\\/\\//i.test(v)?v:'https://'+v; }
    function go(){ const u=norm(url.value); if(u) wv.loadURL(u); }
    document.getElementById('go').onclick = go;
    url.addEventListener('keydown', e => { if(e.key==='Enter') go(); });
    document.getElementById('back').onclick = () => { if(wv.canGoBack()) wv.goBack(); };
    document.getElementById('fwd').onclick = () => { if(wv.canGoForward()) wv.goForward(); };
    document.getElementById('clear').onclick = () => { window.open(${JSON.stringify(CLEAR_SENTINEL)}); };
    wv.addEventListener('did-navigate', e => { url.value = e.url; });
    wv.addEventListener('did-navigate-in-page', e => { url.value = e.url; });
    url.focus();
  </script>
</body></html>`;
}

/** Opens (or focuses) the sign-in browser. Resolves when the window is closed. */
export function openSignInBrowser(): Promise<void> {
  if (current) {
    current.focus();
    return currentClose ?? Promise.resolve();
  }
  applyPartitionPolicy();
  const win = new BrowserWindow({
    width: 1100,
    height: 850,
    autoHideMenuBar: true,
    title: "Sign in",
    webPreferences: {
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // The toolbar page itself never navigates; its only `window.open` is the clear-data
  // sentinel, which is handled here and denied.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url === CLEAR_SENTINEL) void clearSiteData(win);
    return { action: "deny" };
  });
  // The <webview> hosts arbitrary sites the user logs into. Keep real login popups
  // working (some OAuth flows use them) but constrain both navigation and any window the
  // guest opens to http(s) — deny other schemes — so the guest can't spawn arbitrary or
  // other-scheme windows, and give popups their own locked-down preferences rather than
  // inheriting the opener's.
  win.webContents.on("did-attach-webview", (_e, guest) => {
    guest.setWindowOpenHandler(({ url }) =>
      isHttp(url)
        ? {
            action: "allow",
            overrideBrowserWindowOptions: {
              autoHideMenuBar: true,
              webPreferences: {
                partition: AUTH_PARTITION,
                contextIsolation: true,
                nodeIntegration: false,
                webviewTag: false,
                sandbox: true,
              },
            },
          }
        : { action: "deny" },
    );
    guest.on("will-navigate", (event, url) => {
      if (!isHttp(url)) event.preventDefault();
    });
    guest.on("will-redirect", (event, url) => {
      if (!isHttp(url)) event.preventDefault();
    });
  });
  current = win;
  currentClose = new Promise<void>((resolve) => {
    win.on("closed", () => {
      current = null;
      currentClose = null;
      resolve();
    });
  });
  void win.loadURL(
    "data:text/html;charset=utf-8," + encodeURIComponent(toolbarHtml()),
  );
  return currentClose;
}
