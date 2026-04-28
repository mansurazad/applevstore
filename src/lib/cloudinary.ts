const CLOUD_NAME = "dkwwljbmy";
const UPLOAD_PRESET = "ml_default";
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

export interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
}

/** Allowed image MIME types (Cloudinary ml_default preset accepts these). */
export const ALLOWED_IMAGE_MIME = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
];

/** Max upload size — keep in sync with the Cloudinary preset (10 MB). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Upload an image file to Cloudinary.
 * Uses unsigned upload with the configured preset.
 * Optionally pass a folder to organise assets.
 * Retries up to 2 times on transient network errors (DNS / 5xx / abort).
 */
export async function uploadToCloudinary(
  file: File,
  folder: string = "apple-store"
): Promise<CloudinaryUploadResult> {
  // Hard guards (UI also checks but defend at the API too).
  if (!file) throw new Error("কোন ফাইল নির্বাচন করা হয়নি");
  if (file.size === 0) throw new Error("ফাইলটি খালি");
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `ছবির সাইজ ${(MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(0)}MB এর বেশি হতে পারবে না`
    );
  }
  if (file.type && !ALLOWED_IMAGE_MIME.includes(file.type.toLowerCase())) {
    throw new Error(`অসমর্থিত ফাইল টাইপ: ${file.type}`);
  }

  // Sanitise folder name (Cloudinary allows letters, digits, hyphens, slashes, underscores).
  const safeFolder = (folder || "apple-store")
    .replace(/[^a-zA-Z0-9_\-/]/g, "-")
    .slice(0, 80);

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);
  formData.append("folder", safeFolder);

  // If we're plainly offline, fail fast with a clear message — don't burn retries.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error("ইন্টারনেট সংযোগ নেই — অনলাইনে আসার পর আবার চেষ্টা করুন");
  }

  const MAX_ATTEMPTS = 3;
  let lastErr: any = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const ctrl = new AbortController();
      // 60s upload ceiling; large images on slow networks shouldn't hang forever.
      const timeout = setTimeout(() => ctrl.abort(), 60_000);
      const response = await fetch(CLOUDINARY_URL, {
        method: "POST",
        body: formData,
        signal: ctrl.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        const json = (await response.json()) as CloudinaryUploadResult;
        if (!json?.secure_url) {
          throw new Error("Cloudinary থেকে অপ্রত্যাশিত response");
        }
        return json;
      }

      // 4xx → don't retry, fail with the server message
      const text = await response.text();
      if (response.status >= 400 && response.status < 500) {
        let msg = text;
        try {
          const j = JSON.parse(text);
          msg = j?.error?.message ?? msg;
        } catch {
          /* ignore */
        }
        throw new Error(`Cloudinary আপলোড প্রত্যাখ্যাত (${response.status}): ${msg}`);
      }

      // 5xx → retry with backoff
      lastErr = new Error(`Cloudinary সার্ভার ত্রুটি (${response.status})`);
    } catch (err: any) {
      // AbortError / TypeError (network) → retry; explicit Error from above → bubble up
      lastErr = err;
      if (err?.name !== "AbortError" && !(err instanceof TypeError)) {
        // Non-transient — surface immediately
        throw err;
      }
    }

    if (attempt < MAX_ATTEMPTS) {
      await sleep(500 * attempt); // 500ms, 1000ms
    }
  }

  throw new Error(
    `Cloudinary আপলোড ব্যর্থ: ${lastErr?.message ?? "নেটওয়ার্ক ত্রুটি"}`
  );
}

/**
 * Check whether a URL is already a Cloudinary URL
 * (avoids re-uploading images that are already on Cloudinary).
 */
export function isCloudinaryUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.includes("res.cloudinary.com") || url.includes("cloudinary.com");
}

/**
 * Build an optimised Cloudinary delivery URL with transforms.
 */
export function getOptimizedUrl(
  url: string,
  options: { width?: number; height?: number; quality?: string } = {}
): string {
  if (!isCloudinaryUrl(url)) return url;
  const { width, height, quality = "auto" } = options;
  // Insert transforms before /upload/
  const transforms: string[] = [`q_${quality}`, "f_auto"];
  if (width) transforms.push(`w_${width}`);
  if (height) transforms.push(`h_${height}`);
  if (width || height) transforms.push("c_fill");
  return url.replace("/upload/", `/upload/${transforms.join(",")}/`);
}
