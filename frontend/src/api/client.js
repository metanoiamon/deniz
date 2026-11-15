// آدرس سرور (بدون /api). در frontend/.env:  VITE_API_URL=http://localhost:3000
const ORIGIN = (import.meta.env.VITE_API_URL || "http://localhost:3000").replace(/\/+$/, "");

export const API_BASE = `${ORIGIN}/api`;

/**
 * درخواست JSON به بک‌اند.
 * - خطاها همان پیام فارسی سرور را دارند (error.message).
 * - برای مسیرهای ادمین `auth: true` بدهید تا کوکی ورود همراه درخواست برود.
 */
export async function api(path, { method = "GET", body, signal, auth = false } = {}) {
  let response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      signal,
      credentials: auth ? "include" : "same-origin",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error("اتصال به سرور برقرار نشد. اینترنت را بررسی کن و دوباره تلاش کن.");
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || `خطای سرور (${response.status})`);
  }

  return data;
}

// بک‌اند فقط اسم فایل را نگه می‌دارد؛ عکس‌ها از /uploads/products/ سرو می‌شوند.
// «placeholder.png» یعنی عکسی ثبت نشده، پس undefined برمی‌گردد تا آیکن جایگزین نشان داده شود.
export function productImageUrl(image) {
  if (!image || image === "placeholder.png") return undefined;
  if (/^(https?:)?\/\//.test(image) || image.startsWith("/")) return image;
  return `${ORIGIN}/uploads/products/${image}`;
}

export function bannerImageUrl(image) {
  if (!image) return undefined;
  if (/^(https?:)?\/\//.test(image) || image.startsWith("/")) return image;
  return `${ORIGIN}/uploads/banners/${image}`;
}
