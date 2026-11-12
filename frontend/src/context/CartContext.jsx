
import { createContext, useContext, useEffect, useState } from "react";

const CartContext = createContext(null);

const STORAGE_KEY = "deniz-cart";

// بازیابی سبد خرید از localStorage
const getInitialCart = () => {
  try {
    const savedCart = localStorage.getItem(STORAGE_KEY);

    if (!savedCart) return [];

    const parsedCart = JSON.parse(savedCart);

    // تبدیل اطلاعات قدیمی که به شکل Object ذخیره شده‌اند به Array
    if (Array.isArray(parsedCart)) {
      return parsedCart;
    }

    if (parsedCart && typeof parsedCart === "object") {
      return Object.values(parsedCart).filter(
        (item) => item && item.id !== undefined
      );
    }

    return [];
  } catch (error) {
    console.error("خطا در بازیابی سبد خرید:", error);
    return [];
  }
};

// استفاده از سبد خرید در کامپوننت‌ها
export const useCart = () => {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart باید داخل CartProvider استفاده شود");
  }

  return context;
};

export const CartProvider = ({ children }) => {
  const [cart, setCart] = useState(getInitialCart);

  // ذخیره سبد خرید
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  }, [cart]);

  // افزودن محصول
  const addToCart = (product) => {
    setCart((currentCart) => {
      const existingProduct = currentCart.find(
        (item) => String(item.id) === String(product.id)
      );

      if (existingProduct) {
        return currentCart.map((item) =>
          String(item.id) === String(product.id)
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [
        ...currentCart,
        {
          ...product,
          quantity: 1,
        },
      ];
    });
  };

  // تغییر تعداد محصول
  const updateQuantity = (productId, quantity) => {
    setCart((currentCart) => {
      if (quantity <= 0) {
        return currentCart.filter(
          (item) => String(item.id) !== String(productId)
        );
      }

      return currentCart.map((item) =>
        String(item.id) === String(productId)
          ? { ...item, quantity }
          : item
      );
    });
  };

  // افزایش تعداد محصول
  const increase = (productId) => {
    setCart((currentCart) =>
      currentCart.map((item) =>
        String(item.id) === String(productId)
          ? { ...item, quantity: item.quantity + 1 }
          : item
      )
    );
  };

  // کاهش تعداد محصول
  const decrease = (productId) => {
    updateQuantity(
      productId,
      (cart.find((item) => String(item.id) === String(productId))
        ?.quantity || 0) - 1
    );
  };

  // حذف محصول
  const removeFromCart = (productId) => {
    setCart((currentCart) =>
      currentCart.filter(
        (item) => String(item.id) !== String(productId)
      )
    );
  };

  // خالی کردن سبد خرید
  const clearCart = () => {
    setCart([]);
  };

  // مجموع تعداد محصولات
  const totalItems = cart.reduce(
    (total, item) => total + (Number(item.quantity) || 0),
    0
  );

  // مبلغ کل
  const totalPrice = cart.reduce(
    (total, item) =>
      total + (Number(item.price) || 0) * (Number(item.quantity) || 0),
    0
  );

  return (
    <CartContext.Provider
      value={{
        cart,
        cartItems: cart,
        totalItems,
        totalPrice,
        addToCart,
        addItem: addToCart,
        updateQuantity,
        increase,
        decrease,
        removeFromCart,
        removeItem: removeFromCart,
        clearCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};
