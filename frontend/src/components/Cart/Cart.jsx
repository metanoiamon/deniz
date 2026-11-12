
import { useCart } from "../../context/CartContext";
import "./Cart.css";

const formatPrice = (price) =>
  new Intl.NumberFormat("fa-IR").format(price);

const Cart = ({ onBack }) => {
  const {
    cartItems,
    totalItems,
    totalPrice,
    updateQuantity,
    removeFromCart,
    clearCart,
  } = useCart();

  return (
    <section className="cart-page" dir="rtl">
      <div className="cart-container">

        <div className="cart-heading">
          <div>
            <span className="cart-eyebrow">DENIZ FAST FOOD</span>
            <h1>سبد خرید شما</h1>
            <p>سفارش‌های خوشمزه‌ات اینجا جمع شده‌اند!</p>
          </div>

          <button className="cart-back-btn" onClick={onBack}>
            بازگشت به منو
          </button>
        </div>

        {cartItems.length === 0 ? (
          <div className="cart-empty">
            <div className="cart-empty-icon">🛒</div>
            <h2>سبد خریدت خالیه!</h2>
            <p>از منوی غذا یا کافی‌شاپ محصول مورد علاقه‌ات رو انتخاب کن.</p>

            <button onClick={onBack}>
              مشاهده منو
            </button>
          </div>
        ) : (
          <div className="cart-layout">

            <div className="cart-products">

              <div className="cart-products-title">
                <h2>محصولات انتخاب‌شده</h2>
                <span>
                  {formatPrice(totalItems)} عدد
                </span>
              </div>

              {cartItems.map((item) => (
                <article className="cart-item" key={item.id}>

                  <div className="cart-item-image">
                    {item.image ? (
                      <img src={item.image} alt={item.name} />
                    ) : (
                      <span>🍽️</span>
                    )}
                  </div>

                  <div className="cart-item-info">
                    <h3>{item.name}</h3>

                    <p>
                      {formatPrice(item.price)} تومان
                    </p>

                    <div className="cart-item-actions">

                      <div className="cart-quantity">
                        <button
                          onClick={() =>
                            updateQuantity(item.id, item.quantity + 1)
                          }
                          aria-label="افزایش تعداد"
                        >
                          +
                        </button>

                        <span>
                          {formatPrice(item.quantity)}
                        </span>

                        <button
                          onClick={() =>
                            updateQuantity(item.id, item.quantity - 1)
                          }
                          aria-label="کاهش تعداد"
                        >
                          −
                        </button>
                      </div>

                      <button
                        className="cart-remove"
                        onClick={() => removeFromCart(item.id)}
                      >
                        حذف محصول
                      </button>

                    </div>
                  </div>

                  <div className="cart-item-total">
                    {formatPrice(item.price * item.quantity)}
                    <small>تومان</small>
                  </div>

                </article>
              ))}

              <button
                className="cart-clear"
                onClick={clearCart}
              >
                خالی کردن سبد خرید
              </button>

            </div>

            <aside className="cart-summary">

              <h2>خلاصه سفارش</h2>

              <div className="cart-summary-row">
                <span>تعداد کل محصولات</span>
                <strong>{formatPrice(totalItems)}</strong>
              </div>

              <div className="cart-summary-row">
                <span>مبلغ محصولات</span>
                <strong>{formatPrice(totalPrice)} تومان</strong>
              </div>

              <div className="cart-summary-divider" />

              <div className="cart-final-price">
                <span>مبلغ نهایی</span>
                <strong>{formatPrice(totalPrice)} تومان</strong>
              </div>

              <p className="cart-summary-note">
                هزینه ارسال، در صورت وجود، جداگانه محاسبه می‌شود.
              </p>

              <button
                className="cart-checkout-btn"
                onClick={() =>
                  alert("مرحله ثبت سفارش را در قدم بعدی پیاده‌سازی می‌کنیم.")
                }
              >
                ادامه و ثبت سفارش
              </button>

            </aside>

          </div>
        )}

      </div>
    </section>
  );
};

export default Cart;
