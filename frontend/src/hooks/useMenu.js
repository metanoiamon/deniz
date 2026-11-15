import { useEffect, useMemo, useState } from "react";
import { api, productImageUrl } from "../api/client";

/*
  بک‌اند منو را در سه لیست می‌دهد:
    GET /api/menu-types   → تب‌های منو (مثلاً «منوی غذا»، «منوی کافی‌شاپ»)
    GET /api/categories   → دسته‌ها (هرکدام menuTypeId دارد)
    GET /api/products     → محصولات (هرکدام categoryId دارد)

  FoodMenu و CafeMenu هر دو از همین سه درخواست استفاده می‌کنند؛ نتیجه ۶۰ ثانیه
  در حافظه می‌ماند تا برای هر بخش درخواست جدا نرود.
*/

const TTL = 60_000;
let cache = { at: 0, promise: null };

function loadMenu(force = false) {
  const fresh = cache.promise && Date.now() - cache.at < TTL;
  if (!force && fresh) return cache.promise;

  const promise = Promise.all([
    api("/menu-types"),
    api("/categories"),
    api("/products"),
  ]).then(([menuTypes, categories, products]) => ({ menuTypes, categories, products }));

  cache = { at: Date.now(), promise };

  // درخواست ناموفق نباید در کش بماند
  promise.catch(() => {
    if (cache.promise === promise) cache = { at: 0, promise: null };
  });

  return promise;
}

/**
 * @param pickMenuType تابعی که از بین تب‌های منو، تب این بخش را برمی‌گرداند
 *                     (باید خارج از کامپوننت تعریف شود، نه داخل رندر)
 */
export function useMenu(pickMenuType) {
  const [raw, setRaw] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError("");

    loadMenu(attempt > 0)
      .then((result) => !cancelled && setRaw(result))
      .catch((e) => !cancelled && setError(e.message || "دریافت منو ممکن نشد."));

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const menu = useMemo(() => {
    if (!raw) return null;

    const type = pickMenuType(raw.menuTypes);
    if (!type) return { found: false, data: { categories: [], products: [] } };

    const categories = raw.categories
      .filter((c) => c.menuTypeId === type.id)
      .map(({ id, name }) => ({ id, name }));

    const ids = new Set(categories.map((c) => c.id));

    const products = raw.products
      .filter((p) => ids.has(p.categoryId))
      .map((p) => ({ ...p, image: productImageUrl(p.image) }));

    return { found: true, data: { categories, products } };
  }, [raw, pickMenuType]);

  return {
    data: menu?.data ?? null,
    found: menu?.found ?? false,
    loading: !raw && !error,
    error,
    retry: () => setAttempt((n) => n + 1),
  };
}
