const pages = [];

let nextPageId = 1;
let cameraStream = null;
let captureSessionIds = [];
let captureBusy = false;
let pdfBusy = false;

const MAX_PDF_IMAGE_SIDE = 2600;
const PDF_LAYOUTS = {
  standard: {
    margin: 22.68,
    orientation: "auto"
  },
  manual: {
    margin: 56.69,
    orientation: "portrait"
  }
};

const els = {
  notice: document.getElementById("notice"),
  totalPages: document.getElementById("totalPages"),
  homePageCount: document.getElementById("homePageCount"),
  imageInput: document.getElementById("imageInput"),
  homeView: document.getElementById("homeView"),
  cameraView: document.getElementById("cameraView"),
  pagesView: document.getElementById("pagesView"),
  cameraDeviceNotice: document.getElementById("cameraDeviceNotice"),
  secureWarning: document.getElementById("secureWarning"),
  selectImagesHome: document.getElementById("selectImagesHome"),
  selectImagesEmpty: document.getElementById("selectImagesEmpty"),
  addImagesPages: document.getElementById("addImagesPages"),
  startCamera: document.getElementById("startCamera"),
  startCameraEmpty: document.getElementById("startCameraEmpty"),
  openPagesFromHome: document.getElementById("openPagesFromHome"),
  backHome: document.getElementById("backHome"),
  cameraVideo: document.getElementById("cameraVideo"),
  cameraPageCount: document.getElementById("cameraPageCount"),
  capturePage: document.getElementById("capturePage"),
  undoCapture: document.getElementById("undoCapture"),
  finishCamera: document.getElementById("finishCamera"),
  latestThumb: document.getElementById("latestThumb"),
  cameraStrip: document.getElementById("cameraStrip"),
  pagesCount: document.getElementById("pagesCount"),
  pageGrid: document.getElementById("pageGrid"),
  emptyState: document.getElementById("emptyState"),
  pdfName: document.getElementById("pdfName"),
  createPdf: document.getElementById("createPdf"),
  sharePdf: document.getElementById("sharePdf"),
  pdfStatus: document.getElementById("pdfStatus")
};

function setView(viewName) {
  els.homeView.classList.toggle("view-active", viewName === "home");
  els.cameraView.classList.toggle("view-active", viewName === "camera");
  els.pagesView.classList.toggle("view-active", viewName === "pages");

  if (viewName === "pages") {
    renderPages();
  }
}

function setNotice(message) {
  els.notice.textContent = message;
}

function setPdfStatus(message, isError = false) {
  els.pdfStatus.textContent = message;
  els.pdfStatus.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function updateCounts() {
  const count = pages.length;
  els.totalPages.textContent = String(count);
  els.homePageCount.textContent = String(count);
  els.pagesCount.textContent = String(count);
}

function triggerImagePicker() {
  els.imageInput.value = "";
  els.imageInput.click();
}

async function handleSelectedFiles(fileList) {
  const files = Array.from(fileList).filter((file) => file.type.startsWith("image/"));

  if (files.length === 0) {
    setNotice("画像が選択されていません。");
    return;
  }

  setNotice("");
  setPdfStatus("");

  try {
    for (const file of files) {
      const page = await createPageFromBlob(file);
      pages.push(page);
    }
    updateCounts();
    setView("pages");
  } catch (error) {
    setNotice("画像の読み込みに失敗しました。別の画像を選択してください。");
  }
}

async function createPageFromBlob(blob) {
  const url = URL.createObjectURL(blob);

  try {
    const size = await getImageSize(url);
    return {
      id: nextPageId++,
      blob,
      url,
      width: size.width,
      height: size.height
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function getImageSize(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height
      });
    };
    image.onerror = reject;
    image.src = url;
  });
}

async function startCameraFlow() {
  if (!isSmartphone()) {
    setNotice("カメラ撮影はスマートフォンのみ対応です。PC・タブレットでは画像を選択してください。");
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setNotice("カメラを起動できませんでした。ブラウザのカメラ許可を確認してください。");
    return;
  }

  setNotice("");
  setPdfStatus("");
  captureSessionIds = [];
  renderCameraPanel();
  setView("camera");

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    });

    els.cameraVideo.srcObject = cameraStream;
    await els.cameraVideo.play();
  } catch (error) {
    stopCamera();
    setView("home");
    setNotice("カメラを起動できませんでした。ブラウザのカメラ許可を確認してください。");
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
  }

  cameraStream = null;
  els.cameraVideo.pause();
  els.cameraVideo.srcObject = null;
}

async function captureCurrentFrame() {
  if (captureBusy || !cameraStream || !els.cameraVideo.videoWidth || !els.cameraVideo.videoHeight) {
    return;
  }

  captureBusy = true;
  els.capturePage.disabled = true;

  try {
    const canvas = document.createElement("canvas");
    canvas.width = els.cameraVideo.videoWidth;
    canvas.height = els.cameraVideo.videoHeight;

    const context = canvas.getContext("2d");
    context.drawImage(els.cameraVideo, 0, 0, canvas.width, canvas.height);

    const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
    const page = await createPageFromBlob(blob);

    pages.push(page);
    captureSessionIds.push(page.id);
    updateCounts();
    renderCameraPanel();
  } catch (error) {
    setNotice("撮影画像の保存に失敗しました。もう一度試してください。");
  } finally {
    captureBusy = false;
    els.capturePage.disabled = false;
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    if (canvas.toBlob) {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Canvas export failed"));
        }
      }, type, quality);
      return;
    }

    try {
      resolve(dataUrlToBlob(canvas.toDataURL(type, quality)));
    } catch (error) {
      reject(error);
    }
  });
}

function dataUrlToBlob(dataUrl) {
  const [meta, data] = dataUrl.split(",");
  const mime = /data:(.*?);base64/.exec(meta)?.[1] || "application/octet-stream";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: mime });
}

function undoLastCapture() {
  const lastId = captureSessionIds.pop();

  if (!lastId) {
    renderCameraPanel();
    return;
  }

  const pageIndex = pages.findIndex((page) => page.id === lastId);

  if (pageIndex >= 0) {
    removePageAt(pageIndex);
  }

  updateCounts();
  renderCameraPanel();
}

function finishCameraFlow() {
  stopCamera();
  setNotice("");
  setView("pages");
}

function renderCameraPanel() {
  els.cameraPageCount.textContent = `${captureSessionIds.length}ページ`;
  els.undoCapture.disabled = captureSessionIds.length === 0;

  const latestId = captureSessionIds[captureSessionIds.length - 1];
  const latestPage = pages.find((page) => page.id === latestId);

  if (latestPage) {
    els.latestThumb.src = latestPage.url;
  } else {
    els.latestThumb.removeAttribute("src");
  }

  els.cameraStrip.replaceChildren();

  for (const pageId of captureSessionIds.slice(-24)) {
    const page = pages.find((item) => item.id === pageId);

    if (!page) {
      continue;
    }

    const img = document.createElement("img");
    img.className = "strip-thumb";
    img.src = page.url;
    img.alt = "撮影済みサムネイル";
    els.cameraStrip.appendChild(img);
  }
}

function renderPages() {
  updateCounts();
  els.emptyState.hidden = pages.length > 0;
  els.pageGrid.hidden = pages.length === 0;
  els.pageGrid.replaceChildren();

  pages.forEach((page, index) => {
    const card = document.createElement("article");
    card.className = "page-card";

    const image = document.createElement("img");
    image.className = "page-thumb";
    image.src = page.url;
    image.alt = `${index + 1}ページ目`;

    const info = document.createElement("div");
    info.className = "page-info";

    const header = document.createElement("div");

    const title = document.createElement("p");
    title.className = "page-title";
    title.textContent = `${index + 1}ページ目`;

    const size = document.createElement("p");
    size.className = "page-size";
    size.textContent = `${page.width} x ${page.height}px`;

    header.append(title, size);

    const actions = document.createElement("div");
    actions.className = "page-actions";

    const upButton = document.createElement("button");
    upButton.type = "button";
    upButton.textContent = "上へ";
    upButton.disabled = index === 0;
    upButton.addEventListener("click", () => movePage(index, -1));

    const downButton = document.createElement("button");
    downButton.type = "button";
    downButton.textContent = "下へ";
    downButton.disabled = index === pages.length - 1;
    downButton.addEventListener("click", () => movePage(index, 1));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-page";
    deleteButton.textContent = "削除";
    deleteButton.addEventListener("click", () => {
      removePageAt(index);
      renderPages();
    });

    actions.append(upButton, downButton, deleteButton);
    info.append(header, actions);
    card.append(image, info);
    els.pageGrid.appendChild(card);
  });
}

function movePage(index, direction) {
  const nextIndex = index + direction;

  if (nextIndex < 0 || nextIndex >= pages.length) {
    return;
  }

  [pages[index], pages[nextIndex]] = [pages[nextIndex], pages[index]];
  renderPages();
}

function removePageAt(index) {
  const [removed] = pages.splice(index, 1);

  if (removed) {
    URL.revokeObjectURL(removed.url);
    captureSessionIds = captureSessionIds.filter((id) => id !== removed.id);
  }

  updateCounts();
}

async function createPdfFromPages() {
  if (pdfBusy) {
    return;
  }

  if (!ensurePagesForPdf()) {
    return;
  }

  pdfBusy = true;
  setPdfButtonsDisabled(true);
  setNotice("");

  try {
    const { blob, fileName } = await generatePdfBlob();
    downloadBlob(blob, fileName);
    setPdfStatus("PDFを保存しました。保存したファイルを共有できます。");
  } catch (error) {
    setPdfStatus("PDFの作成に失敗しました。画像枚数を減らしてもう一度試してください。", true);
  } finally {
    pdfBusy = false;
    setPdfButtonsDisabled(false);
  }
}

async function sharePdfFromPages() {
  if (pdfBusy) {
    return;
  }

  if (!ensurePagesForPdf()) {
    return;
  }

  pdfBusy = true;
  setPdfButtonsDisabled(true);
  setNotice("");

  try {
    const { blob, fileName } = await generatePdfBlob();

    if (typeof File === "function") {
      const file = new File([blob], fileName, { type: "application/pdf" });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: fileName,
          text: "Book Scan PDFで作成したPDFです。"
        });
        setPdfStatus("共有を開きました。");
        return;
      }
    }

    downloadBlob(blob, fileName);
    setPdfStatus("このブラウザは直接共有に未対応です。保存されたPDFをファイルアプリから共有してください。", true);
  } catch (error) {
    if (error.name === "AbortError") {
      setPdfStatus("共有をキャンセルしました。");
      return;
    }

    setPdfStatus("PDFの共有に失敗しました。PDFを作成してからファイルアプリで共有してください。", true);
  } finally {
    pdfBusy = false;
    setPdfButtonsDisabled(false);
  }
}

async function generatePdfBlob() {
  const pdfPages = [];

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    setPdfStatus(`PDFを作成中... ${index + 1}/${pages.length}`);
    pdfPages.push(await pageToJpegBytes(page));
  }

  return {
    blob: buildPdfBlob(pdfPages, getPdfLayout()),
    fileName: normalizePdfName(els.pdfName.value)
  };
}

function setPdfButtonsDisabled(disabled) {
  els.createPdf.disabled = disabled;
  els.sharePdf.disabled = disabled;
}

function ensurePagesForPdf() {
  if (pages.length > 0) {
    return true;
  }

  setNotice("PDFにする画像がありません。画像を選択するか、カメラで撮影してください。");
  setView("pages");
  return false;
}

async function pageToJpegBytes(page) {
  const image = await loadImage(page.url);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const scale = Math.min(1, MAX_PDF_IMAGE_SIDE / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);

  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    width,
    height
  };
}

function buildPdfBlob(images, layoutName = "standard") {
  const objects = new Map();
  const pageRefs = [];
  let nextObjectId = 3;
  const layout = PDF_LAYOUTS[layoutName] || PDF_LAYOUTS.standard;

  for (const image of images) {
    const isLandscape = layout.orientation === "auto" && image.width >= image.height;
    const pageWidth = isLandscape ? 841.89 : 595.28;
    const pageHeight = isLandscape ? 595.28 : 841.89;
    const margin = layout.margin;
    const fit = fitRect(image.width, image.height, pageWidth - margin * 2, pageHeight - margin * 2);
    const x = (pageWidth - fit.width) / 2;
    const y = (pageHeight - fit.height) / 2;
    const imageObjectId = nextObjectId++;
    const contentObjectId = nextObjectId++;
    const pageObjectId = nextObjectId++;
    const content = [
      "q\n",
      `${pdfNumber(fit.width)} 0 0 ${pdfNumber(fit.height)} ${pdfNumber(x)} ${pdfNumber(y)} cm\n`,
      "/Im0 Do\n",
      "Q\n"
    ].join("");

    objects.set(imageObjectId, [
      `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`,
      image.bytes,
      "\nendstream"
    ]);
    objects.set(contentObjectId, [
      `<< /Length ${byteLength(content)} >>\nstream\n${content}endstream`
    ]);
    objects.set(pageObjectId, [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfNumber(pageWidth)} ${pdfNumber(pageHeight)}] /Resources << /XObject << /Im0 ${imageObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`
    ]);
    pageRefs.push(`${pageObjectId} 0 R`);
  }

  objects.set(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
  objects.set(2, [
    `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pageRefs.length} >>`
  ]);

  return new Blob([serializePdf(objects)], { type: "application/pdf" });
}

function getPdfLayout() {
  return document.querySelector('input[name="pdfLayout"]:checked')?.value || "standard";
}

function serializePdf(objects) {
  const ids = Array.from(objects.keys()).sort((a, b) => a - b);
  const offsets = [];
  const chunks = [];
  let offset = 0;

  function push(chunk) {
    const bytes = typeof chunk === "string" ? encodeAscii(chunk) : chunk;
    chunks.push(bytes);
    offset += bytes.length;
  }

  push("%PDF-1.4\n%Book Scan PDF\n");

  for (const id of ids) {
    offsets[id] = offset;
    push(`${id} 0 obj\n`);

    for (const part of objects.get(id)) {
      push(part);
    }

    push("\nendobj\n");
  }

  const xrefOffset = offset;
  push(`xref\n0 ${ids.length + 1}\n`);
  push("0000000000 65535 f \n");

  for (const id of ids) {
    push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }

  push(`trailer\n<< /Size ${ids.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  return new Blob(chunks, { type: "application/pdf" });
}

function encodeAscii(value) {
  const bytes = new Uint8Array(value.length);

  for (let i = 0; i < value.length; i += 1) {
    bytes[i] = value.charCodeAt(i) & 0xff;
  }

  return bytes;
}

function byteLength(value) {
  return encodeAscii(value).length;
}

function pdfNumber(value) {
  return Number(value.toFixed(3)).toString();
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

function fitRect(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);

  return {
    width: sourceWidth * scale,
    height: sourceHeight * scale
  };
}

function normalizePdfName(value) {
  const baseName = (value || "book-scan").trim() || "book-scan";
  const cleanName = baseName.replace(/[\\/:*?"<>|]+/g, "-");

  return cleanName.toLowerCase().endsWith(".pdf") ? cleanName : `${cleanName}.pdf`;
}

function updateSecureWarning() {
  const localHosts = ["", "localhost", "127.0.0.1", "::1"];
  els.secureWarning.hidden = !isSmartphone() || window.isSecureContext || localHosts.includes(window.location.hostname);
}

function isSmartphone() {
  if (navigator.userAgentData && typeof navigator.userAgentData.mobile === "boolean") {
    return navigator.userAgentData.mobile;
  }

  const userAgent = navigator.userAgent || "";
  const mobilePattern = /iPhone|iPod|Android.*Mobile|Windows Phone|IEMobile|BlackBerry|Opera Mini/i;

  if (mobilePattern.test(userAgent)) {
    return true;
  }

  return window.matchMedia("(max-width: 540px) and (pointer: coarse)").matches;
}

function updateCameraAvailability() {
  const enabled = isSmartphone();

  els.startCamera.disabled = !enabled;
  els.startCameraEmpty.disabled = !enabled;
  els.startCamera.title = enabled ? "" : "カメラ撮影はスマートフォンのみ対応です";
  els.startCameraEmpty.title = enabled ? "" : "カメラ撮影はスマートフォンのみ対応です";
  els.cameraDeviceNotice.hidden = enabled;
  updateSecureWarning();
}

function bindEvents() {
  els.selectImagesHome.addEventListener("click", triggerImagePicker);
  els.selectImagesEmpty.addEventListener("click", triggerImagePicker);
  els.addImagesPages.addEventListener("click", triggerImagePicker);
  els.imageInput.addEventListener("change", (event) => handleSelectedFiles(event.target.files));

  els.startCamera.addEventListener("click", startCameraFlow);
  els.startCameraEmpty.addEventListener("click", startCameraFlow);
  els.capturePage.addEventListener("click", captureCurrentFrame);
  els.undoCapture.addEventListener("click", undoLastCapture);
  els.finishCamera.addEventListener("click", finishCameraFlow);

  els.openPagesFromHome.addEventListener("click", () => setView("pages"));
  els.backHome.addEventListener("click", () => setView("home"));
  els.createPdf.addEventListener("click", createPdfFromPages);
  els.sharePdf.addEventListener("click", sharePdfFromPages);

  window.addEventListener("beforeunload", () => {
    stopCamera();
    pages.forEach((page) => URL.revokeObjectURL(page.url));
  });

  window.addEventListener("resize", updateCameraAvailability);
  window.addEventListener("orientationchange", updateCameraAvailability);
}

bindEvents();
updateCameraAvailability();
updateCounts();
