import { useEffect, useMemo, useState } from "react";
import "./admin.css";

import foodData from "../../data/foodMenu.json";
import cafeData from "../../data/cafeMenu.json";

const MENUS = {
  food: { label: "منوی غذا", initial: foodData },
  cafe: { label: "منوی کافی‌شاپ", initial: cafeData },
};

const GIT_COMMANDS = `git add src/data
git commit -m "update menu"
git push`;

const fa = (n) => new Intl.NumberFormat("fa-IR").format(Number(n) || 0);
const uid = (prefix) => `${prefix}-${Date.now().toString(36)}`;

function move(list, index, dir) {
  const target = index + dir;
  if (target < 0 || target >= list.length) return list;
  const copy = [...list];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

const EMPTY_PRODUCT = {
  name: "",
  description: "",
  price: "",
  image: "",
  isAvailable: true,
};

const AdminPanel = ({ onClose }) => {
  const [menuKey, setMenuKey] = useState("food");
  const [drafts, setDrafts] = useState(() => ({
    food: structuredClone(foodData),
    cafe: structuredClone(cafeData),
  }));
  const [dirty, setDirty] = useState({ food: false, cafe: false });
  const [activeCat, setActiveCat] = useState(foodData.categories[0]?.id);
  const [editor, setEditor] = useState(null); // {mode, product}
  const [catEditor, setCatEditor] = useState(null); // {mode, id, name}
  const [status, setStatus] = useState(null); // {type, text}

  const draft = drafts[menuKey];
  const { categories, products } = draft;

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && !editor && !catEditor && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, editor, catEditor]);

  const visible = useMemo(
    () => products.filter((p) => p.categoryId === activeCat),
    [products, activeCat]
  );

  const update = (fn) => {
    setDrafts((d) => ({ ...d, [menuKey]: fn(d[menuKey]) }));
    setDirty((d) => ({ ...d, [menuKey]: true }));
    setStatus(null);
  };

  const switchMenu = (key) => {
    setMenuKey(key);
    setActiveCat(drafts[key].categories[0]?.id);
    setStatus(null);
  };

  /* ---------- دسته‌ها ---------- */

  const saveCategory = () => {
    const name = catEditor.name.trim();
    if (!name) return;
    if (catEditor.mode === "add") {
      const id = uid("cat");
      update((d) => ({ ...d, categories: [...d.categories, { id, name }] }));
      setActiveCat(id);
    } else {
      update((d) => ({
        ...d,
        categories: d.categories.map((c) =>
          c.id === catEditor.id ? { ...c, name } : c
        ),
      }));
    }
    setCatEditor(null);
  };

  const deleteCategory = (cat) => {
    const count = products.filter((p) => p.categoryId === cat.id).length;
    const msg = count
      ? `دسته «${cat.name}» و ${fa(count)} محصول داخل آن حذف شود؟`
      : `دسته «${cat.name}» حذف شود؟`;
    if (!window.confirm(msg)) return;
    update((d) => ({
      categories: d.categories.filter((c) => c.id !== cat.id),
      products: d.products.filter((p) => p.categoryId !== cat.id),
    }));
    const rest = categories.filter((c) => c.id !== cat.id);
    setActiveCat(rest[0]?.id);
  };

  const moveCategory = (i, dir) =>
    update((d) => ({ ...d, categories: move(d.categories, i, dir) }));

  /* ---------- محصولات ---------- */

  const saveProduct = () => {
    const { mode, product } = editor;
    const clean = {
      ...product,
      name: product.name.trim(),
      description: product.description.trim(),
      price: Number(product.price),
      image: product.image.trim(),
    };
    if (!clean.name || !(clean.price >= 0) || product.price === "") return;
    if (!clean.image) delete clean.image;

    if (mode === "add") {
      update((d) => ({
        ...d,
        products: [...d.products, { ...clean, id: uid("item") }],
      }));
    } else {
      update((d) => ({
        ...d,
        products: d.products.map((p) => (p.id === clean.id ? clean : p)),
      }));
    }
    setEditor(null);
  };

  const deleteProduct = (p) => {
    if (!window.confirm(`«${p.name}» حذف شود؟`)) return;
    update((d) => ({ ...d, products: d.products.filter((x) => x.id !== p.id) }));
  };

  const toggleAvailable = (id) =>
    update((d) => ({
      ...d,
      products: d.products.map((p) =>
        p.id === id ? { ...p, isAvailable: !p.isAvailable } : p
      ),
    }));

  const moveProduct = (id, dir) =>
    update((d) => {
      const globalIdx = d.products.findIndex((p) => p.id === id);
      const cat = d.products[globalIdx].categoryId;
      // جابه‌جایی با نزدیک‌ترین محصول همان دسته
      let t = globalIdx + dir;
      while (t >= 0 && t < d.products.length && d.products[t].categoryId !== cat)
        t += dir;
      if (t < 0 || t >= d.products.length) return d;
      const copy = [...d.products];
      [copy[globalIdx], copy[t]] = [copy[t], copy[globalIdx]];
      return { ...d, products: copy };
    });

  /* ---------- ذخیره ---------- */

  const downloadJson = () => {
    const file = menuKey === "food" ? "foodMenu.json" : "cafeMenu.json";
    const blob = new Blob([JSON.stringify(draft, null, 2) + "\n"], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = file;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const save = async () => {
    try {
      const res = await fetch("/__admin/save-menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ menu: menuKey, data: draft }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.message);
      setDirty((d) => ({ ...d, [menuKey]: false }));
      setStatus({ type: "ok", text: "ذخیره شد. حالا تغییرات را با git به گیت‌هاب بفرست." });
    } catch (err) {
      setStatus({
        type: "err",
        text: `ذخیره خودکار انجام نشد (${err.message}). فایل را دانلود کن و جای src/data بگذار.`,
      });
    }
  };

  const copyGit = () => navigator.clipboard?.writeText(GIT_COMMANDS);

  const catName = (id) => categories.find((c) => c.id === id)?.name;

  return (
    <div className="adm-overlay" dir="rtl" role="dialog" aria-label="پنل مدیریت منو">
      <aside className="adm-side">
        <div className="adm-brand">
          <span>پنل مدیریت منو</span>
          <small>فقط روی کامپیوتر ادمین</small>
        </div>

        <nav className="adm-tabs">
          {Object.entries(MENUS).map(([key, m]) => (
            <button
              key={key}
              type="button"
              className={menuKey === key ? "active" : ""}
              onClick={() => switchMenu(key)}
            >
              {m.label}
              {dirty[key] && <em>●</em>}
            </button>
          ))}
        </nav>

        <button type="button" className="adm-exit" onClick={onClose}>
          بستن پنل
        </button>
      </aside>

      <main className="adm-main">
        <div className="adm-topbar">
          <h2 className="adm-title">{MENUS[menuKey].label}</h2>
          <div className="adm-topbar-actions">
            <button type="button" className="adm-btn ghost" onClick={downloadJson}>
              دانلود JSON
            </button>
            <button
              type="button"
              className="adm-btn primary"
              onClick={save}
              disabled={!dirty[menuKey]}
            >
              ذخیره تغییرات
            </button>
          </div>
        </div>

        {status && (
          <div className={`adm-status ${status.type}`}>
            <p>{status.text}</p>
            {status.type === "ok" && (
              <>
                <pre dir="ltr">{GIT_COMMANDS}</pre>
                <button type="button" className="adm-btn ghost" onClick={copyGit}>
                  کپی دستورها
                </button>
              </>
            )}
          </div>
        )}

        {/* دسته‌ها */}
        <h3 className="adm-sub">دسته‌بندی‌ها</h3>
        <div className="adm-cats">
          {categories.map((c, i) => (
            <div
              key={c.id}
              className={`adm-cat ${c.id === activeCat ? "active" : ""}`}
            >
              <button type="button" className="adm-cat-name" onClick={() => setActiveCat(c.id)}>
                {c.name}
              </button>
              <span className="adm-mini">
                <button type="button" aria-label="انتقال به قبل" onClick={() => moveCategory(i, -1)}>→</button>
                <button type="button" aria-label="انتقال به بعد" onClick={() => moveCategory(i, 1)}>←</button>
                <button type="button" aria-label="ویرایش دسته" onClick={() => setCatEditor({ mode: "edit", id: c.id, name: c.name })}>✎</button>
                <button type="button" aria-label="حذف دسته" className="danger" onClick={() => deleteCategory(c)}>✕</button>
              </span>
            </div>
          ))}
          <button
            type="button"
            className="adm-cat add"
            onClick={() => setCatEditor({ mode: "add", name: "" })}
          >
            + دسته جدید
          </button>
        </div>

        {/* محصولات */}
        <div className="adm-sub-row">
          <h3 className="adm-sub">
            {catName(activeCat) || "محصولات"} ({fa(visible.length)})
          </h3>
          {activeCat && (
            <button
              type="button"
              className="adm-btn primary"
              onClick={() =>
                setEditor({
                  mode: "add",
                  product: { ...EMPTY_PRODUCT, categoryId: activeCat },
                })
              }
            >
              + محصول جدید
            </button>
          )}
        </div>

        <div className="adm-list">
          {visible.length === 0 && (
            <p className="adm-empty">این دسته هنوز محصولی ندارد.</p>
          )}
          {visible.map((p) => (
            <div className="adm-row" key={p.id}>
              <div className="adm-row-main">
                <strong>{p.name}</strong>
                <span>{p.description}</span>
              </div>
              <div className="adm-row-price">{fa(p.price)} تومان</div>
              <button
                type="button"
                className={`adm-switch ${p.isAvailable ? "on" : ""}`}
                onClick={() => toggleAvailable(p.id)}
                aria-pressed={p.isAvailable}
                aria-label={`${p.name} ${p.isAvailable ? "موجود" : "ناموجود"}`}
              >
                <span />
              </button>
              <span className="adm-mini">
                <button type="button" aria-label="بالا" onClick={() => moveProduct(p.id, -1)}>↑</button>
                <button type="button" aria-label="پایین" onClick={() => moveProduct(p.id, 1)}>↓</button>
                <button type="button" aria-label="ویرایش" onClick={() => setEditor({ mode: "edit", product: { ...p, image: p.image || "" } })}>✎</button>
                <button type="button" aria-label="حذف" className="danger" onClick={() => deleteProduct(p)}>✕</button>
              </span>
            </div>
          ))}
        </div>
      </main>

      {/* فرم محصول */}
      {editor && (
        <div className="adm-modal" onClick={() => setEditor(null)}>
          <form
            className="adm-form"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              saveProduct();
            }}
          >
            <h3>{editor.mode === "add" ? "محصول جدید" : "ویرایش محصول"}</h3>

            <label>
              نام
              <input
                required
                autoFocus
                value={editor.product.name}
                onChange={(e) => setEditor({ ...editor, product: { ...editor.product, name: e.target.value } })}
              />
            </label>

            <label>
              توضیح
              <textarea
                rows="2"
                value={editor.product.description}
                onChange={(e) => setEditor({ ...editor, product: { ...editor.product, description: e.target.value } })}
              />
            </label>

            <div className="adm-form-grid">
              <label>
                قیمت (تومان)
                <input
                  required
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={editor.product.price}
                  onChange={(e) => setEditor({ ...editor, product: { ...editor.product, price: e.target.value } })}
                />
              </label>
              <label>
                دسته
                <select
                  value={editor.product.categoryId}
                  onChange={(e) => setEditor({ ...editor, product: { ...editor.product, categoryId: e.target.value } })}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              مسیر عکس (اختیاری)
              <input
                dir="ltr"
                placeholder="/images/pizza.png"
                value={editor.product.image}
                onChange={(e) => setEditor({ ...editor, product: { ...editor.product, image: e.target.value } })}
              />
              <small>اول عکس را داخل پوشه public/images بگذار.</small>
            </label>

            <label className="adm-check">
              <input
                type="checkbox"
                checked={editor.product.isAvailable}
                onChange={(e) => setEditor({ ...editor, product: { ...editor.product, isAvailable: e.target.checked } })}
              />
              موجود است
            </label>

            <div className="adm-form-actions">
              <button type="button" className="adm-btn ghost" onClick={() => setEditor(null)}>انصراف</button>
              <button type="submit" className="adm-btn primary">
                {editor.mode === "add" ? "افزودن محصول" : "ثبت ویرایش"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* فرم دسته */}
      {catEditor && (
        <div className="adm-modal" onClick={() => setCatEditor(null)}>
          <form
            className="adm-form"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              saveCategory();
            }}
          >
            <h3>{catEditor.mode === "add" ? "دسته جدید" : "ویرایش نام دسته"}</h3>
            <label>
              نام دسته
              <input
                required
                autoFocus
                value={catEditor.name}
                onChange={(e) => setCatEditor({ ...catEditor, name: e.target.value })}
              />
            </label>
            <div className="adm-form-actions">
              <button type="button" className="adm-btn ghost" onClick={() => setCatEditor(null)}>انصراف</button>
              <button type="submit" className="adm-btn primary">ثبت</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;