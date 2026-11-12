import { useState } from "react";
import "./Header.css";
import logo from "../../assets/images/Fast-Food-Deniz.png";
import { useCart } from "../../context/CartContext";

const InstagramIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="1" className="icon-fill" />
  </svg>
);

const CartIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h8.9a2 2 0 0 0 1.9-1.4L22 8H6" />
    <circle cx="10" cy="20" r="1.2" />
    <circle cx="18" cy="20" r="1.2" />
  </svg>
);

const MenuIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

const Header = ({ onCartClick, onHomeClick }) => {
  const { totalItems } = useCart();

  // وضعیت باز و بسته بودن منوی موبایل
  const [menuOpen, setMenuOpen] = useState(false);

  // بستن منو بعد از کلیک روی لینک‌ها
  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="site-header" dir="rtl">
      <div className="header-container">
        {/* لوگو */}
        <a
          href="#home"
          className="header-logo"
          onClick={(e) => {
            e.preventDefault();
            closeMenu();
            onHomeClick?.();
          }}
        >
          <img src={logo} alt="لوگوی فست فود دنیز" />
        </a>

        {/* منوی اصلی */}
        <nav className={`header-nav ${menuOpen ? "show-menu" : ""}`}>
          <a
            href="#home"
            className="nav-link active"
            onClick={(e) => {
              e.preventDefault();
              closeMenu();
              onHomeClick?.();
            }}
          >
            صفحه اصلی
          </a>

          <a href="#menu" className="nav-link" onClick={closeMenu}>
            منوی غذا
          </a>

          <a href="#cafe-menu" className="nav-link" onClick={closeMenu}>
            منوی کافی‌شاپ
          </a>

          <a href="#about" className="nav-link" onClick={closeMenu}>
            درباره ما
          </a>

          <a href="#contact" className="nav-link" onClick={closeMenu}>
            تماس با ما
          </a>
        </nav>

        {/* آیکون‌ها و اطلاعات تماس */}
        <div className="header-actions">
          {/* اینستاگرام */}
          <a
            href="https://instagram.com/fastfood_deniz"
            target="_blank"
            rel="noreferrer"
            className="header-icon instagram-icon"
            aria-label="اینستاگرام دنیز"
          >
            <InstagramIcon />
          </a>

          {/* سبد خرید */}
          <button
            type="button"
            onClick={() => {
              closeMenu();
              onCartClick?.();
            }}
            className="header-icon cart-icon"
            aria-label={`سبد خرید، ${totalItems} محصول`}
          >
            <CartIcon />

            <span className="cart-count">
              {new Intl.NumberFormat("fa-IR").format(totalItems)}
            </span>
          </button>

          {/* شماره تماس‌ها */}
          <div className="header-phones" dir="ltr">
            <a href="tel:04142429900">04142429900</a>
            <a href="tel:04142429310">04142429310</a>
          </div>

          {/* دکمه منوی موبایل */}
          <button
            type="button"
            className="mobile-menu-btn"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label={menuOpen ? "بستن منو" : "باز کردن منو"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
