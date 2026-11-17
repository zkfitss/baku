const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });

const cookieName = "zkfits_admin";

async function digest(value) {
  const result = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );

  return Array.from(new Uint8Array(result))
    .map(x => x.toString(16).padStart(2, "0"))
    .join("");
}

async function getToken(env) {
  return digest(
    (env.SESSION_SECRET || "change-this-secret") +
    "|" + (env.ADMIN_PASSWORD || "") +
    "|zkfits-admin"
  );
}

function isAdmin(request, token) {
  const cookie = request.headers.get("Cookie") || "";

  return cookie.split(";").some(
    item => item.trim() === cookieName + "=" + token
  );
}

function cookieHeader(value, maxAge) {
  return {
    "Set-Cookie":
      cookieName + "=" + value +
      "; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=" + maxAge
  };
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function makeId() {
  return crypto.randomUUID();
}

function parseJSON(value) {
  try {
    return JSON.parse(value || "[]");
  } catch {
    return [];
  }
}

export async function onRequest({ request, env }) {
  if (!env.DB) {
    return json({ error: "D1 binding DB is missing" }, 500);
  }

  const url = new URL(request.url);
  const path = url.pathname
    .replace(/^\/api\/?/, "")
    .split("/")
    .filter(Boolean);

  const method = request.method;
  const token = await getToken(env);

  try {
    // LOGIN
    if (path[0] === "login" && method === "POST") {
      const data = await readBody(request);

      if (
        !env.ADMIN_PASSWORD ||
        data.password !== env.ADMIN_PASSWORD
      ) {
        return json({ error: "Invalid login" }, 401);
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          "Content-Type": "application/json",
          ...cookieHeader(token, 604800)
        }
      });
    }

    // LOGOUT
    if (path[0] === "logout") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          "Content-Type": "application/json",
          ...cookieHeader("", 0)
        }
      });
    }

    // SESSION CHECK
    if (path[0] === "me") {
      return isAdmin(request, token)
        ? json({ ok: true })
        : json({ error: "Unauthorized" }, 401);
    }

    // PUBLIC STORE
    if (path[0] === "store" && method === "GET") {
      const products = await env.DB.prepare(
        "SELECT * FROM products WHERE active = 1 ORDER BY featured DESC, created_at DESC"
      ).all();

      const settings = await env.DB.prepare(
        "SELECT key, value FROM settings"
      ).all();

      const cleanProducts = (products.results || []).map(p => ({
        ...p,
        title: p.title || p.name,
        sizes: parseJSON(p.sizes),
        colors: parseJSON(p.colors)
      }));

      return json({
        products: cleanProducts,
        settings: Object.fromEntries(
          (settings.results || []).map(item => [
            item.key,
            item.value
          ])
        )
      });
    }

    // PLACE ORDER
    if (path[0] === "orders" && method === "POST") {
      const data = await readBody(request);

      if (
        !data.customer_name ||
        !data.phone ||
        !data.address ||
        !Array.isArray(data.items) ||
        !data.items.length
      ) {
        return json({ error: "Missing checkout fields" }, 400);
      }

      const shippingSetting = await env.DB.prepare(
        "SELECT value FROM settings WHERE key = 'shipping_fee'"
      ).first();

      const thresholdSetting = await env.DB.prepare(
        "SELECT value FROM settings WHERE key = 'free_shipping_threshold'"
      ).first();

      const shipping = Number(shippingSetting?.value || 250);
      const threshold = Number(thresholdSetting?.value || 5000);

      const subtotal = Number(data.total) || 0;
      const total = subtotal + (subtotal >= threshold ? 0 : shipping);
      const id = makeId();

      await env.DB.prepare(`
        INSERT INTO orders
        (id, customer_name, phone, address, payment, items, total, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        data.customer_name,
        data.phone,
        data.address,
        data.payment_method || "Cash on Delivery",
        JSON.stringify(data.items),
        total,
        "Pending",
        new Date().toISOString()
      ).run();

      return json({ ok: true, id, total });
    }

    // ADMIN AUTHORIZATION
    if (!isAdmin(request, token)) {
      return json({ error: "Unauthorized" }, 401);
    }

    // ADMIN DASHBOARD
    if (path[0] === "admin" && method === "GET") {
      const [products, orders, settings] = await Promise.all([
        env.DB.prepare(
          "SELECT * FROM products ORDER BY created_at DESC"
        ).all(),
        env.DB.prepare(
          "SELECT * FROM orders ORDER BY created_at DESC"
        ).all(),
        env.DB.prepare(
          "SELECT key, value FROM settings"
        ).all()
      ]);

      return json({
        products: (products.results || []).map(p => ({
          ...p,
          title: p.title || p.name,
          sizes: parseJSON(p.sizes),
          colors: parseJSON(p.colors)
        })),
        orders: (orders.results || []).map(o => ({
          ...o,
          payment_method: o.payment
        })),
        settings: Object.fromEntries(
          (settings.results || []).map(item => [
            item.key,
            item.value
          ])
        )
      });
    }

    // ADD PRODUCT
    if (path[0] === "products" && !path[1] && method === "POST") {
      const data = await readBody(request);
      const title = String(data.title || data.name || "").trim();

      if (!title) {
        return json({ error: "Product title is required" }, 400);
      }

      const id = makeId();

      await env.DB.prepare(`
        INSERT INTO products
        (id, name, title, category, price, sale_price, description,
         image, sizes, colors, stock, featured, active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        title,
        title,
        data.category || "Women",
        Number(data.price) || 0,
        data.sale_price ? Number(data.sale_price) : null,
        data.description || "",
        data.image || "",
        JSON.stringify(data.sizes || []),
        JSON.stringify(data.colors || []),
        Number(data.stock) || 0,
        Number(data.featured) || 0,
        data.active === 0 ? 0 : 1,
        new Date().toISOString()
      ).run();

      return json({ ok: true, id });
    }

    // EDIT PRODUCT
    if (path[0] === "products" && path[1] && method === "PUT") {
      const data = await readBody(request);
      const title = String(data.title || data.name || "").trim();

      if (!title) {
        return json({ error: "Product title is required" }, 400);
      }

      await env.DB.prepare(`
        UPDATE products SET
        name = ?, title = ?, category = ?, price = ?, sale_price = ?,
        description = ?, image = ?, sizes = ?, colors = ?,
        stock = ?, featured = ?, active = ?
        WHERE id = ?
      `).bind(
        title,
        title,
        data.category || "Women",
        Number(data.price) || 0,
        data.sale_price ? Number(data.sale_price) : null,
        data.description || "",
        data.image || "",
        JSON.stringify(data.sizes || []),
        JSON.stringify(data.colors || []),
        Number(data.stock) || 0,
        Number(data.featured) || 0,
        data.active === 0 ? 0 : 1,
        path[1]
      ).run();

      return json({ ok: true });
    }

    // DELETE PRODUCT
    if (path[0] === "products" && path[1] && method === "DELETE") {
      await env.DB.prepare(
        "DELETE FROM products WHERE id = ?"
      ).bind(path[1]).run();

      return json({ ok: true });
    }

    // UPDATE ORDER STATUS
    if (path[0] === "orders" && path[1] && method === "PUT") {
      const data = await readBody(request);

      const allowed = [
        "Pending",
        "Confirmed",
        "Shipped",
        "Delivered",
        "Cancelled"
      ];

      if (!allowed.includes(data.status)) {
        return json({ error: "Invalid order status" }, 400);
      }

      await env.DB.prepare(
        "UPDATE orders SET status = ? WHERE id = ?"
      ).bind(data.status, path[1]).run();

      return json({ ok: true });
    }

    // SAVE SETTINGS
    if (path[0] === "settings" && method === "PUT") {
      const data = await readBody(request);

      for (const [key, value] of Object.entries(data)) {
        await env.DB.prepare(`
          INSERT INTO settings (key, value)
          VALUES (?, ?)
          ON CONFLICT(key)
          DO UPDATE SET value = excluded.value
        `).bind(key, String(value ?? "")).run();
      }

      return json({ ok: true });
    }

    return json({ error: "Not found" }, 404);

  } catch (error) {
    return json({
      error: error.message || "Server error"
    }, 500);
  }
}
