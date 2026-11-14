import { useEffect, useState } from "react";
import "./header.css";
import logo from "../../assets/images/Fast-Food-Deniz.png";
import { useCart } from "../../context/CartContext";

/* ---------- آیکون‌ها ---------- */
const Svg = ({ children }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    {children}
  </svg>
);

const InstagramIcon = () => (
  <Svg>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="1" className="icon-fill" />
  </Svg>
);
const CartIcon = () => (
  <Svg>
    <path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h8.9a2 2 0 0 0 1.9-1.4L22 8H6" />
    <circle cx="10" cy="20" r="1.2" />
    <circle cx="18" cy="20" r="1.2" />
  </Svg>
);
const MenuIcon = () => (
  <Svg>
    <path d="M4 7h16M4 12h16M4 17h10" />
  </Svg>
);
const CloseIcon = () => (
  <Svg>
    <path d="m6 6 12 12M18 6 6 18" />
  </Svg>
);
const HomeIcon = () => (
  <Svg>
    <path d="M3 11 12 4l9 7" />
    <path d="M5 10v10h14V10" />
    <path d="M10 20v-6h4v6" />
  </Svg>
);
const FoodIcon = () => (
  <Svg>
    <path d="M7 3v8a2 2 0 0 0 2 2v8" />
    <path d="M5 3v6M9 3v6" />
    <path d="M17 3c-2 1.5-3 4-3 7h3v11" />
  </Svg>
);
const CoffeeIcon = () => (
  <Svg>
    <path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Z" />
    <path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17" />
    <path d="M8 3v3M12 3v3" />
  </Svg>
);
const InfoIcon = () => (
  <Svg>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Svg>
);
const PhoneIcon = () => (
  <Svg>
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
  </Svg>
);
const DashboardIcon = () => (
  <Svg>
    <rect x="3" y="3" width="7" height="9" rx="2" />
    <rect x="14" y="3" width="7" height="5" rx="2" />
    <rect x="14" y="12" width="7" height="9" rx="2" />
    <rect x="3" y="16" width="7" height="5" rx="2" />
  </Svg>
);

/* ---------- تنظیمات ---------- */
const NAV_ITEMS = [
  { id: "home", label: "صفحه اصلی", icon: HomeIcon },
  { id: "menu", label: "منوی غذا", icon: FoodIcon },
  { id: "cafe-menu", label: "منوی کافی‌شاپ", icon: CoffeeIcon },
  { id: "about", label: "درباره ما", icon: InfoIcon },
  { id: "contact", label: "تماس با ما", icon: PhoneIcon },
];

const PHONES = ["04142429900", "04142429310"];

// پیام‌های نوار اطلاع‌رسانی بالای سایت (هر متنی خواستی بنویس)
const ANNOUNCEMENTS = [
  "برای سفارش تلفنی با ما تماس بگیرید",
  "منوی کافی‌شاپ را هم ببینید",
  "ما را در اینستاگرام دنبال کنید: fastfood_deniz",
];

// دکمه پنل فقط روی کامپیوتر خود ادمین (npm run dev) دیده می‌شود، نه در سایت اصلی
const SHOW_ADMIN = import.meta.env.DEV;

const faNumber = (n) => new Intl.NumberFormat("fa-IR").format(n);

const Header = ({ onCartClick, onHomeClick, onAdminClick }) => {
  const { totalItems } = useCart();

  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState("home");
  const [announceIndex, setAnnounceIndex] = useState(0);

  const closeMenu = () => setMenuOpen(false);

  /* سایه و کوچک‌شدن هدر هنگام اسکرول */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* تشخیص بخش فعال هنگام اسکرول */
  useEffect(() => {
    const sections = NAV_ITEMS.map((i) => document.getElementById(i.id)).filter(
      Boolean
    );
    if (!sections.length) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { rootMargin: "-40% 0px -55% 0px" }
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  /* چرخش پیام‌های نوار بالا */
  useEffect(() => {
    const timer = setInterval(
      () => setAnnounceIndex((i) => (i + 1) % ANNOUNCEMENTS.length),
      4000
    );
    return () => clearInterval(timer);
  }, []);

  /* قفل اسکرول صفحه و بستن با Esc وقتی منو باز است */
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const handleNav = (e, id) => {
    closeMenu();
    setActive(id);
    if (id === "home") {
      e.preventDefault();
      onHomeClick?.();
    }
  };

  const handleCart = () => {
    closeMenu();
    onCartClick?.();
  };

  const handleAdmin = () => {
    closeMenu();
    onAdminClick?.();
  };

  return (
    <>
      <header className={`site-header ${scrolled ? "is-scrolled" : ""}`} dir="rtl">
        {/* نوار اطلاع‌رسانی */}
        <div className="top-bar">
          <div className="top-bar-inner">
            <p className="top-bar-msg" key={announceIndex}>
              {ANNOUNCEMENTS[announceIndex]}
            </p>
            <div className="top-bar-phones" dir="ltr">
              {PHONES.map((p) => (
                <a key={p} href={`tel:${p}`}>
                  {p}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* هدر اصلی */}
        <div className="header-container">
          <a
            href="#home"
            className="header-logo"
            onClick={(e) => handleNav(e, "home")}
          >
            <img src={logo} alt="لوگوی فست فود دنیز" />
          </a>

          <nav className="header-nav" aria-label="منوی اصلی">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
              <a
                key={id}
                href={`#${id}`}
                className={`nav-link ${active === id ? "active" : ""}`}
                onClick={(e) => handleNav(e, id)}
              >
                <Icon />
                {label}
              </a>
            ))}
          </nav>

          <div className="header-actions">
            <a
              href="https://instagram.com/fastfood_deniz"
              target="_blank"
              rel="noreferrer"
              className="header-icon instagram-icon"
              aria-label="اینستاگرام دنیز"
            >
              <InstagramIcon />
            </a>

            <button
              type="button"
              onClick={handleCart}
              className="header-icon cart-icon"
              aria-label={`سبد خرید، ${totalItems} محصول`}
            >
              <CartIcon />
              {totalItems > 0 && (
                <span className="cart-count">{faNumber(totalItems)}</span>
              )}
            </button>

            {SHOW_ADMIN && (
            <button
              type="button"
              className="admin-btn"
              onClick={handleAdmin}
              aria-label="ورود به پنل مدیریت"
            >
              <DashboardIcon />
              <span>پنل مدیریت</span>
            </button>
            )}

            <a className="call-btn" href={`tel:${PHONES[0]}`}>
              <PhoneIcon />
              <span>سفارش تلفنی</span>
            </a>

            <button
              type="button"
              className="mobile-menu-btn"
              onClick={() => setMenuOpen(true)}
              aria-label="باز کردن منو"
              aria-expanded={menuOpen}
            >
              <MenuIcon />
            </button>
          </div>
        </div>
      </header>

      {/* پس‌زمینه تیره و کشوی موبایل */}
      <div
        className={`drawer-overlay ${menuOpen ? "open" : ""}`}
        onClick={closeMenu}
      />

      <aside
        className={`mobile-drawer ${menuOpen ? "open" : ""}`}
        dir="rtl"
        aria-hidden={!menuOpen}
      >
        <div className="drawer-head">
          <img src={logo} alt="لوگوی فست فود دنیز" />
          <button
            type="button"
            className="drawer-close"
            onClick={closeMenu}
            aria-label="بستن منو"
          >
            <CloseIcon />
          </button>
        </div>

        <nav className="drawer-nav" aria-label="منوی موبایل">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              className={`drawer-link ${active === id ? "active" : ""}`}
              onClick={(e) => handleNav(e, id)}
              tabIndex={menuOpen ? 0 : -1}
            >
              <span className="drawer-link-icon">
                <Icon />
              </span>
              {label}
            </a>
          ))}

          {SHOW_ADMIN && (
          <button
            type="button"
            className="drawer-link drawer-admin"
            onClick={handleAdmin}
            tabIndex={menuOpen ? 0 : -1}
          >
            <span className="drawer-link-icon">
              <DashboardIcon />
            </span>
            پنل مدیریت
          </button>
          )}
        </nav>

        <div className="drawer-foot">
          <p className="drawer-foot-title">سفارش تلفنی</p>
          {PHONES.map((p) => (
            <a
              key={p}
              href={`tel:${p}`}
              className="drawer-phone"
              dir="ltr"
              tabIndex={menuOpen ? 0 : -1}
            >
              <PhoneIcon />
              {p}
            </a>
          ))}
          <a
            href="https://instagram.com/fastfood_deniz"
            target="_blank"
            rel="noreferrer"
            className="drawer-insta"
            tabIndex={menuOpen ? 0 : -1}
          >
            <InstagramIcon />
            fastfood_deniz
          </a>
        </div>
      </aside>

      {/* نوار پایین موبایل (مثل اپلیکیشن) */}
      <nav
        className="bottom-bar"
        dir="rtl"
        aria-label="دسترسی سریع"
        style={{ gridTemplateColumns: `repeat(${SHOW_ADMIN ? 5 : 4}, 1fr)` }}
      >
        <a
          href="#home"
          className={active === "home" ? "active" : ""}
          onClick={(e) => handleNav(e, "home")}
        >
          <HomeIcon />
          <span>خانه</span>
        </a>
        <a
          href="#menu"
          className={active === "menu" ? "active" : ""}
          onClick={(e) => handleNav(e, "menu")}
        >
          <FoodIcon />
          <span>منو</span>
        </a>
        <button type="button" className="bottom-cart" onClick={handleCart}>
          <span className="bottom-cart-circle">
            <CartIcon />
            {totalItems > 0 && (
              <span className="cart-count">{faNumber(totalItems)}</span>
            )}
          </span>
          <span>سبد خرید</span>
        </button>
        <a
          href="#cafe-menu"
          className={active === "cafe-menu" ? "active" : ""}
          onClick={(e) => handleNav(e, "cafe-menu")}
        >
          <CoffeeIcon />
          <span>کافی‌شاپ</span>
        </a>
        {SHOW_ADMIN && (
        <button type="button" onClick={handleAdmin}>
          <DashboardIcon />
          <span>پنل</span>
        </button>
        )}
      </nav>
    </>
  );
};

export default Header;