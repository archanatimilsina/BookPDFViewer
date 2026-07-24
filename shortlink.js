// Shared by background.js, popup.js, and viewer.js (all three load this
// as a plain script before their own script, so everything here just
// becomes an ordinary global in whichever page includes it).
//
// Putting a source PDF's full URL directly in viewer.html's query string
// makes the address bar show a long, encoded mess. Instead we stash the
// URL under a short random key — in session storage when available, so
// it lives in memory only and is gone as soon as the browser closes —
// and hand viewer.html just that key. viewer.js looks the URL back up
// and deletes the entry once it's read it.

const VIEWER_PAGE = browser.runtime.getURL("viewer.html");
const DOC_KEY_PREFIX = "doc:";
const DOC_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

function docStorageArea() {
  return (browser.storage.session && browser.storage.session.set)
    ? browser.storage.session
    : browser.storage.local;
}

function makeDocKey() {
  return DOC_KEY_PREFIX + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Stashes `url` and resolves to a short viewer.html link pointing at it.
// If the storage write ever fails, falls back to the old, longer link
// rather than letting a storage hiccup stop a PDF from opening.
async function buildViewerLink(url) {
  const key = makeDocKey();
  try {
    await docStorageArea().set({ [key]: { url, ts: Date.now() } });
    return VIEWER_PAGE + "?doc=" + encodeURIComponent(key);
  } catch (e) {
    return VIEWER_PAGE + "?file=" + encodeURIComponent(url);
  }
}

// Best-effort sweep of any handoff entries that were never read back
// (e.g. the tab was closed before viewer.js loaded). Safe to call any
// time; only touches entries under our own key prefix.
async function cleanupStaleDocs() {
  try {
    const store = docStorageArea();
    const all = await store.get(null);
    const cutoff = Date.now() - DOC_MAX_AGE_MS;
    const stale = Object.keys(all).filter((k) => {
      const v = all[k];
      return k.startsWith(DOC_KEY_PREFIX) && v && v.ts && v.ts < cutoff;
    });
    if (stale.length) await store.remove(stale);
  } catch (e) {
  }
}
