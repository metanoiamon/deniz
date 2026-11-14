
import { useEffect, useMemo, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { FreeMode } from "swiper/modules";

import "swiper/css";
import "swiper/css/free-mode";
import "./FoodMenu.css";

import { useCart } from "../../context/CartContext";

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
  const rule = CATEGORY_IMAGE_RULES.find((item) =>
    item.test(name.toLowerCase())
  );

  return `/images/food-categories/${rule ? rule.file : "burger.png"}`;
}

const SLIDER_PROPS = {
  modules: [FreeMode],
  freeMode: true,
  slidesPerView: "auto",
  spaceBetween: 12,
  grabCursor: true,
  dir: "rtl",
};

function PlateIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
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
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 5v14M5 12h14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      className="food-panel-arrow"
      viewBox="0 0 24 24"
      aria-hidden="true"
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
}

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

function ProductCard({ product, count, onAdd, onOpen }) {
  const { name, description, price, image, isAvailable } = product;

  return (
    <article
      className={`food-product-card${isAvailable ? "" : " is-unavailable"}`}
    >
      <button
        type="button"
        className="food-product-image-button"
        onClick={() => onOpen(product)}
        aria-label={`مشاهده جزئیات ${name}`}
        disabled={!isAvailable}
      >
        <div className="food-product-image">
          <ProductImage src={image} alt={name} />

          {!isAvailable && (
            <span className="food-unavailable">ناموجود</span>
          )}

          {isAvailable && (
            <span className="food-image-hint">
              مشاهده جزئیات <span aria-hidden="true">↗</span>
            </span>
          )}
        </div>
      </button>

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

function ProductDetailsModal({ product, onClose, onAdd }) {
  useEffect(() => {
    if (!product) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.classList.add("food-modal-open");

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.classList.remove("food-modal-open");
    };
  }, [product, onClose]);

  if (!product) return null;

  const categoryName =
    CATEGORIES.find((item) => item.id === product.categoryId)?.name ??
    "منوی دنیز";

  return (
    <div
      className="food-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="food-product-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="food-modal-title"
        dir="rtl"
      >
        <button
          type="button"
          className="food-modal-close"
          onClick={onClose}
          aria-label="بستن پنجره"
        >
          ×
        </button>

        <div className="food-modal-image">
          <ProductImage src={product.image} alt={product.name} />

          <span className="food-modal-category">
            {categoryName}
          </span>
        </div>

        <div className="food-modal-content">
          <span className="food-modal-eyebrow">پیشنهاد دنیز</span>

          <h2 id="food-modal-title">{product.name}</h2>

          <p className="food-modal-description">
            {product.description}
          </p>

          <div className="food-modal-info">
            <div>
              <span>قیمت</span>

              <strong>
                {formatNumber(product.price)} <small>تومان</small>
              </strong>
            </div>
          </div>

          <button
            type="button"
            className="food-modal-add"
            disabled={!product.isAvailable}
            onClick={() => {
              onAdd(product);
              onClose();
            }}
          >
            <PlusIcon />
            افزودن به سبد خرید
          </button>

          <p className="food-modal-note">
            برای مشاهده تصویر بزرگ‌تر، روی عکس غذا بزنید.
          </p>
        </div>
      </section>
    </div>
  );
}

const FoodMenu = () => {
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0].id);
  const [expanded, setExpanded] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const { cart = [], addItem } = useCart();

  const cartItems = Array.isArray(cart)
    ? cart
    : Object.values(cart ?? {});

  const activeName = CATEGORIES.find(
    (category) => category.id === activeCategory
  )?.name;

  const visibleProducts = useMemo(
    () =>
      PRODUCTS.filter(
        (product) => product.categoryId === activeCategory
      ),
    [activeCategory]
  );

  function selectCategory(id) {
    setActiveCategory(id);
    setExpanded(true);
  }

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
                        onOpen={setSelectedProduct}
                      />
                    </SwiperSlide>
                  ))}
                </Swiper>
              ))}
          </div>
        </div>
      </div>

      <ProductDetailsModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAdd={addItem}
      />
    </section>
  );
};

export default FoodMenu;
