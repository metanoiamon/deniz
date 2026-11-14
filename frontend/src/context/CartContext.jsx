
import { createContext, useContext, useEffect, useState } from "react";

const CartContext = createContext(null);

const STORAGE_KEY = "deniz-cart";

// فقط آیتم‌های سالم: هر آیتم خراب (null، عدد، بدون id یا تعداد نامعتبر) کنار گذاشته می‌شه.
// وگرنه یک آیتم خراب در localStorage باعث می‌شه کل صفحه موقع رندر کرش کنه، و چون ذخیره‌ست، در هر بار باز کردن سایت.
const isValidItem = (item) =>
  item !== null &&
  typeof item === "object" &&
  item.id !== undefined &&
  Number.isInteger(Number(item.quantity)) &&
  Number(item.quantity) > 0;

const cleanItems = (items) =>
  items
    .filter(isValidItem)
    .map((item) => ({ ...item, quantity: Number(item.quantity) }));

// بازیابی سبد خرید از localStorage
const getInitialCart = () => {
  try {
    const savedCart = localStorage.getItem(STORAGE_KEY);

    if (!savedCart) return [];

    const parsedCart = JSON.parse(savedCart);

    if (Array.isArray(parsedCart)) {
      return cleanItems(parsedCart);
    }

    // تبدیل اطلاعات قدیمی که به شکل Object ذخیره شده‌اند به Array
    if (parsedCart && typeof parsedCart === "object") {
      return cleanItems(Object.values(parsedCart));
    }

    return [];
  } catch (error) {
    console.error("خطا در بازیابی سبد خرید:", error);
    return [];
  }
};

// استفاده از سبد خرید در کامپوننت‌ها
// eslint-disable-next-line react-refresh/only-export-components -- hook کنار Provider خودش؛ فقط یعنی تغییر این فایل صفحه را کامل رفرش می‌کند
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
  // اگه مرورگر ذخیره‌سازی رو بسته باشه (حالت خصوصی، کوکی‌های مسدود، حافظه‌ی پر) setItem خطا می‌ده؛
  // خطای داخل useEffect کل صفحه رو سفید می‌کنه، پس فقط سبد ذخیره نمی‌شه و سایت کار می‌کنه.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch (error) {
      console.warn("ذخیره‌ی سبد خرید ممکن نشد:", error);
    }
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
