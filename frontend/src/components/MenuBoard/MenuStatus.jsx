import "./MenuBoard.css";

/* حالت‌های بارگذاری و خطا؛ ظاهرشان با خود MenuBoard یکی است تا صفحه نپرد. */

export function MenuSkeleton({ id, className = "", title }) {
  return (
    <section className={`menu-board ${className}`} id={id} dir="rtl" aria-busy="true" aria-label={`در حال بارگذاری ${title}`}>
      <div className="menu-container">
        <div className="menu-hero menu-skel-hero">
          <div className="menu-hero-text">
            <h2>{title}</h2>
          </div>
        </div>

        <div className="menu-skel-chips">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="menu-skel" />
          ))}
        </div>

        <div className="menu-grid">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="menu-skel-card">
              <span className="menu-skel menu-skel-media" />
              <span className="menu-skel menu-skel-line" />
              <span className="menu-skel menu-skel-line menu-skel-short" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function MenuError({ id, className = "", title, message, onRetry }) {
  return (
    <section className={`menu-board ${className}`} id={id} dir="rtl">
      <div className="menu-container">
        <div className="menu-hero">
          <div className="menu-hero-text">
            <h2>{title}</h2>
          </div>
        </div>

        <div className="menu-error" role="alert">
          <p>{message || "دریافت منو ممکن نشد."}</p>
          <button type="button" onClick={onRetry}>
            تلاش دوباره
          </button>
        </div>
      </div>
    </section>
  );
}
