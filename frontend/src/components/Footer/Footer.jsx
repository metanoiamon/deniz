
import "./Footer.css";
import logo from "../../assets/images/Fast-Food-Deniz.png";

const Footer = () => {
  return (
    <footer className="deniz-footer" dir="rtl">
      <div className="deniz-footer-container">

        {/* لوگوی دنیز */}
        <div className="deniz-footer-brand">
          <div className="deniz-footer-logo">
            <img
              src={logo}
              alt="Deniz Fast Food"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          </div>

          <h2>فست فود دنیز</h2>

          <p>
            طعم خوشمزه لحظه‌های شما!
          </p>
        </div>

        {/* اطلاعات تماس */}
        <div className="deniz-footer-info">

          <div className="deniz-footer-item">
            <span className="deniz-footer-icon">📍</span>

            <div>
              <h3>آدرس ما</h3>
              <p>
                شبستر، خیابان طالقانی،
                بالاتر از کتابخانه عمومی
              </p>
            </div>
          </div>

          <div className="deniz-footer-item">
            <span className="deniz-footer-icon">☎</span>

            <div>
              <h3>شماره تماس</h3>

              <a href="tel:04142429900">
                04142429900
              </a>

              <a href="tel:04142429310">
                04142429310
              </a>
            </div>
          </div>

          <div className="deniz-footer-item">
            <span className="deniz-footer-icon">◎</span>

            <div>
              <h3>اینستاگرام ما</h3>

              <a
                href="https://www.instagram.com/fastfood_deniz/"
                target="_blank"
                rel="noopener noreferrer"
              >
                @fastfood_deniz
              </a>
            </div>
          </div>

        </div>

        {/* شعار پایانی */}
        <div className="deniz-footer-bottom">
          <p>
            دنیز؛ انتخاب خوشمزه شما 💛
          </p>

          <span>
            © تمامی حقوق برای فست فود دنیز محفوظ است.
          </span>
        </div>

      </div>
    </footer>
  );
};

export default Footer;
