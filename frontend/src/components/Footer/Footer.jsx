
import "./Footer.css";
import logo from "../../assets/images/Fast-Food-Deniz.png";

const Footer = () => {
  return (
    <footer className="deniz-footer" dir="rtl">
      <div className="deniz-footer-container">

        {/* Top CTA */}
        <div className="deniz-footer-cta">
          <div className="deniz-cta-text">
            <span className="deniz-cta-label">
              یک انتخاب خوشمزه!
            </span>

            <h2>هوس یه غذای خوشمزه کردی؟</h2>

            <p>
              منوی دنیز رو ببین و غذای مورد علاقه‌ات رو انتخاب کن.
            </p>
          </div>

          <a href="#menu" className="deniz-cta-button">
            مشاهده منوی غذا
            <span>←</span>
          </a>

          <div className="deniz-cta-decoration">🍔</div>
        </div>

        {/* Main Footer */}
        <div className="deniz-footer-main">

          {/* Brand */}
          <div className="deniz-footer-brand">
            <div className="deniz-footer-logo">
              <img
                src={logo}
                alt="لوگوی فست فود دنیز"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </div>

            <h2>فست فود دنیز</h2>

            <span className="deniz-brand-en">
              DENIZ FAST FOOD
            </span>

            <p>
              طعم خوشمزه لحظه‌های شما!
              <br />
              با بهترین انتخاب‌ها، لحظه‌هات رو خوشمزه‌تر کن.
            </p>

            <a
              href="https://www.instagram.com/fastfood_deniz/"
              target="_blank"
              rel="noopener noreferrer"
              className="deniz-instagram-button"
            >
              <span className="deniz-instagram-icon">◎</span>
              ما رو در اینستاگرام دنبال کن
              <span>↗</span>
            </a>
          </div>

          {/* Quick Links */}
          <div className="deniz-footer-links">
            <h3>دسترسی سریع</h3>

            <span className="deniz-footer-title-line"></span>

            <a href="#menu">
              <span>›</span>
              منوی غذا
            </a>

            <a href="#menu">
              <span>›</span>
              برگرها و ساندویچ‌ها
            </a>

            <a href="#menu">
              <span>›</span>
              پیتزاها
            </a>

            <a href="#menu">
              <span>›</span>
              سوخاری و پیش‌غذا
            </a>

            <a href="tel:04142429900">
              <span>›</span>
              تماس با دنیز
            </a>
          </div>

          {/* Contact */}
          <div className="deniz-footer-contact">
            <h3>راه‌های ارتباطی</h3>

            <span className="deniz-footer-title-line"></span>

            <a
              className="deniz-contact-card"
              href="https://www.google.com/maps/search/?api=1&query=شبستر+خیابان+طالقانی+بالاتر+از+کتابخانه+عمومی"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="deniz-contact-icon">📍</span>

              <span className="deniz-contact-content">
                <strong>آدرس دنیز</strong>
                <small>
                  شبستر، خیابان طالقانی،
                  بالاتر از کتابخانه عمومی
                </small>
              </span>

              <span className="deniz-contact-arrow">↗</span>
            </a>

            <a
              className="deniz-contact-card"
              href="tel:04142429900"
            >
              <span className="deniz-contact-icon">☎</span>

              <span className="deniz-contact-content">
                <strong>شماره تماس اول</strong>
                <small>04142429900</small>
              </span>

              <span className="deniz-contact-arrow">↗</span>
            </a>

            <a
              className="deniz-contact-card"
              href="tel:04142429310"
            >
              <span className="deniz-contact-icon">☎</span>

              <span className="deniz-contact-content">
                <strong>شماره تماس دوم</strong>
                <small>04142429310</small>
              </span>

              <span className="deniz-contact-arrow">↗</span>
            </a>
          </div>
        </div>

        {/* Bottom */}
        <div className="deniz-footer-bottom">

          <div className="deniz-footer-bottom-brand">
            <span>DENIZ</span>
            <span className="deniz-bottom-dot">●</span>
            <span>FAST FOOD</span>
          </div>

          <p>
            دنیز؛ انتخاب خوشمزه شما 💛
          </p>

          <span className="deniz-copyright">
            © تمامی حقوق برای فست فود دنیز محفوظ است.
          </span>

        </div>

      </div>
    </footer>
  );
};

export default Footer;
