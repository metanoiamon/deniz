import MenuBoard from "../MenuBoard/MenuBoard";
import { MenuError, MenuSkeleton } from "../MenuBoard/MenuStatus";
import { useMenu } from "../../hooks/useMenu";
import "./CafeMenu.css";

// تبی که اسمش شبیه کافی‌شاپ باشد؛ اگر اسم تب شما چیز دیگری است، این عبارت را عوض کنید.
const CAFE_TYPE = /کافی|کافه|نوشیدنی|قهوه/;

const pickCafeType = (types) => types.find((t) => CAFE_TYPE.test(t.name)) ?? null;

const HIGHLIGHTS = [
  { icon: "☕", title: "قهوه تازه", text: "دانه‌ی تازه‌آسیاب" },
  { icon: "🥛", title: "شیر و فوم نرم", text: "آماده در لحظه" },
  { icon: "🍰", title: "کیک روز", text: "شیرینی خانگی" },
];

// عکس هر دسته از روی اسمش انتخاب می‌شود (فایل‌ها در public/images/cafe-categories)
const CATEGORY_IMAGE_RULES = [
  { file: "tea.png", test: (n) => n.includes("چای") || n.includes("صبحانه") },
  { file: "iced-coffee.png", test: (n) => n.includes("آیس") && n.includes("کافی") },
  { file: "ice-pack.png", test: (n) => n.includes("آیس پک") },
  { file: "hot-coffee.png", test: (n) => n.includes("هات") || n.includes("کافی") },
  { file: "shake.png", test: (n) => n.includes("شیک") },
  { file: "cake.png", test: (n) => n.includes("کیک") },
];

function getCategoryImage(name = "") {
  const rule = CATEGORY_IMAGE_RULES.find((item) => item.test(name.toLowerCase()));
  return `/images/cafe-categories/${rule ? rule.file : "hot-coffee.png"}`;
}

const CupIcon = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <path d="M9 18h26v9a11 11 0 0 1-11 11h-4A11 11 0 0 1 9 27v-9z" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M35 21h2.5a4.5 4.5 0 0 1 0 9H34" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M16 8v4M22 6v6M28 8v4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

const CafeMenu = ({ onOpenCart }) => {
  const { data, found, loading, error, retry } = useMenu(pickCafeType);

  if (loading) return <MenuSkeleton id="cafe-menu" className="menu--cafe" title="منوی کافی‌شاپ" />;
  if (error) {
    return <MenuError id="cafe-menu" className="menu--cafe" title="منوی کافی‌شاپ" message={error} onRetry={retry} />;
  }
  if (!found) return null;

  return (
    <MenuBoard
      id="cafe-menu"
      className="menu--cafe"
      title="منوی کافی‌شاپ"
      subtitle="از چای صبحانه تا شیک و کیک، یک استراحت خوشمزه در دنیز!"
      data={data}
      highlights={HIGHLIGHTS}
      getCategoryImage={getCategoryImage}
      FallbackIcon={CupIcon}
      searchPlaceholder="جستجوی نوشیدنی یا کیک"
      crossSellPattern="کیک"
      onOpenCart={onOpenCart}
    />
  );
};

export default CafeMenu;
