/**
 * Foundry/Black Flag actor artwork -> Gemini Interactions API image.
 *
 * Only fetch the actor's existing portrait on the trusted GM client.
 * Never accept image bytes or an arbitrary URL from player socket messages.
 * A bad/default/unreadable image is nonfatal: use text-only prompts instead.
 */
const DEFAULT_ART_PATHS = [
  "systems/black-flag/artwork/types/pc.svg",
  "icons/svg/mystery-man.svg"
];

export function isDefaultArtwork(path) {
  if (typeof path !== "string" || !path.trim()) return true;
  const clean = path.split(/[?#]/)[0].replace(/\\/g, "/").toLowerCase();
  let decoded;
  try { decoded = decodeURIComponent(clean); }
  catch { decoded = clean; }
  return DEFAULT_ART_PATHS.some(defaultPath =>
    decoded === defaultPath || decoded === "/" + defaultPath ||
    decoded.endsWith("/" + defaultPath)
  );
}

export function hasCustomArtwork(path) {
  return typeof path === "string" && !!path.trim() && !isDefaultArtwork(path);
}

function foundryArtworkURL(path, baseUrl) {
  if (!baseUrl) throw new Error("Foundry browser location is unavailable.");
  const url = new URL(path, baseUrl);
  const host = new URL(baseUrl);
  // Only Foundry-hosted images. Remote URLs and special schemes would leak
  // the GM's IP or could access unrelated services.
  if (!["http:", "https:"].includes(url.protocol) || url.origin !== host.origin) {
    throw new Error("Artwork is not on the Foundry server.");
  }
  // Skip SVG entirely, including the system's default placeholder.
  if (url.pathname.toLowerCase().endsWith(".svg")) {
    throw new Error("SVG artwork is not supported for portrait analysis.");
  }
  return url.href;
}

/**
 * Return {image, reason} where reason is "attached", "default" or "unavailable".
 * The image is JPEG, base64-encoded, bounded in dimension and payload size.
 * This is deliberately fail-open to text-only generation.
 */
export async function prepareArtwork(path, options = {}) {
  if (!hasCustomArtwork(path)) return { image: null, reason: "default" };
  try {
    const url = foundryArtworkURL(path, options.baseUrl ?? globalThis.location?.href);
    const fetchFn = options.fetchFn ?? globalThis.fetch;
    const response = await fetchFn(url, {
      method: "GET", credentials: "same-origin", cache: "force-cache",
      signal: AbortSignal.timeout(options.timeoutMs ?? 12000)
    });
    if (!response.ok) throw new Error("Portrait could not be fetched.");
    const maxSourceBytes = options.maxSourceBytes ?? 8_000_000;
    const lengthHeader = Number(response.headers?.get?.("content-length"));
    if (Number.isFinite(lengthHeader) && lengthHeader > maxSourceBytes) {
      throw new Error("Portrait file is too large.");
    }
    const blob = await response.blob();
    if (blob.size > maxSourceBytes || !/^image\/(jpeg|png|webp|gif|bmp)$/i.test(blob.type)) {
      throw new Error("Portrait format or size is unsupported.");
    }
    const decode = options.bitmapFactory ?? globalThis.createImageBitmap;
    if (typeof decode !== "function") throw new Error("Image decoding is unavailable.");
    const bitmap = await decode(blob);
    let jpeg;
    try {
      if (!bitmap.width || !bitmap.height) throw new Error("Portrait has invalid dimensions.");
      const limit = options.maxDimension ?? 1024;
      const scale = Math.min(1, limit / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = options.canvasFactory ? options.canvasFactory() : document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", {alpha:false});
      if (!context) throw new Error("Canvas is unavailable.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      jpeg = canvas.toDataURL("image/jpeg", 0.8);
    } finally {
      bitmap.close?.();
    }
    const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(jpeg);
    if (!match || match[1].length > (options.maxBase64Length ?? 2_000_000)) {
      throw new Error("Prepared portrait is too large.");
    }
    return {
      image: { type: "image", mime_type: "image/jpeg", data: match[1] },
      reason: "attached"
    };
  } catch (_) {
    // The generator must NEVER fail because of artwork; keep the backstory
    // workflow usable when a portrait is missing, corrupt, too large or remote.
    return { image: null, reason: "unavailable" };
  }
}
