(function () {
  "use strict";

  const pdfjsLib = window.pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = browser.runtime.getURL("pdfjs/pdf.worker.min.js");

  const els = {
    landing: document.getElementById("landing"),
    dropZone: document.getElementById("dropZone"),
    browseBtn: document.getElementById("browseBtn"),
    fileInput: document.getElementById("fileInput"),
    loading: document.getElementById("loading"),
    loadingText: document.getElementById("loadingText"),
    progressFill: document.getElementById("progressFill"),
    bookWrap: document.getElementById("bookWrap"),
    book: document.getElementById("book"),
    leftPage: document.getElementById("leftPage"),
    rightPage: document.getElementById("rightPage"),
    leftImg: document.getElementById("leftImg"),
    rightImg: document.getElementById("rightImg"),
    flipPanel: document.getElementById("flipPanel"),
    flipFrontImg: document.getElementById("flipFrontImg"),
    flipBackImg: document.getElementById("flipBackImg"),
    errorBox: document.getElementById("errorBox"),
    errorText: document.getElementById("errorText"),
    docTitle: document.getElementById("docTitle"),
    prevBtn: document.getElementById("prevBtn"),
    nextBtn: document.getElementById("nextBtn"),
    edgePrev: document.getElementById("edgePrev"),
    edgeNext: document.getElementById("edgeNext"),
    pageCurrent: document.getElementById("pageCurrent"),
    pageTotal: document.getElementById("pageTotal"),
    fsBtn: document.getElementById("fsBtn"),
    disableBtn: document.getElementById("disableBtn"),
    stage: document.getElementById("stage"),
    zoomInBtn: document.getElementById("zoomInBtn"),
    zoomOutBtn: document.getElementById("zoomOutBtn"),
    zoomLevelLabel: document.getElementById("zoomLevelLabel")
  };

  function hideAllScreens() {
    els.landing.style.display = "none";
    els.loading.style.display = "none";
    els.bookWrap.style.display = "none";
    els.errorBox.style.display = "none";
  }

  function showLanding() {
    hideAllScreens();
    els.landing.style.display = "flex";
  }

  function showError(msg) {
    hideAllScreens();
    els.errorBox.style.display = "flex";
    els.errorText.textContent = msg;
  }

  function describeOpenError(e) {
    const raw = (e && e.message) ? e.message : String(e || "");
    const statusMatch = raw.match(/\((\d{3})\)/);
    const status = statusMatch ? statusMatch[1] : null;

    if (status === "403" || status === "401") {
      return "The website hosting this PDF blocked the download request " +
        "(server responded " + status + "). This usually means the site " +
        "only allows the file to be fetched from its own pages, not " +
        "directly. Try downloading the PDF first, then drag the " +
        "downloaded file onto this viewer instead.";
    }
    if (status === "404") {
      return "That PDF couldn't be found (404) — the link may be broken or the file may have moved.";
    }
    return "This PDF could not be opened. " + raw;
  }

  function showLoading() {
    hideAllScreens();
    els.loading.style.display = "flex";
  }

  function setProgress(fraction, text) {
    els.progressFill.style.width = Math.round(fraction * 100) + "%";
    if (text) els.loadingText.textContent = text;
  }

  async function getSourceFromParams(params) {
    const storageKey = params.get("storageKey");
    if (storageKey) {
      const stored = await browser.storage.local.get(storageKey);
      const base64 = stored[storageKey];
      if (!base64) throw new Error("The stored PDF data could not be found. Please try opening the file again.");
      browser.storage.local.remove(storageKey);
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return { data: bytes, title: params.get("name") || "Document" };
    }

    const fileUrl = params.get("file");
    if (!fileUrl) return null;
    let name = params.get("name");
    if (!name) {
      try {
        const u = new URL(fileUrl);
        name = decodeURIComponent(u.pathname.split("/").pop() || "Document");
      } catch (e) {
        name = "Document";
      }
    }
    return { url: fileUrl, title: name };
  }

  async function fileToSource(file) {
    const buf = await file.arrayBuffer();
    return { data: new Uint8Array(buf), title: file.name || "Document" };
  }

  let pdfDoc = null;
  let pageImages = [];
  let pageAspect = 1;
  let leftIndex = 0;
  let isFlipping = false;

  const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  const RENDER_HEIGHT = Math.round(2400 * DPR);

  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 3.0;
  const ZOOM_STEP = 0.25;
  let zoomLevel = 1.0;

  async function renderPageToImage(pageNum, useLosslessPng) {
    const page = await pdfDoc.getPage(pageNum);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = RENDER_HEIGHT / baseViewport.height;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport }).promise;
    const dataUrl = useLosslessPng
      ? canvas.toDataURL("image/png")
      : canvas.toDataURL("image/jpeg", 0.96);
    canvas.width = 0;
    canvas.height = 0;
    return dataUrl;
  }

  function blankPageDataUrl() {
    const canvas = document.createElement("canvas");
    canvas.width = 100;
    canvas.height = Math.round(100 / pageAspect);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f6efe3";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  }

  function computePageSize() {
    const stageRect = els.stage.getBoundingClientRect();
    const availW = stageRect.width * 0.9;
    const availH = stageRect.height * 0.9;

    let pageH = availH;
    let pageW = pageH * pageAspect;
    if (pageW * 2 > availW) {
      pageW = availW / 2;
      pageH = pageW / pageAspect;
    }
    return { pageW: Math.floor(pageW), pageH: Math.floor(pageH) };
  }

  function applySize() {
    const { pageW, pageH } = computePageSize();
    els.book.style.width = pageW * 2 + "px";
    els.book.style.height = pageH + "px";
    els.leftPage.style.width = pageW + "px";
    els.leftPage.style.height = pageH + "px";
    els.rightPage.style.width = pageW + "px";
    els.rightPage.style.height = pageH + "px";
    els.flipPanel.style.width = pageW + "px";
    els.flipPanel.style.height = pageH + "px";
    applyZoom();
    return { pageW, pageH };
  }

  function applyZoom() {
    els.book.style.transform = "scale(" + zoomLevel + ")";
    els.book.style.transformOrigin = "center center";
    if (els.zoomLevelLabel) {
      els.zoomLevelLabel.textContent = Math.round(zoomLevel * 100) + "%";
    }
    if (els.zoomInBtn) els.zoomInBtn.disabled = zoomLevel >= ZOOM_MAX - 1e-9;
    if (els.zoomOutBtn) els.zoomOutBtn.disabled = zoomLevel <= ZOOM_MIN + 1e-9;

   
    if (els.stage) {
      els.stage.style.overflow = zoomLevel > 1 ? "auto" : "hidden";
    }
  }

  function setZoom(level) {
    zoomLevel = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, level));
    applyZoom();
  }

  function zoomIn() { setZoom(zoomLevel + ZOOM_STEP); }
  function zoomOut() { setZoom(zoomLevel - ZOOM_STEP); }
  function resetZoom() { setZoom(1.0); }

  function ensureZoomControls() {
    if (els.zoomInBtn && els.zoomOutBtn) {
      els.zoomInBtn.addEventListener("click", zoomIn);
      els.zoomOutBtn.addEventListener("click", zoomOut);
      return;
    }

    const toolbar = els.fsBtn ? els.fsBtn.parentElement : null;
    if (!toolbar) return;

    const group = document.createElement("div");
    group.className = "zoomControls";
    group.style.display = "inline-flex";
    group.style.alignItems = "center";
    group.style.gap = "4px";
    group.style.marginRight = "8px";

    const zoomOutBtn = document.createElement("button");
    zoomOutBtn.id = "zoomOutBtn";
    zoomOutBtn.type = "button";
    zoomOutBtn.title = "Zoom out";
    zoomOutBtn.textContent = "\u2212";
    zoomOutBtn.className = els.fsBtn.className || "";

    const zoomLabel = document.createElement("span");
    zoomLabel.id = "zoomLevelLabel";
    zoomLabel.textContent = "100%";
    zoomLabel.style.minWidth = "42px";
    zoomLabel.style.textAlign = "center";
    zoomLabel.style.fontSize = "0.85em";
    zoomLabel.style.userSelect = "none";

    const zoomInBtn = document.createElement("button");
    zoomInBtn.id = "zoomInBtn";
    zoomInBtn.type = "button";
    zoomInBtn.title = "Zoom in";
    zoomInBtn.textContent = "+";
    zoomInBtn.className = els.fsBtn.className || "";

    group.appendChild(zoomOutBtn);
    group.appendChild(zoomLabel);
    group.appendChild(zoomInBtn);

    toolbar.insertBefore(group, els.fsBtn);

    els.zoomInBtn = zoomInBtn;
    els.zoomOutBtn = zoomOutBtn;
    els.zoomLevelLabel = zoomLabel;

    zoomInBtn.addEventListener("click", zoomIn);
    zoomOutBtn.addEventListener("click", zoomOut);
    zoomLabel.addEventListener("dblclick", resetZoom);
  }

  function renderSpread() {
    const total = pageImages.length;
    els.leftImg.src = pageImages[leftIndex] || "";
    els.rightImg.src = pageImages[leftIndex + 1] || "";

    const shownPageNum = Math.min(leftIndex + 1, pdfDoc.numPages);
    els.pageCurrent.textContent = String(shownPageNum);

    els.prevBtn.disabled = leftIndex <= 0;
    els.nextBtn.disabled = leftIndex + 2 >= total;
    els.edgePrev.style.visibility = leftIndex <= 0 ? "hidden" : "visible";
    els.edgeNext.style.visibility = (leftIndex + 2 >= total) ? "hidden" : "visible";
  }

  function animateFlip(direction) {
    if (isFlipping) return;
    const total = pageImages.length;
    if (direction === "next" && leftIndex + 2 >= total) return;
    if (direction === "prev" && leftIndex <= 0) return;

    isFlipping = true;
    const { pageW } = computePageSize();

    if (direction === "next") {
      els.flipFrontImg.src = pageImages[leftIndex + 1] || "";
      els.flipBackImg.src = pageImages[leftIndex + 2] || "";

   
      els.rightImg.src = pageImages[leftIndex + 3] || "";

      els.flipPanel.style.left = pageW + "px";
      els.flipPanel.style.right = "";
      els.flipPanel.style.transformOrigin = "left center";
      els.flipPanel.style.transition = "none";
      els.flipPanel.style.transform = "rotateY(0deg)";
      els.flipPanel.style.visibility = "visible";
      els.flipPanel.style.zIndex = "8";

      void els.flipPanel.offsetWidth;

      els.flipPanel.style.transition = "transform .5s cubic-bezier(.4,.1,.2,1)";
      els.flipPanel.style.transform = "rotateY(-180deg)";

      const onEnd = () => {
        els.flipPanel.removeEventListener("transitionend", onEnd);
        leftIndex += 2;
        renderSpread();
        els.flipPanel.style.visibility = "hidden";
        isFlipping = false;
      };
      els.flipPanel.addEventListener("transitionend", onEnd);
    } else {
      els.flipFrontImg.src = pageImages[leftIndex] || "";
      els.flipBackImg.src = pageImages[leftIndex - 1] || "";

      els.leftImg.src = pageImages[leftIndex - 2] || "";

      els.flipPanel.style.left = "0px";
      els.flipPanel.style.right = "";
      els.flipPanel.style.transformOrigin = "right center";
      els.flipPanel.style.transition = "none";
      els.flipPanel.style.transform = "rotateY(0deg)";
      els.flipPanel.style.visibility = "visible";
      els.flipPanel.style.zIndex = "8";

      void els.flipPanel.offsetWidth;

      els.flipPanel.style.transition = "transform .5s cubic-bezier(.4,.1,.2,1)";
      els.flipPanel.style.transform = "rotateY(180deg)";

      const onEnd = () => {
        els.flipPanel.removeEventListener("transitionend", onEnd);
        leftIndex -= 2;
        renderSpread();
        els.flipPanel.style.visibility = "hidden";
        isFlipping = false;
      };
      els.flipPanel.addEventListener("transitionend", onEnd);
    }
  }

  function goPrev() { animateFlip("prev"); }
  function goNext() { animateFlip("next"); }

  function wireBookControls() {
    els.prevBtn.addEventListener("click", goPrev);
    els.nextBtn.addEventListener("click", goNext);
    els.edgePrev.addEventListener("click", goPrev);
    els.edgeNext.addEventListener("click", goNext);


    els.rightPage.addEventListener("dblclick", (e) => {
      e.preventDefault();
      goNext();
    });
    els.leftPage.addEventListener("dblclick", (e) => {
      e.preventDefault();
      goPrev();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
      if ((e.key === "+" || e.key === "=") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        zoomIn();
      }
      if (e.key === "-" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        zoomOut();
      }
      if (e.key === "0" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        resetZoom();
      }
    });

    els.stage.addEventListener("wheel", (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      if (e.deltaY < 0) zoomIn();
      else zoomOut();
    }, { passive: false });

    let resizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(applySize, 150);
    });

    els.fsBtn.addEventListener("click", () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen();
      }
    });

    els.disableBtn.addEventListener("click", disableForThisPdf);

    ensureZoomControls();
  }

  let currentSourceUrl = null;

  async function disableForThisPdf() {
    if (!currentSourceUrl) return;
    if (!confirm("Stop opening this PDF as a book from now on? It will show Firefox's normal PDF view instead.")) {
      return;
    }
    try {
      const stored = await browser.storage.local.get("disabledUrls");
      const list = new Set(stored.disabledUrls || []);
      list.add(currentSourceUrl);
      await browser.storage.local.set({ disabledUrls: Array.from(list) });
    } catch (e) {
    }
    window.location.href = currentSourceUrl;
  }

  function wireLanding() {
    els.browseBtn.addEventListener("click", () => els.fileInput.click());

    els.fileInput.addEventListener("change", () => {
      const file = els.fileInput.files[0];
      if (file) loadFromFile(file);
    });

    ["dragenter", "dragover"].forEach((evt) => {
      els.dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        els.dropZone.classList.add("dragging");
      });
    });
    ["dragleave", "drop"].forEach((evt) => {
      els.dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        els.dropZone.classList.remove("dragging");
      });
    });
    els.dropZone.addEventListener("drop", (e) => {
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file && file.type === "application/pdf") {
        loadFromFile(file);
      } else if (file) {
        showError("That doesn't look like a PDF file. Please drop a .pdf file.");
      }
    });
  }

  async function loadFromFile(file) {
    showLoading();
    try {
      const src = await fileToSource(file);
      await openSource(src);
    } catch (e) {
      showError(describeOpenError(e));
    }
  }

  async function openSource(src) {
    els.docTitle.textContent = src.title || "Document";
    document.title = src.title || "Book PDF Viewer";

    currentSourceUrl = src.url || null;
    els.disableBtn.style.display = currentSourceUrl ? "flex" : "none";

    let loadingTask;
    const cMapUrl = browser.runtime.getURL("pdfjs/cmaps/");
    const standardFontDataUrl = browser.runtime.getURL("pdfjs/standard_fonts/");

    loadingTask = src.data
      ? pdfjsLib.getDocument({ data: src.data, cMapUrl, cMapPacked: true, standardFontDataUrl })
      : pdfjsLib.getDocument({ url: src.url, cMapUrl, cMapPacked: true, standardFontDataUrl });

    loadingTask.onProgress = (p) => {
      if (p.total) setProgress(p.loaded / p.total, "Downloading PDF…");
    };

    pdfDoc = await loadingTask.promise;

    const total = pdfDoc.numPages;
    els.pageTotal.textContent = "/ " + total;

    const firstPage = await pdfDoc.getPage(1);
    const vp = firstPage.getViewport({ scale: 1 });
    pageAspect = vp.width / vp.height;

    resetZoom();
    applySize();

    const useLosslessPng = total <= 60;

    pageImages = new Array(total);
    for (let i = 1; i <= total; i++) {
      pageImages[i - 1] = await renderPageToImage(i, useLosslessPng);
      setProgress(i / total, `Rendering page ${i} of ${total}…`);
    }
    if (total % 2 !== 0) {
      pageImages.push(blankPageDataUrl());
    }

    hideAllScreens();
    els.bookWrap.style.display = "flex";
    leftIndex = 0;
    renderSpread();
  }

  async function main() {
    wireBookControls();
    wireLanding();

    const params = new URLSearchParams(window.location.search);
    let src;
    try {
      src = await getSourceFromParams(params);
    } catch (e) {
      showError(e.message || String(e));
      return;
    }

    if (!src) {
      showLanding();
      return;
    }

    showLoading();
    try {
      await openSource(src);
    } catch (e) {
      showError(describeOpenError(e));
    }
  }

  main();
})();