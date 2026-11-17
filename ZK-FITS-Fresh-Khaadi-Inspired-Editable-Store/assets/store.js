(() => {
  "use strict";

  const API = "/api";
  const CART_KEY = "zkfits_cart";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  let products = [];
  let settings = {};
  let cart = loadCart();
  let activeFilter = "All";
  let activeSort = "default";
  let selectedProduct = null;
  let isSubmitting = false;

  const money = value =>
    "Rs. " + Number(value || 0).toLocaleString("en-PK");

  const escapeHTML = value =>
    String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);

  const normalise = value =>
    String(value || "").trim().toLowerCase();

  async function api(path, options = {}) {
    const response = await fetch(API + path, {
      credentials: "same-origin",
      ...options,
      headers: {
        ...(options.body && !(options.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...(options.headers || {})
      }
    });

    let data = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      throw new Error(data.error || data.message || "Something went wrong.");
    }

    return data;
  }

  function loadCart() {
    try {
      const saved = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  }

  function saveCart() {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCart();
  }

  function notify(message, error = false) {
    const toast = $("#storeToast");
    if (!toast) return;

    toast.textContent = message;
    toast.classList.toggle("error-toast", error);
    toast.classList.add("show");

    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => {
      toast.classList.remove("show");
    }, 3000);
  }

  function showModal(element) {
    if (!element) return;
    element.classList.add("open");
    element.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  function hideModal(element) {
    if (!element) return;
    element.classList.remove("open");
    element.setAttribute("aria-hidden", "true");

    if (!$(".modal-overlay.open") && !$(".cart-drawer.open")) {
      document.body.classList.remove("modal-open");
    }
  }

  function imageUrl(value) {
    if (!value) return "";
    return String(value).trim();
  }

  function productName(product) {
    return product.title || product.name || "ZK FITS Collection";
  }

  function productPrice(product) {
    const sale = Number(product.sale_price || 0);
    return sale > 0 ? sale : Number(product.price || 0);
  }

  function originalPrice(product) {
    return Number(product.price || 0);
  }

  function productImage(product) {
    return imageUrl(product.image || product.image_url || "");
  }

  function isActive(product) {
    return product.active !== false &&
      product.active !== 0 &&
      product.active !== "0";
  }

  function isFeatured(product) {
    return product.featured === true ||
      product.featured === 1 ||
      product.featured === "1";
  }

  function getVariants(product) {
    let variants = product.variants || [];

    if (typeof variants === "string") {
      try {
        variants = JSON.parse(variants);
      } catch {
        variants = [];
      }
    }

    return Array.isArray(variants) ? variants : [];
  }

  function variantSize(variant) {
    return variant.size || variant.sizes || "";
  }

  function variantColor(variant) {
    return variant.color || variant.colour || "";
  }

  function variantStock(variant) {
    return Number(variant.stock || 0);
  }

  function availableVariants(product) {
    return getVariants(product).filter(v => variantStock(v) > 0);
  }

  function availableStock(product) {
    const variants = getVariants(product);
    if (variants.length) {
      return variants.reduce((sum, v) => sum + variantStock(v), 0);
    }
    return Number(product.stock || 0);
  }

  function parseSettings(raw) {
    if (Array.isArray(raw)) {
      const result = {};
      raw.forEach(item => {
        if (item && item.key) result[item.key] = item.value;
      });
      return result;
    }

    return raw && typeof raw === "object" ? raw : {};
  }

  function setting(key, fallback = "") {
    const value = settings[key];
    return value === undefined || value === null || value === ""
      ? fallback
      : value;
  }

  function setImage(id, url) {
    const image = $("#" + id);
    if (!image || !url) return;

    image.src = url;
    image.hidden = false;
    image.addEventListener("error", () => {
      image.hidden = true;
    }, { once: true });

    const placeholder = image.parentElement?.querySelector(
      ".hero-placeholder, .category-placeholder"
    );

    if (placeholder) placeholder.hidden = true;
  }

  function applySettings() {
    const storeName = setting("store_name", "ZK FITS");

    $("#storeName").textContent = storeName;
    $$(".footer-brand").forEach(el => {
      el.textContent = storeName;
    });

    const logo = setting("logo");
    if (logo) {
      const logoImage = $("#storeLogo");
      logoImage.src = logo;
      logoImage.hidden = false;
      $("#storeName").hidden = true;
    }

    $("#announcementText").textContent = setting(
      "announcement",
      "Welcome to ZK FITS — Discover your style"
    );

    $("#heroTitle").textContent = setting(
      "hero_title",
      "Elegance in Every Stitch"
    );

    $("#heroSubtitle").textContent = setting(
      "hero_subtitle",
      "Discover timeless Pakistani fashion, thoughtfully designed for you."
    );

    setImage("heroImage", setting("hero_image"));
    setImage("womenBanner", setting("women_banner"));
    setImage("girlsBanner", setting("girls_banner"));

    const root = document.documentElement.style;
    if (setting("background_color")) {
      root.setProperty("--store-bg", setting("background_color"));
    }
    if (setting("text_color")) {
      root.setProperty("--store-text", setting("text_color"));
    }
    if (setting("accent_color")) {
      root.setProperty("--store-accent", setting("accent_color"));
    }
    if (setting("header_color")) {
      root.setProperty("--store-header", setting("header_color"));
    }
    if (setting("footer_color")) {
      root.setProperty("--store-footer", setting("footer_color"));
    }
    if (setting("footer_text_color")) {
      root.setProperty("--store-footer-text", setting("footer_text_color"));
    }

    $("#contactHeading").textContent = setting(
      "contact_heading",
      "Let's Stay Connected"
    );

    $("#contactDescription").textContent = setting(
      "contact_description",
      "Have a question about an order or product? Get in touch with us."
    );

    $("#footerText").textContent = setting(
      "footer_text",
      "Discover elegant Pakistani fashion for women and girls."
    );

    const phone = setting("phone");
    const email = setting("email");
    const address = setting("address");
    const whatsapp = setting("whatsapp_social") || setting("whatsapp");

    if (phone) {
      $("#contactPhone").href = "tel:" + phone.replace(/[^\d+]/g, "");
      $("#contactPhone").textContent = "Call: " + phone;
      $("#contactPhone").hidden = false;
      $("#footerPhone").textContent = phone;
    }

    if (email) {
      $("#contactEmail").href = "mailto:" + email;
      $("#contactEmail").textContent = email;
      $("#contactEmail").hidden = false;
      $("#footerEmail").textContent = email;
    }

    if (address) {
      $("#contactAddress").textContent = address;
      $("#contactAddress").hidden = false;
      $("#footerAddress").textContent = address;
    }

    if (whatsapp) {
      const number = whatsapp.replace(/[^\d]/g, "");
      $("#contactWhatsApp").href = "https://wa.me/" + number;
      $("#contactWhatsApp").hidden = false;
    }

    setSocial("socialInstagram", setting("instagram"));
    setSocial("socialFacebook", setting("facebook"));
    setSocial("socialTikTok", setting("tiktok"));
    setSocial("socialWhatsApp", whatsapp
      ? "https://wa.me/" + whatsapp.replace(/[^\d]/g, "")
      : "");

    buildCustomMenu();

    $("#currentYear").textContent = new Date().getFullYear();
  }

  function setSocial(id, url) {
    const link = $("#" + id);
    if (!link || !url) return;

    link.href = url;
    link.hidden = false;
  }

  function buildCustomMenu() {
    const raw = setting("menu_links");
    if (!raw) return;

    let links = [];

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) links = parsed;
    } catch {
      links = String(raw).split("\n").map(line => {
        const parts = line.split("|");
        return {
          label: parts[0]?.trim(),
          url: parts[1]?.trim()
        };
      });
    }

    const nav = $("#mainNav");
    const footer = $("#footerMenu");

    if (!links.length) return;

    const valid = links.filter(link =>
      link && (link.label || link.title) && (link.url || link.href)
    );

    if (!valid.length) return;

    nav.innerHTML = valid.map(link => {
      const label = link.label || link.title;
      const url = link.url || link.href;
      return `<a href="${escapeHTML(url)}">${escapeHTML(label)}</a>`;
    }).join("");

    footer.innerHTML = valid.map(link => {
      const label = link.label || link.title;
      const url = link.url || link.href;
      return `<a href="${escapeHTML(url)}">${escapeHTML(label)}</a>`;
    }).join("");
  }

  function categoryMatches(product, filter) {
    if (filter === "All") return true;

    const category = normalise(product.category);
    const title = normalise(productName(product));

    if (filter === "Women") {
      return category.includes("women") || category.includes("woman");
    }

    if (filter === "Girls") {
      return category.includes("girl") || category.includes("kid");
    }

    return category.includes(normalise(filter)) ||
      title.includes(normalise(filter));
  }

  function productCard(product) {
    const id = escapeHTML(product.id);
    const name = escapeHTML(productName(product));
    const image = productImage(product);
    const price = productPrice(product);
    const original = originalPrice(product);
    const stock = availableStock(product);
    const hasSale = original > price && price > 0;

    return `
      <article class="product-card">
        <button class="product-image-button" type="button"
          data-product="${id}" aria-label="View ${name}">
          <div class="product-image-wrap">
            ${image
              ? `<img src="${escapeHTML(image)}" alt="${name}" loading="lazy">`
              : `<div class="product-image-placeholder">ZK FITS</div>`}
            ${hasSale ? `<span class="sale-badge">SALE</span>` : ""}
            ${stock <= 0 ? `<span class="sold-badge">SOLD OUT</span>` : ""}
          </div>
        </button>

        <div class="product-card-info">
          <span class="product-category">${escapeHTML(product.category || "Collection")}</span>
          <h3>${name}</h3>

          <div class="product-price">
            <strong>${money(price)}</strong>
            ${hasSale ? `<del>${money(original)}</del>` : ""}
          </div>

          <button class="quick-add-button" type="button"
            data-product="${id}" ${stock <= 0 ? "disabled" : ""}>
            ${stock <= 0 ? "SOLD OUT" : "VIEW PRODUCT"}
          </button>
        </div>
      </article>
    `;
  }

  function renderProducts() {
    const activeProducts = products.filter(isActive);

    const featured = activeProducts.filter(isFeatured);
    $("#featuredProducts").innerHTML = featured.length
      ? featured.map(productCard).join("")
      : `<div class="empty-state"><p>Featured products will appear here soon.</p></div>`;

    let filtered = activeProducts.filter(product =>
      categoryMatches(product, activeFilter)
    );

    if (activeSort === "low") {
      filtered.sort((a, b) => productPrice(a) - productPrice(b));
    } else if (activeSort === "high") {
      filtered.sort((a, b) => productPrice(b) - productPrice(a));
    } else if (activeSort === "new") {
      filtered.sort((a, b) =>
        String(b.created_at || "").localeCompare(String(a.created_at || ""))
      );
    }

    $("#productGrid").innerHTML = filtered.length
      ? filtered.map(productCard).join("")
      : "";

    $("#noProducts").hidden = filtered.length > 0;
  }

  function openProduct(id) {
    const product = products.find(item => String(item.id) === String(id));
    if (!product) return;

    selectedProduct = product;
    const variants = availableVariants(product);
    const sizes = [...new Set(variants.map(variantSize).filter(Boolean))];
    const colors = [...new Set(variants.map(variantColor).filter(Boolean))];
    const image = productImage(product);
    const price = productPrice(product);
    const original = originalPrice(product);
    const hasVariants = getVariants(product).length > 0;
    const stock = availableStock(product);

    const sizeOptions = sizes.length
      ? sizes.map(size =>
          `<option value="${escapeHTML(size)}">${escapeHTML(size)}</option>`
        ).join("")
      : "";

    const colorOptions = colors.length
      ? colors.map(color =>
          `<option value="${escapeHTML(color)}">${escapeHTML(color)}</option>`
        ).join("")
      : "";

    $("#productModalContent").innerHTML = `
      <div class="product-modal-image">
        ${image
          ? `<img src="${escapeHTML(image)}" alt="${escapeHTML(productName(product))}">`
          : `<div class="product-image-placeholder">ZK FITS</div>`}
      </div>

      <div class="product-modal-info">
        <span class="section-kicker">${escapeHTML(product.category || "ZK FITS COLLECTION")}</span>
        <h2 id="modalProductTitle">${escapeHTML(productName(product))}</h2>

        <div class="product-modal-price">
          <strong>${money(price)}</strong>
          ${original > price ? `<del>${money(original)}</del>` : ""}
        </div>

        <p class="product-description">
          ${escapeHTML(product.description || "Discover this beautiful ZK FITS design.")}
        </p>

        ${hasVariants && sizes.length ? `
          <label class="variant-select-label">
            Select Size *
            <select id="selectedSize" required>
              <option value="">Choose size</option>
              ${sizeOptions}
            </select>
          </label>
        ` : ""}

        ${hasVariants && colors.length ? `
          <label class="variant-select-label">
            Select Colour *
            <select id="selectedColor" required>
              <option value="">Choose colour</option>
              ${colorOptions}
            </select>
          </label>
        ` : ""}

        <label class="variant-select-label">
          Quantity
          <input id="selectedQuantity" type="number" min="1"
            max="${Math.max(stock, 1)}" value="1">
        </label>

        <p class="stock-note">${stock > 0 ? "Available: " + stock + " pieces" : "Currently out of stock"}</p>

        <button class="button button-dark button-full" id="addSelectedProduct"
          type="button" ${stock <= 0 ? "disabled" : ""}>
          ${stock <= 0 ? "SOLD OUT" : "ADD TO BAG"}
        </button>
      </div>
    `;

    showModal($("#productModal"));
  }

  function addSelectedToCart() {
    if (!selectedProduct) return;

    const product = selectedProduct;
    const hasVariants = getVariants(product).length > 0;

    const size = $("#selectedSize")?.value || "";
    const color = $("#selectedColor")?.value || "";
    const quantity = Math.max(1, Number($("#selectedQuantity")?.value || 1));

    if (hasVariants && getVariants(product).some(v => variantSize(v)) && !size) {
      notify("Please select a size.", true);
      return;
    }

    if (hasVariants && getVariants(product).some(v => variantColor(v)) && !color) {
      notify("Please select a colour.", true);
      return;
    }

    let stock = Number(product.stock || 0);

    if (hasVariants) {
      const variant = getVariants(product).find(v =>
        variantSize(v) === size && variantColor(v) === color
      );

      if (!variant) {
        notify("This size and colour combination is not available.", true);
        return;
      }

      stock = variantStock(variant);
    }

    if (stock < quantity) {
      notify("Not enough stock available.", true);
      return;
    }

    const existing = cart.find(item =>
      String(item.id) === String(product.id) &&
      item.size === size &&
      item.color === color
    );

    if (existing) {
      if (existing.quantity + quantity > stock) {
        notify("You have reached the available stock limit.", true);
        return;
      }
      existing.quantity += quantity;
    } else {
      cart.push({
        id: product.id,
        title: productName(product),
        image: productImage(product),
        price: productPrice(product),
        size,
        color,
        quantity
      });
    }

    saveCart();
    hideModal($("#productModal"));
    notify("Added to your shopping bag.");
    openCart();
  }

  function cartSubtotal() {
    return cart.reduce((sum, item) =>
      sum + Number(item.price || 0) * Number(item.quantity || 0), 0
    );
  }

  function updateCart() {
    const count = cart.reduce((sum, item) =>
      sum + Number(item.quantity || 0), 0
    );

    $("#cartCount").textContent = count;
    $("#cartSubtotal").textContent = money(cartSubtotal());

    const container = $("#cartItems");

    if (!cart.length) {
      container.innerHTML = `
        <div class="empty-cart">
          <p>Your shopping bag is empty.</p>
          <button class="button button-dark" id="continueShopping" type="button">
            CONTINUE SHOPPING
          </button>
        </div>
      `;
      $("#checkoutButton").disabled = true;
      return;
    }

    container.innerHTML = cart.map((item, index) => `
      <div class="cart-item">
        <div class="cart-item-image">
          ${item.image
            ? `<img src="${escapeHTML(item.image)}" alt="${escapeHTML(item.title)}">`
            : `<span>ZK FITS</span>`}
        </div>

        <div class="cart-item-info">
          <h3>${escapeHTML(item.title)}</h3>
          ${item.size ? `<p>Size: ${escapeHTML(item.size)}</p>` : ""}
          ${item.color ? `<p>Colour: ${escapeHTML(item.color)}</p>` : ""}
          <strong>${money(item.price)}</strong>

          <div class="cart-quantity">
            <button type="button" data-cart-action="minus" data-index="${index}" aria-label="Decrease quantity">−</button>
            <span>${item.quantity}</span>
            <button type="button" data-cart-action="plus" data-index="${index}" aria-label="Increase quantity">+</button>
            <button type="button" data-cart-action="remove" data-index="${index}" class="remove-item">Remove</button>
          </div>
        </div>
      </div>
    `).join("");

    $("#checkoutButton").disabled = false;
  }

  function changeCart(index, action) {
    const item = cart[index];
    if (!item) return;

    if (action === "remove") {
      cart.splice(index, 1);
    } else if (action === "minus") {
      item.quantity -= 1;
      if (item.quantity <= 0) cart.splice(index, 1);
    } else if (action === "plus") {
      const product = products.find(p => String(p.id) === String(item.id));
      let stock = product ? Number(product.stock || 0) : 99;

      if (product && getVariants(product).length) {
        const variant = getVariants(product).find(v =>
          variantSize(v) === item.size && variantColor(v) === item.color
        );
        stock = variant ? variantStock(variant) : 0;
      }

      if (item.quantity >= stock) {
        notify("No more stock available.", true);
        return;
      }

      item.quantity += 1;
    }

    saveCart();
  }

  function openCart() {
    $("#cartDrawer").classList.add("open");
    $("#cartDrawer").setAttribute("aria-hidden", "false");
    $("#drawerOverlay").classList.add("open");
    document.body.classList.add("modal-open");
  }

  function closeCart() {
    $("#cartDrawer").classList.remove("open");
    $("#cartDrawer").setAttribute("aria-hidden", "true");
    $("#drawerOverlay").classList.remove("open");

    if (!$(".modal-overlay.open")) {
      document.body.classList.remove("modal-open");
    }
  }

  function shippingAmount() {
    const fee = Number(setting("shipping_fee", 0)) || 0;
    const threshold = Number(setting("free_shipping_threshold", 0)) || 0;
    const subtotal = cartSubtotal();

    if (threshold > 0 && subtotal >= threshold) return 0;
    return fee;
  }

  function openCheckout() {
    if (!cart.length) return;

    closeCart();

    const subtotal = cartSubtotal();
    const shipping = shippingAmount();

    $("#checkoutItems").innerHTML = cart.map(item => `
      <div class="summary-line">
        <span>${escapeHTML(item.title)} × ${item.quantity}
          ${item.size ? " · " + escapeHTML(item.size) : ""}
          ${item.color ? " · " + escapeHTML(item.color) : ""}
        </span>
        <strong>${money(item.price * item.quantity)}</strong>
      </div>
    `).join("");

    $("#checkoutSubtotal").textContent = money(subtotal);
    $("#checkoutShipping").textContent = shipping === 0
      ? "Free"
      : money(shipping);
    $("#checkoutTotal").textContent = money(subtotal + shipping);
    $("#checkoutError").textContent = "";

    showModal($("#checkoutModal"));
  }

  async function placeOrder(event) {
    event.preventDefault();

    if (isSubmitting || !cart.length) return;

    const form = $("#checkoutForm");
    if (!form.reportValidity()) return;

    const formData = new FormData(form);
    const customer = Object.fromEntries(formData.entries());

    const items = cart.map(item => ({
      id: item.id,
      quantity: Number(item.quantity),
      size: item.size || "",
      color: item.color || ""
    }));

    const button = $("#placeOrderButton");
    const error = $("#checkoutError");

    isSubmitting = true;
    button.disabled = true;
    button.textContent = "PLACING YOUR ORDER...";
    error.textContent = "";

    try {
      const result = await api("/orders", {
        method: "POST",
        body: JSON.stringify({
          customer_name: customer.customer_name,
          customer_email: customer.customer_email,
          phone: customer.phone,
          address: customer.address,
          payment_method: customer.payment_method,
          items
        })
      });

      cart = [];
      saveCart();
      form.reset();

      hideModal($("#checkoutModal"));

      const orderId = result.order?.id || result.order_id || result.id || "";

      $("#orderReference").textContent = orderId
        ? "Order Reference: " + orderId
        : "";

      $("#successMessage").textContent = result.email_sent === false
        ? "Your order has been received. We will contact you regarding your order."
        : "Thank you for shopping with ZK FITS. Your order confirmation will be sent to your email.";

      showModal($("#successModal"));
    } catch (err) {
      error.textContent = err.message || "Unable to place your order. Please try again.";
    } finally {
      isSubmitting = false;
      button.disabled = false;
      button.textContent = "PLACE ORDER";
    }
  }

  function setupFilters() {
    $("#collectionFilters").addEventListener("click", event => {
      const button = event.target.closest("[data-filter]");
      if (!button) return;

      activeFilter = button.dataset.filter;

      $$(".filter-button").forEach(item =>
        item.classList.toggle("active", item === button)
      );

      renderProducts();
    });

    $("#sortProducts").addEventListener("change", event => {
      activeSort = event.target.value;
      renderProducts();
    });
  }

  function setupMenu() {
    const toggle = $("#menuToggle");
    const nav = $("#mainNav");
    const overlay = $("#menuOverlay");

    function closeMenu() {
      nav.classList.remove("open");
      overlay.classList.remove("open");
      toggle.classList.remove("active");
      toggle.setAttribute("aria-expanded", "false");
      document.body.classList.remove("menu-open");
    }

    toggle.addEventListener("click", () => {
      const open = !nav.classList.contains("open");

      nav.classList.toggle("open", open);
      overlay.classList.toggle("open", open);
      toggle.classList.toggle("active", open);
      toggle.setAttribute("aria-expanded", String(open));
      document.body.classList.toggle("menu-open", open);
    });

    overlay.addEventListener("click", closeMenu);

    nav.addEventListener("click", event => {
      if (event.target.closest("a")) closeMenu();
    });
  }

  function setupEvents() {
    document.addEventListener("click", event => {
      const productButton = event.target.closest("[data-product]");
      if (productButton) {
        openProduct(productButton.dataset.product);
        return;
      }

      const cartAction = event.target.closest("[data-cart-action]");
      if (cartAction) {
        changeCart(
          Number(cartAction.dataset.index),
          cartAction.dataset.cartAction
        );
        return;
      }

      if (event.target.id === "addSelectedProduct") {
        addSelectedToCart();
        return;
      }

      if (event.target.id === "continueShopping") {
        closeCart();
        $("#products").scrollIntoView({ behavior: "smooth" });
      }
    });

    $("#cartToggle").addEventListener("click", openCart);
    $("#closeCart").addEventListener("click", closeCart);
    $("#drawerOverlay").addEventListener("click", closeCart);

    $("#checkoutButton").addEventListener("click", openCheckout);
    $("#checkoutForm").addEventListener("submit", placeOrder);

    $("#closeProductModal").addEventListener("click", () =>
      hideModal($("#productModal"))
    );

    $("#closeCheckout").addEventListener("click", () =>
      hideModal($("#checkoutModal"))
    );

    $("#successContinue").addEventListener("click", () => {
      hideModal($("#successModal"));
      $("#home").scrollIntoView({ behavior: "smooth" });
    });

    $$(".modal-overlay").forEach(overlay => {
      overlay.addEventListener("click", event => {
        if (event.target === overlay) hideModal(overlay);
      });
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        $$(".modal-overlay.open").forEach(hideModal);
        closeCart();
      }
    });

    setupFilters();
    setupMenu();
  }

  async function loadStore() {
    try {
      const data = await api("/store");

      products = Array.isArray(data.products) ? data.products : [];
      settings = parseSettings(data.settings);

      applySettings();
      renderProducts();
      updateCart();

    } catch (error) {
      console.error("ZK FITS store loading error:", error);

      $("#featuredProducts").innerHTML =
        `<div class="empty-state"><h3>Unable to load collection</h3><p>Please refresh the page or try again later.</p></div>`;

      $("#productGrid").innerHTML = "";
      $("#noProducts").hidden = false;
      notify("Unable to connect to the store. Please refresh.", true);
    }
  }

  function start() {
    setupEvents();
    updateCart();
    loadStore();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
