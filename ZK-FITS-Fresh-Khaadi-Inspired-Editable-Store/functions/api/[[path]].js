const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });

const cookieName = "zkfits_admin";

async function digest(text) {
  const b = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return [...new Uint8Array(b)]
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
    x => x.trim() === cookieName + "=" + token
  );
}

function cookieHeader(value, maxAge) {
  return {
    "Set-Cookie":
      ${cookieName}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}
  };
}

async function body(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function makeId() {
  return crypto.randomUUID();
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
    // ADMIN LOGIN
    if (path[0] === "login" && method === "POST") {
      const b = await body(request);

      if (!env.ADMIN_PASSWORD || b.password !== env.ADMIN_PASSWORD) {
        return json({ error: "Invalid login" }, 401);
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          "Content-Type": "application/json",
          ...cookieHeader(token, 60 * 60 * 24 * 7)
        }
      });
    }

    // ADMIN LOGOUT
    if (path[0] === "logout") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          "Content-Type": "application/json",
          ...cookieHeader("", 0)
        }
      });
    }

    // CHECK ADMIN SESSION
    if (path[0] === "me") {
      return isAdmin(request, token)
        ? json({ ok: true })
        : json({ error: "Unauthorized" }, 401);
    }

    // PUBLIC STORE DATA
    if (path[0] === "store" && method === "GET") {
      const p = await env.DB.prepare(
        "SELECT * FROM products WHERE active = 1 ORDER BY featured DESC, created_at DESC"
      ).all();

      const s = await env.DB.prepare(
        "SELECT key, value FROM settings"
      ).all();

      return json({
        products: p.results || [],
        settings: Object.fromEntries(
          (s.results || []).map(x => [x.key, x.value])
        )
      });
    }

    // PUBLIC ORDER CREATION
    if (path[0] === "orders" && method === "POST") {
      const b = await body(request);

      if (
        !b.customer_name ||
        !b.phone ||
        !b.address ||
        !Array.isArray(b.items) ||
        !b.items.length
      ) {
        return json({ error: "Missing checkout fields" }, 400);
      }

      const shipping = Number(
        (await env.DB.prepare(
          "SELECT value FROM settings WHERE key = 'shipping_fee'"
        ).first())?.value || 250
      );

      const threshold = Number(
        (await env.DB.prepare(
          "SELECT value FROM settings WHERE key = 'free_shipping_threshold'"
        ).first())?.value || 5000
      );

      const subtotal = Number(b.total) || 0;
      const total = subtotal + (subtotal >= threshold ? 0 : shipping);
      const id = makeId();

      await env.DB.prepare(`
        INSERT INTO orders
        (id, customer_name, phone, address, payment, items, total, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        b.customer_name,
        b.phone,
        b.address,
        b.payment_method || "Cash on Delivery",
        JSON.stringify(b.items),
        total,
        "Pending",
        new Date().toISOString()
      ).run();

      return json({ ok: true, id, total });
    }

    // ALL OTHER ROUTES REQUIRE ADMIN
    if (!isAdmin(request, token)) {
      return json({ error: "Unauthorized" }, 401);
    }

    // ADMIN DASHBOARD DATA
    if (path[0] === "admin" && method === "GET") {
      const [p, o, s] = await Promise.all([
        env.DB.prepare("SELECT * FROM products ORDER BY created_at DESC").all(),
        env.DB.prepare("SELECT * FROM orders ORDER BY created_at DESC").all(),
        env.DB.prepare("SELECT key, value FROM settings").all()
      ]);

      return json({
        products: p.results || [],
        orders: o.results || [],
        settings: Object.fromEntries(
          (s.results || []).map(x => [x.key, x.value])
        )
      });
    }

    // ADD PRODUCT
    if (path[0] === "products" && !path[1] && method === "POST") {
      const b = await body(request);
      const title = String(b.title || b.name || "").trim();

      if (!title) {
        return json({ error: "Product title is required" }, 400);
      }

      const id = makeId();

      await env.DB.prepare(`
        INSERT INTO products
        (id, name, title, category, description, price, sale_price,
         image, sizes, colors, stock, featured, active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        title,
        title,
        b.category || "Women",
        b.description || "",
        Number(b.price) || 0,
        b.sale_price ? Number(b.sale_price) : null,
        b.image || "",
        JSON.stringify(b.sizes || []),
        JSON.stringify(b.colors || []),
        Number(b.stock) || 0,
        Number(b.featured) || 0,
        b.active === 0 ? 0 : 1,
        new Date().toISOString()
      ).run();

      return json({ ok: true, id });
    }

    // EDIT PRODUCT
    if (path[0] === "products" && path[1] && method === "PUT") {
      const b = await body(request);
      const title = String(b.title || b.name || "").trim();

      if (!title) {
        return json({ error: "Product title is required" }, 400);
      }

      await env.DB.prepare(`
        UPDATE products SET
        name = ?, title = ?, category = ?, description = ?,
        price = ?, sale_price = ?, image = ?, sizes = ?,
        colors = ?, stock = ?, featured = ?, active = ?
        WHERE id = ?
      `).bind(
        title,
        title,
        b.category || "Women",
        b.description || "",
        Number(b.price) || 0,
        b.sale_price ? Number(b.sale_price) : null,
        b.image || "",
        JSON.stringify(b.sizes || []),
        JSON.stringify(b.colors || []),
        Number(b.stock) || 0,
        Number(b.featured) || 0,
        b.active === 0 ? 0 : 1,
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
      const b = await body(request);

      await env.DB.prepare(
        "UPDATE orders SET status = ? WHERE id = ?"
      ).bind(b.status, path[1]).run();

      return json({ ok: true });
    }

    // SAVE STORE SETTINGS
    if (path[0] === "settings" && method === "PUT") {
      const b = await body(request);

      for (const [key, value] of Object.entries(b)) {
        await env.DB.prepare(`
          INSERT INTO settings (key, value)
          VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `).bind(key, String(value)).run();
      }

      return json({ ok: true });
    }

    return json({ error: "Not found" }, 404);

  } catch (error) {
    return json({ error: error.message || "Server error" }, 500);
  }
}
}
