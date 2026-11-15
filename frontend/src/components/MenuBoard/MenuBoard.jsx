import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { FreeMode } from "swiper/modules";

import "swiper/css";
import "swiper/css/free-mode";
import "./MenuBoard.css";

import { useCart } from "../../context/CartContext";

/* ==========================================================================
   MenuBoard — هستهٔ مشترک منوی غذا و کافی‌شاپ
   ========================================================================== */

const SORTS = [
  { id: "default", label: "پیشنهادی" },
  { id: "rating", label: "محبوب‌ترین" },
  { id: "cheap", label: "ارزان‌ترین" },
  { id: "expensive", label: "گران‌ترین" },
];

const NO_META = {};

const SLIDER_PROPS = {
  modules: [FreeMode],
  freeMode: true,
  slidesPerView: "auto",
  spaceBetween: 10,
  grabCursor: true,
  dir: "rtl",
};

/* ---------- ابزارها ---------- */

const fa = (value) => new Intl.NumberFormat("fa-IR").format(Number(value) || 0);

const faRating = (value) =>
  new Intl.NumberFormat("fa-IR", { minimumFractionDigits: 1 }).format(value);

// برای جستجو: «ي/ك» عربی و نیم‌فاصله را یکسان می‌کند
const norm = (text = "") =>
  String(text)
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u200c/g, " ")
    .toLowerCase();

const discountOf = (price, oldPrice) =>
  oldPrice && oldPrice > price ? Math.round((1 - price / oldPrice) * 100) : 0;

// «گوشت، کاهو و سس» → ["گوشت", "کاهو", "سس"]
function ingredientsOf(description = "") {
  const parts = description
    .split(/،| و /)
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length >= 3 && parts.every((part) => part.length <= 22) ? parts : [];
}

/* ---------- آیکن‌ها ---------- */

const Svg = ({ children, ...rest }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...rest}>
    {children}
  </svg>
);

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.4,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

const PlusIcon = () => (
  <Svg>
    <path d="M12 5v14M5 12h14" {...stroke} />
  </Svg>
);
const MinusIcon = () => (
  <Svg>
    <path d="M5 12h14" {...stroke} />
  </Svg>
);
const CloseIcon = () => (
  <Svg>
    <path d="M6 6l12 12M18 6L6 18" {...stroke} />
  </Svg>
);
const SearchIcon = () => (
  <Svg>
    <circle cx="11" cy="11" r="7" {...stroke} />
    <path d="M16.5 16.5L21 21" {...stroke} />
  </Svg>
);
const StarIcon = () => (
  <Svg>
    <path
      d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2 6.3 20.3l1.2-6.4L2.8 9.5l6.4-.8z"
      fill="currentColor"
    />
  </Svg>
);
const ClockIcon = () => (
  <Svg>
    <circle cx="12" cy="12" r="9" {...stroke} />
    <path d="M12 7v5l3 2" {...stroke} />
  </Svg>
);
const FlameIcon = () => (
  <Svg>
    <path d="M12 3c1 3.5-2 5-2 8a2 2 0 004 0c0-1-.5-1.5-.5-2.5C15.5 10 18 12 18 15a6 6 0 01-12 0c0-5 5-6.5 6-12z" {...stroke} />
  </Svg>
);
const BagIcon = () => (
  <Svg>
    <path d="M5 8h14l-1 12H6L5 8z" {...stroke} />
    <path d="M9 8V6a3 3 0 016 0v2" {...stroke} />
  </Svg>
);
const DefaultPlateIcon = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <circle cx="24" cy="24" r="17" fill="none" stroke="currentColor" strokeWidth="2.5" />
    <circle cx="24" cy="24" r="10" fill="none" stroke="currentColor" strokeWidth="2.5" />
  </svg>
);

/* ---------- اجزای کوچک ---------- */

// اگر عکس نبود یا لود نشد، آیکن جایگزین نشان می‌دهد (span تا داخل button معتبر بماند)
function ProductImage({ src, alt, Fallback }) {
  const [failed, setFailed] = useState(!src);

  useEffect(() => {
    setFailed(!src);
  }, [src]);

  if (failed) {
    return (
      <span className="menu-image-fallback" role="img" aria-label={alt}>
        <Fallback />
      </span>
    );
  }

  return <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

function Meta({ product }) {
  const { rating, reviews, time, calories } = product;
  if (!rating && !time && !calories) return null;

  return (
    <ul className="menu-meta">
      {rating ? (
        <li className="menu-meta-rating">
          <StarIcon />
          <b>{faRating(rating)}</b>
          {reviews ? <span>({fa(reviews)})</span> : null}
        </li>
      ) : null}
      {time ? (
        <li>
          <ClockIcon />
          {fa(time)} دقیقه
        </li>
      ) : null}
      {calories ? (
        <li className="menu-meta-calories">
          <FlameIcon />
          {fa(calories)} کالری
        </li>
      ) : null}
    </ul>
  );
}

function CategoryChip({ category, count, active, getImage, onSelect }) {
  const [iconFailed, setIconFailed] = useState(false);
  const src = getImage?.(category.name);

  return (
    <button
      type="button"
      className={`menu-chip${active ? " is-active" : ""}`}
      aria-pressed={active}
      onClick={() => onSelect(category.id)}
    >
      {src && !iconFailed && <img src={src} alt="" onError={() => setIconFailed(true)} />}
      <span>{category.name}</span>
      <em>{fa(count)}</em>
    </button>
  );
}

function ProductCard({ product, count, Fallback, onAdd, onOpen }) {
  const { name, description, price, oldPrice, image, isAvailable, badge } = product;
  const discount = discountOf(price, oldPrice);

  // لمس هر جای کارت جزئیات را باز می‌کند (به‌جز دکمه‌ها)
  const handleCardClick = (event) => {
    if (!event.target.closest("button")) onOpen(product);
  };

  return (
    <article
      className={`menu-card${isAvailable ? "" : " is-unavailable"}`}
      onClick={handleCardClick}
    >
      <button
        type="button"
        className="menu-card-media"
        onClick={() => onOpen(product)}
        aria-label={`مشاهده جزئیات ${name}`}
      >
        <span className="menu-card-image">
          <ProductImage src={image} alt={name} Fallback={Fallback} />

          {badge && isAvailable && (
            <span className={`menu-badge menu-badge--${badge.tone}`}>{badge.text}</span>
          )}
          {!isAvailable && <span className="menu-unavailable">ناموجود</span>}
          {isAvailable && <span className="menu-image-hint">مشاهده جزئیات</span>}
        </span>
      </button>

      <div className="menu-card-body">
        <h3>{name}</h3>
        <Meta product={product} />
        <p className="menu-desc">{description}</p>

        <div className="menu-card-bottom">
          <div className="menu-price-box">
            {discount > 0 && <span className="menu-old-price">{fa(oldPrice)}</span>}
            <span className="menu-price">
              {fa(price)} <small>تومان</small>
            </span>
          </div>

          <button
            type="button"
            className="menu-add"
            disabled={!isAvailable}
            onClick={() => onAdd(product)}
            aria-label={`افزودن ${name} به سبد`}
          >
            <PlusIcon />
            {count > 0 && <span className="menu-add-count">{fa(count)}</span>}
          </button>
        </div>
      </div>
    </article>
  );
}

/* ---------- پنجرهٔ جزئیات (روی موبایل: کشوی پایین با کشیدن برای بستن) ---------- */

function ProductSheet({ product, categories, related, relatedTitle, Fallback, onClose, onAdd, onSwitch }) {
  const [qty, setQty] = useState(1);
  const [dragY, setDragY] = useState(0);
  const startY = useRef(null);
  const sheetRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    setQty(1);
    sheetRef.current?.scrollTo?.({ top: 0 });
    scrollRef.current?.scrollTo?.({ top: 0 });
  }, [product?.id]);

  useEffect(() => {
    if (!product) return undefined;

    const onKey = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.classList.add("menu-modal-open");
    sheetRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("menu-modal-open");
    };
  }, [product, onClose]);

  if (!product) return null;

  const categoryName = categories.find((c) => c.id === product.categoryId)?.name ?? "منو";
  const discount = discountOf(product.price, product.oldPrice);
  const ingredients = ingredientsOf(product.description);

  const grab = {
    onTouchStart: (e) => {
      startY.current = e.touches[0].clientY;
    },
    onTouchMove: (e) => {
      if (startY.current == null) return;
      setDragY(Math.max(0, e.touches[0].clientY - startY.current));
    },
    onTouchEnd: () => {
      if (dragY > 110) onClose();
      setDragY(0);
      startY.current = null;
    },
  };

  return (
    <div
      className="menu-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        ref={sheetRef}
        tabIndex={-1}
        className={`menu-sheet${dragY ? " is-dragging" : ""}`}
        style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby="menu-sheet-title"
        dir="rtl"
      >
        <div className="menu-sheet-grab" {...grab} aria-hidden="true">
          <i />
        </div>

        <button type="button" className="menu-sheet-close" onClick={onClose} aria-label="بستن">
          <CloseIcon />
        </button>

        <div className="menu-sheet-scroll" ref={scrollRef}>
        <div className="menu-sheet-media">
          <ProductImage src={product.image} alt={product.name} Fallback={Fallback} />
          <span className="menu-sheet-category">{categoryName}</span>
          {product.badge && (
            <span className={`menu-badge menu-badge--${product.badge.tone} menu-badge--lg`}>
              {product.badge.text}
            </span>
          )}
        </div>

        <div className="menu-sheet-content">
          <h2 id="menu-sheet-title">{product.name}</h2>
          <p className="menu-sheet-desc">{product.description}</p>

          {ingredients.length > 0 && (
            <ul className="menu-ingredients" aria-label="مواد تشکیل‌دهنده">
              {ingredients.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}

          {(product.rating || product.time || product.calories) && (
            <div className="menu-info">
              {product.rating ? (
                <div>
                  <span>امتیاز</span>
                  <strong>★ {faRating(product.rating)}</strong>
                </div>
              ) : null}
              {product.time ? (
                <div>
                  <span>آماده‌سازی</span>
                  <strong>
                    {fa(product.time)} <small>دقیقه</small>
                  </strong>
                </div>
              ) : null}
              {product.calories ? (
                <div>
                  <span>انرژی</span>
                  <strong>
                    {fa(product.calories)} <small>کالری</small>
                  </strong>
                </div>
              ) : null}
            </div>
          )}

          {related.length > 0 && (
            <div className="menu-related">
              <h4>{relatedTitle}</h4>
              <div className="menu-related-list">
                {related.map((item) => (
                  <button key={item.id} type="button" onClick={() => onSwitch(item)}>
                    <span>{item.name}</span>
                    <small>{fa(item.price)} تومان</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="menu-buy">
            <div className="menu-qty" role="group" aria-label="تعداد">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={qty <= 1}
                aria-label="کم کردن"
              >
                <MinusIcon />
              </button>
              <output aria-live="polite">{fa(qty)}</output>
              <button
                type="button"
                onClick={() => setQty((q) => Math.min(20, q + 1))}
                aria-label="زیاد کردن"
              >
                <PlusIcon />
              </button>
            </div>

            <button
              type="button"
              className="menu-buy-add"
              disabled={!product.isAvailable}
              onClick={() => {
                onAdd(product, qty);
                onClose();
              }}
            >
              <span>{product.isAvailable ? "افزودن به سبد" : "ناموجود"}</span>
              {product.isAvailable && (
                <strong>
                  {discount > 0 && <s>{fa(product.oldPrice * qty)}</s>}
                  {fa(product.price * qty)} <small>تومان</small>
                </strong>
              )}
            </button>
          </div>
        </div>
        </div>
      </section>
    </div>
  );
}

/* ==========================================================================
   کامپوننت اصلی
   ========================================================================== */

export default function MenuBoard({
  id,
  className = "",
  title,
  subtitle,
  data,
  meta = NO_META,
  highlights = [],
  getCategoryImage,
  FallbackIcon = DefaultPlateIcon,
  searchPlaceholder = "جستجو در منو",
  relatedTitle = "همراه این مورد امتحان کنید",
  crossSellPattern, // بخشی از نام دسته‌ای که به‌عنوان «پیشنهاد همراه» نشان داده شود
  onOpenCart,
}) {
  const categories = data?.categories ?? [];

  const products = useMemo(
    () => (data?.products ?? []).map((p) => ({ ...meta[p.id], ...p })),
    [data, meta]
  );

  const [activeCategory, setActiveCategory] = useState(categories[0]?.id);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("default");
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState("");
  const [catSwiper, setCatSwiper] = useState(null);
  const panelRef = useRef(null);

  const { cart = [], addItem } = useCart();
  const cartItems = Array.isArray(cart) ? cart : Object.values(cart ?? {});

  const cartCount = cartItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const cartTotal = cartItems.reduce((sum, item) => {
    const price =
      Number(item.price) || products.find((p) => String(p.id) === String(item.id))?.price || 0;
    return sum + price * (Number(item.quantity) || 0);
  }, 0);

  const hasRatings = products.some((p) => p.rating);
  const sorts = SORTS.filter((s) => s.id !== "rating" || hasRatings);

  const counts = useMemo(() => {
    const result = {};
    products.forEach((p) => {
      result[p.categoryId] = (result[p.categoryId] || 0) + 1;
    });
    return result;
  }, [products]);

  const searching = query.trim().length > 0;

  const visible = useMemo(() => {
    const q = norm(query.trim());
    let list = q
      ? products.filter((p) => norm(p.name).includes(q) || norm(p.description).includes(q))
      : products.filter((p) => p.categoryId === activeCategory);

    if (sort === "rating") list = [...list].sort((a, b) => (b.rating || 0) - (a.rating || 0));
    if (sort === "cheap") list = [...list].sort((a, b) => a.price - b.price);
    if (sort === "expensive") list = [...list].sort((a, b) => b.price - a.price);
    return list;
  }, [products, query, sort, activeCategory]);

  const activeName = categories.find((c) => c.id === activeCategory)?.name;

  const related = useMemo(() => {
    if (!selected) return [];
    const pattern = crossSellPattern ? norm(crossSellPattern) : null;
    const sideIds = pattern
      ? categories.filter((c) => norm(c.name).includes(pattern)).map((c) => c.id)
      : [];

    const side = products.filter(
      (p) => sideIds.includes(p.categoryId) && p.categoryId !== selected.categoryId
    );
    const same = products.filter((p) => p.categoryId === selected.categoryId);

    return [...side, ...same].filter((p) => p.isAvailable && p.id !== selected.id).slice(0, 3);
  }, [selected, products, categories, crossSellPattern]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 1800);
    return () => clearTimeout(timer);
  }, [toast]);

  const closeSheet = useCallback(() => setSelected(null), []);

  function handleAdd(product, quantity = 1) {
    for (let i = 0; i < quantity; i += 1) addItem(product);
    navigator.vibrate?.(12);
    setToast(`${product.name} به سبد اضافه شد`);
  }

  const countOf = (productId) =>
    Number(cartItems.find((item) => String(item.id) === String(productId))?.quantity) || 0;

  function selectCategory(categoryId) {
    setActiveCategory(categoryId);
    setQuery("");
    catSwiper?.slideTo(categories.findIndex((c) => c.id === categoryId));

    // اگر کاربر پایین‌تر از ابتدای لیست است، به ابتدای دسته برگرد
    const top = panelRef.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openCart() {
    if (onOpenCart) onOpenCart();
    else document.getElementById("cart")?.scrollIntoView({ behavior: "smooth" });
  }

  const titleId = `${id || "menu"}-title`;

  return (
    <section
      className={`menu-board ${className}`}
      id={id}
      dir="rtl"
      aria-labelledby={titleId}
    >
      <div className="menu-container">
        <header className="menu-hero">
          <div className="menu-hero-text">
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>

          {highlights.length > 0 && (
            <ul className="menu-highlights">
              {highlights.map((item) => (
                <li key={item.title}>
                  <span aria-hidden="true">{item.icon}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.text}</small>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </header>

        <div className="menu-toolbar">
          <label className="menu-search">
            <SearchIcon />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label="جستجو در منو"
              enterKeyHint="search"
              autoComplete="off"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="پاک کردن جستجو">
                <CloseIcon />
              </button>
            )}
          </label>

          <div className="menu-sorts" role="group" aria-label="مرتب‌سازی">
            {sorts.map((item) => (
              <button
                key={item.id}
                type="button"
                className={sort === item.id ? "is-active" : ""}
                aria-pressed={sort === item.id}
                onClick={() => setSort(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="menu-sticky">
          <Swiper {...SLIDER_PROPS} onSwiper={setCatSwiper} className="menu-chips">
            {categories.map((category) => (
              <SwiperSlide key={category.id} className="menu-chip-slide">
                <CategoryChip
                  category={category}
                  count={counts[category.id] || 0}
                  active={!searching && category.id === activeCategory}
                  getImage={getCategoryImage}
                  onSelect={selectCategory}
                />
              </SwiperSlide>
            ))}
          </Swiper>
        </div>

        <div className="menu-panel" ref={panelRef}>
          <div className="menu-panel-header">
            <h3>{searching ? `نتیجهٔ «${query.trim()}»` : activeName}</h3>
            <span className="menu-panel-count">{fa(visible.length)} مورد</span>
          </div>

          {visible.length === 0 ? (
            <div className="menu-status">
              <p>{searching ? "موردی با این نام پیدا نشد." : "برای این دسته هنوز محصولی ثبت نشده است."}</p>
              {searching && (
                <button type="button" onClick={() => setQuery("")}>
                  پاک کردن جستجو
                </button>
              )}
            </div>
          ) : (
            <div className="menu-grid" key={`${activeCategory}-${searching}-${sort}`}>
              {visible.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  count={countOf(product.id)}
                  Fallback={FallbackIcon}
                  onAdd={handleAdd}
                  onOpen={setSelected}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {cartCount > 0 && (
        <button type="button" className="menu-cart-bar" onClick={openCart}>
          <span className="menu-cart-icon">
            <BagIcon />
            <em>{fa(cartCount)}</em>
          </span>
          <span className="menu-cart-label">مشاهده سبد خرید</span>
          <strong>
            {fa(cartTotal)} <small>تومان</small>
          </strong>
        </button>
      )}

      <div className={`menu-toast${toast ? " is-visible" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>

      <ProductSheet
        product={selected}
        categories={categories}
        related={related}
        relatedTitle={relatedTitle}
        Fallback={FallbackIcon}
        onClose={closeSheet}
        onAdd={handleAdd}
        onSwitch={setSelected}
      />
    </section>
  );
}
