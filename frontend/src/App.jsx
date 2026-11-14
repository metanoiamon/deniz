import { lazy, Suspense, useState } from "react";

import Header from "./components/header/header";
import Hero from "./components/Hero/Hero";
import FoodMenu from "./components/FoodMenu/FoodMenu";
import CafeMenu from "./components/CafeMenu/CafeMenu";
import Footer from "./components/Footer/Footer";
import Cart from "./components/Cart/Cart";

import { CartProvider } from "./context/CartContext";

// پنل مدیریت فقط در حالت dev بارگذاری می‌شود و داخل build نهایی نمی‌رود
const AdminPanel = import.meta.env.DEV
  ? lazy(() => import("./components/Admin/Adminpanel"))
  : null;

function AppContent() {
  const [currentPage, setCurrentPage] = useState("home");
  const [adminOpen, setAdminOpen] = useState(false);

  const goHome = () => {
    setCurrentPage("home");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  const openCart = () => {
    setCurrentPage("cart");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
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
        </main>
      )}

      <Footer />

      {AdminPanel && adminOpen && (
        <Suspense fallback={null}>
          <AdminPanel onClose={() => setAdminOpen(false)} />
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