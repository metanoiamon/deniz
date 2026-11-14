
import { lazy, Suspense, useState } from "react";

import Header from "./components/header/header";
import Hero from "./components/Hero/Hero";
import FoodMenu from "./components/FoodMenu/FoodMenu";
import CafeMenu from "./components/CafeMenu/CafeMenu";
import Survey from "./components/Survey/Survey";
import Footer from "./components/Footer/Footer";
import Cart from "./components/Cart/Cart";

import { CartProvider } from "./context/CartContext";

// پنل مدیریت فقط در حالت development بارگذاری می‌شود
const AdminPanel = import.meta.env.DEV
  ? lazy(() => import("./components/Admin/Adminpanel"))
  : null;

function AppContent() {
  const [currentPage, setCurrentPage] = useState("home");
  const [adminOpen, setAdminOpen] = useState(false);
  const [showSurvey, setShowSurvey] = useState(false);

  // بازگشت به صفحه اصلی
  const goHome = () => {
    setCurrentPage("home");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  // نمایش سبد خرید
  const openCart = () => {
    setCurrentPage("cart");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  // باز کردن نظرسنجی
  const openSurvey = () => {
    setShowSurvey(true);

    window.setTimeout(() => {
      document
        .getElementById("survey-section")
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
    }, 100);
  };

  return (
    <>
      <Header
        onCartClick={openCart}
        onHomeClick={goHome}
        onAdminClick={() => setAdminOpen(true)}
      />

      {currentPage === "cart" ? (
        <Cart onBack={goHome} />
      ) : (
        <main id="home">
          <Hero />

          <FoodMenu />

          <CafeMenu />

          {/* بخش نظرسنجی؛ ابتدا مخفی است */}
          {showSurvey && (
            <section id="survey-section">
              <Survey />
            </section>
          )}
        </main>
      )}

      {/* نوتیفیکیشن نظرسنجی */}
      {currentPage === "home" && !showSurvey && (
        <button
          type="button"
          className="survey-notification"
          onClick={openSurvey}
        >
          <span className="survey-notification-icon">
            ⭐
          </span>

          <span className="survey-notification-text">
            نظرت درباره دنیز برامون مهمه!
          </span>

          <span className="survey-notification-action">
            ثبت نظر
          </span>
        </button>
      )}

      <Footer />

      {/* پنل مدیریت */}
      {AdminPanel && adminOpen && (
        <Suspense fallback={null}>
          <AdminPanel
            onClose={() => setAdminOpen(false)}
          />
        </Suspense>
      )}
    </>
  );
}

function App() {
  return (
    <CartProvider>
      <AppContent />
    </CartProvider>
  );
}

export default App;
