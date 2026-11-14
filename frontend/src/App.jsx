
import { useState } from "react";

import Header from "./components/header/header";
import Hero from "./components/Hero/Hero";
import FoodMenu from "./components/FoodMenu/FoodMenu";
import CafeMenu from "./components/CafeMenu/CafeMenu";
import Footer from "./components/Footer/Footer";
import Cart from "./components/Cart/Cart";

import { CartProvider } from "./context/CartContext";

function AppContent() {
  const [currentPage, setCurrentPage] = useState("home");

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
