// apps/desktop/src/main/auth/sign-in-browser.ts
import { BrowserWindow } from "electron";

// The one Electron-heavy piece: a minimal browser (address bar + <webview>) the user
// drives to log into any site. Cookies land in the shared `persist:auth` partition,
// which the auth manager reads. webviewTag is enabled ONLY here, never on the main window.

const AUTH_PARTITION = "persist:auth";

let current: BrowserWindow | null = null;
let currentClose: Promise<void> | null = null;

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
  webview{flex:1;border:0}
</style></head><body>
  <div id="bar">
    <button id="back">‹</button><button id="fwd">›</button>
    <input id="url" placeholder="Enter a site, e.g. youtube.com" />
    <button id="go">Go</button>
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
  // The <webview> hosts arbitrary sites the user logs into. Keep real login popups
  // working (some OAuth flows use them) but constrain any window the guest opens to
  // http(s) — deny other schemes — so the guest can't spawn arbitrary/other-scheme windows.
  win.webContents.on("did-attach-webview", (_e, guest) => {
    guest.setWindowOpenHandler(({ url }) =>
      /^https?:\/\//i.test(url) ? { action: "allow" } : { action: "deny" },
    );
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
