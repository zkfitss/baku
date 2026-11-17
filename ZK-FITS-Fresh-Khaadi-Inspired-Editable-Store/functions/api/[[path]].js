const IMAGE_BASE = "https://pub-63b9c8d4a58e4bf58b300ef548a2b9b5.r2.dev";
const COOKIE_NAME = "zkfits_admin";

const json = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extraHeaders
    }
  });

const makeId = () => crypto.randomUUID();

function parseJSON(value, fallback = []) {
  try {
    return JSON.parse(value || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

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
    item => item.trim() === COOKIE_NAME + "=" + token
  );
}

function cookieHeader(value, maxAge) {
  return {
    "Set-Cookie":
      COOKIE_NAME + "=" + value +
      "; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=" + maxAge
  };
}

function cleanProduct(p) {
  return {
    ...p,
    title: p.title || p.name,
    sizes: parseJSON(p.sizes),
    colors: parseJSON(p.colors),
    featured: Number(p.featured) || 0,
    active: Number(p.active) !== 0
  };
}

async function getSettings(env) {
  const result = await env.DB.prepare(
    "SELECT key, value FROM settings"
  ).all();

  return Object.fromEntries(
    (result.results || []).map(item => [
      item.key,
      item.value
    ])
  );
}

async function saveSettings(env, data) {
  for (const [key, value] of Object.entries(data)) {
    await env.DB.prepare(`
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key)
      DO UPDATE SET value = excluded.value
    `).bind(key, String(value ?? "")).run();
  }
}

export async function onRequest({ request, env }) {
  if (!env.DB) {
    return json({ error: "D1 database binding DB is missing" }, 500);
  }

  const url = new URL(request.url);
  const path = url.pathname
    .replace(/^\/api\/?/, "")
    .split("/")
    .filter(Boolean);

  const method = request.method;
  const token = await getToken(env);

  try {
    // ADMIN LOGIN
    if (path[0] === "login" && method === "POST") {
      const data = await readBody(request);

      if (!env.ADMIN_PASSWORD || data.password !== env.ADMIN_PASSWORD) {
        return json({ error: "Incorrect admin password" }, 401);
      }

      return json(
        { ok: true },
        200,
        cookieHeader(token, 604800)
      );
    }

    // ADMIN LOGOUT
    if (path[0] === "logout") {
      return json({ ok: true }, 200, cookieHeader("", 0));
    }

    // SESSION CHECK
    if (path[0] === "me") {
      return isAdmin(request, token)
        ? json({ ok: true })
        : json({ error: "Unauthorized" }, 401);
    }

    // PUBLIC STORE
    if (path[0] === "store" && method === "GET") {
      const result = await env.DB.prepare(`
        SELECT * FROM products
        WHERE active = 1
        ORDER BY featured DESC, created_at DESC
      `).all();

      return json({
        products: (result.results || []).map(cleanProduct),
        settings: await getSettings(env)
      });
    }

    // CUSTOMER ORDER
    if (path[0] === "orders" && method === "POST") {
      const data = await readBody(request);

      if (
        !data.customer_name ||
        !data.phone ||
        !data.address ||
        !Array.isArray(data.items) ||
        data.items.length === 0
      ) {
        return json({ error: "Please complete all checkout fields" }, 400);
      }

      const payment = String(
        data.payment_method || "Cash on Delivery"
      );

      const allowedPayments = [
        "Cash on Delivery",
        "COD",
        "Bank Transfer",
        "Easypaisa",
        "JazzCash",
        "Easypaisa/JazzCash"
      ];

      if (!allowedPayments.includes(payment)) {
        return json({ error: "Invalid payment method" }, 400);
      }

      let subtotal = 0;
      const orderItems = [];

      for (const item of data.items) {
        const productId = String(item.id || "");
        const quantity = Math.floor(Number(item.quantity) || 1);

        if (!productId || quantity < 1 || quantity > 20) {
          return json({ error: "Invalid cart quantity or product" }, 400);
        }

        const product = await env.DB.prepare(
          "SELECT * FROM products WHERE id = ? AND active = 1"
        ).bind(productId).first();

        if (!product) {
          return json({ error: "A product in your cart is unavailable" }, 400);
        }

        if (Number(product.stock) < quantity) {
          return json({
            error: "Insufficient stock for " + (product.title || product.name)
          }, 400);
        }

        const price = Number(product.sale_price || product.price || 0);
        subtotal += price * quantity;

        orderItems.push({
          id: product.id,
          title: product.title || product.name,
          image: product.image || "",
          price,
          quantity,
          size: String(item.size || ""),
          color: String(item.color || "")
        });
      }

      const settings = await getSettings(env);
      const shippingFee = Math.max(
        0,
        Number(settings.shipping_fee ?? 250)
      );
      const freeThreshold = Math.max(
        0,
        Number(settings.free_shipping_threshold ?? 5000)
      );

      const shipping = subtotal >= freeThreshold ? 0 : shippingFee;
      const total = subtotal + shipping;
      const orderId = makeId();

      await env.DB.prepare(`
        INSERT INTO orders
        (id, customer_name, phone, address, payment, items, total, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        orderId,
        String(data.customer_name).trim(),
        String(data.phone).trim(),
        String(data.address).trim(),
        payment,
        JSON.stringify(orderItems),
        total,
        "Pending",
        new Date().toISOString()
      ).run();

      for (const item of orderItems) {
        await env.DB.prepare(`
          UPDATE products
          SET stock = MAX(stock - ?, 0)
          WHERE id = ?
        `).bind(item.quantity, item.id).run();
      }

      return json({
        ok: true,
        id: orderId,
        subtotal,
        shipping,
        total
      });
    }

    // ADMIN AUTHORIZATION
    if (!isAdmin(request, token)) {
      return json({ error: "Unauthorized" }, 401);
    }

    // IMAGE UPLOAD TO R2
    if (path[0] === "upload" && method === "POST") {
      if (!env.IMAGES) {
        return json({ error: "R2 binding IMAGES is missing" }, 500);
      }

      const form = await request.formData();
      const file = form.get("file");

      if (!file || typeof file.stream !== "function") {
        return json({ error: "Please select an image" }, 400);
      }

      if (file.size > 10 * 1024 * 1024) {
        return json({ error: "Image must be 10 MB or smaller" }, 400);
      }

      const extensions = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
        "image/avif": "avif"
      };

      const extension = extensions[file.type];

      if (!extension) {
        return json({
          error: "Use JPG, PNG, WEBP, GIF or AVIF images"
        }, 400);
      }

      const folder = String(form.get("folder") || "products")
        .replace(/[^a-z0-9_-]/gi, "")
        .slice(0, 30) || "products";

      const key = folder + "/" + makeId() + "." + extension;

      await env.IMAGES.put(key, file.stream(), {
        httpMetadata: {
          contentType: file.type,
          cacheControl: "public, max-age=31536000, immutable"
        }
      });

      const encodedKey = key
        .split("/")
        .map(encodeURIComponent)
        .join("/");

      return json({
        ok: true,
        key,
        url: IMAGE_BASE + "/" + encodedKey
      });
    }

    // ADMIN DASHBOARD
    if (path[0] === "admin" && method === "GET") {
      const [products, orders] = await Promise.all([
        env.DB.prepare(
          "SELECT * FROM products ORDER BY created_at DESC"
        ).all(),
        env.DB.prepare(
          "SELECT * FROM orders ORDER BY created_at DESC"
        ).all()
      ]);

      return json({
        products: (products.results || []).map(cleanProduct),
        orders: (orders.results || []).map(o => ({
          ...o,
          payment_method: o.payment,
          items: parseJSON(o.items)
        })),
        settings: await getSettings(env)
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
        Number(data.featured) ? 1 : 0,
        data.active === 0 || data.active === "0" ? 0 : 1,
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
        Number(data.featured) ? 1 : 0,
        data.active === 0 || data.active === "0" ? 0 : 1,
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

    // SAVE STORE SETTINGS
    if (path[0] === "settings" && method === "PUT") {
      const data = await readBody(request);
      await saveSettings(env, data);

      return json({ ok: true });
    }

    return json({ error: "Not found" }, 404);

  } catch (error) {
    return json({
      error: error.message || "Server error"
    }, 500);
  }
}
