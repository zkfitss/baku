const COOKIE_NAME = "zkfits_admin";

const DEFAULT_IMAGE_BASE =
  "https://pub-63b9c8d4a58e4bf58b300ef548a2b9b5.r2.dev";

const DEFAULT_ADMIN_EMAIL = "zkfitss@gmail.com";

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


function analyticsDevice(userAgent = "") {
  const ua = String(userAgent).toLowerCase();
  if (/tablet|ipad/.test(ua)) return "tablet";
  if (/mobile|android|iphone/.test(ua)) return "mobile";
  if (/windows|macintosh|linux|cros/.test(ua)) return "desktop";
  return "unknown";
}

async function saveAnalyticsEvent(env, request, data = {}, forced = {}) {
  const allowed = new Set(["page_view", "product_view", "add_to_cart", "checkout_start", "purchase", "purchase_item"]);
  const eventName = forced.event_name || String(data.event_name || "");
  if (!allowed.has(eventName)) return;
  const cf = request.cf || {};
  const clean = (value, max = 180) => String(value || "").trim().slice(0, max);
  const sessionId = clean(forced.session_id || data.session_id, 80);
  await env.DB.prepare(`
    INSERT INTO analytics_events (
      id,event_name,session_id,page_path,page_title,referrer,source,medium,campaign,
      landing_page,product_id,product_name,order_id,value,city,country,device,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    makeId(), eventName, sessionId,
    clean(data.page_path, 300), clean(data.page_title, 180), clean(data.referrer, 180),
    clean(data.source || "direct", 100), clean(data.medium || "none", 100), clean(data.campaign, 120),
    clean(data.landing_page, 300), clean(forced.product_id || data.product_id, 100),
    clean(forced.product_name || data.product_name, 180), clean(forced.order_id, 80),
    Number(forced.value ?? data.value) || 0,
    clean(cf.city, 100), clean(cf.country, 2), analyticsDevice(request.headers.get("User-Agent")),
    new Date().toISOString()
  ).run();
}

async function maintainAnalyticsRetention(env) {
  // Run at most once every 24 hours when an authenticated admin opens Analytics.
  const state = await env.DB.prepare("SELECT value FROM analytics_maintenance WHERE key='last_retention_run'").first().catch(() => null);
  const lastRun = state?.value ? Date.parse(state.value) : 0;
  if (lastRun && Date.now() - lastRun < 24 * 60 * 60 * 1000) return state.value;

  const months = await env.DB.prepare(`
    SELECT DISTINCT substr(created_at,1,7) AS month
    FROM analytics_events
    WHERE created_at < datetime('now','-90 days')
    ORDER BY month ASC
  `).all();

  for (const item of (months.results || [])) {
    const month = String(item.month || '');
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    const counts = await env.DB.prepare(`
      SELECT
        COUNT(CASE WHEN event_name='page_view' THEN 1 END) AS page_views,
        COUNT(CASE WHEN event_name='product_view' THEN 1 END) AS product_views,
        COUNT(CASE WHEN event_name='add_to_cart' THEN 1 END) AS add_to_cart_events,
        COUNT(CASE WHEN event_name='checkout_start' THEN 1 END) AS checkout_start_events
      FROM analytics_events
      WHERE substr(created_at,1,7)=? AND created_at < datetime('now','-90 days')
    `).bind(month).first();

    // D1 batch is transactional: only delete detailed rows if their compacted
    // monthly counts, unique sessions and purchase attribution are saved.
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO analytics_monthly_summary(month,page_views,product_views,add_to_cart_events,checkout_start_events,updated_at)
        VALUES(?,?,?,?,?,?)
        ON CONFLICT(month) DO UPDATE SET
          page_views=page_views+excluded.page_views,
          product_views=product_views+excluded.product_views,
          add_to_cart_events=add_to_cart_events+excluded.add_to_cart_events,
          checkout_start_events=checkout_start_events+excluded.checkout_start_events,
          updated_at=excluded.updated_at
      `).bind(month, Number(counts?.page_views || 0), Number(counts?.product_views || 0), Number(counts?.add_to_cart_events || 0), Number(counts?.checkout_start_events || 0), new Date().toISOString()),
      env.DB.prepare(`
        INSERT OR IGNORE INTO analytics_monthly_sessions(month,session_id)
        SELECT ?,session_id FROM analytics_events
        WHERE substr(created_at,1,7)=? AND created_at < datetime('now','-90 days') AND session_id<>''
      `).bind(month, month),
      env.DB.prepare(`
        INSERT OR IGNORE INTO analytics_monthly_source_orders(month,order_id,source,medium,session_id)
        SELECT ?,order_id,COALESCE(NULLIF(source,''),'direct'),COALESCE(NULLIF(medium,''),'none'),session_id
        FROM analytics_events
        WHERE substr(created_at,1,7)=? AND created_at < datetime('now','-90 days')
          AND event_name='purchase' AND order_id<>''
      `).bind(month, month),
      env.DB.prepare(`
        DELETE FROM analytics_events
        WHERE substr(created_at,1,7)=? AND created_at < datetime('now','-90 days')
      `).bind(month)
    ]);
  }

  const completedAt = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO analytics_maintenance(key,value) VALUES('last_retention_run',?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(completedAt).run();
  return completedAt;
}

async function getAnalyticsStorage(env) {
  const row = await env.DB.prepare(`
    SELECT COUNT(*) AS event_count,
      COALESCE(SUM(length(id)+length(event_name)+length(session_id)+length(page_path)+length(page_title)+length(referrer)+length(source)+length(medium)+length(campaign)+length(landing_page)+length(product_id)+length(product_name)+length(order_id)+length(city)+length(country)+length(device)+32),0) AS estimated_event_bytes
    FROM analytics_events
  `).first();
  const [sessions, months, sourceOrders, maintenance] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS count FROM analytics_monthly_sessions').first(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM analytics_monthly_summary').first(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM analytics_monthly_source_orders').first(),
    env.DB.prepare("SELECT value FROM analytics_maintenance WHERE key='last_retention_run'").first()
  ]);
  const eventBytes = Number(row?.estimated_event_bytes || 0);
  const archiveBytes = Number(sessions?.count || 0) * 48 + Number(sourceOrders?.count || 0) * 100 + Number(months?.count || 0) * 80;
  return {
    event_count: Number(row?.event_count || 0),
    archived_sessions: Number(sessions?.count || 0),
    archived_months: Number(months?.count || 0),
    archived_source_orders: Number(sourceOrders?.count || 0),
    estimated_bytes: eventBytes + archiveBytes,
    estimated_mb: Number(((eventBytes + archiveBytes) / (1024 * 1024)).toFixed(2)),
    last_retention_run: maintenance?.value || null,
    detailed_retention_days: 90,
    note: 'Estimated analytics payload only; excludes SQLite indexes, database overhead and other store tables.'
  };
}

async function getMonthlyAnalytics(env) {
  const [summaryResult, orderResult, sourceResult] = await Promise.all([
    env.DB.prepare(`SELECT s.month,s.page_views,s.product_views,s.add_to_cart_events,s.checkout_start_events,
      (SELECT COUNT(*) FROM analytics_monthly_sessions v WHERE v.month=s.month) AS visitors
      FROM analytics_monthly_summary s ORDER BY s.month DESC LIMIT 24`).all(),
    env.DB.prepare(`SELECT substr(created_at,1,7) AS month,COUNT(*) AS orders,
      COUNT(CASE WHEN status='Cancelled' THEN 1 END) AS cancelled,
      COALESCE(SUM(CASE WHEN status<>'Cancelled' THEN total ELSE 0 END),0) AS revenue
      FROM orders WHERE created_at >= date('now','-24 months') GROUP BY substr(created_at,1,7)`).all(),
    env.DB.prepare(`SELECT a.month,a.source,a.medium,COUNT(*) AS orders,
      COALESCE(SUM(CASE WHEN o.status<>'Cancelled' THEN o.total ELSE 0 END),0) AS revenue
      FROM analytics_monthly_source_orders a LEFT JOIN orders o ON o.id=a.order_id
      GROUP BY a.month,a.source,a.medium ORDER BY a.month DESC`).all()
  ]);
  const orders = new Map((orderResult.results || []).map(row => [row.month, row]));
  const monthly = (summaryResult.results || []).map(row => {
    const order = orders.get(row.month) || {};
    return { ...row, orders:Number(order.orders || 0), cancelled:Number(order.cancelled || 0), revenue:Number(order.revenue || 0) };
  });
  return { monthly, monthly_sources:sourceResult.results || [] };
}

function cleanProduct(product) {
  return {
    ...product,
    title: product.title || product.name,
    sizes: parseJSON(product.sizes),
    colors: parseJSON(product.colors),
    images: parseJSON(product.images),
    variants: parseJSON(product.variants)
  };
}

function normalizeVariants(input) {
  if (!Array.isArray(input)) return [];

  return input
    .map(item => ({
      size: String(item.size || "").trim(),
      color: String(item.color || item.colour || "").trim(),
      stock: Math.max(0, Math.floor(Number(item.stock) || 0)),
      images: Array.isArray(item.images)
        ? item.images.filter(url => typeof url === "string" && url.trim())
        : []
    }))
    .filter(item => item.size || item.color);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    String(value || "").trim()
  );
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

async function getSettings(env) {
  const result = await env.DB
    .prepare("SELECT key, value FROM settings")
    .all();

  return Object.fromEntries(
    (result.results || []).map(row => [row.key, row.value])
  );
}

// EMAIL SERVICE
async function sendEmail(env, { to, subject, html, replyTo, from }) {
  if (!env.RESEND_API_KEY) {
    return { sent: false, reason: "RESEND_API_KEY is not configured." };
  }

  const sender = from || env.EMAIL_FROM || "ZK FITSS <orders@zkfitss.com>";

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + env.RESEND_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: sender,
        to: Array.isArray(to) ? to : [to],
        reply_to: replyTo || env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL,
        subject,
        html
      })
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        sent: false,
        reason: result.message || "Email provider rejected the request."
      };
    }

    return { sent: true };
  } catch (error) {
    return {
      sent: false,
      reason: error.message || "Email could not be sent."
    };
  }
}

async function sendOrderEmails(env, order) {
  const settings = await getSettings(env);
  if (settings.order_emails_enabled === "0") {
    return {
      customer: { sent: false, reason: "Order email notifications are disabled in store settings." },
      admin: { sent: false, reason: "Order email notifications are disabled in store settings." }
    };
  }
  const adminEmail = env.ADMIN_EMAIL || settings.admin_email || DEFAULT_ADMIN_EMAIL;
  const sender = env.EMAIL_FROM || settings.email_from || undefined;
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

  const details = `
    <div style="font-family:Arial,sans-serif;color:#292521;max-width:650px;margin:auto">
      <div style="background:#292521;color:white;padding:24px;text-align:center">
        <h1 style="margin:0;letter-spacing:3px">ZK FITSS</h1>
      </div>
      <div style="padding:24px">
        <h2>Order #${escapeHTML(order.id)}</h2>
        <p><b>Customer:</b> ${escapeHTML(order.customer_name)}</p>
        <p><b>Email:</b> ${escapeHTML(order.customer_email)}</p>
        <p><b>Phone:</b> ${escapeHTML(order.phone)}</p>
        <p><b>Address:</b> ${escapeHTML(order.address)}</p>
        <p><b>Payment:</b> ${escapeHTML(order.payment_method || order.payment)}</p>
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr>
              <th style="text-align:left;padding:10px">Product</th>
              <th style="padding:10px">Qty</th>
              <th style="text-align:right;padding:10px">Price</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>
        <h2 style="text-align:right">
          Total: PKR ${Number(order.total).toLocaleString("en-PK")}
        </h2>
      </div>
    </div>
  `;

  const customerHtml = `
    <div style="font-family:Arial,sans-serif;color:#292521">
      <h2>Thank you, ${escapeHTML(order.customer_name)}!</h2>
      <p>Your order has been received successfully.</p>
      ${details}
      <p>Our team will contact you regarding your order.</p>
    </div>
  `;

  const adminHtml = `
    <h2>New order received - ZK FITSS</h2>
    ${details}
  `;

  const results = await Promise.all([
    sendEmail(env, {
      to: order.customer_email,
      subject: "ZK FITSS - Order received #" + order.id,
      html: customerHtml.replace("Your order has been received successfully.", "We have received your order. It is currently awaiting confirmation by our team."),
      from: sender
    }),
    sendEmail(env, {
      to: adminEmail,
      subject: "New ZK FITSS Order #" + order.id,
      html: adminHtml,
      replyTo: order.customer_email,
      from: sender
    })
  ]);

  return {
    customer: results[0],
    admin: results[1]
  };
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

// CREATE ORDER
async function createOrder(request, env) {
  const data = await readBody(request);

  const customerName = String(data.customer_name || "").trim();
  const phone = String(data.phone || "").trim();
  const address = String(data.address || "").trim();
  const customerEmail = String(data.customer_email || "").trim();

  const payment = String(
    data.payment_method || data.payment || "Cash on Delivery"
  ).trim();

  const allowedPayments = [
    "Cash on Delivery",
    "Bank Transfer",
    "Easypaisa",
    "JazzCash"
  ];

  if (!customerName || !phone || !address || !customerEmail) {
    return json({
      error: "Please complete your name, email, phone and delivery address."
    }, 400);
  }

  if (!validEmail(customerEmail)) {
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
    const quantity = Math.floor(Number(item.quantity ?? item.qty) || 0);

    if (!id || quantity < 1 || quantity > 20) {
      return json({ error: "Invalid product or quantity." }, 400);
    }

    const key = [id, size, color].join("|");

    if (!grouped.has(key)) {
      grouped.set(key, { id, size, color, quantity: 0 });
    }

    grouped.get(key).quantity += quantity;
  }

  const groupedItems = Array.from(grouped.values());
  const productsById = new Map();

  for (const item of groupedItems) {
    if (!productsById.has(item.id)) {
      const product = await env.DB.prepare(`
        SELECT id, name, title, price, sale_price, stock, variants
        FROM products
        WHERE id = ? AND active = 1
      `).bind(item.id).first();

      if (!product) {
        return json({
          error: "A product in your bag is no longer available."
        }, 400);
      }

      productsById.set(item.id, {
        ...product,
        variants: parseJSON(product.variants)
      });
    }
  }

  const updatedProducts = new Map();
  const orderItems = [];
  let subtotal = 0;

  for (const item of groupedItems) {
    const product = productsById.get(item.id);

    let updated = updatedProducts.get(item.id);

    if (!updated) {
      updated = {
        stock: Number(product.stock) || 0,
        variants: product.variants.map(variant => ({ ...variant }))
      };
      updatedProducts.set(item.id, updated);
    }

    const hasVariants = updated.variants.length > 0;

    if (hasVariants) {
      const variantIndex = updated.variants.findIndex(variant =>
        String(variant.size || "").toLowerCase() === item.size.toLowerCase() &&
        String(variant.color || "").toLowerCase() === item.color.toLowerCase()
      );

      if (variantIndex === -1) {
        return json({
          error: "The selected size or colour is not available for " +
            (product.title || product.name) + "."
        }, 400);
      }

      const available = Number(updated.variants[variantIndex].stock) || 0;

      if (available < item.quantity) {
        return json({
          error: "Insufficient stock for " +
            (product.title || product.name) + "."
        }, 400);
      }

      updated.variants[variantIndex].stock =
        available - item.quantity;

      updated.stock = Math.max(0, updated.stock - item.quantity);
    } else {
      if (updated.stock < item.quantity) {
        return json({
          error: "Insufficient stock for " +
            (product.title || product.name) + "."
        }, 400);
      }

      updated.stock -= item.quantity;
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
        id, customer_name, phone, address, payment,
        items, total, status, created_at, customer_email
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
  const savedOrderId = orderId;
  const attribution = data.attribution && typeof data.attribution === "object" ? data.attribution : {};
  const purchaseMeta = {
    session_id: String(attribution.session_id || "").slice(0, 80),
    source: String(attribution.source || "direct").slice(0, 100),
    medium: String(attribution.medium || "none").slice(0, 100),
    campaign: String(attribution.campaign || "").slice(0, 120),
    referrer: String(attribution.referrer || "").slice(0, 180),
    landing_page: String(attribution.landing_page || "/").slice(0, 300),
    page_path: "/",
    page_title: "ZK FITSS"
  };
  try {
    await saveAnalyticsEvent(env, request, purchaseMeta, {
      event_name: "purchase", order_id: savedOrderId, value: total,
      session_id: purchaseMeta.session_id
    });
    for (const line of orderItems) {
      await saveAnalyticsEvent(env, request, purchaseMeta, {
        event_name: "purchase_item", order_id: savedOrderId,
        product_id: line.id, product_name: line.title,
        value: Number(line.price || 0) * Number(line.quantity || 1),
        session_id: purchaseMeta.session_id
      });
    }
  } catch (analyticsError) {
    console.error("Analytics purchase event failed", analyticsError);
  }

  const emailResults = await sendOrderEmails(env, {
    id: savedOrderId,
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
    id: savedOrderId,
    subtotal,
    shipping,
    total,
    email_sent: emailResults.customer.sent,
    admin_email_sent: emailResults.admin.sent,
    email_message: {
      customer: emailResults.customer.reason || "Customer email processed.",
      admin: emailResults.admin.reason || "Admin email processed."
    }
  });
}

// SAVE PRODUCT
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

  const stock = variants.length
    ? variants.reduce((sum, variant) => sum + variant.stock, 0)
    : Math.max(0, Math.floor(Number(data.stock) || 0));

  const sizes = Array.isArray(data.sizes)
    ? data.sizes
    : String(data.sizes || "").split(",").map(x => x.trim()).filter(Boolean);

  const colors = Array.isArray(data.colors)
    ? data.colors
    : String(data.colors || "").split(",").map(x => x.trim()).filter(Boolean);

  const category = String(data.category || "Women");
  const collection = String(data.collection || "").trim();
  const description = String(data.description || "");
  const image = String(data.image || "");
  const images = Array.isArray(data.images) ? data.images.filter(url => typeof url === "string" && url.trim()).slice(0, 9) : [];
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
        name = ?, title = ?, category = ?, collection = ?, price = ?,
        sale_price = ?, description = ?, image = ?, images = ?,
        sizes = ?, colors = ?, stock = ?, variants = ?,
        featured = ?, active = ?
      WHERE id = ?
    `).bind(
      title, title, category, collection, price, salePrice,
      description, image, JSON.stringify(images), JSON.stringify(sizes),
      JSON.stringify(colors), stock, JSON.stringify(variants),
      featured, active, productId
    ).run();

    return json({ ok: true, id: productId });
  }

  const newProductId = makeId();
  await env.DB.prepare(`
    INSERT INTO products (
      id, name, title, category, collection, price, sale_price,
      description, image, images, sizes, colors, stock,
      variants, featured, active, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    newProductId, title, title, category, collection, price, salePrice,
    description, image, JSON.stringify(images), JSON.stringify(sizes),
    JSON.stringify(colors), stock, JSON.stringify(variants),
    featured, active, new Date().toISOString()
  ).run();

  return json({ ok: true, id: newProductId });
}

// MAIN API ROUTER
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

      if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
        return json({ error: "Admin authentication is not configured. Set ADMIN_PASSWORD and SESSION_SECRET in Cloudflare Pages settings." }, 503);
      }
      if (data.password !== env.ADMIN_PASSWORD) {
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
      return json({ ok: true }, 200, cookieHeader("", 0));
    }

    // CHECK ADMIN SESSION
    if (path[0] === "me") {
      return isAdmin(request, token)
        ? json({ ok: true })
        : json({ error: "Unauthorized." }, 401);
    }

    // PUBLIC FIRST-PARTY ANALYTICS EVENT COLLECTOR
    if (path[0] === "events" && method === "POST") {
      const data = await readBody(request);
      const eventName = String(data.event_name || "");
      if (!["page_view", "product_view", "add_to_cart", "checkout_start"].includes(eventName)) {
        return json({ error: "Invalid analytics event." }, 400);
      }
      try { await saveAnalyticsEvent(env, request, data); }
      catch (error) { console.error("Analytics event failed", error); return json({ ok: false }, 202); }
      return json({ ok: true }, 202);
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

    // PUBLIC BLOG: published posts only; optional slug returns one article
    if (path[0] === "blog" && method === "GET" && url.searchParams.get("admin") !== "1") {
      const slug = String(url.searchParams.get("slug") || "").trim();
      if (slug) {
        const post = await env.DB.prepare("SELECT id,title,slug,excerpt,content,cover_image,category,tags,seo_title,seo_description,published_at,created_at FROM blog_posts WHERE slug = ? AND status = 'published' LIMIT 1").bind(slug).first();
        return post ? json({ post }) : json({ error: "Blog post not found." }, 404);
      }
      const result = await env.DB.prepare("SELECT id,title,slug,excerpt,cover_image,category,tags,published_at,created_at FROM blog_posts WHERE status = 'published' ORDER BY COALESCE(published_at,created_at) DESC").all();
      return json({ posts: result.results || [] });
    }

    // PUBLIC PRODUCT REVIEWS
    if (path[0] === "reviews" && !path[1] && method === "GET") {
      const productId = String(
        url.searchParams.get("product_id") || ""
      ).trim();

      if (!productId) {
        return json({ error: "Product ID is required." }, 400);
      }

      const result = await env.DB.prepare(`
        SELECT id, product_id, customer_name, rating, review, created_at
        FROM product_reviews
        WHERE product_id = ? AND status = 'approved'
        ORDER BY created_at DESC
      `).bind(productId).all();

      const reviews = result.results || [];
      const total = reviews.length;

      const average = total
        ? reviews.reduce((sum, item) => sum + Number(item.rating), 0) / total
        : 0;

      return json({
        ok: true,
        reviews,
        total,
        average: Number(average.toFixed(1))
      });
    }

    // CUSTOMER SUBMITS REVIEW
    if (path[0] === "reviews" && !path[1] && method === "POST") {
      const data = await readBody(request);

      const productId = String(data.product_id || "").trim();
      const name = String(data.customer_name || "").trim();
      const email = String(data.customer_email || "").trim();
      const review = String(data.review || "").trim();
      const rating = Number(data.rating);

      if (!productId || !name || !email || !review) {
        return json({ error: "Please complete all review fields." }, 400);
      }

      if (
        productId.length > 100 ||
        name.length > 100 ||
        email.length > 254 ||
        review.length > 3000
      ) {
        return json({ error: "One or more fields are too long." }, 400);
      }

      if (!validEmail(email)) {
        return json({ error: "Please enter a valid email address." }, 400);
      }

      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return json({ error: "Rating must be between 1 and 5." }, 400);
      }

      const product = await env.DB.prepare(
        "SELECT id FROM products WHERE id = ? AND active = 1"
      ).bind(productId).first();

      if (!product) {
        return json({ error: "Product not found or unavailable." }, 404);
      }

      await env.DB.prepare(`
        INSERT INTO product_reviews
        (product_id, customer_name, customer_email, rating, review)
        VALUES (?, ?, ?, ?, ?)
      `).bind(productId, name, email, rating, review).run();

      return json({
        ok: true,
        message: "Your review has been submitted for approval."
      }, 201);
    }

    // CUSTOMER ORDER CHECKOUT
    if (path[0] === "orders" && !path[1] && method === "POST") {
      return await createOrder(request, env);
    }

    // OTHER ROUTES REQUIRE ADMIN LOGIN
    if (!isAdmin(request, token)) {
      return json({ error: "Unauthorized." }, 401);
    }

    // ADMIN BLOG MANAGEMENT
    if (path[0] === "blog" && method === "GET") {
      const result = await env.DB.prepare("SELECT * FROM blog_posts ORDER BY created_at DESC").all();
      return json({ posts: result.results || [] });
    }
    if (path[0] === "blog" && !path[1] && method === "POST") {
      const data = await readBody(request);
      const title = String(data.title || "").trim();
      const slug = String(data.slug || title).toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,140);
      const content = String(data.content || "").trim();
      if (!title || !slug || !content) return json({ error: "Title, URL slug and article content are required." },400);
      const id = crypto.randomUUID();
      const status = data.status === "published" ? "published" : "draft";
      const publishedAt = status === "published" ? new Date().toISOString() : null;
      try {
        await env.DB.prepare("INSERT INTO blog_posts (id,title,slug,excerpt,content,cover_image,category,tags,seo_title,seo_description,status,published_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
          .bind(id,title,slug,String(data.excerpt||""),content,String(data.cover_image||""),String(data.category||"Fashion"),String(data.tags||""),String(data.seo_title||title),String(data.seo_description||data.excerpt||""),status,publishedAt,new Date().toISOString(),new Date().toISOString()).run();
      } catch(e) { if (String(e).includes("UNIQUE")) return json({error:"This URL slug is already in use."},409); throw e; }
      return json({ok:true,id},201);
    }
    if (path[0] === "blog" && path[1] && method === "PUT") {
      const data = await readBody(request);
      const title = String(data.title || "").trim();
      const slug = String(data.slug || title).toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,140);
      const content = String(data.content || "").trim();
      if (!title || !slug || !content) return json({ error: "Title, URL slug and article content are required." },400);
      const old = await env.DB.prepare("SELECT id,status,published_at FROM blog_posts WHERE id=?").bind(path[1]).first();
      if (!old) return json({error:"Blog post not found."},404);
      const status = data.status === "published" ? "published" : "draft";
      const publishedAt = status === "published" ? (old.published_at || new Date().toISOString()) : null;
      try {
        await env.DB.prepare("UPDATE blog_posts SET title=?,slug=?,excerpt=?,content=?,cover_image=?,category=?,tags=?,seo_title=?,seo_description=?,status=?,published_at=?,updated_at=? WHERE id=?")
          .bind(title,slug,String(data.excerpt||""),content,String(data.cover_image||""),String(data.category||"Fashion"),String(data.tags||""),String(data.seo_title||title),String(data.seo_description||data.excerpt||""),status,publishedAt,new Date().toISOString(),path[1]).run();
      } catch(e) { if (String(e).includes("UNIQUE")) return json({error:"This URL slug is already in use."},409); throw e; }
      return json({ok:true});
    }
    if (path[0] === "blog" && path[1] && method === "DELETE") {
      await env.DB.prepare("DELETE FROM blog_posts WHERE id=?").bind(path[1]).run();
      return json({ok:true});
    }

    // ADMIN ANALYTICS REPORT
    if (path[0] === "analytics" && method === "GET") {
      let retentionLastRun = null;
      let retentionWarning = "";
      try { retentionLastRun = await maintainAnalyticsRetention(env); }
      catch (error) { console.error("Analytics retention maintenance failed", error); retentionWarning = "Automatic retention cleanup could not complete. Check that migration 0006 has been applied."; }
      const [storage, archive] = await Promise.all([
        getAnalyticsStorage(env).catch(error => { console.error("Analytics storage summary failed", error); return null; }),
        getMonthlyAnalytics(env).catch(error => { console.error("Monthly analytics failed", error); return { monthly:[], monthly_sources:[] }; })
      ]);
      const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days") || 30)));
      const modifier = `-${days} days`;
      const [trafficSummary, orderSummary, sources, locations, pages, topProducts, daily, devices, funnel] = await Promise.all([
        env.DB.prepare(`SELECT COUNT(CASE WHEN event_name='page_view' THEN 1 END) AS page_views, COUNT(DISTINCT CASE WHEN event_name IN ('page_view','product_view','add_to_cart','checkout_start') THEN session_id END) AS visitors, COUNT(DISTINCT CASE WHEN event_name='add_to_cart' THEN session_id END) AS carts, COUNT(DISTINCT CASE WHEN event_name='checkout_start' THEN session_id END) AS checkouts FROM analytics_events WHERE created_at >= datetime('now', ?)` ).bind(modifier).first(),
        env.DB.prepare(`SELECT COUNT(*) AS orders, COALESCE(SUM(CASE WHEN status <> 'Cancelled' THEN total ELSE 0 END),0) AS revenue, COUNT(CASE WHEN status='Cancelled' THEN 1 END) AS cancelled FROM orders WHERE created_at >= datetime('now', ?)`).bind(modifier).first(),
        env.DB.prepare(`SELECT e.source, e.medium, COUNT(DISTINCT e.session_id) AS visitors, COUNT(*) AS orders, COALESCE(SUM(CASE WHEN o.status <> 'Cancelled' THEN o.total ELSE 0 END),0) AS revenue FROM analytics_events e JOIN orders o ON o.id=e.order_id WHERE e.event_name='purchase' AND o.created_at >= datetime('now', ?) GROUP BY e.source,e.medium ORDER BY orders DESC LIMIT 12`).bind(modifier).all(),
        env.DB.prepare(`SELECT COALESCE(NULLIF(e.city,''),'Unknown') AS city, COALESCE(NULLIF(e.country,''),'Unknown') AS country, COUNT(DISTINCT e.session_id) AS visitors, COUNT(DISTINCT CASE WHEN e.event_name='purchase' AND o.status <> 'Cancelled' THEN o.id END) AS orders FROM analytics_events e LEFT JOIN orders o ON o.id=e.order_id WHERE e.created_at >= datetime('now', ?) GROUP BY city,country ORDER BY visitors DESC LIMIT 12`).bind(modifier).all(),
        env.DB.prepare(`SELECT page_path, COUNT(*) AS views, COUNT(DISTINCT session_id) AS visitors FROM analytics_events WHERE event_name IN ('page_view','product_view') AND created_at >= datetime('now', ?) GROUP BY page_path ORDER BY views DESC LIMIT 12`).bind(modifier).all(),
        env.DB.prepare(`SELECT e.product_id, COALESCE(MAX(e.product_name),'') AS product_name, COUNT(CASE WHEN e.event_name='product_view' THEN 1 END) AS views, COUNT(CASE WHEN e.event_name='add_to_cart' THEN 1 END) AS add_to_carts, COUNT(CASE WHEN e.event_name='purchase_item' AND o.status <> 'Cancelled' THEN 1 END) AS units_sold, COALESCE(SUM(CASE WHEN e.event_name='purchase_item' AND o.status <> 'Cancelled' THEN e.value ELSE 0 END),0) AS sales FROM analytics_events e LEFT JOIN orders o ON o.id=e.order_id WHERE e.created_at >= datetime('now', ?) AND e.product_id <> '' GROUP BY e.product_id ORDER BY views DESC LIMIT 12`).bind(modifier).all(),
        env.DB.prepare(`SELECT d.day, d.views, d.visitors, COALESCE(o.orders,0) AS orders, COALESCE(o.revenue,0) AS revenue FROM (SELECT substr(created_at,1,10) AS day, COUNT(CASE WHEN event_name='page_view' THEN 1 END) AS views, COUNT(DISTINCT CASE WHEN event_name IN ('page_view','product_view','add_to_cart','checkout_start') THEN session_id END) AS visitors FROM analytics_events WHERE created_at >= datetime('now', ?) GROUP BY day) d LEFT JOIN (SELECT substr(created_at,1,10) AS day, COUNT(*) AS orders, COALESCE(SUM(CASE WHEN status <> 'Cancelled' THEN total ELSE 0 END),0) AS revenue FROM orders WHERE created_at >= datetime('now', ?) GROUP BY day) o ON o.day=d.day ORDER BY d.day ASC`).bind(modifier, modifier).all(),
        env.DB.prepare(`SELECT device, COUNT(DISTINCT session_id) AS visitors FROM analytics_events WHERE created_at >= datetime('now', ?) GROUP BY device ORDER BY visitors DESC`).bind(modifier).all(),
        env.DB.prepare(`SELECT event_name, COUNT(DISTINCT session_id) AS sessions FROM analytics_events WHERE created_at >= datetime('now', ?) GROUP BY event_name`).bind(modifier).all()
      ]);
      return json({ ok:true, days, summary: { ...(trafficSummary || {}), ...(orderSummary || {}) }, sources:sources.results||[], locations:locations.results||[], pages:pages.results||[], products:topProducts.results||[], daily:daily.results||[], devices:devices.results||[], funnel:funnel.results||[], storage, monthly:archive.monthly, monthly_sources:archive.monthly_sources, retention_last_run:retentionLastRun, retention_warning:retentionWarning });
    }

    // ADMIN REVIEW LIST
    if (path[0] === "reviews" && path[1] === "admin" && method === "GET") {
      const status = String(url.searchParams.get("status") || "").trim();

      let result;

      if (["pending", "approved", "rejected"].includes(status)) {
        result = await env.DB.prepare(`
          SELECT r.*, p.title AS product_title, p.name AS product_name
          FROM product_reviews r
          LEFT JOIN products p ON p.id = r.product_id
          WHERE r.status = ?
          ORDER BY r.created_at DESC
        `).bind(status).all();
      } else {
        result = await env.DB.prepare(`
          SELECT r.*, p.title AS product_title, p.name AS product_name
          FROM product_reviews r
          LEFT JOIN products p ON p.id = r.product_id
          ORDER BY r.created_at DESC
        `).all();
      }

      return json({
        ok: true,
        reviews: result.results || []
      });
    }

    // ADMIN APPROVES OR REJECTS REVIEW
    if (path[0] === "reviews" && path[1] && method === "PUT") {
      const data = await readBody(request);
      const status = String(data.status || "");

      if (!["pending", "approved", "rejected"].includes(status)) {
        return json({ error: "Invalid review status." }, 400);
      }

      const existing = await env.DB.prepare(
        "SELECT id FROM product_reviews WHERE id = ?"
      ).bind(path[1]).first();

      if (!existing) {
        return json({ error: "Review not found." }, 404);
      }

      await env.DB.prepare(
        "UPDATE product_reviews SET status = ? WHERE id = ?"
      ).bind(status, path[1]).run();

      return json({ ok: true });
    }

    // ADMIN DELETES REVIEW
    if (path[0] === "reviews" && path[1] && method === "DELETE") {
      const existing = await env.DB.prepare(
        "SELECT id FROM product_reviews WHERE id = ?"
      ).bind(path[1]).first();

      if (!existing) {
        return json({ error: "Review not found." }, 404);
      }

      await env.DB.prepare(
        "DELETE FROM product_reviews WHERE id = ?"
      ).bind(path[1]).run();

      return json({ ok: true });
    }

    // IMAGE UPLOAD
    if (path[0] === "upload" && method === "POST") {
      return await uploadImage(request, env);
    }

    // ADMIN DASHBOARD DATA
    if (path[0] === "admin" && method === "GET") {
      const [products, orders, settings, reviews] = await Promise.all([
        env.DB.prepare(`
          SELECT * FROM products ORDER BY created_at DESC
        `).all(),

        env.DB.prepare(`
          SELECT * FROM orders ORDER BY created_at DESC
        `).all(),

        getSettings(env),

        env.DB.prepare(`
          SELECT COUNT(*) AS total,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending
          FROM product_reviews
        `).first()
      ]);

      return json({
        products: (products.results || []).map(cleanProduct),

        orders: (orders.results || []).map(order => ({
          ...order,
          payment_method: order.payment_method || order.payment,
          items: parseJSON(order.items)
        })),

        settings,

        reviewStats: {
          total: Number(reviews?.total || 0),
          pending: Number(reviews?.pending || 0)
        }
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
      const existing = await env.DB.prepare(
        "SELECT id FROM products WHERE id = ?"
      ).bind(path[1]).first();

      if (!existing) {
        return json({ error: "Product not found." }, 404);
      }

      await env.DB.prepare(
        "DELETE FROM products WHERE id = ?"
      ).bind(path[1]).run();

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

      const existing = await env.DB.prepare(
        "SELECT * FROM orders WHERE id = ?"
      ).bind(path[1]).first();

      if (!existing) {
        return json({ error: "Order not found." }, 404);
      }

      await env.DB.prepare(`
        UPDATE orders SET status = ? WHERE id = ?
      `).bind(data.status, path[1]).run();

      let customerEmail = { sent: false, reason: "No confirmation email required for this status." };
      if (data.status === "Confirmed" && existing.status !== "Confirmed") {
        const items = parseJSON(existing.items, []);
        const rows = items.map(item => `<tr><td style="padding:10px;border-bottom:1px solid #eee">${escapeHTML(item.title || item.name || "Product")} ${item.size ? `<br>Size: ${escapeHTML(item.size)}` : ""} ${item.color ? `<br>Colour: ${escapeHTML(item.color)}` : ""}</td><td style="padding:10px;text-align:center">${Number(item.quantity || item.qty || 1)}</td><td style="padding:10px;text-align:right">PKR ${(Number(item.price || 0) * Number(item.quantity || item.qty || 1)).toLocaleString("en-PK")}</td></tr>`).join("");
        const html = `<div style="font-family:Arial,sans-serif;color:#292521;max-width:640px;margin:auto"><div style="background:#292521;color:white;padding:22px;text-align:center"><h1>ZK FITSS</h1></div><div style="padding:24px"><h2>Your order is confirmed!</h2><p>Dear ${escapeHTML(existing.customer_name)}, your order #${escapeHTML(existing.id)} has been confirmed by ZK FITSS.</p><table style="width:100%;border-collapse:collapse"><tbody>${rows}</tbody></table><h3 style="text-align:right">Total: PKR ${Number(existing.total || 0).toLocaleString("en-PK")}</h3><p>We will update you when your order is shipped.</p></div></div>`;
        const settings = await getSettings(env);
        customerEmail = await sendEmail(env, { to: existing.customer_email, subject: `ZK FITSS - Your order #${existing.id} is confirmed`, html, from: env.EMAIL_FROM || settings.email_from || undefined, replyTo: env.ADMIN_EMAIL || settings.admin_email || DEFAULT_ADMIN_EMAIL });
      }

      return json({ ok: true, customer_email_sent: customerEmail.sent, email_message: customerEmail.reason || "Confirmation email processed." });
    }

    // SAVE STORE SETTINGS
    if (path[0] === "settings" && method === "PUT") {
      const data = await readBody(request);
      const marketingRules = {
        marketing_ga4_id: /^$|^G-[A-Z0-9]+$/i,
        marketing_google_ads_id: /^$|^AW-[0-9]+$/i,
        marketing_google_ads_label: /^[A-Za-z0-9_-]{0,160}$/,
        marketing_meta_pixel_id: /^$|^[0-9]{5,30}$/,
        marketing_tiktok_pixel_id: /^$|^[A-Za-z0-9_-]{3,100}$/
      };
      for (const [key, rule] of Object.entries(marketingRules)) {
        if (Object.prototype.hasOwnProperty.call(data, key) && !rule.test(String(data[key] ?? '').trim())) {
          return json({ error: `Invalid value for ${key}. Please check the platform ID format.` }, 400);
        }
      }

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
