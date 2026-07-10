const video = document.querySelector("#preview");
const canvas = document.querySelector("#frameCanvas");
const statusEl = document.querySelector("#status");
const startButton = document.querySelector("#startButton");
const stopButton = document.querySelector("#stopButton");
const cameraToggle = document.querySelector("#cameraToggle");
const imageInput = document.querySelector("#imageInput");
const emptyState = document.querySelector("#emptyState");
const resultCard = document.querySelector("#resultCard");
const resultText = document.querySelector("#resultText");
const copyButton = document.querySelector("#copyButton");
const openLink = document.querySelector("#openLink");

let stream = null;
let detector = null;
let scanTimer = null;
let currentFacingMode = "environment";
let lastValue = "";
const canvasContext = canvas.getContext("2d", { willReadFrequently: true });

function syncPreviewOrientation() {
  video.classList.toggle("is-mirrored", currentFacingMode === "user");
}

const text = {
  copied: "\u7ed3\u679c\u5df2\u590d\u5236",
  detectorNeedsNetwork: "\u5f53\u524d\u6d4f\u89c8\u5668\u9700\u8981\u8054\u7f51\u52a0\u8f7d\u626b\u7801\u7ec4\u4ef6\uff0c\u6216\u4f7f\u7528\u6700\u65b0\u7248 Chrome/Edge\u3002",
  detectorUnsupported: "\u5f53\u524d\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u4e8c\u7ef4\u7801\u683c\u5f0f\u3002\u8bf7\u4f7f\u7528\u6700\u65b0\u7248 Chrome/Edge\u3002",
  imageNoCode: "\u8fd9\u5f20\u56fe\u7247\u91cc\u6ca1\u6709\u8bc6\u522b\u5230\u4e8c\u7ef4\u7801",
  imageReady: "\u5df2\u8bc6\u522b\u56fe\u7247\u4e2d\u7684\u4e8c\u7ef4\u7801",
  invalidFile: "\u8bf7\u9009\u62e9\u4e00\u5f20\u56fe\u7247",
  noCamera: "\u6ca1\u6709\u627e\u5230\u53ef\u7528\u6444\u50cf\u5934\u3002\u8bf7\u68c0\u67e5\u7535\u8111\u662f\u5426\u6709\u6444\u50cf\u5934\uff0c\u6216\u7ed9\u6d4f\u89c8\u5668\u5f00\u542f\u6444\u50cf\u5934\u6743\u9650\u3002",
  noCameraApi: "\u5f53\u524d\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u6444\u50cf\u5934\u8c03\u7528",
  noPermission: "\u6444\u50cf\u5934\u6743\u9650\u88ab\u62d2\u7edd\u3002\u8bf7\u5728\u5730\u5740\u680f\u5de6\u4fa7\u7ad9\u70b9\u6743\u9650\u91cc\u5141\u8bb8\u6444\u50cf\u5934\u3002",
  openFailed: "\u65e0\u6cd5\u6253\u5f00\u6444\u50cf\u5934",
  qrFound: "\u5df2\u8bc6\u522b\u4e8c\u7ef4\u7801",
  requestCamera: "\u6b63\u5728\u8bf7\u6c42\u6444\u50cf\u5934\u6743\u9650",
  scanFailed: "\u8bc6\u522b\u5931\u8d25",
  scanning: "\u6b63\u5728\u626b\u63cf",
  secureOnly: "\u8bf7\u901a\u8fc7 localhost \u6216 HTTPS \u6253\u5f00\u9875\u9762",
  stopped: "\u5df2\u505c\u6b62\u626b\u63cf",
};

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.borderColor = isError ? "rgba(255, 107, 107, 0.7)" : "rgba(255, 255, 255, 0.12)";
  statusEl.style.color = isError ? "#ffd5d5" : "";
}

function getCameraErrorMessage(error) {
  if (error?.name === "NotAllowedError" || error?.name === "SecurityError") return text.noPermission;
  if (error?.name === "NotFoundError" || error?.name === "OverconstrainedError") return text.noCamera;
  return error?.message || text.openFailed;
}

function isProbablyUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function showResult(value, message = text.qrFound) {
  if (!value) return;

  lastValue = value;
  resultText.value = value;
  emptyState.classList.add("hidden");
  resultCard.classList.remove("hidden");

  if (isProbablyUrl(value)) {
    openLink.href = value;
    openLink.classList.remove("hidden");
  } else {
    openLink.classList.add("hidden");
  }

  setStatus(message);
  navigator.vibrate?.(80);
}

async function createDetector() {
  if (!("BarcodeDetector" in window)) {
    if (window.jsQR) return null;
    throw new Error(text.detectorNeedsNetwork);
  }

  const formats = await BarcodeDetector.getSupportedFormats();
  if (!formats.includes("qr_code")) {
    if (window.jsQR) return null;
    throw new Error(text.detectorUnsupported);
  }

  return new BarcodeDetector({ formats: ["qr_code"] });
}

function scanCanvasImage(width, height) {
  if (!window.jsQR) return null;

  const imageData = canvasContext.getImageData(0, 0, width, height);
  const code = window.jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: "attemptBoth",
  });

  return code?.data || null;
}

function scanWithCanvas() {
  if (video.videoWidth === 0 || video.videoHeight === 0) return;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvasContext.drawImage(video, 0, 0, canvas.width, canvas.height);

  const value = scanCanvasImage(canvas.width, canvas.height);
  if (value && value !== lastValue) showResult(value);
}

async function scanFrame() {
  if (!stream || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

  try {
    if (detector) {
      const codes = await detector.detect(video);
      const code = codes.find((item) => item.rawValue);
      if (code?.rawValue && code.rawValue !== lastValue) showResult(code.rawValue);
      return;
    }

    scanWithCanvas();
  } catch (error) {
    setStatus(error.message || text.scanFailed, true);
  }
}

function stopScanner() {
  if (scanTimer) {
    clearInterval(scanTimer);
    scanTimer = null;
  }

  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  video.srcObject = null;
  startButton.disabled = false;
  stopButton.disabled = true;
  setStatus(text.stopped);
}

async function startScanner() {
  try {
    startButton.disabled = true;
    setStatus(text.requestCamera);
    syncPreviewOrientation();

    detector ??= await createDetector();
    stopScanner();
    startButton.disabled = true;

    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: currentFacingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });

    video.srcObject = stream;
    await video.play();

    stopButton.disabled = false;
    setStatus(text.scanning);
    scanTimer = setInterval(scanFrame, 250);
  } catch (error) {
    startButton.disabled = false;
    stopButton.disabled = true;
    setStatus(getCameraErrorMessage(error), true);
  }
}

async function toggleCamera() {
  currentFacingMode = currentFacingMode === "environment" ? "user" : "environment";
  syncPreviewOrientation();
  if (stream) await startScanner();
}

async function copyResult() {
  if (!resultText.value) return;

  try {
    await navigator.clipboard.writeText(resultText.value);
    setStatus(text.copied);
  } catch {
    resultText.select();
    document.execCommand("copy");
    setStatus(text.copied);
  }
}

async function scanUploadedImage(file) {
  if (!file?.type.startsWith("image/")) {
    setStatus(text.invalidFile, true);
    return;
  }

  const image = new Image();
  const objectUrl = URL.createObjectURL(file);

  image.onload = () => {
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvasContext.drawImage(image, 0, 0);

    const value = scanCanvasImage(canvas.width, canvas.height);
    if (value) {
      showResult(value, text.imageReady);
    } else {
      setStatus(text.imageNoCode, true);
    }

    URL.revokeObjectURL(objectUrl);
    imageInput.value = "";
  };

  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    imageInput.value = "";
    setStatus(text.invalidFile, true);
  };

  image.src = objectUrl;
}

startButton.addEventListener("click", startScanner);
stopButton.addEventListener("click", stopScanner);
cameraToggle.addEventListener("click", toggleCamera);
copyButton.addEventListener("click", copyResult);
imageInput.addEventListener("change", (event) => scanUploadedImage(event.target.files[0]));

if (!window.isSecureContext) {
  setStatus(text.secureOnly, true);
} else if (!navigator.mediaDevices?.getUserMedia) {
  setStatus(text.noCameraApi, true);
}

syncPreviewOrientation();
