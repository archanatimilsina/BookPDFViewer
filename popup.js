const VIEWER_PAGE = browser.runtime.getURL("viewer.html");

document.getElementById("openUrl").addEventListener("click", () => {
  const val = document.getElementById("url").value.trim();
  if (!val) return;
  browser.tabs.create({ url: VIEWER_PAGE + "?file=" + encodeURIComponent(val) });
  window.close();
});

document.getElementById("file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  const base64 = btoa(binary);

  const key = "localpdf-" + Date.now();
  await browser.storage.local.set({ [key]: base64 });

  browser.tabs.create({
    url: VIEWER_PAGE + "?storageKey=" + encodeURIComponent(key) + "&name=" + encodeURIComponent(file.name)
  });
  window.close();
});
