
import { useState } from "react";
import "./Survey.css";

const initialForm = {
  foodRating: 0,
  staffRating: 0,
  staffBehavior: "",
  hygiene: 55,
  ingredients: 0,
  priceQuality: "",
  buyAgain: "",
  fullName: "",
  feedback: "",
};

const emojiRatings = [
  { value: 1, emoji: "😠", label: "خیلی بد" },
  { value: 2, emoji: "🙁", label: "بد" },
  { value: 3, emoji: "😐", label: "متوسط" },
  { value: 4, emoji: "🙂", label: "خوب" },
  { value: 5, emoji: "😍", label: "عالی" },
];

function StarRating({ value, onChange, label }) {
  return (
    <div className="survey-stars" role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className={`survey-star ${value >= star ? "active" : ""}`}
          onClick={() => onChange(star)}
          aria-label={`${star} از 5`}
          aria-pressed={value === star}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function YesNo({ value, onChange, name }) {
  return (
    <div className="survey-yes-no">
      <button
        type="button"
        className={value === "yes" ? "selected yes" : ""}
        onClick={() => onChange("yes")}
        aria-pressed={value === "yes"}
      >
        <span>بله</span>
        <span className="survey-face">☻</span>
      </button>

      <button
        type="button"
        className={value === "no" ? "selected no" : ""}
        onClick={() => onChange("no")}
        aria-pressed={value === "no"}
      >
        <span>خیر</span>
        <span className="survey-face">☹</span>
      </button>
    </div>
  );
}

function Survey() {
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState("");

  const updateField = (field, value) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
    setMessage("");
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (
      !form.foodRating ||
      !form.staffRating ||
      !form.staffBehavior ||
      !form.ingredients ||
      !form.priceQuality ||
      !form.buyAgain ||
      !form.fullName.trim()
    ) {
      setMessage("لطفاً به سؤال‌های ضروری پاسخ دهید.");
      return;
    }

    // داده‌ها در این مرحله آماده ارسال به سرور هستند.
    console.log("Survey response:", form);

    setMessage(
      "پاسخ‌های شما آماده ارسال هستند. برای ذخیره نهایی باید به API سایت متصل شود."
    );
  };

  return (
    <section className="deniz-survey" dir="rtl">
      <div className="survey-container">

        <div className="survey-header">
          <span className="survey-header-icon">✦</span>
          <h2>نظرسنجی مشتریان دنیز</h2>
          <p>
            با نظرات شما، هر روز بهتر می‌شویم.
            <br />
            چند لحظه وقت بگذارید و تجربه‌تان را با ما به اشتراک بگذارید.
          </p>
        </div>

        <form className="survey-form" onSubmit={handleSubmit}>

          {/* Food Rating */}
          <div className="survey-question">
            <label className="survey-label">
              میزان رضایت از غذا
            </label>

            <StarRating
              label="امتیاز غذا"
              value={form.foodRating}
              onChange={(value) => updateField("foodRating", value)}
            />
          </div>

          {/* Staff Behavior */}
          <div className="survey-question">
            <label className="survey-label">
              آیا از برخورد پرسنل رضایت داشتید؟
            </label>

            <YesNo
              value={form.staffBehavior}
              onChange={(value) => updateField("staffBehavior", value)}
              name="staffBehavior"
            />
          </div>

          {/* Staff Rating */}
          <div className="survey-question">
            <label className="survey-label">
              میزان رضایت خود از برخورد پرسنل
            </label>

            <StarRating
              label="امتیاز برخورد پرسنل"
              value={form.staffRating}
              onChange={(value) => updateField("staffRating", value)}
            />
          </div>

          {/* Hygiene */}
          <div className="survey-question">
            <label className="survey-label">
              میزان بهداشت غذا
            </label>

            <div className="survey-range-wrap">
              <div className="survey-range-value">
                {form.hygiene}
              </div>

              <input
                type="range"
                min="0"
                max="100"
                value={form.hygiene}
                onChange={(event) =>
                  updateField("hygiene", Number(event.target.value))
                }
                className="survey-range"
                aria-label="میزان بهداشت غذا"
                style={{
                  "--range-progress": `${form.hygiene}%`,
                }}
              />

              <div className="survey-range-labels">
                <span>ضعیف</span>
                <span>عالی</span>
              </div>
            </div>
          </div>

          {/* Ingredients */}
          <div className="survey-question">
            <label className="survey-label">
              نظرتان نسبت به کیفیت مواد اولیه استفاده شده
            </label>

            <div className="survey-emojis">
              {emojiRatings.map((item) => (
                <button
                  type="button"
                  key={item.value}
                  className={
                    form.ingredients === item.value
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    updateField("ingredients", item.value)
                  }
                  aria-label={item.label}
                  aria-pressed={form.ingredients === item.value}
                  title={item.label}
                >
                  {item.emoji}
                </button>
              ))}
            </div>

            {form.ingredients > 0 && (
              <span className="survey-selected-label">
                {emojiRatings.find(
                  (item) => item.value === form.ingredients
                )?.label}
              </span>
            )}
          </div>

          {/* Price Quality */}
          <div className="survey-question">
            <label className="survey-label">
              نسبت کیفیت به قیمت
            </label>

            <div className="survey-radio-group">
              {[
                { value: "100", label: "۱۰۰٪" },
                { value: "90", label: "۹۰٪" },
                { value: "80", label: "۸۰٪" },
                { value: "below80", label: "زیر ۸۰٪" },
              ].map((item) => (
                <label
                  className="survey-radio-option"
                  key={item.value}
                >
                  <input
                    type="radio"
                    name="priceQuality"
                    value={item.value}
                    checked={form.priceQuality === item.value}
                    onChange={() =>
                      updateField("priceQuality", item.value)
                    }
                  />
                  <span className="survey-radio-custom"></span>
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Buy Again */}
          <div className="survey-question">
            <label className="survey-label">
              آیا علاقه‌مند به خرید مجدد از ما هستید؟
            </label>

            <div className="survey-simple-radio">
              <label>
                <input
                  type="radio"
                  name="buyAgain"
                  value="no"
                  checked={form.buyAgain === "no"}
                  onChange={() => updateField("buyAgain", "no")}
                />
                <span>خیر</span>
              </label>

              <label>
                <input
                  type="radio"
                  name="buyAgain"
                  value="yes"
                  checked={form.buyAgain === "yes"}
                  onChange={() => updateField("buyAgain", "yes")}
                />
                <span>بله</span>
              </label>
            </div>
          </div>

          {/* Name */}
          <div className="survey-question">
            <label className="survey-label" htmlFor="survey-name">
              نام و نام خانوادگی
            </label>

            <input
              id="survey-name"
              type="text"
              className="survey-text-input"
              placeholder="نام و نام خانوادگی خود را وارد کنید"
              value={form.fullName}
              onChange={(event) =>
                updateField("fullName", event.target.value)
              }
              required
            />
          </div>

          {/* Feedback */}
          <div className="survey-question">
            <label className="survey-label" htmlFor="survey-feedback">
              پیشنهادات خود را با ما در میان بگذارید.
            </label>

            <textarea
              id="survey-feedback"
              className="survey-textarea"
              placeholder="نظرات، پیشنهادها و انتقادات شما..."
              value={form.feedback}
              onChange={(event) =>
                updateField("feedback", event.target.value)
              }
              rows="5"
            />
          </div>

          {message && (
            <div className="survey-message" role="status">
              {message}
            </div>
          )}

          <button type="submit" className="survey-submit">
            ثبت نظرسنجی
            <span>←</span>
          </button>

          <p className="survey-footer-note">
            ممنون که به بهتر شدن دنیز کمک می‌کنید 💛
          </p>

        </form>
      </div>
    </section>
  );
}

export default Survey;
