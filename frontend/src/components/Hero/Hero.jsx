import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, Pagination, Navigation, EffectFade } from "swiper/modules";

import "swiper/css";
import "swiper/css/pagination";
import "swiper/css/navigation";
import "swiper/css/effect-fade";

import "./Hero.css";
import logo from "../../assets/images/Fast-Food-Deniz.png";

const slides = [
  {
    id: 1,
    image: "/images/hero-burger.jpg",
    eyebrow: "فست فود و کافی‌شاپ دنیز",
    title: "طعم خوب،",
    highlight: "همین نزدیکی!",
    description: "تجربه‌ی لذت واقعی از فست فود و کافی‌شاپ دنیز",
    button: "مشاهده منو",
    link: "#menu",
    position: "right",
  },
  {
    id: 2,
    image: "/images/hero-pizza.jpg",
    eyebrow: "یک انتخاب خوشمزه",
    title: "لحظه‌هات رو",
    highlight: "پیتزایی کن!",
    description: "طعم‌های متنوع و خوشمزه، برای دورهمی‌های دوست‌داشتنی",
    button: "منوی غذا",
    link: "#menu",
    position: "right",
  },
  {
    id: 3,
    image: "/images/hero-cafe.jpg",
    eyebrow: "یه مکث خوشمزه",
    title: "وقت یه فنجون",
    highlight: "حال خوبه!",
    description: "از نوشیدنی‌های خنک تا قهوه‌های دلچسب دنیز",
    button: "منوی کافی‌شاپ",
    link: "#cafe-menu",
    position: "right",
  },
];

const Hero = () => {
  return (
    <section className="hero-banner" id="home" dir="rtl">
      <Swiper
        modules={[Autoplay, Pagination, Navigation, EffectFade]}
        effect="fade"
        fadeEffect={{ crossFade: true }}
        loop
        speed={700}
        autoplay={{
          delay: 5000,
          disableOnInteraction: false,
          pauseOnMouseEnter: true,
        }}
        pagination={{ clickable: true }}
        navigation
        className="hero-swiper"
      >
        {slides.map((slide) => (
          <SwiperSlide key={slide.id}>
            <article className={`hero-slide hero-slide-${slide.id}`}>
              <img
                className="hero-slide-image"
                src={slide.image}
                alt={slide.title + " " + slide.highlight}
              />

              <div className="hero-overlay" />

              <div
                className={`hero-slide-content hero-content-${slide.position}`}
              >
                <span className="hero-eyebrow">{slide.eyebrow}</span>

                <h1 className="hero-heading">
                  {slide.title}
                  <br />
                  <span>{slide.highlight}</span>
                </h1>

                <p className="hero-subtitle">{slide.description}</p>

                <a href={slide.link} className="hero-cta">
                  {slide.button}
                  <span aria-hidden="true">‹</span>
                </a>
              </div>

              <div className="hero-brand-note">
                <img src={logo} alt="لوگوی فست فود دنیز" />
              </div>
            </article>
          </SwiperSlide>
        ))}
      </Swiper>
    </section>
  );
};

export default Hero;
