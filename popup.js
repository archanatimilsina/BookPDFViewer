// VIEWER_PAGE and buildViewerLink come from shortlink.js, loaded
// before this file (see popup.html).
const urlInput = document.getElementById("url");
const urlError = document.getElementById("urlError");

function showUrlError(msg) {
  urlError.textContent = msg;
  urlError.style.display = "block";
}

function clearUrlError() {
  urlError.style.display = "none";
}

urlInput.addEventListener("input", clearUrlError);

document.getElementById("openUrl").addEventListener("click", async () => {
  const val = urlInput.value.trim();
  if (!val) return;

  let parsed;
  try {
    parsed = new URL(val);
  } catch (e) {
    showUrlError("That doesn't look like a valid URL. Include the full address, e.g. https://example.com/file.pdf");
    return;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    showUrlError("Please use an http:// or https:// link to a PDF.");
    return;
  }

  clearUrlError();
  const target = await buildViewerLink(val);
  browser.tabs.create({ url: target });
  window.close();
});

document.getElementById("openLocal").addEventListener("click", () => {
  // Opens the viewer's own landing screen (Browse button + drag & drop),
  // which runs in a real tab and loads the file straight into the book view.
  browser.tabs.create({ url: VIEWER_PAGE });
  window.close();
});
