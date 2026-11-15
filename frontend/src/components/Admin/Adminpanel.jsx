import { useCallback, useEffect, useState } from "react";
import "./admin.css";

import { API_BASE, api, productImageUrl } from "../../api/client";

/* ==========================================================================
   پنل مدیریت منو — متصل به API بک‌اند (ورود با کوکی)
   ========================================================================== */

const MANAGER_ROLES = ["DEVELOPER", "MAIN"];
const ROLE_LABELS = { DEVELOPER: "توسعه‌دهنده", MAIN: "مدیر", SECONDARY: "کارمند" };
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const fa = (n) => new Intl.NumberFormat("fa-IR").format(Number(n) || 0);

// ارقام فارسی/عربی را انگلیسی می‌کند تا قیمت با کیبورد فارسی هم درست ثبت شود
const toEnDigits = (value) =>
  String(value)
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));

async function uploadImage(file) {
  const form = new FormData();
  form.append("image", file);

  let response;
  try {
    response = await fetch(`${API_BASE}/admin/upload`, {
      method: "POST",
      body: form,
      credentials: "include",
    });
  } catch {
    throw new Error("اتصال به سرور برقرار نشد.");
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || "آپلود عکس انجام نشد.");
  return data.filename;
}

function swap(list, index, dir) {
  const target = index + dir;
  if (target < 0 || target >= list.length) return null;
  const copy = [...list];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

/* ---------- ورود ---------- */

function Login({ onSuccess, onClose }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { admin } = await api("/admin/login", {
        method: "POST",
        auth: true,
        body: { username, password },
      });
      onSuccess(admin);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="adm-login-wrap">
      <form className="adm-login" onSubmit={submit}>
        <h2>ورود به پنل مدیریت</h2>
        <p>با نام کاربری و رمز عبور ادمین وارد شوید.</p>

        <label>
          نام کاربری
          <input
            dir="ltr"
            autoFocus
            autoComplete="username"
            autoCapitalize="none"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </label>

        <label>
          رمز عبور
          <input
            dir="ltr"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error && <p className="adm-error" role="alert">{error}</p>}

        <button type="submit" className="adm-btn primary adm-btn-block" disabled={loading}>
          {loading ? "در حال ورود…" : "ورود"}
        </button>
        <button type="button" className="adm-btn ghost adm-btn-block" onClick={onClose}>
          بستن
        </button>
      </form>
    </div>
  );
}

/* ---------- فرم‌ها (پنجره‌ی پایین‌کشو روی موبایل) ---------- */

function Modal({ title, onClose, children }) {
  return (
    <div className="adm-modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="adm-form" role="dialog" aria-modal="true" aria-label={title}>
        <div className="adm-form-head">
          <h3>{title}</h3>
          <button type="button" className="adm-icon" onClick={onClose} aria-label="بستن">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ProductForm({ product, categories, menuTypes, defaultCategoryId, onSubmit, onCancel, notify }) {
  const editing = Boolean(product?.id);
  const [form, setForm] = useState(() => ({
    name: product?.name ?? "",
    description: product?.description ?? "",
    price: product ? String(product.price) : "",
    categoryId: String(product?.categoryId ?? defaultCategoryId ?? ""),
    isActive: product?.isActive ?? true,
    isAvailable: product?.isAvailable ?? true,
    image: product?.image ?? "",
    imageChanged: false,
    uploading: false,
    saving: false,
  }));

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const preview = productImageUrl(form.image);

  async function pickImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
      notify("err", "فقط عکس JPG، PNG، WEBP یا GIF قابل قبول است.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      notify("err", "حجم عکس بیشتر از ۵ مگابایت است.");
      return;
    }

    set({ uploading: true });
    try {
      const filename = await uploadImage(file);
      set({ image: filename, imageChanged: true, uploading: false });
    } catch (e) {
      set({ uploading: false });
      notify("err", e.message);
    }
  }

  async function submit(event) {
    event.preventDefault();
    const digits = toEnDigits(form.price).replace(/\D/g, "");
    if (!form.name.trim() || !digits) return;

    set({ saving: true });
    const ok = await onSubmit({
      name: form.name.trim(),
      description: form.description.trim(),
      price: Number(digits),
      categoryId: Number(form.categoryId),
      isActive: form.isActive,
      isAvailable: form.isAvailable,
      ...(form.imageChanged ? { image: form.image } : {}),
    });
    if (!ok) set({ saving: false });
  }

  return (
    <Modal title={editing ? "ویرایش محصول" : "محصول جدید"} onClose={onCancel}>
      <form onSubmit={submit} className="adm-form-body">
        <div className="adm-photo">
          <div className="adm-photo-preview">
            {preview ? <img src={preview} alt="" /> : <span>بدون عکس</span>}
          </div>
          <label className="adm-btn ghost adm-file">
            {form.uploading ? "در حال آپلود…" : preview ? "تغییر عکس" : "انتخاب عکس"}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={pickImage} disabled={form.uploading} />
          </label>
        </div>

        <label>
          نام
          <input required maxLength={80} value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </label>

        <label>
          توضیح
          <textarea rows="3" maxLength={500} value={form.description} onChange={(e) => set({ description: e.target.value })} />
        </label>

        <div className="adm-form-grid">
          <label>
            قیمت (تومان)
            <input required inputMode="numeric" value={form.price} onChange={(e) => set({ price: e.target.value })} />
          </label>
          <label>
            دسته‌بندی
            <select value={form.categoryId} onChange={(e) => set({ categoryId: e.target.value })} required>
              {menuTypes.map((t) => (
                <optgroup key={t.id} label={t.name}>
                  {categories
                    .filter((c) => c.menuTypeId === t.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>

        <label className="adm-check">
          <input type="checkbox" checked={form.isAvailable} onChange={(e) => set({ isAvailable: e.target.checked })} />
          موجود است <small>(اگر خاموش باشد، با برچسب «ناموجود» نمایش داده می‌شود)</small>
        </label>

        <label className="adm-check">
          <input type="checkbox" checked={form.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
          در منو نمایش داده شود <small>(خاموش = کاملاً مخفی)</small>
        </label>

        <div className="adm-form-actions">
          <button type="button" className="adm-btn ghost" onClick={onCancel}>انصراف</button>
          <button type="submit" className="adm-btn primary" disabled={form.saving || form.uploading}>
            {form.saving ? "در حال ذخیره…" : editing ? "ثبت ویرایش" : "افزودن محصول"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CategoryForm({ category, menuTypes, defaultTypeId, onSubmit, onCancel }) {
  const editing = Boolean(category?.id);
  const [name, setName] = useState(category?.name ?? "");
  const [menuTypeId, setMenuTypeId] = useState(String(category?.menuTypeId ?? defaultTypeId ?? ""));
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const ok = await onSubmit({ name: name.trim(), menuTypeId: Number(menuTypeId) });
    if (!ok) setSaving(false);
  }

  return (
    <Modal title={editing ? "ویرایش دسته‌بندی" : "دسته‌بندی جدید"} onClose={onCancel}>
      <form onSubmit={submit} className="adm-form-body">
        <label>
          نام دسته‌بندی
          <input required autoFocus maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <label>
          منوی اصلی
          <select value={menuTypeId} onChange={(e) => setMenuTypeId(e.target.value)} required>
            {menuTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>

        <div className="adm-form-actions">
          <button type="button" className="adm-btn ghost" onClick={onCancel}>انصراف</button>
          <button type="submit" className="adm-btn primary" disabled={saving}>
            {saving ? "در حال ذخیره…" : "ثبت"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TypeForm({ type, onSubmit, onDelete, onCancel }) {
  const editing = Boolean(type?.id);
  const [name, setName] = useState(type?.name ?? "");
  const [isActive, setIsActive] = useState(type?.isActive ?? true);
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const ok = await onSubmit({ name: name.trim(), isActive });
    if (!ok) setSaving(false);
  }

  return (
    <Modal title={editing ? "ویرایش منوی اصلی" : "منوی اصلی جدید"} onClose={onCancel}>
      <form onSubmit={submit} className="adm-form-body">
        <label>
          نام (مثلاً «منوی غذا»)
          <input required autoFocus maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <label className="adm-check">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          در سایت نمایش داده شود
        </label>

        <div className="adm-form-actions">
          {editing && (
            <button type="button" className="adm-btn danger" onClick={onDelete}>حذف</button>
          )}
          <button type="button" className="adm-btn ghost" onClick={onCancel}>انصراف</button>
          <button type="submit" className="adm-btn primary" disabled={saving}>
            {saving ? "در حال ذخیره…" : "ثبت"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------- مدیریت منو ---------- */

function MenuManager({ admin, onLogout, onAuthLost, onClose }) {
  const isManager = MANAGER_ROLES.includes(admin.role);

  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [typeState, setTypeState] = useState(null);
  const [catState, setCatState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null); // {kind: "product"|"category"|"type", item?}

  const notify = useCallback((type, text) => setToast({ type, text, key: Date.now() }), []);

  const load = useCallback(async () => {
    const [t, c, p] = await Promise.all([
      api("/admin/menu-types", { auth: true }),
      api("/admin/categories", { auth: true }),
      api("/admin/products", { auth: true }),
    ]);
    setData({ menuTypes: t.menuTypes, categories: c.categories, products: p.products });
  }, []);

  useEffect(() => {
    load().catch((e) => {
      if (e.status === 401) onAuthLost();
      else setLoadError(e.message);
    });
  }, [load, onAuthLost]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (modal) setModal(null);
      else onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal, onClose]);

  // اجرای یک عملیات، بعد بارگذاری دوباره‌ی لیست‌ها
  async function run(action, successText) {
    setBusy(true);
    try {
      await action();
      await load();
      if (successText) notify("ok", successText);
      return true;
    } catch (e) {
      if (e.status === 401) onAuthLost();
      else notify("err", e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="adm-center">
        <p className="adm-error">{loadError}</p>
        <button type="button" className="adm-btn primary" onClick={() => { setLoadError(""); load().catch((e) => setLoadError(e.message)); }}>
          تلاش دوباره
        </button>
      </div>
    );
  }

  if (!data) return <div className="adm-center"><p>در حال بارگذاری…</p></div>;

  const { menuTypes, categories, products } = data;

  const type = menuTypes.find((t) => t.id === typeState) ?? menuTypes[0] ?? null;
  const typeCats = type ? categories.filter((c) => c.menuTypeId === type.id) : [];
  const cat = typeCats.find((c) => c.id === catState) ?? typeCats[0] ?? null;
  const visible = cat ? products.filter((p) => p.categoryId === cat.id) : [];

  /* --- منوهای اصلی --- */

  const saveType = (body) =>
    run(
      () =>
        modal.item?.id
          ? api(`/admin/menu-types/${modal.item.id}`, { method: "PATCH", auth: true, body })
          : api("/admin/menu-types", { method: "POST", auth: true, body }),
      "ذخیره شد."
    ).then((ok) => {
      if (ok) setModal(null);
      return ok;
    });

  async function deleteType() {
    const target = modal.item;
    if (!window.confirm(`منوی اصلی «${target.name}» حذف شود؟ (فقط اگر خالی باشد حذف می‌شود)`)) return;
    const ok = await run(() => api(`/admin/menu-types/${target.id}`, { method: "DELETE", auth: true }), "حذف شد.");
    if (ok) setModal(null);
  }

  function moveType(dir) {
    const index = menuTypes.findIndex((t) => t.id === type.id);
    const ids = swap(menuTypes.map((t) => t.id), index, dir);
    if (ids) run(() => api("/admin/menu-types/order", { method: "PUT", auth: true, body: { ids } }));
  }

  /* --- دسته‌ها --- */

  const saveCategory = (body) =>
    run(
      () =>
        modal.item?.id
          ? api(`/admin/categories/${modal.item.id}`, { method: "PATCH", auth: true, body })
          : api("/admin/categories", { method: "POST", auth: true, body }),
      "ذخیره شد."
    ).then((ok) => {
      if (ok) setModal(null);
      return ok;
    });

  function deleteCategory() {
    const count = cat._count?.products ?? 0;
    const text = count
      ? `دسته‌بندی «${cat.name}» همراه با ${fa(count)} محصول داخل آن حذف شود؟`
      : `دسته‌بندی «${cat.name}» حذف شود؟`;
    if (!window.confirm(text)) return;
    run(
      () => api(`/admin/categories/${cat.id}${count ? "?withProducts=1" : ""}`, { method: "DELETE", auth: true }),
      "حذف شد."
    );
  }

  function moveCategory(dir) {
    const index = typeCats.findIndex((c) => c.id === cat.id);
    const ids = swap(typeCats.map((c) => c.id), index, dir);
    if (ids) run(() => api("/admin/categories/order", { method: "PUT", auth: true, body: { menuTypeId: type.id, ids } }));
  }

  /* --- محصولات --- */

  const saveProduct = (body) =>
    run(
      () =>
        modal.item?.id
          ? api(`/admin/products/${modal.item.id}`, { method: "PATCH", auth: true, body })
          : api("/admin/products", { method: "POST", auth: true, body }),
      "ذخیره شد."
    ).then((ok) => {
      if (ok) setModal(null);
      return ok;
    });

  const patchProduct = (product, body) =>
    run(() => api(`/admin/products/${product.id}`, { method: "PATCH", auth: true, body }));

  function deleteProduct(product) {
    if (!window.confirm(`«${product.name}» حذف شود؟`)) return;
    run(() => api(`/admin/products/${product.id}`, { method: "DELETE", auth: true }), "حذف شد.");
  }

  function moveProduct(product, dir) {
    const index = visible.findIndex((p) => p.id === product.id);
    const ids = swap(visible.map((p) => p.id), index, dir);
    if (ids) run(() => api("/admin/products/order", { method: "PUT", auth: true, body: { categoryId: cat.id, ids } }));
  }

  return (
    <div className={`adm-shell${busy ? " is-busy" : ""}`}>
      <header className="adm-header">
        <div className="adm-header-title">
          <strong>پنل مدیریت منو</strong>
          <small>{admin.name} · {ROLE_LABELS[admin.role] ?? admin.role}</small>
        </div>
        <div className="adm-header-actions">
          <button type="button" className="adm-btn ghost" onClick={onLogout}>خروج</button>
          <button type="button" className="adm-btn ghost" onClick={onClose}>بستن</button>
        </div>
      </header>

      <main className="adm-main">
        {/* منوهای اصلی */}
        <div className="adm-tabs" role="tablist">
          {menuTypes.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={type?.id === t.id}
              className={`adm-tab${type?.id === t.id ? " active" : ""}${t.isActive ? "" : " is-hidden"}`}
              onClick={() => setTypeState(t.id)}
            >
              {t.name}
              {!t.isActive && <em>مخفی</em>}
            </button>
          ))}
          {isManager && (
            <button type="button" className="adm-tab add" onClick={() => setModal({ kind: "type" })}>
              + منوی جدید
            </button>
          )}
        </div>

        {isManager && type && (
          <div className="adm-toolbar">
            <span>منوی «{type.name}»:</span>
            <button type="button" className="adm-chipbtn" onClick={() => moveType(-1)} aria-label="انتقال به قبل">→ قبل</button>
            <button type="button" className="adm-chipbtn" onClick={() => moveType(1)} aria-label="انتقال به بعد">بعد ←</button>
            <button type="button" className="adm-chipbtn" onClick={() => setModal({ kind: "type", item: type })}>ویرایش</button>
          </div>
        )}

        {!type ? (
          <p className="adm-empty">
            {isManager ? "هنوز منویی ساخته نشده. با «+ منوی جدید» شروع کنید." : "هنوز منویی ساخته نشده؛ از مدیر بخواهید بسازد."}
          </p>
        ) : (
          <>
            {/* دسته‌ها */}
            <div className="adm-sub-row">
              <h3 className="adm-sub">دسته‌بندی‌ها</h3>
              <button type="button" className="adm-btn primary" onClick={() => setModal({ kind: "category" })}>
                + دسته‌بندی
              </button>
            </div>

            {typeCats.length === 0 ? (
              <p className="adm-empty">این منو هنوز دسته‌بندی ندارد.</p>
            ) : (
              <>
                <div className="adm-cats">
                  {typeCats.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`adm-cat${c.id === cat?.id ? " active" : ""}`}
                      onClick={() => setCatState(c.id)}
                    >
                      {c.name}
                      <em>{fa(c._count?.products ?? 0)}</em>
                    </button>
                  ))}
                </div>

                {cat && (
                  <div className="adm-toolbar">
                    <span>دسته‌ی «{cat.name}»:</span>
                    <button type="button" className="adm-chipbtn" onClick={() => moveCategory(-1)}>→ قبل</button>
                    <button type="button" className="adm-chipbtn" onClick={() => moveCategory(1)}>بعد ←</button>
                    <button type="button" className="adm-chipbtn" onClick={() => setModal({ kind: "category", item: cat })}>ویرایش</button>
                    <button type="button" className="adm-chipbtn danger" onClick={deleteCategory}>حذف</button>
                  </div>
                )}
              </>
            )}

            {/* محصولات */}
            {cat && (
              <>
                <div className="adm-sub-row">
                  <h3 className="adm-sub">{cat.name} ({fa(visible.length)})</h3>
                  <button type="button" className="adm-btn primary" onClick={() => setModal({ kind: "product" })}>
                    + محصول جدید
                  </button>
                </div>

                <div className="adm-list">
                  {visible.length === 0 && <p className="adm-empty">این دسته هنوز محصولی ندارد.</p>}

                  {visible.map((p, index) => {
                    const img = productImageUrl(p.image);
                    return (
                      <article className={`adm-row${p.isActive ? "" : " is-hidden"}`} key={p.id}>
                        <div className="adm-thumb">{img ? <img src={img} alt="" loading="lazy" /> : <span>🍽</span>}</div>

                        <div className="adm-row-main">
                          <strong>
                            {p.name}
                            {!p.isActive && <em className="adm-flag">مخفی</em>}
                          </strong>
                          <span>{p.description || "بدون توضیح"}</span>
                          <b>{fa(p.price)} تومان</b>
                        </div>

                        <div className="adm-row-controls">
                          <label className="adm-toggle">
                            <button
                              type="button"
                              className={`adm-switch${p.isAvailable ? " on" : ""}`}
                              onClick={() => patchProduct(p, { isAvailable: !p.isAvailable })}
                              aria-pressed={p.isAvailable}
                              aria-label={`${p.name}: ${p.isAvailable ? "موجود" : "ناموجود"}`}
                            >
                              <span />
                            </button>
                            {p.isAvailable ? "موجود" : "ناموجود"}
                          </label>

                          <div className="adm-mini">
                            <button type="button" aria-label="بالا" disabled={index === 0} onClick={() => moveProduct(p, -1)}>↑</button>
                            <button type="button" aria-label="پایین" disabled={index === visible.length - 1} onClick={() => moveProduct(p, 1)}>↓</button>
                            <button type="button" aria-label={p.isActive ? "مخفی کردن" : "نمایش دادن"} onClick={() => patchProduct(p, { isActive: !p.isActive })}>
                              {p.isActive ? "👁" : "🚫"}
                            </button>
                            <button type="button" aria-label="ویرایش" onClick={() => setModal({ kind: "product", item: p })}>✎</button>
                            <button type="button" className="danger" aria-label="حذف" onClick={() => deleteProduct(p)}>✕</button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </main>

      {modal?.kind === "product" && (
        <ProductForm
          product={modal.item}
          categories={categories}
          menuTypes={menuTypes}
          defaultCategoryId={cat?.id}
          onSubmit={saveProduct}
          onCancel={() => setModal(null)}
          notify={notify}
        />
      )}

      {modal?.kind === "category" && (
        <CategoryForm
          category={modal.item}
          menuTypes={menuTypes}
          defaultTypeId={type?.id}
          onSubmit={saveCategory}
          onCancel={() => setModal(null)}
        />
      )}

      {modal?.kind === "type" && (
        <TypeForm type={modal.item} onSubmit={saveType} onDelete={deleteType} onCancel={() => setModal(null)} />
      )}

      {toast && (
        <div key={toast.key} className={`adm-toast ${toast.type}`} role="status">
          {toast.text}
        </div>
      )}
    </div>
  );
}

/* ---------- پوسته: بررسی ورود ---------- */

const AdminPanel = ({ onClose }) => {
  const [auth, setAuth] = useState({ state: "checking", admin: null });

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // اگر قبلاً وارد شده باشید، کوکی معتبر است و دوباره رمز نمی‌خواهد
  useEffect(() => {
    let cancelled = false;
    api("/admin/me", { auth: true })
      .then(({ admin }) => !cancelled && setAuth({ state: "ready", admin }))
      .catch(() => !cancelled && setAuth({ state: "login", admin: null }));
    return () => {
      cancelled = true;
    };
  }, []);

  const authLost = useCallback(() => setAuth({ state: "login", admin: null }), []);

  async function logout() {
    try {
      await api("/admin/logout", { method: "POST", auth: true });
    } catch {
      // حتی اگر درخواست خطا بدهد، از پنل خارج می‌شویم
    }
    setAuth({ state: "login", admin: null });
  }

  return (
    <div className="adm-overlay" dir="rtl" role="dialog" aria-label="پنل مدیریت منو">
      {auth.state === "checking" && <div className="adm-center"><p>در حال بررسی ورود…</p></div>}
      {auth.state === "login" && <Login onSuccess={(admin) => setAuth({ state: "ready", admin })} onClose={onClose} />}
      {auth.state === "ready" && (
        <MenuManager admin={auth.admin} onLogout={logout} onAuthLost={authLost} onClose={onClose} />
      )}
    </div>
  );
};

export default AdminPanel;
