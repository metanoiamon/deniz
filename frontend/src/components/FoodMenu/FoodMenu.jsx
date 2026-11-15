import MenuBoard from "../MenuBoard/MenuBoard";
import { MenuError, MenuSkeleton } from "../MenuBoard/MenuStatus";
import { useMenu } from "../../hooks/useMenu";
import "./FoodMenu.css";

/*
  این بخش از بین «تب‌های منو» در پنل ادمین، تبی را نشان می‌دهد که اسمش شبیه غذا/فست‌فود باشد.
  اگر اسم تب شما چیز دیگری است، همین دو عبارت را عوض کنید.
*/
const FOOD_TYPE = /غذا|فست|برگر|پیتزا/;
const CAFE_TYPE = /کافی|کافه|نوشیدنی|قهوه/;

const pickFoodType = (types) =>
  types.find((t) => FOOD_TYPE.test(t.name)) ??
  types.find((t) => !CAFE_TYPE.test(t.name)) ??
  null;

const HIGHLIGHTS = [
  { icon: "🛵", title: "ارسال سریع", text: "حداکثر ۳۰ دقیقه" },
  { icon: "🔥", title: "همیشه داغ", text: "تازه و در لحظه" },
  { icon: "🥩", title: "مواد درجه یک", text: "گوشت و مرغ تازه" },
];

// عکس هر دسته از روی اسمش انتخاب می‌شود (فایل‌ها در public/images/food-categories)
const CATEGORY_IMAGE_RULES = [
  { file: "burger.png", test: (n) => n.includes("برگر") },
  { file: "salad.png", test: (n) => n.includes("سالاد") || n.includes("پاستا") },
  { file: "pizza-italian.png", test: (n) => n.includes("پیتزا") && n.includes("ایتالیایی") },
  { file: "pizza-american.png", test: (n) => n.includes("پیتزا") },
  { file: "chicken.png", test: (n) => n.includes("ساندویچ") && n.includes("مرغ") },
  { file: "sandwich.png", test: (n) => n.includes("ساندویچ") },
  { file: "fries.png", test: (n) => n.includes("سیب‌زمینی") || n.includes("اسنک") },
  { file: "doner.png", test: (n) => n.includes("دونر") },
  { file: "fried-chicken.png", test: (n) => n.includes("سوخاری") },
];

function getCategoryImage(name = "") {
  const rule = CATEGORY_IMAGE_RULES.find((item) => item.test(name.toLowerCase()));
  return `/images/food-categories/${rule ? rule.file : "burger.png"}`;
}

const PlateIcon = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <circle cx="24" cy="24" r="17" fill="none" stroke="currentColor" strokeWidth="2.5" />
    <circle cx="24" cy="24" r="10" fill="none" stroke="currentColor" strokeWidth="2.5" />
  </svg>
);

const FoodMenu = ({ onOpenCart }) => {
  const { data, found, loading, error, retry } = useMenu(pickFoodType);

  if (loading) return <MenuSkeleton id="menu" className="menu--food" title="منوی غذا" />;
  if (error) {
    return <MenuError id="menu" className="menu--food" title="منوی غذا" message={error} onRetry={retry} />;
  }
  if (!found) return null;

  return (
    <MenuBoard
      id="menu"
      className="menu--food"
      title="منوی غذا"
      subtitle="از یک برگر لذیذ تا پیتزای ایتالیایی، همه‌چیز در دنیز!"
      data={data}
      highlights={HIGHLIGHTS}
      getCategoryImage={getCategoryImage}
      FallbackIcon={PlateIcon}
      searchPlaceholder="جستجوی غذا، مثلاً پیتزا یا مرغ"
      crossSellPattern="سیب"
      onOpenCart={onOpenCart}
    />
  );
};

export default FoodMenu;
