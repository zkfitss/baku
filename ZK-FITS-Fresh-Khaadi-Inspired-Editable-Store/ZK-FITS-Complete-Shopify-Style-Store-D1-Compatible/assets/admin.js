(() => {
  "use strict";

  const API = "/api";

  let products = [];
  let orders = [];
  let settings = {};
  let reviews = [];

  let editingProductImage = "";
  let editingProductImages = [];
  let uploadedSettingsImages = {};
  let reviewFilter = "pending";
  let knownOrderIds = null;
  let orderPollTimer = null;

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const escapeHTML = value =>
    String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  const money = value =>
    "PKR " + Number(value || 0).toLocaleString("en-PK");

  async function api(path, options = {}) {
    const response = await fetch(API + path, {
      credentials: "same-origin",
      ...options,
      headers: {
        ...(options.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...(options.headers || {})
      }
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401) showLogin();
      throw new Error(result.error || "Something went wrong.");
    }

    return result;
  }

  function showLogin() {
    $("#login").hidden = false;
    $("#dashboard").hidden = true;
  }

  function showDashboard() {
    $("#login").hidden = true;
    $("#dashboard").hidden = false;
  }

  function notify(message, isError = false) {
    let toast = $("#adminToast");

    if (!toast) {
      toast = document.createElement("div");
      toast.id = "adminToast";
      toast.className = "admin-toast";
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.toggle("error-toast", isError);
    toast.classList.add("show");

    clearTimeout(notify.timer);

    notify.timer = setTimeout(() => {
      toast.classList.remove("show");
    }, 3500);
  }

  function setLoading(button, loading, text = "Please wait...") {
    if (!button) return;

    if (loading) {
      button.dataset.originalText = button.textContent;
      button.textContent = text;
      button.disabled = true;
    } else {
      button.textContent =
        button.dataset.originalText || button.textContent;

      button.disabled = false;
    }
  }

  // ------------------------------------
  // LOGIN AND SESSION
  // ------------------------------------

  async function checkSession() {
    try {
      await api("/me");
      showDashboard();
      await loadAdmin();
    } catch {
      showLogin();
    }
  }

  $("#loginForm")?.addEventListener("submit", async event => {
    event.preventDefault();

    const button = event.submitter;
    const password = $("#password").value;
    const error = $("#loginError");

    error.textContent = "";

    setLoading(button, true, "SIGNING IN...");

    try {
      await api("/login", {
        method: "POST",
        body: JSON.stringify({ password })
      });

      $("#password").value = "";

      showDashboard();
      await loadAdmin();

    } catch (err) {
      error.textContent = err.message;

    } finally {
      setLoading(button, false);
    }
  });

  $("#logout")?.addEventListener("click", async () => {
    try {
      await api("/logout", { method: "POST" });
    } catch {}

    showLogin();
  });

  // ------------------------------------
  // NAVIGATION
  // ------------------------------------

  function setupNavigation() {
    document.querySelectorAll("[data-tab]").forEach(button => {
      button.addEventListener("click", () => {
        openTab(button.dataset.tab);
      });
    });
  }

  function openTab(tab) {
    document.querySelectorAll("[data-tab]").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.tab === tab
      );
    });

    document.querySelectorAll(".admin-main .panel").forEach(panel => {
      panel.hidden = panel.id !== tab;
    });

    const titles = {
      overview: "Overview",
      products: "Products",
      orders: "Customer Orders",
      settings: "Store Customization",
      reviews: "Product Reviews",
      analytics: "Store Analytics"
    };

    if ($("#pageTitle")) {
      $("#pageTitle").textContent = titles[tab] || "ZK FITSS";
    }

    if (tab === "reviews") {
      loadReviews();
    }
    if (tab === "analytics") {
      loadAnalytics();
    }
  }

  // ------------------------------------
  // LOAD ADMIN DATA
  // ------------------------------------

  async function loadAdmin() {
    try {
      const data = await api("/admin");

      products = data.products || [];
      const freshOrders = data.orders || [];
      if (knownOrderIds !== null) {
        const known = new Set(knownOrderIds);
        const newOrders = freshOrders.filter(order => !known.has(String(order.id)));
        if (newOrders.length) {
          notify(`${newOrders.length} new customer order${newOrders.length > 1 ? "s" : ""} received.`);
          showNewOrderPopup(newOrders[0]);
        }
      }
      knownOrderIds = freshOrders.map(order => String(order.id));
      orders = freshOrders;
      settings = data.settings || {};

      renderProducts();
      renderOrders();
      populateSettings();
      renderStats();

      if ($("#reviews")) {
        loadReviews();
      }

    } catch (error) {
      notify(error.message, true);
    }
  }

  function showNewOrderPopup(order) {
    let popup = document.getElementById("newOrderPopup");
    if (!popup) {
      popup = document.createElement("div");
      popup.id = "newOrderPopup";
      popup.setAttribute("role", "status");
      popup.style.cssText = "position:fixed;right:18px;top:18px;z-index:99999;max-width:340px;background:#292521;color:#fff;padding:18px 20px;border-radius:12px;box-shadow:0 12px 40px #0003;font:14px/1.5 Arial,sans-serif";
      document.body.appendChild(popup);
    }
    popup.innerHTML = `<strong>New ZK FITSS order!</strong><p style="margin:8px 0">Order #${escapeHTML(order.id)} · ${escapeHTML(order.customer_name || "Customer")} · ${money(order.total)}</p><button type="button" id="viewNewOrder" style="background:#fff;color:#292521;border:0;border-radius:6px;padding:8px 12px;cursor:pointer">View orders</button> <button type="button" id="dismissNewOrder" style="background:transparent;color:#fff;border:1px solid #aaa;border-radius:6px;padding:8px 12px;cursor:pointer">Dismiss</button>`;
    document.getElementById("viewNewOrder")?.addEventListener("click", () => { openTab("orders"); popup.remove(); });
    document.getElementById("dismissNewOrder")?.addEventListener("click", () => popup.remove());
  }

  function renderStats() {
    if ($("#statProducts")) {
      $("#statProducts").textContent = products.length;
    }

    if ($("#statOrders")) {
      $("#statOrders").textContent = orders.length;
    }

    const revenue = orders
      .filter(order => order.status !== "Cancelled")
      .reduce(
        (sum, order) => sum + Number(order.total || 0),
        0
      );

    if ($("#statRevenue")) {
      $("#statRevenue").textContent = money(revenue);
    }

    const pendingCount = orders.filter(order =>
      order.status === "Pending"
    ).length;

    if ($("#statPendingOrders")) {
      $("#statPendingOrders").textContent = pendingCount;
    }
  }

  // ------------------------------------
  // STORE ANALYTICS
  // ------------------------------------
  function analyticsTable(rows, columns, emptyText = "No data collected yet.") {
    if (!rows || !rows.length) return `<div class="analytics-empty">${escapeHTML(emptyText)}</div>`;
    return `<div style="overflow-x:auto"><table class="analytics-table"><thead><tr>${columns.map(c => `<th>${escapeHTML(c.label)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${columns.map(c => `<td>${escapeHTML(c.render ? c.render(row) : row[c.key] ?? "—")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  function analyticsBars(rows, labelKey, valueKey) {
    if (!rows || !rows.length) return `<div class="analytics-empty">No data collected yet.</div>`;
    const max = Math.max(1, ...rows.map(row => Number(row[valueKey] || 0)));
    return rows.map(row => {
      const value = Number(row[valueKey] || 0);
      const label = row[labelKey] || "Unknown";
      return `<div class="analytics-bar-row"><span title="${escapeHTML(label)}">${escapeHTML(label)}</span><div class="analytics-bar"><i style="width:${Math.max(2, value / max * 100)}%"></i></div><strong>${value.toLocaleString("en-PK")}</strong></div>`;
    }).join("");
  }

  async function loadAnalytics() {
    const target = $("#analyticsContent");
    if (!target) return;
    const days = Number($("#analyticsPeriod")?.value || 30);
    target.innerHTML = `<div class="analytics-empty">Loading analytics…</div>`;
    try {
      const data = await api(`/analytics?days=${days}`);
      const summary = data.summary || {};
      const funnel = Object.fromEntries((data.funnel || []).map(row => [row.event_name, Number(row.sessions || 0)]));
      const moneyValue = value => money(Number(value || 0));
      target.innerHTML = `
        <div class="analytics-grid">
          <article class="analytics-card"><small>Unique visitors</small><strong>${Number(summary.visitors || 0).toLocaleString("en-PK")}</strong><span>Distinct tracked browser sessions</span></article>
          <article class="analytics-card"><small>Page views</small><strong>${Number(summary.page_views || 0).toLocaleString("en-PK")}</strong><span>Storefront page visits</span></article>
          <article class="analytics-card"><small>Orders placed</small><strong>${Number(summary.orders || 0).toLocaleString("en-PK")}</strong><span>Successfully submitted checkouts</span></article>
          <article class="analytics-card"><small>Net revenue</small><strong>${moneyValue(summary.revenue)}</strong><span>Excludes cancelled orders</span></article>
          <article class="analytics-card"><small>Add-to-cart sessions</small><strong>${Number(summary.carts || 0).toLocaleString("en-PK")}</strong><span>Visitors who added products</span></article>
          <article class="analytics-card"><small>Checkout sessions</small><strong>${Number(summary.checkouts || 0).toLocaleString("en-PK")}</strong><span>Visitors who started checkout</span></article>
          <article class="analytics-card"><small>Cancelled orders</small><strong>${Number(summary.cancelled || 0).toLocaleString("en-PK")}</strong><span>Excluded from net revenue</span></article>
          <article class="analytics-card"><small>Cart → order rate</small><strong>${summary.carts ? (Number(summary.orders || 0) / Number(summary.carts) * 100).toFixed(1) + "%" : "0%"}</strong><span>Orders divided by add-to-cart sessions</span></article>
          <article class="analytics-card"><small>Checkout → order rate</small><strong>${summary.checkouts ? (Number(summary.orders || 0) / Number(summary.checkouts) * 100).toFixed(1) + "%" : "0%"}</strong><span>Orders divided by checkout sessions</span></article>
        </div>
        <div class="analytics-columns">
          <div class="analytics-box"><h3>Traffic sources & sales</h3>${analyticsTable(data.sources, [
            {label:"Source", key:"source"},{label:"Medium",key:"medium"},{label:"Ordering sessions",key:"visitors"},{label:"Orders",key:"orders"},{label:"Net sales",render:r=>moneyValue(r.revenue)}
          ])}</div>
          <div class="analytics-box"><h3>Visitors by device</h3>${analyticsBars(data.devices, "device", "visitors")}</div>
        </div>
        <div class="analytics-columns">
          <div class="analytics-box"><h3>Visitor locations (approximate)</h3>${analyticsTable(data.locations, [
            {label:"City",key:"city"},{label:"Country",key:"country"},{label:"Visitors",key:"visitors"},{label:"Orders",key:"orders"}
          ])}</div>
          <div class="analytics-box"><h3>Top pages</h3>${analyticsTable(data.pages, [
            {label:"Page",key:"page_path"},{label:"Views",key:"views"},{label:"Visitors",key:"visitors"}
          ])}</div>
        </div>
        <div class="analytics-columns">
          <div class="analytics-box"><h3>Top products</h3>${analyticsTable(data.products, [
            {label:"Product",key:"product_name"},{label:"Views",key:"views"},{label:"Add to carts",key:"add_to_carts"},{label:"Items ordered",key:"units_sold"},{label:"Net sales",render:r=>moneyValue(r.sales)}
          ])}</div>
          <div class="analytics-box"><h3>Customer journey</h3>${analyticsBars([
            {label:"Visitors",count:Number(summary.visitors||0)},{label:"Added to cart",count:funnel.add_to_cart||0},{label:"Checkout started",count:funnel.checkout_start||0},{label:"Orders completed",count:Number(summary.orders||0)}
          ], "label", "count")}</div>
        </div>
        <div class="analytics-box"><h3>Daily activity</h3>${analyticsTable((data.daily||[]).slice(-14).reverse(), [
          {label:"Date",key:"day"},{label:"Visitors",key:"visitors"},{label:"Views",key:"views"},{label:"Orders",key:"orders"},{label:"Net revenue",render:r=>moneyValue(r.revenue)}
        ])}</div>
      `;
      const storageTarget = $("#analyticsStorage");
      if (storageTarget) {
        const storage = data.storage || {};
        const sizeLabel = Number(storage.estimated_mb || 0) < 1
          ? `${Math.max(1, Math.round(Number(storage.estimated_bytes || 0) / 1024))} KB`
          : `${Number(storage.estimated_mb || 0).toFixed(2)} MB`;
        storageTarget.innerHTML = `<div class="analytics-grid analytics-storage-grid">
          <article class="analytics-card"><small>Estimated analytics footprint</small><strong>${sizeLabel}</strong><span>Payload estimate, not full D1 database size</span></article>
          <article class="analytics-card"><small>Detailed events retained</small><strong>${Number(storage.event_count || 0).toLocaleString("en-PK")}</strong><span>Automatic 90-day detail window</span></article>
          <article class="analytics-card"><small>Archived monthly sessions</small><strong>${Number(storage.archived_sessions || 0).toLocaleString("en-PK")}</strong><span>Anonymous monthly visitor keys</span></article>
          <article class="analytics-card"><small>Archived months</small><strong>${Number(storage.archived_months || 0)}</strong><span>Monthly summaries preserved</span></article>
        </div><p class="analytics-note">Last cleanup: ${storage.last_retention_run ? escapeHTML(new Date(storage.last_retention_run).toLocaleString()) : "Not run yet"}. ${escapeHTML(storage.note || "")}</p>`;
      }
      const monthlyTarget = $("#analyticsMonthly");
      if (monthlyTarget) {
        const rows = data.monthly || [];
        monthlyTarget.innerHTML = analyticsTable(rows, [
          {label:"Month",key:"month"},{label:"Visitors",key:"visitors"},{label:"Page views",key:"page_views"},
          {label:"Orders",key:"orders"},{label:"Net revenue",render:r=>moneyValue(r.revenue)}
        ], "No archived months yet. Older data will appear here after it passes the 90-day detail window.") +
          `<h3 style="margin-top:18px">Archived order sources</h3>` + analyticsTable(data.monthly_sources || [], [
            {label:"Month",key:"month"},{label:"Source",key:"source"},{label:"Medium",key:"medium"},
            {label:"Orders",key:"orders"},{label:"Net revenue",render:r=>moneyValue(r.revenue)}
          ], "No archived source-attributed orders yet.");
      }
      if (data.retention_warning) notify(data.retention_warning, true);
      const periodLabel = $("#analyticsPeriodLabel");
      if (periodLabel) periodLabel.textContent = `Last ${days} days`;
    } catch (error) {
      target.innerHTML = `<div class="analytics-empty">${escapeHTML(error.message)}<br>Make sure the analytics database migration has been applied.</div>`;
    }
  }

  $("#analyticsPeriod")?.addEventListener("change", loadAnalytics);
  $("#refreshAnalytics")?.addEventListener("click", loadAnalytics);

  // ------------------------------------
  // PRODUCT LIST
  // ------------------------------------

  function renderProducts() {
    const container = $("#productList");
    if (!container) return;

    if (!products.length) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No products added yet</h3>
          <p>Add your first ZK FITSS product.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = products.map(product => `
      <article class="product-admin-card">
        <img
          src="${escapeHTML(product.image || "")}"
          alt="${escapeHTML(product.title || product.name)}"
          loading="lazy"
        >

        <div class="product-admin-info">
          <h3>${escapeHTML(product.title || product.name)}</h3>
          <p>${escapeHTML(product.category || "General")}</p>
          <strong>${money(product.sale_price || product.price)}</strong>
          <small>Stock: ${Number(product.stock || 0)}</small>
          <small>${product.active ? "Active" : "Hidden"}</small>
        </div>

        <div class="product-admin-actions">
          <button type="button" data-edit="${escapeHTML(product.id)}">
            Edit
          </button>

          <button type="button"
            class="danger"
            data-delete="${escapeHTML(product.id)}">
            Delete
          </button>
        </div>
      </article>
    `).join("");
  }

  $("#addProduct")?.addEventListener("click", () => {
    openProductEditor();
  });

  $("#cancelProduct")?.addEventListener("click", () => {
    $("#productEditor").hidden = true;
  });

  function openProductEditor(product = null) {
    const form = $("#productForm");

    form.reset();

    editingProductImage = product?.image || "";
    editingProductImages = [...(product?.image ? [product.image] : []), ...(Array.isArray(product?.images) ? product.images : [])].filter(Boolean);

    form.elements.id.value = product?.id || "";
    form.elements.title.value =
      product?.title || product?.name || "";

    form.elements.category.value =
      product?.category || "Women";

    form.elements.price.value = product?.price ?? "";

    form.elements.sale_price.value =
      product?.sale_price ?? "";

    form.elements.sizes.value =
      (product?.sizes || []).join(", ");

    form.elements.colors.value =
      (product?.colors || []).join(", ");

    form.elements.description.value =
      product?.description || "";


    form.elements.featured.checked =
      Boolean(product?.featured);

    form.elements.active.value =
      product?.active === 0 ? "0" : "1";

    $("#editorTitle").textContent =
      product ? "Edit Product" : "Add New Product";

    renderProductImagesPreview();

    $("#variantRows").innerHTML = "";

    const variants = Array.isArray(product?.variants)
      ? product.variants
      : [];

    if (variants.length) {
      variants.forEach(addVariantRow);
    } else {
      addVariantRow();
    }

    $("#productEditor").hidden = false;

    $("#productEditor").scrollIntoView({
      behavior: "smooth"
    });
  }

  // ------------------------------------
  // VARIANT INVENTORY
  // ------------------------------------

  function addVariantRow(variant = {}) {
    const row = document.createElement("div");
    row.className = "variant-row variant-row-rich";
    row.dataset.images = JSON.stringify(Array.isArray(variant.images) ? variant.images : []);

    row.innerHTML = `
      <input type="text" class="variant-size" placeholder="Size e.g. S"
        value="${escapeHTML(variant.size || "")}">
      <input type="text" class="variant-color" placeholder="Colour e.g. Black"
        value="${escapeHTML(variant.color || "")}">
      <input type="number" class="variant-stock" min="0" step="1" placeholder="Stock"
        value="${Math.max(0, Number(variant.stock) || 0)}">
      <label class="variant-images-label">Colour images
        <input type="file" class="variant-images" accept="image/jpeg,image/png,image/webp,image/avif" multiple>
      </label>
      <div class="variant-image-preview"></div>
      <button type="button" class="remove-variant danger" aria-label="Remove variant">×</button>
    `;

    const preview = row.querySelector(".variant-image-preview");
    const drawPreview = () => {
      const images = JSON.parse(row.dataset.images || "[]");
      preview.innerHTML = images.map((url, index) => `<span class="admin-image-thumb sortable-admin-image" draggable="true" data-variant-image-index="${index}"><img src="${escapeHTML(url)}" alt="Variant image"><button type="button" data-variant-image-remove="${index}" aria-label="Remove image">×</button></span>`).join("");
    };
    drawPreview();
    let draggedVariantImage = null;
    preview.addEventListener("dragstart", event => {
      const item = event.target.closest("[data-variant-image-index]");
      if (!item) return;
      draggedVariantImage = Number(item.dataset.variantImageIndex);
      event.dataTransfer.effectAllowed = "move";
    });
    preview.addEventListener("dragover", event => {
      if (event.target.closest("[data-variant-image-index]")) event.preventDefault();
    });
    preview.addEventListener("drop", event => {
      const item = event.target.closest("[data-variant-image-index]");
      if (!item || draggedVariantImage === null) return;
      event.preventDefault();
      const images = JSON.parse(row.dataset.images || "[]");
      const target = Number(item.dataset.variantImageIndex);
      const [moved] = images.splice(draggedVariantImage, 1);
      images.splice(target, 0, moved);
      row.dataset.images = JSON.stringify(images);
      draggedVariantImage = null;
      drawPreview();
    });

    row.querySelector(".variant-images").addEventListener("change", async event => {
      const files = [...(event.target.files || [])];
      if (!files.length) return;
      const input = event.target;
      input.disabled = true;
      try {
        const current = JSON.parse(row.dataset.images || "[]");
        const uploaded = [];
        for (const file of files) {
          const url = await uploadImage(file, "product-variants");
          if (url) uploaded.push(url);
        }
        row.dataset.images = JSON.stringify([...current, ...uploaded]);
        drawPreview();
        notify("Colour images uploaded.");
      } catch (error) {
        notify(error.message, true);
      } finally {
        input.disabled = false;
        input.value = "";
      }
    });

    row.querySelector(".remove-variant").addEventListener("click", () => row.remove());
    $("#variantRows").appendChild(row);
  }

  $("#addVariant")?.addEventListener("click", () => {
    addVariantRow();
  });

  $("#generateVariants")?.addEventListener("click", () => {
    const form = $("#productForm");
    const sizes = splitSizeList(form.elements.sizes.value);
    const colors = splitColorList(form.elements.colors.value);
    if (!sizes.length) {
      notify("Enter at least one product size first. Colour is optional.", true);
      return;
    }
    const existing = collectVariants();
    const byKey = new Map(existing.map(v => [`${v.size.toLowerCase()}|${v.color.toLowerCase()}`, v]));
    const combinations = [];
    for (const size of sizes) {
      const coloursForSize = colors.length ? colors : [""];
      for (const color of coloursForSize) {
        const key = `${size.toLowerCase()}|${color.toLowerCase()}`;
        combinations.push(byKey.get(key) || { size, color, stock: 0, images: [] });
      }
    }
    $("#variantRows").innerHTML = "";
    combinations.forEach(addVariantRow);
    notify(`${combinations.length} inventory rows generated. Colour is optional; enter stock for each size/colour row.`);
  });

  function splitSizeList(value) {
    const raw = String(value || "").trim();
    if (!raw) return [];
    // Accept comma-separated values, and also the common shorthand "S M L XL".
    return (raw.includes(",") ? raw.split(",") : raw.split(/\s+/))
      .map(value => value.trim()).filter(Boolean);
  }

  function splitColorList(value) {
    return String(value || "").split(",").map(value => value.trim()).filter(Boolean);
  }

  function collectVariants() {
    return [
      ...document.querySelectorAll("#variantRows .variant-row")
    ]
      .map(row => ({
        size: row.querySelector(".variant-size").value.trim(),
        color: row.querySelector(".variant-color").value.trim(),
        stock: Math.max(
          0,
          Math.floor(
            Number(row.querySelector(".variant-stock").value) || 0
          )
        ),
        images: JSON.parse(row.dataset.images || "[]")
      }))
      .filter(item => item.size || item.color);
  }

  // ------------------------------------
  // IMAGE UPLOAD
  // ------------------------------------

  async function uploadImage(file, folder) {
    if (!file) return null;

    const formData = new FormData();

    formData.append("file", file);
    formData.append("folder", folder);

    const result = await api("/upload", {
      method: "POST",
      body: formData
    });

    return result.url;
  }

  function renderProductImagesPreview() {
    const preview = $("#productImagesPreview");
    if (!preview) return;
    preview.classList.add("ordered-product-images");
    preview.innerHTML = editingProductImages.map((url, index) => `<div class="ordered-image-item" draggable="true" data-product-image-index="${index}"><img src="${escapeHTML(url)}" alt="Product image ${index + 1}"><span class="image-order-label">${index===0?"COVER PHOTO":`IMAGE ${index+1}`}</span><div class="image-order-actions"><button type="button" data-image-up="${index}" ${index===0?"disabled":""} aria-label="Move image up">↑</button><button type="button" data-image-down="${index}" ${index===editingProductImages.length-1?"disabled":""} aria-label="Move image down">↓</button><button type="button" data-product-image-remove="${index}" aria-label="Remove image">×</button></div></div>`).join("");
  }

  $("#productImagesPreview")?.addEventListener("click", event => {
    const remove = event.target.closest("[data-product-image-remove]");
    const up = event.target.closest("[data-image-up]");
    const down = event.target.closest("[data-image-down]");
    if (remove) editingProductImages.splice(Number(remove.dataset.productImageRemove),1);
    else if (up) { const i=Number(up.dataset.imageUp); if(i>0) [editingProductImages[i-1],editingProductImages[i]]=[editingProductImages[i],editingProductImages[i-1]]; }
    else if (down) { const i=Number(down.dataset.imageDown); if(i<editingProductImages.length-1) [editingProductImages[i+1],editingProductImages[i]]=[editingProductImages[i],editingProductImages[i+1]]; }
    else return;
    editingProductImage=editingProductImages[0]||""; renderProductImagesPreview();
  });
  let draggedProductImage=null;
  $("#productImagesPreview")?.addEventListener("dragstart",e=>{const item=e.target.closest("[data-product-image-index]");if(!item)return;draggedProductImage=Number(item.dataset.productImageIndex);e.dataTransfer.effectAllowed="move";});
  $("#productImagesPreview")?.addEventListener("dragover",e=>{if(e.target.closest("[data-product-image-index]"))e.preventDefault();});
  $("#productImagesPreview")?.addEventListener("drop",e=>{const item=e.target.closest("[data-product-image-index]");if(!item||draggedProductImage===null)return;e.preventDefault();const target=Number(item.dataset.productImageIndex);const [moved]=editingProductImages.splice(draggedProductImage,1);editingProductImages.splice(target,0,moved);draggedProductImage=null;editingProductImage=editingProductImages[0]||"";renderProductImagesPreview();});

  $("#productImages")?.addEventListener("change", async event => {
    const files = [...(event.target.files || [])];
    if (!files.length) return;
    const input = event.target;
    input.disabled = true;
    try {
      for (const file of files) {
        const url = await uploadImage(file, "products");
        if (url) editingProductImages.push(url);
      }
      editingProductImage = editingProductImages[0] || "";
      renderProductImagesPreview();
      notify("Product images uploaded.");
    } catch (error) {
      notify(error.message, true);
    } finally {
      input.disabled = false;
      input.value = "";
    }
  });

  $("#variantRows")?.addEventListener("click", event => {
    const button = event.target.closest("[data-variant-image-remove]");
    if (!button) return;
    const row = button.closest(".variant-row");
    if (!row) return;
    const images = JSON.parse(row.dataset.images || "[]");
    images.splice(Number(button.dataset.variantImageRemove), 1);
    row.dataset.images = JSON.stringify(images);
    row.querySelector(".variant-image-preview").innerHTML = images.map((url, index) => `<span class="admin-image-thumb sortable-admin-image" draggable="true" data-variant-image-index="${index}"><img src="${escapeHTML(url)}" alt="Variant image"><button type="button" data-variant-image-remove="${index}" aria-label="Remove image">×</button></span>`).join("");
  });

  // ------------------------------------
  // SAVE PRODUCT
  // ------------------------------------

  $("#productForm")?.addEventListener("submit", async event => {
    event.preventDefault();

    const form = event.currentTarget;
    const button = event.submitter;

    const id = form.elements.id.value;
    const variants = collectVariants();

    const product = {
      title: form.elements.title.value.trim(),
      category: form.elements.category.value,
      price: Number(form.elements.price.value),

      sale_price: form.elements.sale_price.value === ""
        ? null
        : Number(form.elements.sale_price.value),

      sizes: splitSizeList(form.elements.sizes.value),
      colors: splitColorList(form.elements.colors.value),

      description: form.elements.description.value,
      image: editingProductImages[0] || "",
      images: editingProductImages.slice(1),
      variants,

      stock: variants.length
        ? variants.reduce((sum, item) => sum + item.stock, 0)
        : 0,

      featured: form.elements.featured.checked,
      active: form.elements.active.value === "1"
    };

    if (!product.image) {
      notify("Please upload at least one product image.", true);
      return;
    }

    if (product.sizes.length && !variants.length) {
      notify("Generate size inventory rows and enter stock for each size.", true);
      return;
    }

    if (variants.some(v => !v.size)) {
      notify("Every inventory row must have a size. Colour is optional.", true);
      return;
    }

    if (!product.title || product.price < 0) {
      notify("Please enter valid product information.", true);
      return;
    }

    setLoading(button, true, "SAVING PRODUCT...");

    try {
      await api(
        id
          ? "/products/" + encodeURIComponent(id)
          : "/products",
        {
          method: id ? "PUT" : "POST",
          body: JSON.stringify(product)
        }
      );

      $("#productEditor").hidden = true;

      await loadAdmin();

      notify(
        id
          ? "Product updated successfully."
          : "Product added successfully."
      );

    } catch (error) {
      notify(error.message, true);

    } finally {
      setLoading(button, false);
    }
  });

  $("#productList")?.addEventListener("click", async event => {
    const editButton = event.target.closest("[data-edit]");
    const deleteButton = event.target.closest("[data-delete]");

    if (editButton) {
      const product = products.find(
        item => String(item.id) === String(editButton.dataset.edit)
      );

      if (product) openProductEditor(product);
    }

    if (deleteButton) {
      const id = deleteButton.dataset.delete;

      if (!confirm("Are you sure you want to delete this product?")) {
        return;
      }

      try {
        await api("/products/" + encodeURIComponent(id), {
          method: "DELETE"
        });

        await loadAdmin();

        notify("Product deleted.");

      } catch (error) {
        notify(error.message, true);
      }
    }
  });

  // ------------------------------------
  // CUSTOMER ORDERS
  // ------------------------------------

  function renderOrders() {
    const container = $("#orderList");
    if (!container) return;

    if (!orders.length) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No customer orders yet</h3>
          <p>New orders will appear here.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = orders.map(order => {
      const items = Array.isArray(order.items)
        ? order.items
        : [];

      return `
        <article class="order-card">
          <div class="order-heading">
            <div>
              <h3>Order #${escapeHTML(order.id)}</h3>
              <small>${escapeHTML(order.created_at || "")}</small>
            </div>

            <strong>${money(order.total)}</strong>
          </div>

          <div class="order-customer">
            <p><strong>Customer:</strong> ${escapeHTML(order.customer_name)}</p>
            <p><strong>Phone:</strong> ${escapeHTML(order.phone)}</p>
            <p><strong>Email:</strong> ${escapeHTML(order.customer_email || "Not available")}</p>
            <p><strong>Address:</strong> ${escapeHTML(order.address)}</p>
            <p><strong>Payment:</strong> ${escapeHTML(order.payment_method || order.payment)}</p>
          </div>

          <div class="order-items">
            <strong>Products</strong>

            ${items.map(item => `
              <div class="order-item">
                <span>
                  ${escapeHTML(item.title)}
                  ${item.size ? " · " + escapeHTML(item.size) : ""}
                  ${item.color ? " · " + escapeHTML(item.color) : ""}
                  × ${Number(item.quantity)}
                </span>

                <span>
                  ${money(Number(item.price) * Number(item.quantity))}
                </span>
              </div>
            `).join("")}
          </div>

          <div class="order-status-control">
            <label>
              Order Status

              <select data-order-status="${escapeHTML(order.id)}">
                ${["Pending", "Confirmed", "Shipped", "Delivered", "Cancelled"]
                  .map(status => `
                    <option value="${status}"
                      ${order.status === status ? "selected" : ""}>
                      ${status}
                    </option>
                  `).join("")}
              </select>
            </label>

            <button type="button"
              data-save-order="${escapeHTML(order.id)}">
              UPDATE STATUS
            </button>
          </div>
        </article>
      `;
    }).join("");
  }

  $("#orderList")?.addEventListener("click", async event => {
    const button = event.target.closest("[data-save-order]");
    if (!button) return;

    const id = button.dataset.saveOrder;

    const select = document.querySelector(
      `[data-order-status="${CSS.escape(id)}"]`
    );

    if (!select) return;

    setLoading(button, true, "UPDATING...");

    try {
      const result = await api("/orders/" + encodeURIComponent(id), {
        method: "PUT",
        body: JSON.stringify({ status: select.value })
      });

      await loadAdmin();

      if (select.value === "Confirmed") {
        notify(result.customer_email_sent ? "Order confirmed. Customer confirmation email sent." : "Order confirmed, but customer email was not sent: " + (result.email_message || "Check Resend configuration."), !result.customer_email_sent);
      } else {
        notify("Order status updated.");
      }

    } catch (error) {
      notify(error.message, true);

    } finally {
      setLoading(button, false);
    }
  });

  // ------------------------------------
  // STORE SETTINGS
  // ------------------------------------

  // Drag files onto any image upload field (products, variants, banners, logo, favicon, SEO image).
  // The native change handlers remain the single upload path, so all existing validation/API logic is reused.
  function enableImageFileDropZones() {
    document.querySelectorAll('input[type="file"][accept*="image"]').forEach(input => {
      const zone = input.closest("label") || input;
      zone.classList.add("image-drop-zone");
      ["dragenter", "dragover"].forEach(type => zone.addEventListener(type, event => {
        if (![...(event.dataTransfer?.items || [])].some(item => item.kind === "file")) return;
        event.preventDefault();
        zone.classList.add("is-drag-over");
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      }));
      ["dragleave", "dragend"].forEach(type => zone.addEventListener(type, event => {
        if (type === "dragleave" && zone.contains(event.relatedTarget)) return;
        zone.classList.remove("is-drag-over");
      }));
      zone.addEventListener("drop", event => {
        const files = [...(event.dataTransfer?.files || [])].filter(file => file.type.startsWith("image/"));
        if (!files.length) return;
        event.preventDefault();
        zone.classList.remove("is-drag-over");
        const transfer = new DataTransfer();
        (input.multiple ? files : files.slice(0, 1)).forEach(file => transfer.items.add(file));
        input.files = transfer.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });
  }
  enableImageFileDropZones();

  function renderSortableSlides(preview, urls, kind) {
    const removeAttr = kind === "mobile" ? "data-mobile-slide-remove" : "data-hero-slide-remove";
    const indexAttr = kind === "mobile" ? "data-mobile-slide-index" : "data-hero-slide-index";
    preview.innerHTML = urls.map((url, index) => `<span class="admin-image-thumb sortable-admin-image" draggable="true" ${indexAttr}="${index}"><img src="${escapeHTML(url)}" alt="${kind === "mobile" ? "Mobile hero" : "Hero"} slide"><button type="button" ${removeAttr}="${index}" aria-label="Remove slide">×</button></span>`).join("");
  }

  function bindSortableSlidePreview(preview, kind) {
    if (!preview) return;
    let draggedIndex = null;
    const getKey = () => kind === "mobile" ? "hero_mobile_slides" : "hero_slides";
    const getIndex = item => Number(kind === "mobile" ? item.dataset.mobileSlideIndex : item.dataset.heroSlideIndex);
    preview.addEventListener("dragstart", event => {
      const item = event.target.closest("[data-hero-slide-index], [data-mobile-slide-index]");
      if (!item) return;
      draggedIndex = getIndex(item);
      event.dataTransfer.effectAllowed = "move";
    });
    preview.addEventListener("dragover", event => {
      if (event.target.closest("[data-hero-slide-index], [data-mobile-slide-index]")) event.preventDefault();
    });
    preview.addEventListener("drop", event => {
      const item = event.target.closest("[data-hero-slide-index], [data-mobile-slide-index]");
      if (!item || draggedIndex === null) return;
      event.preventDefault();
      const key = getKey();
      let urls = [];
      try { urls = JSON.parse(uploadedSettingsImages[key] || settings[key] || "[]"); } catch {}
      const target = getIndex(item);
      const [moved] = urls.splice(draggedIndex, 1);
      urls.splice(target, 0, moved);
      uploadedSettingsImages[key] = JSON.stringify(urls);
      draggedIndex = null;
      renderSortableSlides(preview, urls, kind);
    });
  }

  bindSortableSlidePreview($("#heroSlidesPreview"), "desktop");
  bindSortableSlidePreview($("#heroMobileSlidesPreview"), "mobile");

  const settingFileFields = {
    logoUpload: {
      key: "logo",
      preview: "logoPreview",
      folder: "branding"
    },

    heroUpload: {
      key: "hero_image",
      preview: "heroPreview",
      folder: "banners"
    },

    womenUpload: {
      key: "women_banner",
      preview: "womenPreview",
      folder: "banners"
    },

    girlsUpload: {
      key: "girls_banner",
      preview: "girlsPreview",
      folder: "banners"
    },

    seoImageUpload: { key: "seo_image", preview: "seoImagePreview", folder: "branding" },
    faviconUpload: { key: "favicon_url", preview: "faviconPreview", folder: "branding" },
    heroMobileUpload: { key: "hero_mobile_image", preview: "heroMobilePreview", folder: "banners" },
    womenMobileUpload: { key: "women_mobile_banner", preview: "womenMobilePreview", folder: "banners" },
    girlsMobileUpload: { key: "girls_mobile_banner", preview: "girlsMobilePreview", folder: "banners" },
    promoUpload: { key: "promo_image", preview: "promoPreview", folder: "banners" },
    promoMobileUpload: { key: "promo_mobile_image", preview: "promoMobilePreview", folder: "banners" }
  };

  function populateSettings() {
    const form = $("#settingsForm");
    if (!form) return;

    for (const element of form.elements) {
      if (!element.name) continue;

      const value = settings[element.name];

      if (value === undefined) continue;

      element.value = value;
    }

    const mobileSlidesPreview = $("#heroMobileSlidesPreview");
    if (mobileSlidesPreview) {
      let mobileSlides = [];
      try { mobileSlides = JSON.parse(settings.hero_mobile_slides || "[]"); } catch {}
      renderSortableSlides(mobileSlidesPreview, mobileSlides, "mobile");
    }
    const slidesPreview = $("#heroSlidesPreview");
    if (slidesPreview) {
      let slides = [];
      try { slides = JSON.parse(settings.hero_slides || "[]"); } catch {}
      renderSortableSlides(slidesPreview, slides, "desktop");
    }

    Object.entries(settingFileFields).forEach(([, config]) => {
      const preview = $("#" + config.preview);
      const url = settings[config.key];

      if (!preview) return;

      preview.innerHTML = url
        ? `<span class="admin-image-thumb"><img src="${escapeHTML(url)}" alt="Uploaded image preview"><button type="button" data-clear-setting="${escapeHTML(config.key)}" aria-label="Remove image">×</button></span>`
        : "";
    });
  }

  Object.entries(settingFileFields).forEach(([inputId, config]) => {
    $("#" + inputId)?.addEventListener("change", async event => {
      const file = event.target.files[0];
      if (!file) return;

      const preview = $("#" + config.preview);

      preview.textContent = "Uploading...";

      try {
        const url = await uploadImage(file, config.folder);

        uploadedSettingsImages[config.key] = url;

        preview.innerHTML = `<span class="admin-image-thumb"><img src="${escapeHTML(url)}" alt="Uploaded image preview"><button type="button" data-clear-setting="${escapeHTML(config.key)}" aria-label="Remove image">×</button></span>`;

        notify("Website image uploaded.");

      } catch (error) {
        preview.textContent = "";
        notify(error.message, true);
      }
    });
  });

  $("#heroSlidesUpload")?.addEventListener("change", async event => {
    const files = [...(event.target.files || [])];
    if (!files.length) return;
    const preview = $("#heroSlidesPreview");
    preview.textContent = "Uploading slider images...";
    try {
      const urls = [];
      for (const file of files) urls.push(await uploadImage(file, "hero-slides"));
      const existing = (() => { try { return JSON.parse(uploadedSettingsImages.hero_slides || settings.hero_slides || "[]"); } catch { return []; } })();
      uploadedSettingsImages.hero_slides = JSON.stringify([...existing, ...urls].slice(0, 10));
      renderSortableSlides(preview, [...existing, ...urls], "desktop");
      notify("Hero slider images uploaded.");
    } catch (error) {
      preview.textContent = "";
      notify(error.message, true);
    } finally {
      event.target.value = "";
    }
  });

  $("#heroMobileSlidesUpload")?.addEventListener("change", async event => {
    const files = [...(event.target.files || [])];
    if (!files.length) return;
    const preview = $("#heroMobileSlidesPreview");
    preview.textContent = "Uploading mobile slider images...";
    try {
      const urls = [];
      for (const file of files) urls.push(await uploadImage(file, "hero-mobile-slides"));
      let existing = [];
      try { existing = JSON.parse(uploadedSettingsImages.hero_mobile_slides || settings.hero_mobile_slides || "[]"); } catch {}
      uploadedSettingsImages.hero_mobile_slides = JSON.stringify([...existing, ...urls].slice(0, 10));
      renderSortableSlides(preview, [...existing, ...urls], "mobile");
      notify("Mobile hero slider images uploaded.");
    } catch (error) { preview.textContent = ""; notify(error.message, true); }
    finally { event.target.value = ""; }
  });

  $("#settingsForm")?.addEventListener("click", event => {
    const clear = event.target.closest("[data-clear-setting]");
    if (clear) {
      const key = clear.dataset.clearSetting;
      uploadedSettingsImages[key] = "";
      const config = Object.values(settingFileFields).find(item => item.key === key);
      if (config) $("#" + config.preview).innerHTML = "";
    }
    const removeMobileSlide = event.target.closest("[data-mobile-slide-remove]");
    if (removeMobileSlide) {
      let slides = [];
      try { slides = JSON.parse(uploadedSettingsImages.hero_mobile_slides || settings.hero_mobile_slides || "[]"); } catch {}
      slides.splice(Number(removeMobileSlide.dataset.mobileSlideRemove), 1);
      uploadedSettingsImages.hero_mobile_slides = JSON.stringify(slides);
      const preview = $("#heroMobileSlidesPreview");
      if (preview) renderSortableSlides(preview, slides, "mobile");
    }
    const removeSlide = event.target.closest("[data-hero-slide-remove]");
    if (removeSlide) {
      let slides = [];
      try { slides = JSON.parse(uploadedSettingsImages.hero_slides || settings.hero_slides || "[]"); } catch {}
      slides.splice(Number(removeSlide.dataset.heroSlideRemove), 1);
      uploadedSettingsImages.hero_slides = JSON.stringify(slides);
      const preview = $("#heroSlidesPreview");
      if (preview) renderSortableSlides(preview, slides, "desktop");
    }
  });

  $("#settingsForm")?.addEventListener("submit", async event => {
    event.preventDefault();

    const form = event.currentTarget;
    const button = event.submitter;
    const data = {};

    for (const element of form.elements) {
      if (!element.name || element.type === "file") continue;

      data[element.name] = element.value;
    }

    Object.assign(data, uploadedSettingsImages);

    setLoading(button, true, "SAVING SETTINGS...");

    try {
      await api("/settings", {
        method: "PUT",
        body: JSON.stringify(data)
      });

      settings = { ...settings, ...data };
      uploadedSettingsImages = {};

      notify("Store settings saved successfully.");

    } catch (error) {
      notify(error.message, true);

    } finally {
      setLoading(button, false);
    }
  });

  // ------------------------------------
  // REVIEWS MANAGEMENT
  // ------------------------------------

  function installReviewsTab() {
    if ($("#reviews")) return;

    const ordersTab = $('[data-tab="orders"]');
    const nav = ordersTab?.parentElement;
    const main = $(".admin-main");

    if (!nav || !main) {
      console.error("Reviews tab could not be installed.");
      return;
    }

    const button = document.createElement("button");

    button.type = "button";
    button.dataset.tab = "reviews";
    button.textContent = "Reviews";

    nav.appendChild(button);

    button.addEventListener("click", () => {
      openTab("reviews");
    });

    const panel = document.createElement("section");

    panel.id = "reviews";
    panel.className = "panel";
    panel.hidden = true;

    panel.innerHTML = `
      <div class="reviews-admin-header">
        <div>
          <h2>Product Reviews</h2>
          <p>Manage customer ratings and feedback.</p>
        </div>

        <button type="button" id="refreshReviews">
          Refresh
        </button>
      </div>

      <div class="reviews-admin-filters">
        <button type="button"
          data-review-filter="pending"
          class="active">
          Pending
        </button>

        <button type="button"
          data-review-filter="approved">
          Approved
        </button>

        <button type="button"
          data-review-filter="rejected">
          Rejected
        </button>

        <button type="button"
          data-review-filter="all">
          All Reviews
        </button>
      </div>

      <div id="adminReviewList">
        <div class="empty-state">Loading reviews...</div>
      </div>
    `;

    main.appendChild(panel);

    const style = document.createElement("style");

    style.textContent = `
      .reviews-admin-header {
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:15px;
        flex-wrap:wrap;
        margin-bottom:22px;
      }

      .reviews-admin-header h2 {
        margin:0 0 6px;
      }

      .reviews-admin-header p {
        margin:0;
        opacity:.7;
      }

      .reviews-admin-filters {
        display:flex;
        flex-wrap:wrap;
        gap:8px;
        margin-bottom:22px;
      }

      .reviews-admin-filters button {
        padding:10px 16px;
        border:1px solid #ddd;
        border-radius:30px;
        background:transparent;
        cursor:pointer;
      }

      .reviews-admin-filters button.active {
        background:#222;
        color:white;
        border-color:#222;
      }

      .admin-review-card {
        background:var(--card-bg,#fff);
        border:1px solid #e8e8e8;
        border-radius:12px;
        padding:18px;
        margin-bottom:14px;
      }

      .admin-review-top {
        display:flex;
        justify-content:space-between;
        gap:12px;
        flex-wrap:wrap;
      }

      .admin-review-stars {
        color:#d69b22;
        letter-spacing:2px;
      }

      .admin-review-text {
        line-height:1.7;
        white-space:pre-wrap;
        overflow-wrap:anywhere;
        margin:14px 0;
      }

      .admin-review-meta {
        font-size:13px;
        opacity:.7;
        line-height:1.8;
      }

      .admin-review-actions {
        display:flex;
        gap:8px;
        flex-wrap:wrap;
        margin-top:14px;
      }

      .admin-review-actions button {
        padding:9px 14px;
        border:0;
        border-radius:7px;
        cursor:pointer;
      }

      .admin-review-actions button:disabled {
        opacity:.5;
        cursor:wait;
      }

      .admin-review-actions .approve {
        background:#26734d;
        color:white;
      }

      .admin-review-actions .reject,
      .admin-review-actions .danger {
        background:#b33b36;
        color:white;
      }

      .admin-review-status {
        font-size:12px;
        padding:5px 10px;
        border-radius:20px;
        background:#eee;
        text-transform:capitalize;
      }

      @media(max-width:600px) {
        .admin-review-card {
          padding:14px;
        }
      }
    `;

    document.head.appendChild(style);

    panel.addEventListener("click", event => {
      const filterButton =
        event.target.closest("[data-review-filter]");

      if (filterButton) {
        reviewFilter = filterButton.dataset.reviewFilter;

        panel.querySelectorAll("[data-review-filter]").forEach(button => {
          button.classList.toggle(
            "active",
            button === filterButton
          );
        });

        loadReviews();
      }

      if (event.target.closest("#refreshReviews")) {
        loadReviews();
      }
    });

    panel.addEventListener("click", event => {
      const statusButton =
        event.target.closest("[data-review-action]");

      const deleteButton =
        event.target.closest("[data-review-delete]");

      if (statusButton) {
        updateReviewStatus(
          statusButton.dataset.reviewId,
          statusButton.dataset.reviewAction,
          statusButton
        );
      }

      if (deleteButton) {
        deleteReview(
          deleteButton.dataset.reviewDelete,
          deleteButton
        );
      }
    });
  }

  async function loadReviews() {
    const container = $("#adminReviewList");
    if (!container) return;

    container.innerHTML = `
      <div class="empty-state">Loading reviews...</div>
    `;

    try {
      const query = reviewFilter === "all"
        ? ""
        : "?status=" + encodeURIComponent(reviewFilter);

      const result = await api("/reviews/admin" + query);

      reviews = Array.isArray(result)
        ? result
        : Array.isArray(result.reviews)
          ? result.reviews
          : [];

      renderAdminReviews();

    } catch (error) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>Unable to load reviews</h3>
          <p>${escapeHTML(error.message)}</p>
        </div>
      `;
    }
  }

  function renderAdminReviews() {
    const container = $("#adminReviewList");
    if (!container) return;

    if (!reviews.length) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No reviews found</h3>
          <p>There are no reviews in this category yet.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = reviews.map(review => {
      const id = String(review.id);

      const rating = Math.max(
        0,
        Math.min(5, Number(review.rating) || 0)
      );

      const status = String(
        review.status || "pending"
      ).toLowerCase();

      const product = products.find(item =>
        String(item.id) === String(review.product_id)
      );

      const productName = product
        ? product.title || product.name
        : "Product #" + review.product_id;

      return `
        <article class="admin-review-card">

          <div class="admin-review-top">
            <div>
              <strong>
                ${escapeHTML(review.customer_name || "Customer")}
              </strong>

              <div class="admin-review-stars">
                ${"★".repeat(rating)}${"☆".repeat(5 - rating)}
              </div>
            </div>

            <span class="admin-review-status">
              ${escapeHTML(status)}
            </span>
          </div>

          <div class="admin-review-meta">
            <div>
              <strong>Product:</strong>
              ${escapeHTML(productName)}
            </div>

            <div>
              <strong>Email:</strong>
              ${escapeHTML(review.customer_email || "")}
            </div>

            <div>
              <strong>Date:</strong>
              ${escapeHTML(review.created_at || "")}
            </div>
          </div>

          <p class="admin-review-text">
            ${escapeHTML(review.review || "")}
          </p>

          <div class="admin-review-actions">

            ${status !== "approved" ? `
              <button type="button"
                class="approve"
                data-review-action="approved"
                data-review-id="${escapeHTML(id)}">
                Approve
              </button>
            ` : ""}

            ${status !== "rejected" ? `
              <button type="button"
                class="reject"
                data-review-action="rejected"
                data-review-id="${escapeHTML(id)}">
                Reject
              </button>
            ` : ""}

            <button type="button"
              class="danger"
              data-review-delete="${escapeHTML(id)}">
              Delete
            </button>

          </div>
        </article>
      `;
    }).join("");
  }

  async function updateReviewStatus(id, status, button) {
    setLoading(button, true, "SAVING...");

    try {
      await api("/reviews/" + encodeURIComponent(id), {
        method: "PUT",
        body: JSON.stringify({ status })
      });

      notify("Review " + status + " successfully.");

      await loadReviews();

    } catch (error) {
      notify(error.message, true);

    } finally {
      setLoading(button, false);
    }
  }

  async function deleteReview(id, button) {
    if (!confirm("Permanently delete this customer review?")) {
      return;
    }

    setLoading(button, true, "DELETING...");

    try {
      await api("/reviews/" + encodeURIComponent(id), {
        method: "DELETE"
      });

      notify("Review deleted successfully.");

      await loadReviews();

    } catch (error) {
      notify(error.message, true);

    } finally {
      setLoading(button, false);
    }
  }

  // ------------------------------------
  // START
  // ------------------------------------

  setupNavigation();
  installReviewsTab();
  checkSession();
  if (!orderPollTimer) {
    orderPollTimer = setInterval(() => {
      if (!document.hidden && $("#dashboard") && !$("#dashboard").hidden) loadAdmin();
    }, 20000);
  }

})();
