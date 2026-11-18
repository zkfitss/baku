(() => {
  "use strict";

  const API = "/api";
  const CART_KEY = "zkfits_cart";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  // This script is for the homepage only.
  // Product page has its own product.js.
  if (!$("#featuredProducts") || !$("#productGrid")) return;

  let products = [];
  let settings = {};
  let cart = loadCart();
  let activeFilter = "All";
  let activeSort = "default";
  let selectedProduct = null;
  let isSubmitting = false;
  let heroSlideIndex = 0;
  let heroTimer = null;
  let collectionTimer = null;

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

  function setText(selector, value) {
    const element = $(selector);
    if (element) element.textContent = value;
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

    setText("#storeName", storeName);

    $$(".footer-brand").forEach(el => {
      el.textContent = storeName;
    });

    const logo = setting("logo");

    if (logo) {
      const logoImage = $("#storeLogo");

      if (logoImage) {
        logoImage.src = logo;
        logoImage.hidden = false;
      }

      const nameElement = $("#storeName");
      if (nameElement) nameElement.hidden = true;
    }

    setText(
      "#announcementText",
      setting("announcement", "Welcome to ZK FITS — Discover your style")
    );

    const heroKicker = $("#heroKicker");
    const heroTitle = $("#heroTitle");
    const heroSubtitle = $("#heroSubtitle");
    const heroButton = $("#heroButton");
    const heroContent = $(".hero-content");
    const kickerText = String(setting("hero_kicker", "")).trim();
    const titleText = String(setting("hero_title", "")).trim();
    const subtitleText = String(setting("hero_subtitle", "")).trim();
    const buttonText = String(setting("hero_button_text", "")).trim();
    if (heroKicker) { heroKicker.textContent = kickerText; heroKicker.hidden = !kickerText; }
    if (heroTitle) { heroTitle.textContent = titleText; heroTitle.hidden = !titleText; }
    if (heroSubtitle) { heroSubtitle.textContent = subtitleText; heroSubtitle.hidden = !subtitleText; }
    if (heroButton) { heroButton.textContent = buttonText; heroButton.href = setting("hero_button_link", "#collection"); heroButton.hidden = !buttonText; }
    if (heroContent) heroContent.hidden = !(kickerText || titleText || subtitleText || buttonText);

    setImage("heroImage", setting("hero_image"));
    setImage("womenBanner", setting("women_banner"));
    setImage("girlsBanner", setting("girls_banner"));

    setText("#promoTitle", setting("promo_title", "Every Outfit Tells a Story."));
    setText("#promoDescription", setting("promo_description", "Celebrate your individuality with beautiful styles, elegant details and fashion that feels special."));
    const promoButton = $("#promoButton");
    if (promoButton) {
      promoButton.textContent = setting("promo_button_text", "SHOP THE COLLECTION");
      promoButton.href = setting("promo_button_link", "#products");
    }
    const promo = $(".brand-message");
    const promoImage = window.matchMedia("(max-width: 700px)").matches
      ? setting("promo_mobile_image", setting("promo_image"))
      : setting("promo_image");
    if (promo && promoImage) promo.style.backgroundImage = `linear-gradient(rgba(25,20,17,.42),rgba(25,20,17,.42)),url("${promoImage.replace(/["\\]/g, "")}")`;

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
    if (setting("header_text_color")) root.setProperty("--store-header-text", setting("header_text_color"));
    root.setProperty("--header-height", `${Math.max(50, Math.min(150, Number(setting("header_height", 83)) || 83))}px`);
    root.setProperty("--header-mobile-height", `${Math.max(45, Math.min(120, Number(setting("header_mobile_height", 70)) || 70))}px`);
    root.setProperty("--hero-height-desktop", `${Math.max(250, Math.min(900, Number(setting("hero_height_desktop", 570)) || 570))}px`);
    root.setProperty("--hero-height-mobile", `${Math.max(220, Math.min(750, Number(setting("hero_height_mobile", 470)) || 470))}px`);
    root.setProperty("--collection-height-desktop", `${Math.max(220, Math.min(700, Number(setting("collection_height_desktop", 430)) || 430))}px`);
    root.setProperty("--collection-height-mobile", `${Math.max(180, Math.min(600, Number(setting("collection_height_mobile", 340)) || 340))}px`);
    root.setProperty("--promo-height-desktop", `${Math.max(220, Math.min(700, Number(setting("promo_height_desktop", 400)) || 400))}px`);
    root.setProperty("--promo-height-mobile", `${Math.max(200, Math.min(650, Number(setting("promo_height_mobile", 360)) || 360))}px`);

    if (setting("footer_color")) {
      root.setProperty("--store-footer", setting("footer_color"));
    }

    if (setting("footer_text_color")) {
      root.setProperty("--store-footer-text", setting("footer_text_color"));
    }
    root.setProperty("--header-font-size", `${Math.max(10, Math.min(32, Number(setting("header_font_size", 14)) || 14))}px`);
    root.setProperty("--header-mobile-font-size", `${Math.max(10, Math.min(28, Number(setting("header_mobile_font_size", 13)) || 13))}px`);
    root.setProperty("--header-font-family", setting("header_font_family", "DM Sans"));
    root.setProperty("--header-font-weight", setting("header_font_weight", "500"));
    root.setProperty("--footer-font-size", `${Math.max(10, Math.min(24, Number(setting("footer_font_size", 13)) || 13))}px`);
    root.setProperty("--footer-font-family", setting("footer_font_family", "DM Sans"));
    root.setProperty("--footer-font-weight", setting("footer_font_weight", "400"));
    $("#siteHeader")?.classList.toggle("header-no-animation", setting("header_animation", "1") === "0");

    setText(
      "#contactHeading",
      setting("contact_heading", "Let's Stay Connected")
    );

    setText(
      "#contactDescription",
      setting(
        "contact_description",
        "Have a question about an order or product? Get in touch with us."
      )
    );

    setText(
      "#footerText",
      setting(
        "footer_text",
        "Discover elegant Pakistani fashion for women and girls."
      )
    );

    const phone = setting("phone");
    const email = setting("email");
    const address = setting("address");
    const whatsapp = setting("whatsapp_social") || setting("whatsapp");

    if (phone) {
      const contactPhone = $("#contactPhone");

      if (contactPhone) {
        contactPhone.href = "tel:" + phone.replace(/[^\d+]/g, "");
        contactPhone.textContent = "Call: " + phone;
        contactPhone.hidden = false;
      }

      setText("#footerPhone", phone);
    }

    if (email) {
      const contactEmail = $("#contactEmail");

      if (contactEmail) {
        contactEmail.href = "mailto:" + email;
        contactEmail.textContent = email;
        contactEmail.hidden = false;
      }

      setText("#footerEmail", email);
    }

    if (address) {
      const contactAddress = $("#contactAddress");

      if (contactAddress) {
        contactAddress.textContent = address;
        contactAddress.hidden = false;
      }

      setText("#footerAddress", address);
    }

    if (whatsapp) {
      const contactWhatsApp = $("#contactWhatsApp");

      if (contactWhatsApp) {
        const number = whatsapp.replace(/[^\d]/g, "");
        contactWhatsApp.href = "https://wa.me/" + number;
        contactWhatsApp.hidden = false;
      }
    }

    setSocial("socialInstagram", setting("instagram"));
    setSocial("socialFacebook", setting("facebook"));
    setSocial("socialTikTok", setting("tiktok"));

    setSocial(
      "socialWhatsApp",
      whatsapp
        ? "https://wa.me/" + whatsapp.replace(/[^\d]/g, "")
        : ""
    );

    buildCustomMenu();
    buildFooterMenu();

    setText("#currentYear", new Date().getFullYear());
    const copyright = $("#copyrightText");
    if (copyright) copyright.textContent = setting("copyright_text", "All Rights Reserved");
    startVisualRotations();
  }

  function parseImageList(value) {
    try { const parsed = JSON.parse(value || "[]"); return Array.isArray(parsed) ? parsed.filter(Boolean) : []; }
    catch { return []; }
  }

  function startVisualRotations() {
    if (heroTimer) clearInterval(heroTimer);
    if (collectionTimer) clearInterval(collectionTimer);

    const desktopSlides = parseImageList(setting("hero_slides", "[]"));
    if (!desktopSlides.length && setting("hero_image")) desktopSlides.push(setting("hero_image"));
    const mobileSlides = parseImageList(setting("hero_mobile_slides", "[]"));
    if (!mobileSlides.length && setting("hero_mobile_image")) mobileSlides.push(setting("hero_mobile_image"));
    const hero = $("#heroImage");
    const controls = $("#heroSliderControls");
    const mobile = () => window.matchMedia("(max-width: 700px)").matches;
    let activeSlides = [];
    let lastViewport = mobile();

    const getSlides = () => mobile() && mobileSlides.length ? mobileSlides : desktopSlides;
    const setHero = index => {
      const slides = getSlides();
      if (!slides.length || !hero) return;
      activeSlides = slides;
      heroSlideIndex = ((index % slides.length) + slides.length) % slides.length;
      const nextSrc = slides[heroSlideIndex];
      // Do not fade/reassign the same image: this prevents a one-image mobile banner
      // from visibly flashing when desktop slides rotate in the background.
      if (hero.getAttribute("src") !== nextSrc) {
        hero.style.transition = "opacity .35s ease";
        hero.style.opacity = "0";
        hero.src = nextSrc;
        const reveal = () => { hero.style.opacity = "1"; };
        if (hero.complete) requestAnimationFrame(reveal);
        else hero.addEventListener("load", reveal, { once: true });
      } else {
        hero.style.opacity = "1";
      }
      hero.hidden = false;
      $("#heroPlaceholder") && ($("#heroPlaceholder").hidden = true);
      if (controls) controls.hidden = slides.length < 2 || setting("hero_slider_enabled", "1") === "0";
    };

    activeSlides = getSlides();
    if (activeSlides.length) {
      setHero(Math.min(heroSlideIndex, activeSlides.length - 1));
      const heroSection = $(".hero-section");
      if (heroSection && !heroSection.dataset.swipeReady) {
        let touchStartX = 0;
        heroSection.addEventListener("touchstart", event => { touchStartX = event.changedTouches[0]?.clientX || 0; }, { passive:true });
        heroSection.addEventListener("touchend", event => {
          const endX = event.changedTouches[0]?.clientX || 0;
          const delta = endX - touchStartX;
          if (Math.abs(delta) > 45 && getSlides().length > 1) setHero(heroSlideIndex + (delta < 0 ? 1 : -1));
        }, { passive:true });
        heroSection.dataset.swipeReady = "1";
      }
      // Both desktop and mobile use the same 10-second interval. A single image
      // never gets an autoplay timer, so it remains completely still.
      if (activeSlides.length > 1 && setting("hero_slider_enabled", "1") !== "0") {
        heroTimer = setInterval(() => setHero(heroSlideIndex + 1), 10000);
      }
      if ($("#heroPrev")) $("#heroPrev").onclick = () => setHero(heroSlideIndex - 1);
      if ($("#heroNext")) $("#heroNext").onclick = () => setHero(heroSlideIndex + 1);
    } else if (controls) {
      controls.hidden = true;
    }

    // If the visitor rotates the device or resizes across the mobile breakpoint,
    // switch to that viewport's own slide set without waiting for a timer tick.
    if (!window.__zkHeroResizeBound) {
      window.addEventListener("resize", () => {
        const nowMobile = mobile();
        if (nowMobile !== lastViewport) {
          lastViewport = nowMobile;
          startVisualRotations();
        }
      }, { passive: true });
      window.__zkHeroResizeBound = true;
    }

    const rotateCollections = () => {
      const women = products.filter(p => isActive(p) && categoryMatches(p, "Women") && productImage(p));
      const girls = products.filter(p => isActive(p) && categoryMatches(p, "Girls") && productImage(p));
      const applyCollection = (id, list, desktopKey, mobileKey, index) => {
        const img = $("#" + id);
        if (!img) return;
        const custom = mobile() ? setting(mobileKey, setting(desktopKey)) : setting(desktopKey);
        if (custom) { if (img.src !== custom) setImage(id, custom); return; }
        if (!list.length) return;
        const src = productImage(list[index % list.length]);
        if (src && img.src !== src) setImage(id, src);
      };
      const tick = Number(window.__zkfitsCollectionTick || 0);
      applyCollection("womenBanner", women, "women_banner", "women_mobile_banner", tick);
      applyCollection("girlsBanner", girls, "girls_banner", "girls_mobile_banner", tick);
      window.__zkfitsCollectionTick = tick + 1;
    };
    rotateCollections();
    collectionTimer = setInterval(rotateCollections, 5000);
    window.addEventListener("resize", () => {
      setHero(heroSlideIndex);
      rotateCollections();
      const promo = $(".brand-message");
      const promoImage = mobile() ? setting("promo_mobile_image", setting("promo_image")) : setting("promo_image");
      if (promo && promoImage) promo.style.backgroundImage = `linear-gradient(rgba(25,20,17,.42),rgba(25,20,17,.42)),url("${promoImage.replace(/["\\]/g, "")}")`;
    }, { passive: true });
  }

  function buildFooterMenu() {
    const raw = setting("footer_links");
    const nav = $("#footerMenu");
    if (!raw || !nav) return;
    let links = [];
    try { links = JSON.parse(raw); }
    catch { links = String(raw).split("\n").map(line => { const [label,url] = line.split("|"); return {label,url}; }); }
    if (!Array.isArray(links)) return;
    const valid = links.filter(item => item && String(item.label || "").trim() && String(item.url || "").trim());
    if (valid.length) nav.innerHTML = valid.map(item => `<a href="${escapeHTML(item.url)}">${escapeHTML(item.label)}</a>`).join("");
  }

  function setSocial(id, url) {
    const link = $("#" + id);
    if (!link || !url) return;

    link.href = url;
    link.hidden = false;
  }

  // Admin custom links are applied to the header only.
  // Footer links remain separately editable in the page HTML.
  // Return Policy is deliberately excluded from the header.
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
    if (!nav || !links.length) return;

    const valid = links.filter(link => {
      if (!link) return false;

      const label = String(link.label || link.title || "").trim();
      const url = String(link.url || link.href || "").trim();

      if (!label || !url) return false;

      const isReturnPolicy =
        normalise(label).includes("return policy") ||
        normalise(label).includes("returns policy") ||
        normalise(url).includes("return-policy");

      return !isReturnPolicy;
    });

    if (!valid.length) return;

    nav.innerHTML = valid.map(link => {
      const label = link.label || link.title;
      const rawUrl = String(link.url || link.href || "").trim();
      const url = rawUrl.startsWith("#") && location.pathname.endsWith("product.html")
        ? `/${rawUrl}`
        : rawUrl;
      if (/^\s*javascript:/i.test(url)) return "";
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
      normalise(product.collection).includes(normalise(filter)) ||
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

          <div class="product-card-actions">
            <a class="quick-add-button card-add-button" href="/product.html?id=${encodeURIComponent(product.id)}&action=cart" ${stock <= 0 ? 'aria-disabled="true"' : ""}>ADD TO CART</a>
            <a class="quick-add-button card-buy-button" href="/product.html?id=${encodeURIComponent(product.id)}&action=buy" ${stock <= 0 ? 'aria-disabled="true"' : ""}>BUY NOW</a>
          </div>
        </div>
      </article>
    `;
  }

  function renderProducts() {
    const activeProducts = products.filter(isActive);

    const featured = activeProducts.filter(isFeatured);

    setHTML(
      "#featuredProducts",
      featured.length
        ? featured.map(productCard).join("")
        : `<div class="empty-state"><p>Featured products will appear here soon.</p></div>`
    );

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

    setHTML(
      "#productGrid",
      filtered.length ? filtered.map(productCard).join("") : ""
    );

    const noProducts = $("#noProducts");
    if (noProducts) noProducts.hidden = filtered.length > 0;
  }

  function setHTML(selector, html) {
    const element = $(selector);
    if (element) element.innerHTML = html;
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

    setHTML("#productModalContent", `
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
    `);

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

    setText("#cartCount", count);
    setText("#cartSubtotal", money(cartSubtotal()));

    const container = $("#cartItems");
    if (!container) return;

    if (!cart.length) {
      container.innerHTML = `
        <div class="empty-cart">
          <p>Your shopping bag is empty.</p>
          <button class="button button-dark" id="continueShopping" type="button">
            CONTINUE SHOPPING
          </button>
        </div>
      `;

      const checkoutButton = $("#checkoutButton");
      if (checkoutButton) checkoutButton.disabled = true;

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

    const checkoutButton = $("#checkoutButton");
    if (checkoutButton) checkoutButton.disabled = false;
  }

  function changeCart(index, action) {
    const item = cart[index];
    if (!item) return;

    if (action === "remove") {
      cart.splice(index, 1);

    } else if (action === "minus") {
      item.quantity -= 1;

      if (item.quantity <= 0) {
        cart.splice(index, 1);
      }

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
    const drawer = $("#cartDrawer");
    const overlay = $("#drawerOverlay");

    if (!drawer || !overlay) return;

    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    overlay.classList.add("open");
    document.body.classList.add("modal-open");
  }

  function closeCart() {
    const drawer = $("#cartDrawer");
    const overlay = $("#drawerOverlay");

    if (drawer) {
      drawer.classList.remove("open");
      drawer.setAttribute("aria-hidden", "true");
    }

    if (overlay) overlay.classList.remove("open");

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

  function updatePaymentInstructions() {
    const method = $("#paymentMethod")?.value || "";
    const target = $("#paymentInstructions");
    if (!target) return;
    const instructions = {
      "Bank Transfer": setting("bank_transfer_details"),
      "Easypaisa": setting("easypaisa_account"),
      "JazzCash": setting("jazzcash_account")
    };
    const text = instructions[method] || (method === "Cash on Delivery" ? "Pay in cash when your order is delivered." : "");
    target.textContent = text;
    target.hidden = !text;
  }

  function openCheckout() {
    if (!cart.length) return;

    closeCart();

    const subtotal = cartSubtotal();
    const shipping = shippingAmount();

    setHTML("#checkoutItems", cart.map(item => `
      <div class="summary-line">
        <span>${escapeHTML(item.title)} × ${item.quantity}
          ${item.size ? " · " + escapeHTML(item.size) : ""}
          ${item.color ? " · " + escapeHTML(item.color) : ""}
        </span>
        <strong>${money(item.price * item.quantity)}</strong>
      </div>
    `).join(""));

    setText("#checkoutSubtotal", money(subtotal));
    setText("#checkoutShipping", shipping === 0 ? "Free" : money(shipping));
    setText("#checkoutTotal", money(subtotal + shipping));
    setText("#checkoutError", "");
    updatePaymentInstructions();

    showModal($("#checkoutModal"));
  }

  async function placeOrder(event) {
    event.preventDefault();

    if (isSubmitting || !cart.length) return;

    const form = $("#checkoutForm");
    if (!form || !form.reportValidity()) return;

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

    if (!button || !error) return;

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

      const orderId =
        result.order?.id || result.order_id || result.id || "";

      setText(
        "#orderReference",
        orderId ? "Order Reference: " + orderId : ""
      );

      setText(
        "#successMessage",
        result.email_sent === false
          ? "Your order has been received. We will contact you regarding your order."
          : "Thank you for shopping with ZK FITS. Your order confirmation will be sent to your email."
      );

      showModal($("#successModal"));

    } catch (err) {
      error.textContent =
        err.message || "Unable to place your order. Please try again.";

    } finally {
      isSubmitting = false;
      button.disabled = false;
      button.textContent = "PLACE ORDER";
    }
  }

  function setupFilters() {
    const filters = $("#collectionFilters");
    const sort = $("#sortProducts");
    document.querySelectorAll(".category-card[data-category]").forEach(card => {
      card.addEventListener("click", () => {
        activeFilter = card.dataset.category;
        $$(".filter-button").forEach(item => item.classList.toggle("active", item.dataset.filter === activeFilter));
        renderProducts();
      });
    });

    if (filters) {
      filters.addEventListener("click", event => {
        const button = event.target.closest("[data-filter]");
        if (!button) return;

        activeFilter = button.dataset.filter;

        $$(".filter-button").forEach(item =>
          item.classList.toggle("active", item === button)
        );

        renderProducts();
      });
    }

    if (sort) {
      sort.addEventListener("change", event => {
        activeSort = event.target.value;
        renderProducts();
      });
    }
  }

  // Mobile and desktop menu controls.
  function setupMenu() {
    const toggle = $("#menuToggle");
    const nav = $("#mainNav");
    const overlay = $("#menuOverlay");

    if (!toggle || !nav) return;

    function openMenu() {
      nav.classList.add("open");

      if (overlay) overlay.classList.add("open");

      toggle.classList.add("active");
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-label", "Close menu");

      document.body.classList.add("menu-open");
    }

    function closeMenu() {
      nav.classList.remove("open");

      if (overlay) overlay.classList.remove("open");

      toggle.classList.remove("active");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Open menu");

      document.body.classList.remove("menu-open");
    }

    function toggleMenu() {
      if (nav.classList.contains("open")) {
        closeMenu();
      } else {
        openMenu();
      }
    }

    toggle.addEventListener("click", toggleMenu);

    overlay?.addEventListener("click", closeMenu);

    nav.addEventListener("click", event => {
      if (event.target.closest("a")) {
        closeMenu();
      }
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") closeMenu();
    });

    // Ensure the menu starts closed.
    closeMenu();
  }

  function setupEvents() {
    document.addEventListener("click", event => {
      const productButton = event.target.closest("[data-product]");

      if (productButton) {
        location.href = "/product.html?id=" + encodeURIComponent(productButton.dataset.product);
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

      if (event.target.closest("#addSelectedProduct")) {
        addSelectedToCart();
        return;
      }

      if (event.target.closest("#continueShopping")) {
        closeCart();
        $("#products")?.scrollIntoView({ behavior: "smooth" });
      }
    });

    $("#cartToggle")?.addEventListener("click", openCart);
    $("#closeCart")?.addEventListener("click", closeCart);
    $("#drawerOverlay")?.addEventListener("click", closeCart);

    $("#checkoutButton")?.addEventListener("click", openCheckout);
    $("#checkoutForm")?.addEventListener("submit", placeOrder);
    $("#paymentMethod")?.addEventListener("change", updatePaymentInstructions);

    $("#closeProductModal")?.addEventListener("click", () =>
      hideModal($("#productModal"))
    );

    $("#closeCheckout")?.addEventListener("click", () =>
      hideModal($("#checkoutModal"))
    );

    $("#successContinue")?.addEventListener("click", () => {
      hideModal($("#successModal"));
      $("#home")?.scrollIntoView({ behavior: "smooth" });
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

      setHTML(
        "#featuredProducts",
        `<div class="empty-state"><h3>Unable to load collection</h3><p>Please refresh the page or try again later.</p></div>`
      );

      setHTML("#productGrid", "");

      const noProducts = $("#noProducts");
      if (noProducts) noProducts.hidden = false;

      notify("Unable to connect to the store. Please refresh.", true);
    }
  }

  function start() {
    setupEvents();
    updateCart();
    loadStore();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
