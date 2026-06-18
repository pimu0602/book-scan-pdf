const pages = [];

let nextPageId = 1;
let cameraStream = null;
let captureSessionIds = [];
let captureBusy = false;
let pdfBusy = false;

const MAX_PDF_IMAGE_SIDE = 2600;
const MAX_DOCUMENT_IMAGE_SIDE = 1800;
const DOCUMENT_DETECTION_SIDE = 760;
const PDF_LAYOUTS = {
  standard: {
    margin: 22.68,
    orientation: "auto",
    correction: false
  },
  manual: {
    margin: 56.69,
    orientation: "portrait",
    correction: false
  },
  document: {
    margin: 22.68,
    orientation: "portrait",
    correction: true
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
  const layoutName = getPdfLayout();
  const layout = PDF_LAYOUTS[layoutName] || PDF_LAYOUTS.standard;

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    setPdfStatus(layout.correction
      ? `紙面を自動補正中... ${index + 1}/${pages.length}`
      : `PDFを作成中... ${index + 1}/${pages.length}`);
    pdfPages.push(await pageToJpegBytes(page, layout));
  }

  return {
    blob: buildPdfBlob(pdfPages, layoutName),
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

async function pageToJpegBytes(page, layout = PDF_LAYOUTS.standard) {
  const image = await loadImage(page.url);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const maxSide = layout.correction ? MAX_DOCUMENT_IMAGE_SIDE : MAX_PDF_IMAGE_SIDE;
  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  if (layout.correction) {
    const correctedCanvas = createDocumentCanvas(canvas);

    if (correctedCanvas) {
      const correctedBlob = await canvasToBlob(correctedCanvas, "image/jpeg", 0.92);

      return {
        bytes: new Uint8Array(await correctedBlob.arrayBuffer()),
        width: correctedCanvas.width,
        height: correctedCanvas.height
      };
    }
  }

  const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);

  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    width,
    height
  };
}

function createDocumentCanvas(sourceCanvas) {
  const quad = detectDocumentQuad(sourceCanvas);

  if (!quad) {
    return null;
  }

  const topWidth = distance(quad.topLeft, quad.topRight);
  const bottomWidth = distance(quad.bottomLeft, quad.bottomRight);
  const leftHeight = distance(quad.topLeft, quad.bottomLeft);
  const rightHeight = distance(quad.topRight, quad.bottomRight);
  const rawWidth = Math.max(topWidth, bottomWidth);
  const rawHeight = Math.max(leftHeight, rightHeight);

  if (rawWidth < 80 || rawHeight < 80) {
    return null;
  }

  const scale = Math.min(1, MAX_DOCUMENT_IMAGE_SIDE / Math.max(rawWidth, rawHeight));
  const outputWidth = Math.max(1, Math.round(rawWidth * scale));
  const outputHeight = Math.max(1, Math.round(rawHeight * scale));
  const outputCanvas = document.createElement("canvas");

  outputCanvas.width = outputWidth;
  outputCanvas.height = outputHeight;

  warpQuadToCanvas(sourceCanvas, quad, outputCanvas);
  enhanceDocumentCanvas(outputCanvas);

  return outputCanvas;
}

function detectDocumentQuad(sourceCanvas) {
  const scale = Math.min(1, DOCUMENT_DETECTION_SIDE / Math.max(sourceCanvas.width, sourceCanvas.height));
  const width = Math.max(1, Math.round(sourceCanvas.width * scale));
  const height = Math.max(1, Math.round(sourceCanvas.height * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  canvas.width = width;
  canvas.height = height;
  context.drawImage(sourceCanvas, 0, 0, width, height);

  const imageData = context.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const grays = new Uint8Array(width * height);
  const histogram = new Uint32Array(256);

  for (let index = 0, pixel = 0; index < pixels.length; index += 4, pixel += 1) {
    const gray = Math.round(0.299 * pixels[index] + 0.587 * pixels[index + 1] + 0.114 * pixels[index + 2]);
    grays[pixel] = gray;
    histogram[gray] += 1;
  }

  const threshold = clamp(otsuThreshold(histogram) + 8, 120, 218);
  const mask = new Uint8Array(width * height);

  for (let index = 0, pixel = 0; index < pixels.length; index += 4, pixel += 1) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const gray = grays[pixel];
    const spread = Math.max(red, green, blue) - Math.min(red, green, blue);

    if ((gray >= threshold && spread < 86) || gray >= threshold + 24) {
      mask[pixel] = 1;
    }
  }

  const component = findDocumentComponent(mask, width, height);

  if (!component) {
    return null;
  }

  const minArea = width * height * 0.08;

  if (component.area < minArea) {
    return null;
  }

  const inverseScale = 1 / scale;

  return {
    topLeft: scalePoint(component.topLeft, inverseScale),
    topRight: scalePoint(component.topRight, inverseScale),
    bottomRight: scalePoint(component.bottomRight, inverseScale),
    bottomLeft: scalePoint(component.bottomLeft, inverseScale)
  };
}

function findDocumentComponent(mask, width, height) {
  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let best = null;
  const centerX = width / 2;
  const centerY = height / 2;

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) {
      continue;
    }

    let head = 0;
    let tail = 0;
    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    const extremes = {
      topLeft: { score: Infinity, point: null },
      topRight: { score: -Infinity, point: null },
      bottomRight: { score: -Infinity, point: null },
      bottomLeft: { score: -Infinity, point: null }
    };

    queue[tail] = start;
    tail += 1;
    visited[start] = 1;

    while (head < tail) {
      const current = queue[head];
      head += 1;

      const x = current % width;
      const y = Math.floor(current / width);
      area += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      updateExtremes(extremes, x, y);

      if (x > 0) {
        if (mask[current - 1] && !visited[current - 1]) {
          visited[current - 1] = 1;
          queue[tail] = current - 1;
          tail += 1;
        }
      }

      if (x < width - 1 && mask[current + 1] && !visited[current + 1]) {
        visited[current + 1] = 1;
        queue[tail] = current + 1;
        tail += 1;
      }

      if (y > 0 && mask[current - width] && !visited[current - width]) {
        visited[current - width] = 1;
        queue[tail] = current - width;
        tail += 1;
      }

      if (y < height - 1 && mask[current + width] && !visited[current + width]) {
        visited[current + width] = 1;
        queue[tail] = current + width;
        tail += 1;
      }
    }

    const containsCenter = centerX >= minX && centerX <= maxX && centerY >= minY && centerY <= maxY;
    const centerBonus = containsCenter ? 2 : 1;
    const score = area * centerBonus;

    if (!best || score > best.score) {
      best = {
        area,
        score,
        minX,
        minY,
        maxX,
        maxY,
        topLeft: extremes.topLeft.point,
        topRight: extremes.topRight.point,
        bottomRight: extremes.bottomRight.point,
        bottomLeft: extremes.bottomLeft.point
      };
    }
  }

  if (!best || !best.topLeft || !best.topRight || !best.bottomRight || !best.bottomLeft) {
    return null;
  }

  const boxWidth = best.maxX - best.minX;
  const boxHeight = best.maxY - best.minY;

  if (boxWidth < width * 0.22 || boxHeight < height * 0.22) {
    return null;
  }

  return best;
}

function updateExtremes(extremes, x, y) {
  const topLeft = x + y;
  const topRight = x - y;
  const bottomRight = x + y;
  const bottomLeft = y - x;

  if (topLeft < extremes.topLeft.score) {
    extremes.topLeft = { score: topLeft, point: { x, y } };
  }

  if (topRight > extremes.topRight.score) {
    extremes.topRight = { score: topRight, point: { x, y } };
  }

  if (bottomRight > extremes.bottomRight.score) {
    extremes.bottomRight = { score: bottomRight, point: { x, y } };
  }

  if (bottomLeft > extremes.bottomLeft.score) {
    extremes.bottomLeft = { score: bottomLeft, point: { x, y } };
  }
}

function warpQuadToCanvas(sourceCanvas, quad, outputCanvas) {
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const outputContext = outputCanvas.getContext("2d", { willReadFrequently: true });
  const sourceData = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const outputData = outputContext.createImageData(outputCanvas.width, outputCanvas.height);
  const matrix = homographyFromRectToQuad(outputCanvas.width, outputCanvas.height, quad);

  for (let y = 0; y < outputCanvas.height; y += 1) {
    for (let x = 0; x < outputCanvas.width; x += 1) {
      const sourcePoint = applyHomography(matrix, x + 0.5, y + 0.5);
      const color = sampleBilinear(sourceData, sourceCanvas.width, sourceCanvas.height, sourcePoint.x, sourcePoint.y);
      const target = (y * outputCanvas.width + x) * 4;

      outputData.data[target] = color.red;
      outputData.data[target + 1] = color.green;
      outputData.data[target + 2] = color.blue;
      outputData.data[target + 3] = 255;
    }
  }

  outputContext.putImageData(outputData, 0, 0);
}

function enhanceDocumentCanvas(canvas) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;

  for (let index = 0; index < pixels.length; index += 4) {
    const gray = 0.299 * pixels[index] + 0.587 * pixels[index + 1] + 0.114 * pixels[index + 2];
    const value = gray > 178
      ? 255
      : gray < 92
        ? 0
        : clamp((gray - 92) * 2.18, 0, 255);

    pixels[index] = value;
    pixels[index + 1] = value;
    pixels[index + 2] = value;
    pixels[index + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);
}

function homographyFromRectToQuad(width, height, quad) {
  const source = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height }
  ];
  const target = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
  const system = [];

  for (let index = 0; index < source.length; index += 1) {
    const src = source[index];
    const dst = target[index];

    system.push([src.x, src.y, 1, 0, 0, 0, -src.x * dst.x, -src.y * dst.x, dst.x]);
    system.push([0, 0, 0, src.x, src.y, 1, -src.x * dst.y, -src.y * dst.y, dst.y]);
  }

  const solved = solveLinearSystem(system);

  return [
    solved[0], solved[1], solved[2],
    solved[3], solved[4], solved[5],
    solved[6], solved[7], 1
  ];
}

function solveLinearSystem(matrix) {
  const size = 8;

  for (let column = 0; column < size; column += 1) {
    let pivot = column;

    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) {
        pivot = row;
      }
    }

    [matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]];

    const divisor = matrix[column][column] || 1;

    for (let value = column; value <= size; value += 1) {
      matrix[column][value] /= divisor;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === column) {
        continue;
      }

      const factor = matrix[row][column];

      for (let value = column; value <= size; value += 1) {
        matrix[row][value] -= factor * matrix[column][value];
      }
    }
  }

  return matrix.map((row) => row[size]);
}

function applyHomography(matrix, x, y) {
  const denominator = matrix[6] * x + matrix[7] * y + matrix[8];

  return {
    x: (matrix[0] * x + matrix[1] * y + matrix[2]) / denominator,
    y: (matrix[3] * x + matrix[4] * y + matrix[5]) / denominator
  };
}

function sampleBilinear(imageData, width, height, x, y) {
  const clampedX = clamp(x, 0, width - 1);
  const clampedY = clamp(y, 0, height - 1);
  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const dx = clampedX - x0;
  const dy = clampedY - y0;
  const topLeft = (y0 * width + x0) * 4;
  const topRight = (y0 * width + x1) * 4;
  const bottomLeft = (y1 * width + x0) * 4;
  const bottomRight = (y1 * width + x1) * 4;

  return {
    red: bilinearChannel(imageData.data, topLeft, topRight, bottomLeft, bottomRight, dx, dy, 0),
    green: bilinearChannel(imageData.data, topLeft, topRight, bottomLeft, bottomRight, dx, dy, 1),
    blue: bilinearChannel(imageData.data, topLeft, topRight, bottomLeft, bottomRight, dx, dy, 2)
  };
}

function bilinearChannel(data, topLeft, topRight, bottomLeft, bottomRight, dx, dy, offset) {
  const top = data[topLeft + offset] * (1 - dx) + data[topRight + offset] * dx;
  const bottom = data[bottomLeft + offset] * (1 - dx) + data[bottomRight + offset] * dx;

  return Math.round(top * (1 - dy) + bottom * dy);
}

function otsuThreshold(histogram) {
  let total = 0;
  let sum = 0;

  for (let value = 0; value < histogram.length; value += 1) {
    total += histogram[value];
    sum += value * histogram[value];
  }

  let backgroundWeight = 0;
  let backgroundSum = 0;
  let bestVariance = 0;
  let threshold = 160;

  for (let value = 0; value < histogram.length; value += 1) {
    backgroundWeight += histogram[value];

    if (backgroundWeight === 0) {
      continue;
    }

    const foregroundWeight = total - backgroundWeight;

    if (foregroundWeight === 0) {
      break;
    }

    backgroundSum += value * histogram[value];

    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (sum - backgroundSum) / foregroundWeight;
    const variance = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;

    if (variance > bestVariance) {
      bestVariance = variance;
      threshold = value;
    }
  }

  return threshold;
}

function scalePoint(point, scale) {
  return {
    x: point.x * scale,
    y: point.y * scale
  };
}

function distance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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
