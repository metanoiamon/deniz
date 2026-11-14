import { useMemo, useState } from "react";

import { Swiper, SwiperSlide } from "swiper/react";
import { FreeMode } from "swiper/modules";

import "swiper/css";
import "swiper/css/free-mode";
import "./CafeMenu.css";

import { useCart } from "../../context/CartContext";

/* ==========================================================================
   داده‌ی آزمایشی
   وقتی بک‌اند وصل شد، این دو آرایه را با داده‌ی API عوض کن.
   عکس‌ها را داخل پوشه‌ی public/images بگذار (مثلاً public/images/cafe/latte.png).
   ========================================================================== */

// ترتیب نمایش دسته‌ها همین ترتیب آرایه است
const CATEGORIES = [
  { id: "tea-breakfast", name: "چای و نوشیدنی صبحانه" },
  { id: "iced-coffee", name: "آیس کافی" },
  { id: "hot-coffee", name: "هات کافی" },
  { id: "ice-pack", name: "آیس پک" },
  { id: "shake", name: "شیک" },
  { id: "cake", name: "کیک" },
];

// محصولات نمونه؛ اسم و قیمت و توضیح را با منوی واقعی خودت عوض کن.
// محصولی که image ندارد، فنجان پیش‌فرض نشان می‌دهد.
const PRODUCTS = [
  // چای و نوشیدنی صبحانه
  {
    id: "black-tea",
    categoryId: "tea-breakfast",
    name: "چای دمی",
    description: "چای سیاه تازه‌دم، همراه با نبات",
    price: 60000,
    isAvailable: true,
  },
  {
    id: "masala-tea",
    categoryId: "tea-breakfast",
    name: "چای ماسالا",
    description: "چای سیاه با شیر و ادویه‌های گرم",
    price: 95000,
    isAvailable: true,
  },
  {
    id: "hot-cocoa",
    categoryId: "tea-breakfast",
    name: "شیر کاکائو داغ",
    description: "شیر داغ با کاکائوی غلیظ",
    price: 90000,
    isAvailable: true,
  },

  // آیس کافی
  {
    id: "iced-latte",
    categoryId: "iced-coffee",
    name: "آیس لاته",
    description: "اسپرسو دوبل، شیر سرد و یخ",
    price: 150000,
    isAvailable: true,
  },
  {
    id: "iced-americano",
    categoryId: "iced-coffee",
    name: "آیس آمریکانو",
    description: "اسپرسو دوبل با آب سرد و یخ",
    price: 120000,
    isAvailable: true,
  },
  {
    id: "iced-mocha",
    categoryId: "iced-coffee",
    name: "آیس موکا",
    description: "اسپرسو، سس شکلات، شیر سرد و یخ",
    price: 170000,
    isAvailable: true,
  },

  // هات کافی
  {
    id: "espresso",
    categoryId: "hot-coffee",
    name: "اسپرسو",
    description: "یک شات اسپرسوی غلیظ و خوش‌عطر",
    price: 85000,
    isAvailable: true,
  },
  {
    id: "cappuccino",
    categoryId: "hot-coffee",
    name: "کاپوچینو",
    description: "اسپرسو با شیر بخارداده و فوم نرم",
    price: 140000,
    isAvailable: true,
  },
  {
    id: "hot-latte",
    categoryId: "hot-coffee",
    name: "لاته",
    description: "اسپرسو دوبل با شیر بخارداده",
    price: 145000,
    isAvailable: true,
  },

  // آیس پک
  {
    id: "caramel-ice-pack",
    categoryId: "ice-pack",
    name: "آیس پک کارامل",
    description: "قهوه و یخ مخلوط‌شده با سس کارامل و خامه",
    price: 190000,
    isAvailable: true,
  },
  {
    id: "mocha-ice-pack",
    categoryId: "ice-pack",
    name: "آیس پک موکا",
    description: "قهوه و یخ مخلوط‌شده با سس شکلات و خامه",
    price: 195000,
    isAvailable: true,
  },

  // شیک
  {
    id: "chocolate-shake",
    categoryId: "shake",
    name: "شیک شکلات",
    description: "بستنی وانیل، شیر و سس شکلات",
    price: 200000,
    isAvailable: true,
  },
  {
    id: "strawberry-shake",
    categoryId: "shake",
    name: "شیک توت‌فرنگی",
    description: "بستنی، شیر و توت‌فرنگی تازه",
    price: 210000,
    isAvailable: true,
  },
  {
    id: "vanilla-shake",
    categoryId: "shake",
    name: "شیک وانیل",
    description: "بستنی وانیل و شیر، همراه با خامه",
    price: 190000,
    isAvailable: true,
  },

  // کیک
  {
    id: "chocolate-cake",
    categoryId: "cake",
    name: "کیک شکلاتی",
    description: "کیک اسفنجی شکلاتی با روکش گاناش",
    price: 170000,
    isAvailable: true,
  },
  {
    id: "cheesecake",
    categoryId: "cake",
    name: "چیزکیک",
    description: "چیزکیک خامه‌ای با سس میوه‌ی قرمز",
    price: 200000,
    isAvailable: true,
  },
  {
    id: "carrot-cake",
    categoryId: "cake",
    name: "کیک هویج و گردو",
    description: "کیک ادویه‌دار با هویج، گردو و کرم پنیر",
    price: 180000,
    isAvailable: true,
  },
];

/* ==========================================================================
   ابزارها
   ========================================================================== */

const formatNumber = (value) =>
  new Intl.NumberFormat("fa-IR").format(Number(value) || 0);

// عکس هر دسته از روی اسمش انتخاب می‌شود؛ اولین قانونی که جور شد برنده است
const CATEGORY_IMAGE_RULES = [
  { file: "tea.png", test: (n) => n.includes("چای") || n.includes("صبحانه") },
  {
    file: "iced-coffee.png",
    test: (n) => n.includes("آیس") && n.includes("کافی"),
  },
  { file: "ice-pack.png", test: (n) => n.includes("آیس پک") },
  {
    file: "hot-coffee.png",
    test: (n) => n.includes("هات") || n.includes("کافی"),
  },
  { file: "shake.png", test: (n) => n.includes("شیک") },
  { file: "cake.png", test: (n) => n.includes("کیک") },
];

function getCategoryImage(name = "") {
  const value = name.toLowerCase();
  const rule = CATEGORY_IMAGE_RULES.find((item) => item.test(value));
  return `/images/cafe-categories/${rule ? rule.file : "hot-coffee.png"}`;
}

// تنظیمات مشترک هر دو اسلایدر
const SLIDER_PROPS = {
  modules: [FreeMode],
  freeMode: true,
  slidesPerView: "auto",
  spaceBetween: 10,
  grabCursor: true,
  dir: "rtl",
};

/* ==========================================================================
   آیکون‌ها
   ========================================================================== */

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      d="M12 5v14M5 12h14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
  </svg>
);

const ChevronIcon = () => (
  <svg
    className="cafe-panel-arrow"
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M6 15l6-6 6 6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// فنجان ساده برای وقتی که عکس محصول نیست
const CupIcon = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <path
      d="M9 18h26v9a11 11 0 0 1-11 11h-4A11 11 0 0 1 9 27v-9z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
    <path
      d="M35 21h2.5a4.5 4.5 0 0 1 0 9H34"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    <path
      d="M16 8v4M22 6v6M28 8v4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
  </svg>
);

/* ==========================================================================
   اجزای کوچک
   ========================================================================== */

// اگر عکس محصول نبود یا لود نشد، به‌جای عکس خراب یک فنجان ساده نشان می‌دهیم
function ProductImage({ src, alt }) {
  const [failed, setFailed] = useState(!src);

  if (failed) {
    return (
      <div className="cafe-image-fallback" role="img" aria-label={alt}>
        <CupIcon />
      </div>
    );
  }

  return (
    <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />
  );
}

function CategoryChip({ category, active, onSelect }) {
  const [iconFailed, setIconFailed] = useState(false);

  return (
    <button
      type="button"
      className={`cafe-category${active ? " is-active" : ""}`}
      aria-pressed={active}
      onClick={() => onSelect(category.id)}
    >
      {!iconFailed && (
        <img
          src={getCategoryImage(category.name)}
          alt=""
          onError={() => setIconFailed(true)}
        />
      )}
      <span>{category.name}</span>
    </button>
  );
}

function ProductCard({ product, count, onAdd }) {
  const { name, description, price, image, isAvailable } = product;

  return (
    <article
      className={`cafe-product-card${isAvailable ? "" : " is-unavailable"}`}
    >
      <div className="cafe-product-image">
        <ProductImage src={image} alt={name} />
        {!isAvailable && <span className="cafe-unavailable">ناموجود</span>}
      </div>

      <h3>{name}</h3>
      <p className="cafe-product-description">{description}</p>

      <div className="cafe-product-bottom">
        <span className="cafe-product-price">
          {formatNumber(price)} <small>تومان</small>
        </span>

        <button
          type="button"
          className="cafe-add-button"
          disabled={!isAvailable}
          onClick={() => onAdd(product)}
          aria-label={`افزودن ${name} به سبد`}
        >
          <PlusIcon />
          {count > 0 && (
            <span className="cafe-add-count">{formatNumber(count)}</span>
          )}
        </button>
      </div>
    </article>
  );
}

/* ==========================================================================
   منوی کافی‌شاپ
   ========================================================================== */

const CafeMenu = () => {
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0].id);
  const [expanded, setExpanded] = useState(true);
  const { cart = [], addItem } = useCart();

const cartItems = Array.isArray(cart) ? cart : [];

const getProductCount = (productId) => {
  const item = cartItems.find(
    (item) => String(item.id) === String(productId)
  );

  return Number(item?.quantity) || 0;
};

  const activeName = CATEGORIES.find(
    (category) => category.id === activeCategory,
  )?.name;

  const visibleProducts = useMemo(
    () => PRODUCTS.filter((product) => product.categoryId === activeCategory),
    [activeCategory],
  );

  function selectCategory(id) {
    setActiveCategory(id);
    setExpanded(true);
  }

  return (
    <section
      className="cafe-menu-section"
      id="cafe-menu"
      dir="rtl"
      aria-labelledby="cafe-menu-title"
    >
      <div className="cafe-menu-container">
        <header className="cafe-menu-heading">
          <h2 id="cafe-menu-title">منوی کافی‌شاپ</h2>
          <p>از چای صبحانه تا شیک و کیک، یک استراحت خوشمزه در دنیز!</p>
        </header>

        {/* دسته‌بندی‌ها */}
        <Swiper {...SLIDER_PROPS} className="cafe-category-swiper">
          {CATEGORIES.map((category) => (
            <SwiperSlide key={category.id} className="cafe-category-slide">
              <CategoryChip
                category={category}
                active={category.id === activeCategory}
                onSelect={selectCategory}
              />
            </SwiperSlide>
          ))}
        </Swiper>

        {/* محصولات دسته‌ی انتخاب‌شده */}
        <div className="cafe-products-panel">
          <button
            type="button"
            className="cafe-panel-header"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            aria-controls="cafe-products"
          >
            <span className="cafe-panel-title">{activeName}</span>
            <span className="cafe-panel-count">
              {formatNumber(visibleProducts.length)} مورد
            </span>
            <ChevronIcon />
          </button>

          <div id="cafe-products">
            {expanded &&
              (visibleProducts.length === 0 ? (
                <p className="cafe-status">
                  برای این دسته هنوز محصولی ثبت نشده است.
                </p>
              ) : (
                <Swiper
                  {...SLIDER_PROPS}
                  key={activeCategory}
                  className="cafe-products-swiper"
                >
                  {visibleProducts.map((product) => (
                    <SwiperSlide
                      key={product.id}
                      className="cafe-product-slide"
                    >
                      <ProductCard
                        product={product}
                        count={getProductCount(product.id)}
                        onAdd={addItem}
                      />
                    </SwiperSlide>
                  ))}
                </Swiper>
              ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default CafeMenu;
