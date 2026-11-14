// پلاگین Vite: فقط موقع npm run dev کار می‌کند و فقط از localhost جواب می‌دهد.
// در build نهایی (سایت اصلی) اصلاً وجود ندارد.
import fs from "node:fs";
import path from "node:path";

const FILES = {
  food: "src/data/foodMenu.json",
  cafe: "src/data/cafeMenu.json",
};

const LOCAL_IPS = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];

function validate(data) {
  if (!data || !Array.isArray(data.categories) || !Array.isArray(data.products))
    return "ساختار داده درست نیست";

  const ids = new Set(data.categories.map((c) => c.id));
  if (ids.size !== data.categories.length) return "شناسه دسته‌ها تکراری است";

  for (const c of data.categories) {
    if (!c.id || !String(c.name || "").trim()) return "یک دسته بدون نام است";
  }

  const pids = new Set();
  for (const p of data.products) {
    if (!p.id || pids.has(p.id)) return "شناسه محصول تکراری یا خالی است";
    pids.add(p.id);
    if (!ids.has(p.categoryId)) return `دسته محصول «${p.name}» پیدا نشد`;
    if (!String(p.name || "").trim()) return "یک محصول بدون نام است";
    if (typeof p.price !== "number" || !(p.price >= 0))
      return `قیمت «${p.name}» معتبر نیست`;
    if (typeof p.isAvailable !== "boolean") return "وضعیت موجودی نامعتبر است";
  }
  return null;
}

export default function menuAdmin() {
  return {
    name: "menu-admin",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__admin/save-menu", (req, res) => {
        const send = (code, msg) => {
          res.statusCode = code;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ ok: code === 200, message: msg }));
        };

        if (req.method !== "POST") return send(405, "فقط POST");
        if (!LOCAL_IPS.includes(req.socket.remoteAddress))
          return send(403, "فقط از همین کامپیوتر مجاز است");

        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          try {
            const { menu, data } = JSON.parse(body);
            if (!FILES[menu]) return send(400, "منوی نامعتبر");

            const error = validate(data);
            if (error) return send(400, error);

            const file = path.resolve(server.config.root, FILES[menu]);
            fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf-8");
            send(200, "ذخیره شد");
          } catch {
            send(400, "درخواست نامعتبر");
          }
        });
      });
    },
  };
}