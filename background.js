const VIEWER_PAGE = browser.runtime.getURL("viewer.html");

function isAlreadyOurViewer(url) {
  return url.startsWith(VIEWER_PAGE) || url.startsWith("moz-extension://");
}

function looksLikePdfUrl(url) {
  try {
    const u = new URL(url);
    return /\.pdf($|[?#])/i.test(u.pathname) || /\.pdf($|[?#])/i.test(u.search);
  } catch (e) {
    return false;
  }
}

let disabledUrlsCache = new Set();

async function refreshDisabledCache() {
  try {
    const stored = await browser.storage.local.get("disabledUrls");
    disabledUrlsCache = new Set(stored.disabledUrls || []);
  } catch (e) {
    disabledUrlsCache = new Set();
  }
}
refreshDisabledCache();

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.disabledUrls) {
    disabledUrlsCache = new Set(changes.disabledUrls.newValue || []);
  }
});

browser.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.type !== "main_frame") return {};
    if (isAlreadyOurViewer(details.url)) return {};
    if (disabledUrlsCache.has(details.url)) return {};

    const headers = details.responseHeaders || [];
    let contentType = "";
    let disposition = "";

    for (const h of headers) {
      const name = h.name.toLowerCase();
      if (name === "content-type") contentType = (h.value || "").toLowerCase();
      if (name === "content-disposition") disposition = (h.value || "").toLowerCase();
    }

    const isPdfContentType = contentType.includes("application/pdf");
    const isForcedDownload = disposition.includes("attachment");

    if ((isPdfContentType || looksLikePdfUrl(details.url)) && !isForcedDownload) {
      const target = VIEWER_PAGE + "?file=" + encodeURIComponent(details.url);
      return { redirectUrl: target };
    }

    return {};
  },
  { urls: ["<all_urls>"], types: ["main_frame"] },
  ["blocking", "responseHeaders"]
);


browser.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === "open-pdf" && msg.url) {
    const target = VIEWER_PAGE + "?file=" + encodeURIComponent(msg.url);
    return browser.tabs.update(sender.tab ? sender.tab.id : undefined, { url: target })
      .catch(() => browser.tabs.create({ url: target }));
  }
});