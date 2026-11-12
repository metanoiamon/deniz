
import { useMemo, useState } from "react";

import { Swiper, SwiperSlide } from "swiper/react";
import { FreeMode } from "swiper/modules";

import "swiper/css";
import "swiper/css/free-mode";
import "./FoodMenu.css";

import { useCart } from "../../context/CartContext";

/* ==========================================================================
   داده‌های آزمایشی
   ========================================================================== */

const CATEGORIES = [
  { id: "burger", name: "برگرها" },
  { id: "pizza-american", name: "پیتزا آمریکایی" },
  { id: "pizza-italian", name: "پیتزا ایتالیایی" },
  { id: "salad-pasta", name: "پاستا و سالاد" },
  { id: "sandwich", name: "ساندویچ‌ها" },
  { id: "fries-snack", name: "سیب‌زمینی و اسنک" },
  { id: "chicken-sandwich", name: "ساندویچ‌های مرغ" },
  { id: "doner", name: "دونر" },
  { id: "fried-chicken", name: "سوخاری‌ها" },
];

const PRODUCTS = [
  // برگر
  {
    id: "classic-burger",
    categoryId: "burger",
    name: "برگر کلاسیک دنیز",
    description: "گوشت گوساله، کاهو، گوجه، خیارشور و سس مخصوص",
    price: 220000,
    isAvailable: true,
  },
  {
    id: "double-cheese-burger",
    categoryId: "burger",
    name: "چیزبرگر دوبل",
    description: "دو لایه گوشت، دو برش پنیر چدار و سس مخصوص",
    price: 290000,
    isAvailable: true,
  },
  {
    id: "mushroom-burger",
    categoryId: "burger",
    name: "برگر قارچ و پنیر",
    description: "گوشت گوساله با قارچ سوته و پنیر ورقه‌ای",
    price: 260000,
    isAvailable: true,
  },

  // پیتزا آمریکایی
  {
    id: "special-pizza",
    categoryId: "pizza-american",
    name: "پیتزا مخصوص دنیز",
    description: "پیتزای خوشمزه با ترکیبی از مواد تازه و پنیر مخصوص",
    price: 350000,
    image: "/images/pizza.png",
    isAvailable: true,
  },
  {
    id: "pepperoni-pizza",
    categoryId: "pizza-american",
    name: "پیتزا پپرونی",
    description: "پپرونی، پنیر موزارلا و سس گوجه",
    price: 320000,
    isAvailable: true,
  },

  // پیتزا ایتالیایی
  {
    id: "margherita-pizza",
    categoryId: "pizza-italian",
    name: "پیتزا مارگاریتا",
    description: "سس گوجه، پنیر موزارلا و ریحان تازه",
    price: 290000,
    isAvailable: true,
  },
  {
    id: "four-cheese-pizza",
    categoryId: "pizza-italian",
    name: "پیتزا چهار پنیر",
    description: "موزارلا، پارمزان، گودا و پنیر آبی",
    price: 360000,
    isAvailable: true,
  },

  // سالاد و پاستا
  {
    id: "caesar-salad",
    categoryId: "salad-pasta",
    name: "سالاد سزار",
    description: "کاهو، مرغ گریل، پنیر پارمزان و سس سزار",
    price: 190000,
    isAvailable: true,
  },
  {
    id: "alfredo-pasta",
    categoryId: "salad-pasta",
    name: "پاستا آلفردو",
    description: "پنه با سس خامه، مرغ و قارچ",
    price: 240000,
    isAvailable: true,
  },

  // ساندویچ مرغ
  {
    id: "grilled-chicken-sandwich",
    categoryId: "chicken-sandwich",
    name: "ساندویچ مرغ گریل",
    description: "فیله مرغ گریل، کاهو، گوجه و سس سیر",
    price: 210000,
    isAvailable: true,
  },
  {
    id: "crispy-chicken-sandwich",
    categoryId: "chicken-sandwich",
    name: "ساندویچ مرغ سوخاری",
    description: "فیله مرغ سوخاری، کاهو و سس مخصوص",
    price: 220000,
    isAvailable: true,
  },

  // ساندویچ
  {
    id: "club-sandwich",
    categoryId: "sandwich",
    name: "کلاب ساندویچ",
    description: "سینه مرغ، ژامبون، پنیر و سبزیجات تازه",
    price: 230000,
    isAvailable: true,
  },
  {
    id: "sausage-sandwich",
    categoryId: "sandwich",
    name: "ساندویچ سوسیس",
    description: "سوسیس گریل، پنیر و قارچ",
    price: 180000,
    isAvailable: true,
  },

  // سیب‌زمینی و اسنک
  {
    id: "french-fries",
    categoryId: "fries-snack",
    name: "سیب‌زمینی سرخ‌کرده",
    description: "سیب‌زمینی طلایی و ترد با سس به‌انتخاب شما",
    price: 90000,
    isAvailable: true,
  },
  {
    id: "cheese-fries",
    categoryId: "fries-snack",
    name: "سیب‌زمینی پنیری",
    description: "سیب‌زمینی سرخ‌کرده با سس پنیر چدار",
    price: 130000,
    isAvailable: true,
  },

  // دونر
  {
    id: "chicken-doner",
    categoryId: "doner",
    name: "دونر مرغ",
    description: "مرغ ریش‌ریش‌شده، سبزیجات و سس مخصوص",
    price: 200000,
    isAvailable: true,
  },
  {
    id: "beef-doner",
    categoryId: "doner",
    name: "دونر گوشت",
    description: "گوشت گوساله ریش‌ریش‌شده، سبزیجات و سس مخصوص",
    price: 240000,
    isAvailable: true,
  },

  // سوخاری
  {
    id: "fried-chicken-four",
    categoryId: "fried-chicken",
    name: "سوخاری چهار تکه",
    description: "چهار تکه مرغ سوخاری ترد همراه با سیب‌زمینی",
    price: 280000,
    isAvailable: true,
  },
  {
    id: "chicken-strips",
    categoryId: "fried-chicken",
    name: "استریپس مرغ",
    description: "نوارهای مرغ سوخاری همراه با سس دیپ",
    price: 190000,
    isAvailable: true,
  },
];

/* ==========================================================================
   ابزارها
   ========================================================================== */

const formatNumber = (value) =>
  new Intl.NumberFormat("fa-IR").format(Number(value) || 0);

const CATEGORY_IMAGE_RULES = [
  { file: "burger.png", test: (n) => n.includes("برگر") },
  {
    file: "salad.png",
    test: (n) => n.includes("سالاد") || n.includes("پاستا"),
  },
  {
    file: "pizza-italian.png",
    test: (n) => n.includes("پیتزا") && n.includes("ایتالیایی"),
  },
  { file: "pizza-american.png", test: (n) => n.includes("پیتزا") },
  {
    file: "chicken.png",
    test: (n) => n.includes("ساندویچ") && n.includes("مرغ"),
  },
  { file: "sandwich.png", test: (n) => n.includes("ساندویچ") },
  {
    file: "fries.png",
    test: (n) => n.includes("سیب‌زمینی") || n.includes("اسنک"),
  },
  { file: "doner.png", test: (n) => n.includes("دونر") },
  { file: "fried-chicken.png", test: (n) => n.includes("سوخاری") },
];

function getCategoryImage(name = "") {
  const value = name.toLowerCase();
  const rule = CATEGORY_IMAGE_RULES.find((item) => item.test(value));

  return `/images/food-categories/${rule ? rule.file : "burger.png"}`;
}

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
    className="food-panel-arrow"
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

const PlateIcon = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <circle
      cx="24"
      cy="24"
      r="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    />
    <circle
      cx="24"
      cy="24"
      r="10"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    />
  </svg>
);

/* ==========================================================================
   اجزای کوچک
   ========================================================================== */

function ProductImage({ src, alt }) {
  const [failed, setFailed] = useState(!src);

  if (failed) {
    return (
      <div className="food-image-fallback" role="img" aria-label={alt}>
        <PlateIcon />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function CategoryChip({ category, active, onSelect }) {
  const [iconFailed, setIconFailed] = useState(false);

  return (
    <button
      type="button"
      className={`food-category${active ? " is-active" : ""}`}
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
      className={`food-product-card${isAvailable ? "" : " is-unavailable"}`}
    >
      <div className="food-product-image">
        <ProductImage src={image} alt={name} />
        {!isAvailable && <span className="food-unavailable">ناموجود</span>}
      </div>

      <h3>{name}</h3>

      <p className="food-product-description">{description}</p>

      <div className="food-product-bottom">
        <span className="food-product-price">
          {formatNumber(price)} <small>تومان</small>
        </span>

        <button
          type="button"
          className="food-add-button"
          disabled={!isAvailable}
          onClick={() => onAdd(product)}
          aria-label={`افزودن ${name} به سبد`}
        >
          <PlusIcon />

          {count > 0 && (
            <span className="food-add-count">
              {formatNumber(count)}
            </span>
          )}
        </button>
      </div>
    </article>
  );
}

/* ==========================================================================
   منوی غذا
   ========================================================================== */

const FoodMenu = () => {
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0].id);
  const [expanded, setExpanded] = useState(true);

  // دریافت اطلاعات سبد خرید
  const { cart = [], addItem } = useCart();

  // اطمینان از اینکه اطلاعات سبد همیشه آرایه باشد
  const cartItems = Array.isArray(cart)
    ? cart
    : Object.values(cart ?? {});

  // دسته‌بندی فعال
  const activeName = CATEGORIES.find(
    (category) => category.id === activeCategory
  )?.name;

  // محصولات دسته انتخاب‌شده
  const visibleProducts = useMemo(
    () => PRODUCTS.filter(
      (product) => product.categoryId === activeCategory
    ),
    [activeCategory]
  );

  function selectCategory(id) {
    setActiveCategory(id);
    setExpanded(true);
  }

  // پیدا کردن تعداد هر محصول در سبد خرید
  function getProductCount(productId) {
    const cartItem = cartItems.find(
      (item) => String(item.id) === String(productId)
    );

    return Number(cartItem?.quantity) || 0;
  }

  return (
    <section
      className="food-menu-section"
      id="menu"
      dir="rtl"
      aria-labelledby="food-menu-title"
    >
      <div className="food-menu-container">

        <header className="food-menu-heading">
          <h2 id="food-menu-title">منوی غذا</h2>
          <p>
            از یک برگر لذیذ تا پیتزای ایتالیایی، همه‌چیز در دنیز!
          </p>
        </header>

        {/* دسته‌بندی‌ها */}

        <Swiper
          {...SLIDER_PROPS}
          className="food-category-swiper"
        >
          {CATEGORIES.map((category) => (
            <SwiperSlide
              key={category.id}
              className="food-category-slide"
            >
              <CategoryChip
                category={category}
                active={category.id === activeCategory}
                onSelect={selectCategory}
              />
            </SwiperSlide>
          ))}
        </Swiper>

        {/* محصولات دسته انتخاب‌شده */}

        <div className="food-products-panel">

          <button
            type="button"
            className="food-panel-header"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            aria-controls="food-products"
          >
            <span className="food-panel-title">
              {activeName}
            </span>

            <span className="food-panel-count">
              {formatNumber(visibleProducts.length)} مورد
            </span>

            <ChevronIcon />
          </button>

          <div id="food-products">

            {expanded &&
              (visibleProducts.length === 0 ? (
                <p className="food-status">
                  برای این دسته هنوز محصولی ثبت نشده است.
                </p>
              ) : (
                <Swiper
                  {...SLIDER_PROPS}
                  key={activeCategory}
                  className="food-products-swiper"
                >
                  {visibleProducts.map((product) => (
                    <SwiperSlide
                      key={product.id}
                      className="food-product-slide"
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

export default FoodMenu;
