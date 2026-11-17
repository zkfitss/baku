const COOKIE_NAME = "zkfits_admin";
const DEFAULT_IMAGE_BASE =
  "https://pub-63b9c8d4a58e4bf58b300ef548a2b9b5.r2.dev";

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers
    }
  });

const makeId = () => crypto.randomUUID();

function parseJSON(value, fallback = []) {
  try {
    if (Array.isArray(value)) return value;
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
    "|" +
    (env.ADMIN_PASSWORD || "") +
    "|zkfits-admin"
  );
}

function isAdmin(request, token) {
  const cookie = request.headers.get("Cookie") || "";

  return cookie.split(";").some(item =>
    item.trim() === COOKIE_NAME + "=" + token
  );
}

function cookieHeader(value, maxAge) {
  return {
    "Set-Cookie":
      COOKIE_NAME + "=" + value +
      "; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=" + maxAge
  };
}

function cleanProduct(product) {
  return {
    ...product,
    title: product.title || product.name,
    sizes: parseJSON(product.sizes),
    colors: parseJSON(product.colors),
    variants: parseJSON(product.variants)
  };
}

function normalizeVariants(input) {
  if (!Array.isArray(input)) return [];

  return input
    .map(item => ({
      size: String(item.size || "").trim(),
      color: String(item.color || "").trim(),
      stock: Math.max(0, Math.floor(Number(item.stock) || 0))
    }))
    .filter(item => item.size || item.color);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

async function getSettings(env) {
  const result = await env.DB
    .prepare("SELECT key, value FROM settings")
    .all();

  return Object.fromEntries(
    (result.results || []).map(row => [row.key, row.value])
  );
}

async function sendOrderEmail(env, order) {
  if (!env.RESEND_API_KEY || !order.customer_email) {
    return {
      sent: false,
      reason: "Email service is not configured or customer email is missing"
    };
  }

  const from =
    env.EMAIL_FROM || "ZK FITS <orders@zkfitss.com>";

  const itemRows = order.items.map(item => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #eee">
        ${escapeHTML(item.title)}
        ${item.size ? `<br>Size: ${escapeHTML(item.size)}` : ""}
        ${item.color ? `<br>Colour: ${escapeHTML(item.color)}` : ""}
      </td>
      <td style="padding:10px;border-bottom:1px solid #eee;text-align:center">
        ${item.quantity}
      </td>
      <td style="padding:10px;border-bottom:1px solid #eee;text-align:right">
        PKR ${(item.price * item.quantity).toLocaleString("en-PK")}
      </td>
    </tr>
  `).join("");

  const html = `
    <div style="font-family:Arial,sans-serif;color:#292521;max-width:650px;margin:auto">
      <div style="background:#292521;color:white;padding:25px;text-align:center">
        <h1 style="margin:0;letter-spacing:3px">ZK FITS</h1>
        <p style="margin-bottom:0">Thank you for shopping with us</p>
      </div>

      <div style="padding:25px">
        <h2>Thank you, ${escapeHTML(order.customer_name)}!</h2>
        <p>Your order has been received successfully.</p>

        <p><strong>Order ID:</strong> ${escapeHTML(order.id)}</p>
        <p><strong>Payment method:</strong> ${escapeHTML(order.payment)}</p>

        <h3>Order details</h3>

        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr>
              <th style="text-align:left;padding:10px;border-bottom:2px solid #292521">Product</th>
              <th style="padding:10px;border-bottom:2px solid #292521">Qty</th>
              <th style="text-align:right;padding:10px;border-bottom:2px solid #292521">Price</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>

        <h2 style="text-align:right">
          Total: PKR ${Number(order.total).toLocaleString("en-PK")}
        </h2>

        <p>Delivery address: ${escapeHTML(order.address)}</p>
        <p>Phone: ${escapeHTML(order.phone)}</p>

        <p>Our team will contact you regarding your order.</p>
        <p>Thank you for choosing ZK FITS.</p>
      </div>
    </div>
  `;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + env.RESEND_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: [order.customer_email],
        reply_to: "zkfitss@gmail.com",
        subject: "ZK FITS - Order Confirmation #" + order.id,
        html
      })
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        sent: false,
        reason: result.message || "Email provider rejected the request"
      };
    }

    return { sent: true };
  } catch (error) {
    return {
      sent: false,
      reason: error.message || "Email could not be sent"
    };
  }
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

async function uploadImage(request, env) {
  if (!env.IMAGES) {
    return json({
      error: "R2 binding IMAGES is missing. Check wrangler.toml."
    }, 500);
  }

  const form = await request.formData();
  const file = form.get("file");

  if (!file || typeof file.stream !== "function") {
    return json({ error: "Please select an image." }, 400);
  }

  if (file.size > 10 * 1024 * 1024) {
    return json({ error: "Image must be 10 MB or smaller." }, 400);
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
      error: "Use JPG, PNG, WEBP, GIF or AVIF images."
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

  const base = String(
    env.PUBLIC_IMAGE_BASE || DEFAULT_IMAGE_BASE
  ).replace(/\/$/, "");

  const encodedKey = key.split("/")
    .map(encodeURIComponent)
    .join("/");

  return json({
    ok: true,
    key,
    url: base + "/" + encodedKey
  });
}

async function createOrder(request, env) {
  const data = await readBody(request);

  const customerName = String(data.customer_name || "").trim();
  const phone = String(data.phone || "").trim();
  const address = String(data.address || "").trim();
  const customerEmail = String(data.customer_email || "").trim();
  const payment = String(
    data.payment_method || "Cash on Delivery"
  ).trim();

  const allowedPayments = [
    "Cash on Delivery",
    "Bank Transfer",
    "Easypaisa",
    "JazzCash"
  ];

  if (!customerName || !phone || !address) {
    return json({
      error: "Please complete your name, phone and delivery address."
    }, 400);
  }

  if (customerEmail && !validEmail(customerEmail)) {
    return json({ error: "Please enter a valid email address." }, 400);
  }

  if (!Array.isArray(data.items) || !data.items.length) {
    return json({ error: "Your shopping bag is empty." }, 400);
  }

  if (!allowedPayments.includes(payment)) {
    return json({ error: "Invalid payment method." }, 400);
  }

  if (data.items.length > 50) {
    return json({ error: "Too many different items in one order." }, 400);
  }

  const grouped = new Map();

  for (const item of data.items) {
    const id = String(item.id || "");
    const size = String(item.size || "").trim();
    const color = String(item.color || "").trim();
    const quantity = Math.floor(Number(item.quantity) || 0);

    if (!id || quantity < 1 || quantity > 20) {
      return json({ error: "Invalid product or quantity." }, 400);
    }

    const key = [id, size, color].join("|");

    if (!grouped.has(key)) {
      grouped.set(key, {
        id,
        size,
        color,
        quantity: 0
      });
    }

    grouped.get(key).quantity += quantity;
  }

  const groupedItems = Array.from(grouped.values());
  const productsById = new Map();

  for (const item of groupedItems) {
    if (!productsById.has(item.id)) {
      const product = await env.DB
        .prepare(`
          SELECT id, name, title, price, sale_price, stock, variants
          FROM products
          WHERE id = ? AND active = 1
        `)
        .bind(item.id)
        .first();

      if (!product) {
        return json({
          error: "A product in your bag is no longer available."
        }, 400);
      }

      productsById.set(item.id, product);
    }
  }

  const updatedProducts = new Map();
  const orderItems = [];
  let subtotal = 0;

  for (const item of groupedItems) {
    const product = productsById.get(item.id);
    const variants = parseJSON(product.variants);
    const hasVariants = variants.length > 0;

    if (hasVariants) {
      const variantIndex = variants.findIndex(variant =>
        String(variant.size || "").toLowerCase() === item.size.toLowerCase() &&
        String(variant.color || "").toLowerCase() === item.color.toLowerCase()
      );

      if (variantIndex === -1) {
        return json({
          error: "The selected size or colour is not available for " +
            (product.title || product.name) + "."
        }, 400);
      }

      const available = Number(variants[variantIndex].stock) || 0;

      if (available < item.quantity) {
        return json({
          error: "Insufficient stock for " +
            (product.title || product.name) +
            " (" + item.size + " / " + item.color + ")."
        }, 400);
      }

      variants[variantIndex].stock = available - item.quantity;

      const existing = updatedProducts.get(item.id) || {
        stock: Number(product.stock) || 0,
        variants
      };

      existing.stock = Math.max(0, existing.stock - item.quantity);
      existing.variants = variants;
      updatedProducts.set(item.id, existing);
    } else {
      const existing = updatedProducts.get(item.id) || {
        stock: Number(product.stock) || 0,
        variants: []
      };

      if (existing.stock < item.quantity) {
        return json({
          error: "Insufficient stock for " +
            (product.title || product.name) + "."
        }, 400);
      }

      existing.stock -= item.quantity;
      updatedProducts.set(item.id, existing);
    }

    const unitPrice = Number(
      product.sale_price || product.price || 0
    );

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return json({ error: "Invalid product price." }, 400);
    }

    subtotal += unitPrice * item.quantity;

    orderItems.push({
      id: product.id,
      title: product.title || product.name,
      price: unitPrice,
      quantity: item.quantity,
      size: item.size,
      color: item.color
    });
  }

  const shippingRow = await env.DB
    .prepare("SELECT value FROM settings WHERE key = 'shipping_fee'")
    .first();

  const thresholdRow = await env.DB
    .prepare("SELECT value FROM settings WHERE key = 'free_shipping_threshold'")
    .first();

  const shippingFee = Math.max(
    0,
    Number(shippingRow?.value ?? 250) || 0
  );

  const freeThreshold = Math.max(
    0,
    Number(thresholdRow?.value ?? 5000) || 0
  );

  const shipping = subtotal >= freeThreshold ? 0 : shippingFee;
  const total = subtotal + shipping;
  const orderId = makeId();
  const createdAt = new Date().toISOString();

  const statements = [];

  for (const [productId, updated] of updatedProducts.entries()) {
    statements.push(
      env.DB.prepare(`
        UPDATE products
        SET stock = ?, variants = ?
        WHERE id = ?
      `).bind(
        updated.stock,
        JSON.stringify(updated.variants),
        productId
      )
    );
  }

  statements.push(
    env.DB.prepare(`
      INSERT INTO orders (
        id,
        customer_name,
        phone,
        address,
        payment,
        items,
        total,
        status,
        created_at,
        customer_email
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      orderId,
      customerName,
      phone,
      address,
      payment,
      JSON.stringify(orderItems),
      total,
      "Pending",
      createdAt,
      customerEmail
    )
  );

  await env.DB.batch(statements);

  const emailResult = await sendOrderEmail(env, {
    id: orderId,
    customer_name: customerName,
    customer_email: customerEmail,
    phone,
    address,
    payment,
    items: orderItems,
    total
  });

  return json({
    ok: true,
    id: orderId,
    subtotal,
    shipping,
    total,
    email_sent: emailResult.sent,
    email_message: emailResult.sent
      ? "Confirmation email sent."
      : emailResult.reason
  });
}

async function saveProduct(request, env, productId = null) {
  const data = await readBody(request);

  const title = String(data.title || data.name || "").trim();

  if (!title) {
    return json({ error: "Product title is required." }, 400);
  }

  const price = Math.max(0, Number(data.price) || 0);
  const salePrice =
    data.sale_price === "" ||
    data.sale_price === null ||
    data.sale_price === undefined
      ? null
      : Math.max(0, Number(data.sale_price) || 0);

  const variants = normalizeVariants(data.variants);
  const variantStock = variants.reduce(
    (sum, variant) => sum + variant.stock,
    0
  );

  const stock = variants.length
    ? variantStock
    : Math.max(0, Math.floor(Number(data.stock) || 0));

  const sizes = Array.isArray(data.sizes)
    ? data.sizes
    : String(data.sizes || "").split(",").map(x => x.trim()).filter(Boolean);

  const colors = Array.isArray(data.colors)
    ? data.colors
    : String(data.colors || "").split(",").map(x => x.trim()).filter(Boolean);

  const category = String(data.category || "Women");
  const description = String(data.description || "");
  const image = String(data.image || "");
  const featured = data.featured ? 1 : 0;
  const active = data.active === false || Number(data.active) === 0 ? 0 : 1;

  if (productId) {
    const existing = await env.DB
      .prepare("SELECT id FROM products WHERE id = ?")
      .bind(productId)
      .first();

    if (!existing) {
      return json({ error: "Product not found." }, 404);
    }

    await env.DB.prepare(`
      UPDATE products
      SET
        name = ?,
        title = ?,
        category = ?,
        price = ?,
        sale_price = ?,
        description = ?,
        image = ?,
        sizes = ?,
        colors = ?,
        stock = ?,
        variants = ?,
        featured = ?,
        active = ?
      WHERE id = ?
    `).bind(
      title,
      title,
      category,
      price,
      salePrice,
      description,
      image,
      JSON.stringify(sizes),
      JSON.stringify(colors),
      stock,
      JSON.stringify(variants),
      featured,
      active,
      productId
    ).run();

    return json({ ok: true, id: productId });
  }

  const id = makeId();

  await env.DB.prepare(`
    INSERT INTO products (
      id,
      name,
      title,
      category,
      price,
      sale_price,
      description,
      image,
      sizes,
      colors,
      stock,
      variants,
      featured,
      active,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    title,
    title,
    category,
    price,
    salePrice,
    description,
    image,
    JSON.stringify(sizes),
    JSON.stringify(colors),
    stock,
    JSON.stringify(variants),
    featured,
    active,
    new Date().toISOString()
  ).run();

  return json({ ok: true, id });
}

export async function onRequest({ request, env }) {
  if (!env.DB) {
    return json({ error: "D1 binding DB is missing." }, 500);
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
        return json({ error: "Invalid admin password." }, 401);
      }

      return json(
        { ok: true },
        200,
        cookieHeader(token, 604800)
      );
    }

    // ADMIN LOGOUT
    if (path[0] === "logout") {
      return json(
        { ok: true },
        200,
        cookieHeader("", 0)
      );
    }

    // CHECK ADMIN SESSION
    if (path[0] === "me") {
      return isAdmin(request, token)
        ? json({ ok: true })
        : json({ error: "Unauthorized." }, 401);
    }

    // CUSTOMER STOREFRONT DATA
    if (path[0] === "store" && method === "GET") {
      const [products, settings] = await Promise.all([
        env.DB.prepare(`
          SELECT *
          FROM products
          WHERE active = 1
          ORDER BY featured DESC, created_at DESC
        `).all(),

        getSettings(env)
      ]);

      return json({
        products: (products.results || []).map(cleanProduct),
        settings
      });
    }

    // CUSTOMER ORDER CHECKOUT
    if (path[0] === "orders" && !path[1] && method === "POST") {
      return await createOrder(request, env);
    }

    // ALL OTHER ROUTES REQUIRE ADMIN LOGIN
    if (!isAdmin(request, token)) {
      return json({ error: "Unauthorized." }, 401);
    }

    // IMAGE UPLOAD
    if (path[0] === "upload" && method === "POST") {
      return await uploadImage(request, env);
    }

    // ADMIN DASHBOARD DATA
    if (path[0] === "admin" && method === "GET") {
      const [products, orders, settings] = await Promise.all([
        env.DB.prepare(`
          SELECT *
          FROM products
          ORDER BY created_at DESC
        `).all(),

        env.DB.prepare(`
          SELECT *
          FROM orders
          ORDER BY created_at DESC
        `).all(),

        getSettings(env)
      ]);

      return json({
        products: (products.results || []).map(cleanProduct),

        orders: (orders.results || []).map(order => ({
          ...order,
          payment_method: order.payment,
          items: parseJSON(order.items)
        })),

        settings
      });
    }

    // ADD PRODUCT
    if (path[0] === "products" && !path[1] && method === "POST") {
      return await saveProduct(request, env);
    }

    // EDIT PRODUCT
    if (path[0] === "products" && path[1] && method === "PUT") {
      return await saveProduct(request, env, path[1]);
    }

    // DELETE PRODUCT
    if (path[0] === "products" && path[1] && method === "DELETE") {
      const existing = await env.DB
        .prepare("SELECT id FROM products WHERE id = ?")
        .bind(path[1])
        .first();

      if (!existing) {
        return json({ error: "Product not found." }, 404);
      }

      await env.DB
        .prepare("DELETE FROM products WHERE id = ?")
        .bind(path[1])
        .run();

      return json({ ok: true });
    }

    // UPDATE ORDER STATUS
    if (path[0] === "orders" && path[1] && method === "PUT") {
      const data = await readBody(request);

      const allowedStatuses = [
        "Pending",
        "Confirmed",
        "Shipped",
        "Delivered",
        "Cancelled"
      ];

      if (!allowedStatuses.includes(data.status)) {
        return json({ error: "Invalid order status." }, 400);
      }

      const existing = await env.DB
        .prepare("SELECT id FROM orders WHERE id = ?")
        .bind(path[1])
        .first();

      if (!existing) {
        return json({ error: "Order not found." }, 404);
      }

      await env.DB.prepare(`
        UPDATE orders
        SET status = ?
        WHERE id = ?
      `).bind(data.status, path[1]).run();

      return json({ ok: true });
    }

    // SAVE STORE SETTINGS
    if (path[0] === "settings" && method === "PUT") {
      const data = await readBody(request);

      const statements = Object.entries(data).map(([key, value]) =>
        env.DB.prepare(`
          INSERT INTO settings (key, value)
          VALUES (?, ?)
          ON CONFLICT(key)
          DO UPDATE SET value = excluded.value
        `).bind(
          String(key),
          String(value ?? "")
        )
      );

      if (statements.length) {
        await env.DB.batch(statements);
      }

      return json({ ok: true });
    }

    return json({ error: "API route not found." }, 404);

  } catch (error) {
    return json({
      error: error.message || "Unexpected server error."
    }, 500);
  }
}
