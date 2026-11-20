/* =====================================================
   ZK FITSS — PRODUCT DETAIL PAGE
   Product details, variants, gallery, cart and reviews
   Editable Return & Exchange Policy
   Mobile navigation support
   ===================================================== */

(() => {
  "use strict";

  const API = "/api";
  const CART_KEY = "zkfits_cart";
  const $ = id => document.getElementById(id);

  const state = {
    products: [],
    product: null,
    settings: {},
    images: [],
    imageIndex: 0,
    sizes: [],
    colors: [],
    variants: [],
    selectedSize: "",
    selectedColor: "",
    quantity: 1,
    stock: 0
  };

  const money = value =>
    "Rs. " + Number(value || 0).toLocaleString("en-PK");

  const escapeHTML = value =>
    String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  function parseJSON(value, fallback = []) {
    if (Array.isArray(value) || (value && typeof value === "object")) {
      return value;
    }

    if (typeof value !== "string" || !value.trim()) {
      return fallback;
    }

    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function getProductId() {
    const params = new URLSearchParams(location.search);
    return (params.get("id") || params.get("product") || "").trim();
  }

  function getProductPrice(product) {
    const sale = Number(product.sale_price || 0);
    const regular = Number(product.price || 0);

    return sale > 0 && sale < regular ? sale : regular;
  }

  function getProductImages(product) {
    const images = [];

    const extraImages = parseJSON(product.images, []);
    if (Array.isArray(extraImages)) images.push(...extraImages);

    if (product.image) {
      images.unshift(product.image);
    }

    return [...new Set(images.filter(Boolean))];
  }

  function normalizeList(value, kind = "generic") {
    const parsed = parseJSON(value, null);
    if (Array.isArray(parsed)) {
      return parsed.map(item => {
        if (typeof item === "object" && item !== null) return String(item.name || item.value || item.label || "");
        return String(item);
      }).map(item => item.trim()).filter(Boolean);
    }
    if (typeof value === "string" && value.trim()) {
      const raw = value.trim();
      if (raw.includes(",")) return raw.split(",").map(item => item.trim()).filter(Boolean);
      if (kind === "sizes") return raw.split(/\s+/).filter(Boolean);
      return [raw];
    }
    return [];
  }

  function normalizeVariants(value) {
    const parsed = parseJSON(value, []);

    if (Array.isArray(parsed)) {
      return parsed.map(item => ({
        size: String(item.size || ""),
        color: String(item.color || item.colour || ""),
        stock: Math.max(0, Number(item.stock || 0)),
        images: Array.isArray(item.images) ? item.images.filter(Boolean) : []
      }));
    }

    if (parsed && typeof parsed === "object") {
      return Object.entries(parsed).map(([key, stock]) => {
        const parts = key.split("|");

        return {
          size: parts[0] || "",
          color: parts[1] || "",
          stock: Math.max(
            0,
            Number(typeof stock === "object" ? stock.stock : stock)
          )
        };
      });
    }

    return [];
  }

  function getAvailableVariant() {
    if (!state.variants.length) return null;

    return state.variants.find(variant => {
      const sizeMatches =
        !state.selectedSize || variant.size === state.selectedSize;

      const colorMatches =
        !state.selectedColor || variant.color === state.selectedColor;

      return sizeMatches && colorMatches;
    }) || null;
  }

  function getCurrentStock() {
    if (state.variants.length) {
      const matchingInStock = state.variants.find(item =>
        (!state.selectedSize || String(item.size || "") === state.selectedSize) &&
        (!state.selectedColor || String(item.color || "") === state.selectedColor) &&
        Number(item.stock) > 0
      );
      return matchingInStock ? Number(matchingInStock.stock) : 0;
    }
    return Math.max(0, Number(state.product?.stock || 0));
  }

  function setMessage(element, message, isError = false) {
    if (!element) return;

    element.textContent = message;
    element.style.color = isError ? "#b33b36" : "#26734d";
  }

  function showToast(message) {
    const toast = $("storeToast");
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add("show");

    window.clearTimeout(showToast.timer);

    showToast.timer = window.setTimeout(() => {
      toast.classList.remove("show");
    }, 2800);
  }

  function showProductError() {
    $("productLoading")?.setAttribute("hidden", "");
    $("productContent")?.setAttribute("hidden", "");
    $("productError")?.removeAttribute("hidden");
  }

  function updateDocumentDetails(product) {
    const productName = product.title || product.name || "Product";
    const brandName = "ZK FITSS";
    const title = `${productName} | ${brandName}`;
    const rawDescription = product.description || `Shop ${productName} at ${brandName}. Discover elegant Pakistani Eastern wear for women and girls.`;
    const description = String(rawDescription).replace(/\s+/g, " ").trim().slice(0, 155);
    const canonicalUrl = `${window.location.origin}${window.location.pathname}?id=${encodeURIComponent(getProductId())}`;
    const productImages = getProductImages(product);
    const imageUrl = productImages[0] ? new URL(productImages[0], window.location.origin).href : `${window.location.origin}/og-image.jpg`;

    document.title = title;

    const setMeta = (selector, value) => {
      let element = document.querySelector(selector);
      if (!element) {
        element = document.createElement("meta");
        const propertyMatch = selector.match(/property="([^"]+)"/);
        const nameMatch = selector.match(/name="([^"]+)"/);
        if (propertyMatch) element.setAttribute("property", propertyMatch[1]);
        if (nameMatch) element.setAttribute("name", nameMatch[1]);
        document.head.appendChild(element);
      }
      element.setAttribute("content", value);
    };

    setMeta('meta[name="description"]', description);
    setMeta('meta[property="og:title"]', title);
    setMeta('meta[property="og:description"]', description);
    setMeta('meta[property="og:url"]', canonicalUrl);
    setMeta('meta[property="og:image"]', imageUrl);
    setMeta('meta[property="og:image:alt"]', `${productName} at ZK FITSS`);
    setMeta('meta[name="twitter:title"]', title);
    setMeta('meta[name="twitter:description"]', description);
    setMeta('meta[name="twitter:image"]', imageUrl);

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;

    const price = getProductPrice(product);
    const stockKnown = product.stock !== undefined && product.stock !== null && product.stock !== "";
    const structuredProduct = {
      "@context": "https://schema.org",
      "@type": "Product",
      "name": productName,
      "description": description,
      "image": productImages.map(url => new URL(url, window.location.origin).href),
      "brand": { "@type": "Brand", "name": brandName },
      ...(product.sku ? { "sku": String(product.sku) } : {}),
      ...(price > 0 ? {
        "offers": {
          "@type": "Offer",
          "url": canonicalUrl,
          "priceCurrency": "PKR",
          "price": price,
          ...(stockKnown ? {
            "availability": Number(product.stock) > 0
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock"
          } : {})
        }
      } : {})
    };
    let jsonLd = document.getElementById("productStructuredData");
    if (!jsonLd) {
      jsonLd = document.createElement("script");
      jsonLd.id = "productStructuredData";
      jsonLd.type = "application/ld+json";
      document.head.appendChild(jsonLd);
    }
    jsonLd.textContent = JSON.stringify(structuredProduct);

    if ($("breadcrumbProduct")) {
      $("breadcrumbProduct").textContent = productName;
    }
  }

  /* =========================================
     MOBILE AND DESKTOP MENU
     ========================================= */

  function setupMenu() {
    const toggle = $("#menuToggle");
    const nav = $("#mainNav");
    const overlay = $("#menuOverlay");

    if (!toggle || !nav) return;

    function openMenu() {
      nav.classList.add("open");

      if (overlay) {
        overlay.classList.add("open");
      }

      toggle.classList.add("active");
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-label", "Close menu");

      document.body.classList.add("menu-open");
    }

    function closeMenu() {
      nav.classList.remove("open");

      if (overlay) {
        overlay.classList.remove("open");
      }

      toggle.classList.remove("active");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Open menu");

      document.body.classList.remove("menu-open");
    }

    toggle.addEventListener("click", () => {
      if (nav.classList.contains("open")) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    overlay?.addEventListener("click", closeMenu);

    nav.addEventListener("click", event => {
      if (event.target.closest("a")) {
        closeMenu();
      }
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        closeMenu();
      }
    });

    closeMenu();
  }

  /* =========================================
     PRODUCT IMAGE GALLERY
     ========================================= */

  function renderImages() {
    const image = $("mainProductImage");
    const thumbnails = $("productThumbnails");

    if (!image || !thumbnails) return;

    if (!state.images.length) {
      image.removeAttribute("src");
      image.alt = state.product?.name || "Product image";
      thumbnails.innerHTML = "";
      return;
    }

    image.src = state.images[state.imageIndex];
    image.alt = state.product?.name || "ZK FITSS product";

    thumbnails.innerHTML = state.images.map((src, index) => `
      <button
        class="product-thumbnail ${index === state.imageIndex ? "active" : ""}"
        type="button"
        data-image-index="${index}"
        aria-label="View product image ${index + 1}">
        <img
          src="${escapeHTML(src)}"
          alt="${escapeHTML(state.product?.name || "Product")}"
          loading="lazy">
      </button>
    `).join("");

    thumbnails.querySelectorAll("[data-image-index]").forEach(button => {
      button.addEventListener("click", () => {
        state.imageIndex = Number(button.dataset.imageIndex);
        renderImages();
      });
    });

    if ($("galleryPrev")) {
      $("galleryPrev").disabled = state.images.length < 2;
    }

    if ($("galleryNext")) {
      $("galleryNext").disabled = state.images.length < 2;
    }
  }

  function moveGallery(direction) {
    if (state.images.length < 2) return;

    state.imageIndex =
      (state.imageIndex + direction + state.images.length) %
      state.images.length;

    renderImages();
  }

  /* =========================================
     PRODUCT PRICE
     ========================================= */

  function renderPrice() {
    const product = state.product;
    if (!product || !$("productPrice")) return;

    const regular = Number(product.price || 0);
    const sale = Number(product.sale_price || 0);
    const hasSale = sale > 0 && sale < regular;

    $("productPrice").innerHTML = `
      <strong class="current-price">
        ${money(hasSale ? sale : regular)}
      </strong>

      ${hasSale ? `
        <del class="old-price">${money(regular)}</del>
        <span class="sale-discount">
          ${Math.round((regular - sale) / regular * 100)}% OFF
        </span>
      ` : ""}
    `;

    if ($("productSaleBadge")) {
      $("productSaleBadge").hidden = !hasSale;
    }
  }

  /* =========================================
     SIZE AND COLOUR VARIANTS
     ========================================= */

  function renderVariants() {
    const container = $("productVariants");
    if (!container) return;

    const available = state.variants.filter(v => Number(v.stock) > 0);
    const sizes = state.sizes.length
      ? state.sizes
      : [...new Set(available.map(v => v.size).filter(Boolean))];
    const allColors = state.colors.length
      ? state.colors
      : [...new Set(available.map(v => v.color).filter(Boolean))];

    const colorsForSize = state.selectedSize
      ? [...new Set(state.variants.filter(v => v.size === state.selectedSize).map(v => v.color).filter(Boolean))]
      : allColors;

    const parts = [];
    if (sizes.length) {
      parts.push(`
        <div class="variant-group">
          <label class="variant-label">Select Size</label>
          <div class="variant-options size-options">
            ${sizes.map(size => {
              const unavailable = state.variants.length && !available.some(v => v.size === size);
              return `<button type="button" class="variant-option ${state.selectedSize === size ? "selected" : ""}" data-size="${escapeHTML(size)}" ${unavailable ? "disabled" : ""}>${escapeHTML(size)}</button>`;
            }).join("")}
          </div>
        </div>`);
    }

    if (allColors.length) {
      parts.push(`
        <div class="variant-group">
          <label class="variant-label">Select Colour <span class="selected-colour-name">${escapeHTML(state.selectedColor || "")}</span></label>
          <div class="variant-options color-options">
            ${colorsForSize.map(color => {
              const unavailable = state.variants.length && !available.some(v => v.color === color && (!state.selectedSize || v.size === state.selectedSize));
              const swatch = colorToCSS(color);
              return `<button type="button" class="variant-option color-option ${state.selectedColor === color ? "selected" : ""}" data-color="${escapeHTML(color)}" ${unavailable ? "disabled" : ""}><span class="colour-swatch" style="--swatch:${escapeHTML(swatch)}"></span><span>${escapeHTML(color)}</span></button>`;
            }).join("")}
          </div>
        </div>`);
    }

    container.innerHTML = parts.join("");
    container.querySelectorAll("[data-size]").forEach(button => button.addEventListener("click", () => {
      state.selectedSize = button.dataset.size;
      if (state.selectedColor && state.variants.length && !state.variants.some(v => v.size === state.selectedSize && v.color === state.selectedColor && v.stock > 0)) state.selectedColor = "";
      updateVariantUI();
    }));
    container.querySelectorAll("[data-color]").forEach(button => button.addEventListener("click", () => {
      state.selectedColor = button.dataset.color;
      state.imageIndex = 0;
      updateSelectedVariantImages();
      updateVariantUI();
    }));
    updateSelectedVariantImages();
    updateAvailability();
  }

  function colorToCSS(value) {
    const key = String(value || "").toLowerCase().replace(/[^a-z]/g, "");
    const known = { black:"#171717", white:"#ffffff", red:"#d62828", navy:"#172b57", navyblue:"#172b57", maroon:"#701b35", pink:"#efa4bd", green:"#28734b", olive:"#78823c", beige:"#d8c4a5", brown:"#795548", purple:"#754b91", grey:"#888888", gray:"#888888", yellow:"#f1c40f", orange:"#e67e22" };
    return known[key] || "#b8aaa0";
  }

  function updateSelectedVariantImages() {
    if (!state.product) return;
    const match = state.variants.find(v =>
      v.size === state.selectedSize && v.color === state.selectedColor
    );
    const sameColour = state.variants.find(v =>
      v.color.toLowerCase() === String(state.selectedColor || "").toLowerCase() &&
      Array.isArray(v.images) && v.images.length
    );
    const chosen = match && match.images && match.images.length
      ? match.images
      : sameColour && sameColour.images.length
        ? sameColour.images
        : getProductImages(state.product);
    state.images = chosen;
    state.imageIndex = Math.min(state.imageIndex, Math.max(0, chosen.length - 1));
    renderImages();
  }

  function updateVariantUI() {
    renderVariants();
  }

  function updateAvailability() {
    const stock = getCurrentStock();
    state.stock = stock;

    const hasRequiredSize =
      !state.sizes.length || !!state.selectedSize;

    const hasRequiredColor =
      !state.colors.length || !!state.selectedColor;

    const hasSelection = hasRequiredSize && hasRequiredColor;

    const availability = $("productAvailability");
    const addButton = $("addToCartButton");
    const buyButton = $("buyNowButton");

    if (availability) {
      if (!hasSelection && stock > 0) {
        availability.textContent = "Size and colour are optional. You can continue without selecting.";
        availability.className = "product-availability";

      } else if (stock <= 0) {
        availability.textContent = "Currently out of stock";

        availability.className =
          "product-availability out-of-stock";

      } else {
        availability.textContent = stock <= 5
          ? `Only ${stock} left in stock`
          : "In stock";

        availability.className =
          "product-availability in-stock";
      }
    }

    const disabled = stock <= 0;

    if (addButton) addButton.disabled = disabled;
    if (buyButton) buyButton.disabled = disabled;

    const quantityInput = $("productQuantity");

    if (quantityInput) {
      quantityInput.max = String(Math.max(1, stock));

      if (stock > 0 && state.quantity > stock) {
        state.quantity = stock;
      }

      quantityInput.value = String(state.quantity);
    }
  }

  function updateQuantity(value) {
    const stock = getCurrentStock();
    const parsed = Math.floor(Number(value) || 1);

    state.quantity = Math.max(
      1,
      Math.min(parsed, Math.max(1, stock))
    );

    if ($("productQuantity")) {
      $("productQuantity").value = String(state.quantity);
    }
  }

  /* =========================================
     RETURN & EXCHANGE POLICY
     Reads saved Admin Settings
     ========================================= */

  function renderTrustAndPolicy() {
    const content = $("returnPolicyContent");

    const policy =
      state.settings.return_policy ||
      state.settings.returns_policy ||
      state.settings.returnPolicy ||
      "";

    const title =
      state.settings.return_policy_title ||
      "Returns & Exchanges";

    const details = content?.closest("details");
    const summary = details?.querySelector("summary");

    if (summary) {
      summary.textContent = title;
    }

    if (content) {
      content.textContent = String(policy).trim()
        ? String(policy)
        : "Please contact ZK FITSS for return and exchange information.";

      content.style.whiteSpace = "pre-line";
    }
  }

  /* =========================================
     RELATED PRODUCTS
     ========================================= */

  function renderRelatedProducts() {
    const section = $("relatedProductsSection");
    const container = $("relatedProducts");

    if (!section || !container) return;

    const current = state.product;

    const related = state.products
      .filter(product =>
        String(product.id) !== String(current.id) &&
        product.active !== false &&
        Number(product.active) !== 0 &&
        (
          !current.category ||
          product.category === current.category
        )
      )
      .slice(0, 4);

    if (!related.length) {
      section.hidden = true;
      return;
    }

    section.hidden = false;

    container.innerHTML = related.map(product => {
      const title = product.title || product.name || "Product";
      const price = getProductPrice(product);

      return `
        <a class="product-card product-related-card"
          href="/product.html?id=${encodeURIComponent(product.id)}">

          <img
            src="${escapeHTML(product.image || "")}"
            alt="${escapeHTML(title)}"
            loading="lazy">

          <h3>${escapeHTML(title)}</h3>
          <p>${money(price)}</p>
        </a>
      `;
    }).join("");
  }

  function applyProductPageSettings() {
    const settings = state.settings || {};
    const savedStoreName = settings.store_name || "ZK FITSS";
    const name = /^ZK FITS$/i.test(savedStoreName.trim()) ? "ZK FITSS" : savedStoreName;
    const logo = settings.logo || "";
    document.querySelectorAll(".footer-brand").forEach(el => el.textContent = name);
    const storeName = $("storeName");
    const storeLogo = $("storeLogo");
    if (storeName) { storeName.textContent = name; storeName.hidden = !!logo; }
    if (storeLogo && logo) { storeLogo.src = logo; storeLogo.hidden = false; }
    if ($("announcementText")) $("announcementText").textContent = settings.announcement || "Welcome to ZK FITSS";
    if ($("footerText")) $("footerText").textContent = settings.footer_text || "Discover elegant Pakistani fashion for women and girls.";
    if ($("footerPhone")) $("footerPhone").textContent = settings.phone || "Customer Support";
    if ($("footerEmail")) $("footerEmail").textContent = settings.email || "";
    if ($("footerAddress")) $("footerAddress").textContent = settings.address || "";
    if ($("currentYear")) $("currentYear").textContent = new Date().getFullYear();
    const root = document.documentElement.style;
    const vars = { background_color:"--store-bg", text_color:"--store-text", accent_color:"--store-accent", header_color:"--store-header", footer_color:"--store-footer", footer_text_color:"--store-footer-text" };
    Object.entries(vars).forEach(([key, css]) => { if (settings[key]) root.setProperty(css, settings[key]); });
    if (settings.header_text_color) root.setProperty("--store-header-text", settings.header_text_color);
    if (settings.header_height) root.setProperty("--header-height", `${Number(settings.header_height)}px`);
    if (settings.header_mobile_height) root.setProperty("--header-mobile-height", `${Number(settings.header_mobile_height)}px`);
    if (settings.header_font_size) root.setProperty("--header-font-size", `${Number(settings.header_font_size)}px`);
    if (settings.header_mobile_font_size) root.setProperty("--header-mobile-font-size", `${Number(settings.header_mobile_font_size)}px`);
    if (settings.header_font_family) root.setProperty("--header-font-family", settings.header_font_family);
    if (settings.header_font_weight) root.setProperty("--header-font-weight", settings.header_font_weight);
    if (settings.footer_font_size) root.setProperty("--footer-font-size", `${Number(settings.footer_font_size)}px`);
    if (settings.footer_font_family) root.setProperty("--footer-font-family", settings.footer_font_family);
    if (settings.footer_font_weight) root.setProperty("--footer-font-weight", settings.footer_font_weight);
    $("siteHeader")?.classList.toggle("header-no-animation", settings.header_animation === "0");
    if ($("copyrightText")) $("copyrightText").textContent = settings.copyright_text || "All Rights Reserved";
    const links = { socialInstagram:settings.instagram, socialFacebook:settings.facebook, socialTikTok:settings.tiktok, socialWhatsApp:settings.whatsapp_social || settings.whatsapp };
    Object.entries(links).forEach(([id,url]) => { const a = $(id); if (a && url) { a.href = url.startsWith("http") ? url : `https://wa.me/${url.replace(/[^0-9]/g, "")}`; a.hidden = false; } });
    if ($("shippingInformation")) {
      const fee = Number(settings.shipping_fee || 250);
      const threshold = Number(settings.free_shipping_threshold || 5000);
      $("shippingInformation").textContent = `Standard delivery: PKR ${fee.toLocaleString("en-PK")}. Free delivery on orders above PKR ${threshold.toLocaleString("en-PK")}.`;
    }
    const paymentInfo = $("paymentInformation");
    if (paymentInfo) {
      const lines = ["Cash on Delivery available", settings.bank_transfer_details ? `Bank Transfer: ${settings.bank_transfer_details}` : "Bank Transfer available", settings.easypaisa_account ? `Easypaisa: ${settings.easypaisa_account}` : "Easypaisa available", settings.jazzcash_account ? `JazzCash: ${settings.jazzcash_account}` : "JazzCash available"];
      paymentInfo.textContent = lines.join("\n");
      paymentInfo.style.whiteSpace = "pre-line";
    }
    const footerMenu = $("footerMenu");
    if (footerMenu && settings.footer_links) {
      let footerLinks = [];
      try { footerLinks = JSON.parse(settings.footer_links); } catch { footerLinks = String(settings.footer_links).split("\n").map(line => { const [label,url] = line.split("|"); return {label,url}; }); }
      if (Array.isArray(footerLinks) && footerLinks.length) footerMenu.innerHTML = footerLinks.filter(x => x && x.label && x.url).map(x => `<a href="${escapeHTML(x.url)}">${escapeHTML(x.label)}</a>`).join("");
    }
    const menu = $("mainNav");
    if (menu && settings.menu_links) {
      let links = [];
      try { links = JSON.parse(settings.menu_links); } catch { links = String(settings.menu_links).split("\n").map(line => { const [label,url] = line.split("|"); return {label,url}; }); }
      if (Array.isArray(links) && links.length) menu.innerHTML = links
        .filter(x => x && (x.label || x.title) && (x.url || x.href) && !String(x.url || x.href).includes("return-policy"))
        .map(x => {
          const label = String(x.label || x.title).trim();
          const rawUrl = String(x.url || x.href).trim();
          const url = rawUrl.startsWith("#") ? `/${rawUrl}` : rawUrl;
          if (!label || !url || /^\s*javascript:/i.test(url)) return "";
          return `<a href="${escapeHTML(url)}">${escapeHTML(label)}</a>`;
        }).join("");
    }
  }

  /* =========================================
     RENDER PRODUCT PAGE
     ========================================= */

  function renderProduct(product) {
    state.product = product;
    state.images = getProductImages(product);
    state.imageIndex = 0;
    state.variants = normalizeVariants(product.variants);
    state.sizes = normalizeList(product.sizes, "sizes");
    state.colors = normalizeList(product.colors, "colors");
    if (!state.sizes.length) state.sizes = [...new Set(state.variants.map(v => v.size).filter(Boolean))];
    if (!state.colors.length) state.colors = [...new Set(state.variants.map(v => v.color).filter(Boolean))];
    state.selectedSize = "";
    state.selectedColor = "";
    state.quantity = 1;

    updateDocumentDetails(product);
    window.ZKAnalytics?.track("product_view", { product_id: product.id, product_name: product.title || product.name, value: getProductPrice(product) });

    if ($("productCategory")) {
      $("productCategory").textContent = product.category || "";
    }

    if ($("productTitle")) {
      $("productTitle").textContent =
        product.title || product.name || "Product";
    }

    if ($("productDescription")) {
      $("productDescription").textContent =
        product.description || "";
    }

    if ($("fullProductDetails")) {
      $("fullProductDetails").textContent =
        product.description || "Please contact us for further product details.";
    }

    renderPrice();
    renderImages();
    renderVariants();
    renderTrustAndPolicy();
    renderRelatedProducts();

    if ($("productLoading")) $("productLoading").hidden = true;
    if ($("productError")) $("productError").hidden = true;
    if ($("productContent")) $("productContent").hidden = false;

    updateAvailability();
    loadReviews();
    const requestedAction = new URLSearchParams(location.search).get("action");
    if (requestedAction === "cart" || requestedAction === "buy") {
      window.setTimeout(() => {
        $("#productVariants")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 250);
    }
  }

  /* =========================================
     LOAD STORE DATA
     ========================================= */

  async function loadStore() {
    const id = getProductId();

    if (!id) {
      showProductError();
      return;
    }

    try {
      const response = await fetch(`${API}/store`, {
        method: "GET",
        headers: { "Accept": "application/json" },
        credentials: "same-origin"
      });

      if (!response.ok) {
        throw new Error("Unable to load store.");
      }

      const data = await response.json();

      state.products = Array.isArray(data.products)
        ? data.products
        : [];

      state.settings = data.settings || {};
      applyProductPageSettings();

      const product = state.products.find(item =>
        String(item.id) === String(id)
      );

      if (
        !product ||
        product.active === false ||
        Number(product.active) === 0
      ) {
        showProductError();
        return;
      }

      renderProduct(product);

    } catch (error) {
      console.error("ZK FITSS product loading error:", error);
      showProductError();
    }
  }

  /* =========================================
     SHOPPING CART
     Compatible with homepage cart format
     ========================================= */

  function readCart() {
    try {
      const cart = JSON.parse(
        localStorage.getItem(CART_KEY) || "[]"
      );

      return Array.isArray(cart) ? cart : [];

    } catch {
      return [];
    }
  }

  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }

  function addProductToCart() {
    const product = state.product;
    if (!product) return false;

    const stock = getCurrentStock();

    if (stock <= 0) {
      showToast("This product is currently out of stock.");
      return false;
    }

    if (state.quantity > stock) {
      showToast("Selected quantity is not available.");
      return false;
    }

    const cart = readCart();
    let size = state.selectedSize;
    let color = state.selectedColor;
    // If the shopper skips variant choices, use the first in-stock combination
    // so inventory remains accurate and the cart/order contains a real variant.
    if (state.variants.length && (!size || !color)) {
      const matchingVariant = state.variants.find(variant =>
        Number(variant.stock) > 0 &&
        (!size || String(variant.size || "") === size) &&
        (!color || String(variant.color || "") === color)
      );
      if (matchingVariant) {
        size = size || matchingVariant.size || "";
        color = color || matchingVariant.color || "";
        state.selectedSize = size;
        state.selectedColor = color;
        renderVariants();
        showToast("An available size/colour has been selected for your order.");
      }
    }

    const existing = cart.find(item =>
      String(item.id) === String(product.id) &&
      String(item.size || "") === size &&
      String(item.color || "") === color
    );

    if (existing) {
      const oldQuantity =
        Number(existing.quantity ?? existing.qty ?? 0);

      const newQuantity = oldQuantity + state.quantity;

      if (newQuantity > stock) {
        showToast("Not enough stock for this quantity.");
        return false;
      }

      existing.quantity = newQuantity;
      existing.qty = newQuantity;

    } else {
      const price = getProductPrice(product);

      cart.push({
        id: product.id,
        name: product.name || product.title || "Product",
        title: product.title || product.name || "Product",
        price,
        image: state.images[0] || product.image || "",
        qty: state.quantity,
        quantity: state.quantity,
        size,
        color,
        stock,
        variant: { size, color, stock }
      });
    }

    saveCart(cart);
    window.ZKAnalytics?.track("add_to_cart", { product_id: product.id, product_name: product.title || product.name, value: getProductPrice(product) * state.quantity });

    window.dispatchEvent(new Event("zkfits:cart-updated"));

    showToast("Product added to your shopping bag.");

    return true;
  }

  function openExistingCart() {
    // Support both homepage and product page cart button IDs.
    const cartButton =
      $("cartToggle") ||
      $("cartButton");

    cartButton?.click();
  }

  function buyNow() {
    const button = $("buyNowButton");
    if (!addProductToCart()) return;
    if (button) {
      button.classList.add("is-pressed");
      button.setAttribute("aria-busy", "true");
      button.textContent = "PROCESSING...";
    }
    openExistingCart();
    window.setTimeout(() => {
      $("checkoutButton")?.click();
      if (button) {
        button.classList.remove("is-pressed");
        button.removeAttribute("aria-busy");
        button.textContent = "BUY IT NOW";
      }
    }, 180);
  }

  /* =========================================
     PRODUCT REVIEWS
     ========================================= */

  function renderStars(rating) {
    const value = Math.max(
      0,
      Math.min(5, Math.round(Number(rating) || 0))
    );

    return "★".repeat(value) + "☆".repeat(5 - value);
  }

  function formatReviewDate(value) {
    if (!value) return "";

    const date = new Date(
      String(value).includes("Z")
        ? value
        : value.replace(" ", "T") + "Z"
    );

    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleDateString("en-PK", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  }

  function renderReviews(reviews) {
    const list = $("reviewsList");
    if (!list) return;

    const validReviews = Array.isArray(reviews)
      ? reviews.filter(review =>
          Number(review.rating) >= 1 &&
          Number(review.rating) <= 5
        )
      : [];

    const total = validReviews.length;

    const average = total
      ? validReviews.reduce(
          (sum, review) => sum + Number(review.rating), 0
        ) / total
      : 0;

    const averageText = total ? average.toFixed(1) : "—";

    if ($("reviewsAverage")) {
      $("reviewsAverage").textContent = averageText;
    }

    if ($("reviewsStars")) {
      $("reviewsStars").textContent = renderStars(average);
    }

    if ($("reviewsTotal")) {
      $("reviewsTotal").textContent =
        total === 1
          ? "1 customer review"
          : `${total} customer reviews`;
    }

    if ($("ratingStars")) {
      $("ratingStars").textContent = renderStars(average);
    }

    if ($("ratingCount")) {
      $("ratingCount").textContent =
        total ? `${total} reviews` : "No reviews yet";
    }

    if ($("reviewsSummary")) {
      $("reviewsSummary").textContent = total
        ? `${averageText} out of 5 based on ${total} reviews`
        : "Be the first to review this product.";
    }

    if (!total) {
      list.innerHTML = `
        <p class="reviews-empty">
          No approved reviews yet. Be the first to share your experience!
        </p>
      `;
      return;
    }

    list.innerHTML = validReviews.map(review => `
      <article class="customer-review">

        <div class="customer-review-heading">
          <strong>${escapeHTML(review.customer_name || "Customer")}</strong>

          <span class="review-stars"
            aria-label="${Number(review.rating)} out of 5 stars">
            ${renderStars(review.rating)}
          </span>
        </div>

        <p class="customer-review-text">
          ${escapeHTML(review.review || "")}
        </p>

        <time class="customer-review-date">
          ${escapeHTML(formatReviewDate(review.created_at))}
        </time>

      </article>
    `).join("");
  }

  async function loadReviews() {
    const product = state.product;
    if (!product) return;

    const list = $("reviewsList");

    if (list) {
      list.innerHTML = `
        <p class="reviews-empty">Loading customer reviews...</p>
      `;
    }

    try {
      const response = await fetch(
        `${API}/reviews?product_id=${encodeURIComponent(product.id)}`,
        {
          method: "GET",
          headers: { "Accept": "application/json" },
          credentials: "same-origin"
        }
      );

      if (!response.ok) {
        throw new Error("Could not load reviews.");
      }

      const data = await response.json();

      renderReviews(
        Array.isArray(data)
          ? data
          : (data.reviews || [])
      );

    } catch (error) {
      console.error("ZK FITSS reviews loading error:", error);

      if (list) {
        list.innerHTML = `
          <p class="reviews-empty">
            Reviews could not be loaded right now. Please try again later.
          </p>
        `;
      }
    }
  }

  function setupReviewForm() {
    const form = $("reviewForm");
    if (!form) return;

    form.addEventListener("submit", async event => {
      event.preventDefault();

      if (!state.product) return;

      const name = $("reviewName")?.value.trim() || "";
      const email = $("reviewEmail")?.value.trim() || "";
      const rating = Number($("reviewRating")?.value || 0);
      const review = $("reviewText")?.value.trim() || "";

      const message = $("reviewFormMessage");
      const submitButton = $("submitReviewButton");

      if (!name || !email || !review || rating < 1 || rating > 5) {
        setMessage(
          message,
          "Please complete all fields and select a star rating.",
          true
        );
        return;
      }

      if (review.length < 5) {
        setMessage(
          message,
          "Please write a little more about your experience.",
          true
        );
        return;
      }

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Submitting...";
      }

      setMessage(message, "");

      try {
        const response = await fetch(`${API}/reviews`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          credentials: "same-origin",
          body: JSON.stringify({
            product_id: state.product.id,
            customer_name: name,
            customer_email: email,
            rating,
            review
          })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data.error || data.message || "Review submission failed."
          );
        }

        form.reset();

        setMessage(
          message,
          "Thank you! Your review has been submitted and is awaiting approval."
        );

        showToast("Thank you for your review!");

      } catch (error) {
        console.error("ZK FITSS review submission error:", error);

        setMessage(
          message,
          error.message ||
            "Unable to submit your review. Please try again.",
          true
        );

      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = "Submit Review";
        }
      }
    });
  }

  /* =========================================
     QUANTITY CONTROLS
     ========================================= */

  function setupQuantityControls() {
    $("quantityMinus")?.addEventListener("click", () => {
      updateQuantity(state.quantity - 1);
    });

    $("quantityPlus")?.addEventListener("click", () => {
      updateQuantity(state.quantity + 1);
    });

    $("productQuantity")?.addEventListener("change", event => {
      updateQuantity(event.target.value);
    });

    $("productQuantity")?.addEventListener("input", event => {
      const value = Number(event.target.value);

      if (Number.isFinite(value) && value >= 1) {
        updateQuantity(value);
      }
    });
  }

  /* =========================================
     PURCHASE BUTTONS
     ========================================= */

  function setupPurchaseButtons() {
    $("addToCartButton")?.addEventListener("click", () => {
      if (addProductToCart()) {
        openExistingCart();
      }
    });

    $("buyNowButton")?.addEventListener("click", buyNow);
  }

  /* =========================================
     GALLERY CONTROLS + RELIABLE SWIPE
     ========================================= */

  function setupGallery() {
    const previous = $("galleryPrev");
    const next = $("galleryNext");
    previous?.addEventListener("click", () => moveGallery(-1));
    next?.addEventListener("click", () => moveGallery(1));

    const gallery = $("mainProductImage")?.closest(".product-main-image");
    if (!gallery || gallery.dataset.swipeBound === "1") return;
    gallery.dataset.swipeBound = "1";

    // Pointer Events handle touch and mouse consistently. Horizontal gestures
    // change images while vertical page scrolling remains native.
    let startX = 0;
    let startY = 0;
    let activePointer = null;
    let didSwipe = false;

    gallery.addEventListener("pointerdown", event => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (event.target.closest(".gallery-control")) return;
      activePointer = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      didSwipe = false;
    }, { passive: true });

    gallery.addEventListener("pointerup", event => {
      if (activePointer === null || event.pointerId !== activePointer) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      activePointer = null;
      if (Math.abs(dx) >= 38 && Math.abs(dx) > Math.abs(dy) * 1.15) {
        didSwipe = true;
        moveGallery(dx < 0 ? 1 : -1);
      }
    }, { passive: true });

    const clearPointer = () => { activePointer = null; };
    gallery.addEventListener("pointercancel", clearPointer, { passive: true });
    gallery.addEventListener("lostpointercapture", clearPointer, { passive: true });

    // Prevent a click from being interpreted as a zoom/tap after a swipe.
    gallery.addEventListener("click", event => {
      if (didSwipe) {
        event.preventDefault();
        event.stopPropagation();
        didSwipe = false;
      }
    }, true);

    // Legacy fallback for browsers without Pointer Events.
    if (!window.PointerEvent) {
      let touchX = 0, touchY = 0, touching = false;
      gallery.addEventListener("touchstart", event => {
        if (event.touches.length !== 1) return;
        touchX = event.touches[0].clientX;
        touchY = event.touches[0].clientY;
        touching = true;
      }, { passive: true });
      gallery.addEventListener("touchend", event => {
        if (!touching || !event.changedTouches.length) return;
        touching = false;
        const dx = event.changedTouches[0].clientX - touchX;
        const dy = event.changedTouches[0].clientY - touchY;
        if (Math.abs(dx) >= 38 && Math.abs(dx) > Math.abs(dy) * 1.15) {
          moveGallery(dx < 0 ? 1 : -1);
        }
      }, { passive: true });
      gallery.addEventListener("touchcancel", () => { touching = false; }, { passive: true });
    }
  }

  /* =========================================
     SHARE PRODUCT
     ========================================= */

  function setupShareButton() {
    $("shareProductButton")?.addEventListener("click", async () => {
      const product = state.product;
      if (!product) return;

      const shareData = {
        title: product.title || product.name || "ZK FITSS",
        text: product.description ||
          "Discover this product at ZK FITSS.",
        url: location.href
      };

      try {
        if (navigator.share) {
          await navigator.share(shareData);

        } else if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(location.href);
          showToast("Product link copied.");

        } else {
          showToast("Please copy the product link from your browser.");
        }

      } catch (error) {
        if (error.name !== "AbortError") {
          console.error("Share error:", error);
        }
      }
    });
  }

  /* =========================================
     PRODUCT PAGE CART + CHECKOUT
     ========================================= */
  function readCart() {
    try { const value = JSON.parse(localStorage.getItem(CART_KEY) || "[]"); return Array.isArray(value) ? value : []; }
    catch { return []; }
  }
  function writeCart(cart) { localStorage.setItem(CART_KEY, JSON.stringify(cart)); renderCartDrawer(); }
  function cartSubtotal() { return readCart().reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || item.qty || 1), 0); }
  function renderCartDrawer() {
    const cart = readCart();
    const items = $("cartItems");
    if (!items) return;
    items.innerHTML = cart.length ? cart.map((item, index) => `
      <div class="cart-item">
        <img src="${escapeHTML(item.image || "")}" alt="${escapeHTML(item.title || item.name || "Product")}">
        <div class="cart-item-info"><strong>${escapeHTML(item.title || item.name || "Product")}</strong>
          <p>${item.size ? "Size: " + escapeHTML(item.size) : ""} ${item.color ? "Colour: " + escapeHTML(item.color) : ""}</p>
          <p>${money(item.price)}</p>
          <div class="product-cart-quantity"><button type="button" data-cart-step="-1" data-cart-index="${index}">−</button><span>${Number(item.quantity || item.qty || 1)}</span><button type="button" data-cart-step="1" data-cart-index="${index}">+</button><button type="button" data-cart-remove="${index}">Remove</button></div>
        </div>
      </div>`).join("") : `<p class="empty-cart">Your shopping bag is empty.</p>`;
    if ($("cartSubtotal")) $("cartSubtotal").textContent = money(cartSubtotal());
    if ($("checkoutButton")) $("checkoutButton").disabled = !cart.length;
    const count = cart.reduce((sum, item) => sum + Number(item.quantity || item.qty || 1), 0);
    if ($("cartCount")) $("cartCount").textContent = count;
  }
  function openCartDrawer() {
    renderCartDrawer();
    $("cart")?.classList.add("open");
    $("cart")?.setAttribute("aria-hidden", "false");
    $("drawerOverlay")?.classList.add("open");
  }
  function closeCartDrawer() {
    $("cart")?.classList.remove("open");
    $("cart")?.setAttribute("aria-hidden", "true");
    $("drawerOverlay")?.classList.remove("open");
  }
  function openCheckoutModal() {
    const cart = readCart();
    if (!cart.length) return;
    closeCartDrawer();
    const subtotal = cartSubtotal();
    const fee = Math.max(0, Number(state.settings.shipping_fee || 250));
    const threshold = Math.max(0, Number(state.settings.free_shipping_threshold || 5000));
    const shipping = threshold && subtotal >= threshold ? 0 : fee;
    if ($("checkoutItems")) $("checkoutItems").innerHTML = cart.map(item => `<p>${escapeHTML(item.title || item.name)} × ${Number(item.quantity || item.qty || 1)} — ${money(Number(item.price) * Number(item.quantity || item.qty || 1))}</p>`).join("");
    if ($("checkoutSubtotal")) $("checkoutSubtotal").textContent = money(subtotal);
    if ($("checkoutShipping")) $("checkoutShipping").textContent = shipping ? money(shipping) : "Free";
    if ($("checkoutTotal")) $("checkoutTotal").textContent = money(subtotal + shipping);
    $("checkoutModal")?.classList.add("open");
    $("checkoutModal")?.setAttribute("aria-hidden", "false");
  }
  async function submitCheckout(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const button = $("placeOrderButton");
    const error = $("checkoutError");
    button.disabled = true;
    button.textContent = "PLACING ORDER...";
    if (error) error.textContent = "";
    try {
      const fd = new FormData(form);
      const data = Object.fromEntries(fd.entries());
      const items = readCart().map(item => ({ id:item.id, quantity:Number(item.quantity || item.qty || 1), size:item.size || "", color:item.color || "" }));
      const response = await fetch(`${API}/orders`, { method:"POST", headers:{"Content-Type":"application/json"}, credentials:"same-origin", body:JSON.stringify({...data, items, attribution: window.ZKAnalytics?.getAttribution?.() || {}}) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Unable to place order.");
      localStorage.removeItem(CART_KEY);
      renderCartDrawer();
      form.reset();
      $("checkoutModal")?.classList.remove("open");
      $("checkoutModal")?.setAttribute("aria-hidden", "true");
      if ($("successOrderReference")) $("successOrderReference").textContent = `Order Reference: ${result.id || "received"}`;
      if ($("successMessage")) $("successMessage").textContent = result.email_sent === false || result.admin_email_sent === false ? "Your order was received. Email notifications need store email configuration." : "Your order has been received. A confirmation email will be sent to you.";
      $("successModal")?.classList.add("open");
      $("successModal")?.setAttribute("aria-hidden", "false");
    } catch (err) {
      if (error) error.textContent = err.message;
    } finally {
      button.disabled = false;
      button.textContent = "PLACE ORDER";
    }
  }
  function setupProductCart() {
    $("cartButton")?.addEventListener("click", openCartDrawer);
    $("closeCart")?.addEventListener("click", closeCartDrawer);
    $("drawerOverlay")?.addEventListener("click", closeCartDrawer);
    $("checkoutButton")?.addEventListener("click", openCheckoutModal);
    $("closeCheckout")?.addEventListener("click", () => { $("checkoutModal")?.classList.remove("open"); $("checkoutModal")?.setAttribute("aria-hidden", "true"); });
    $("checkoutForm")?.addEventListener("submit", submitCheckout);
    $("paymentMethod")?.addEventListener("change", () => {
      const method = $("paymentMethod").value;
      const map = { "Bank Transfer":state.settings.bank_transfer_details, "Easypaisa":state.settings.easypaisa_account, "JazzCash":state.settings.jazzcash_account };
      const text = map[method] || (method === "Cash on Delivery" ? "Pay in cash when your order is delivered." : "");
      const box = $("paymentInstructions");
      if (box) { box.textContent = text || ""; box.hidden = !text; }
    });
    $("successContinue")?.addEventListener("click", () => { $("successModal")?.classList.remove("open"); $("successModal")?.setAttribute("aria-hidden", "true"); location.href = "/#products"; });
    $("cartItems")?.addEventListener("click", event => {
      const remove = event.target.closest("[data-cart-remove]");
      const step = event.target.closest("[data-cart-step]");
      const cart = readCart();
      if (remove) {
        cart.splice(Number(remove.dataset.cartRemove), 1);
        writeCart(cart);
        return;
      }
      if (step) {
        const index = Number(step.dataset.cartIndex);
        const item = cart[index];
        if (!item) return;
        const next = Number(item.quantity || item.qty || 1) + Number(step.dataset.cartStep);
        if (next <= 0) cart.splice(index, 1);
        else if (next > Number(item.stock || 99)) { showToast("No more stock available."); return; }
        else { item.quantity = next; item.qty = next; }
        writeCart(cart);
      }
    });
    renderCartDrawer();
  }

  /* =========================================
     INITIALISE PAGE
     ========================================= */

  function init() {
    setupMenu();
    setupQuantityControls();
    setupPurchaseButtons();
    setupGallery();
    setupShareButton();
    setupReviewForm();
    setupProductCart();

    loadStore();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
