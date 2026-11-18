/* =====================================================
   ZK FITS — PRODUCT DETAIL PAGE
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

    if (Array.isArray(product.images)) {
      images.push(...product.images);
    }

    if (product.image) {
      images.unshift(product.image);
    }

    return [...new Set(images.filter(Boolean))];
  }

  function normalizeList(value) {
    const parsed = parseJSON(value, []);

    if (!Array.isArray(parsed)) return [];

    return parsed.map(item => {
      if (typeof item === "object" && item !== null) {
        return String(item.name || item.value || item.label || "");
      }

      return String(item);
    }).filter(Boolean);
  }

  function normalizeVariants(value) {
    const parsed = parseJSON(value, []);

    if (Array.isArray(parsed)) {
      return parsed.map(item => ({
        size: String(item.size || ""),
        color: String(item.color || item.colour || ""),
        stock: Math.max(0, Number(item.stock || 0))
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
    const variant = getAvailableVariant();

    if (state.variants.length) {
      return variant ? variant.stock : 0;
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
    document.title =
      `${product.title || product.name || "Product"} | ZK FITS`;

    const description =
      product.description || "Discover your outfit at ZK FITS.";

    const meta = document.querySelector('meta[name="description"]');

    if (meta) {
      meta.setAttribute("content", description.slice(0, 155));
    }

    if ($("breadcrumbProduct")) {
      $("breadcrumbProduct").textContent =
        product.title || product.name || "Product";
    }
  }

  /* =========================================
     MOBILE AND DESKTOP MENU
     ========================================= */

  function setupMenu() {
    const toggle = $("menuToggle");
    const nav = $("mainNav");
    const overlay = $("menuOverlay");

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
    image.alt = state.product?.name || "ZK FITS product";

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

    const parts = [];

    if (state.sizes.length) {
      parts.push(`
        <div class="variant-group">
          <label class="variant-label">Select Size</label>

          <div class="variant-options">
            ${state.sizes.map(size => {
              const unavailable = state.variants.length &&
                !state.variants.some(v =>
                  v.size === size &&
                  (!state.selectedColor || v.color === state.selectedColor) &&
                  v.stock > 0
                );

              return `
                <button
                  type="button"
                  class="variant-option ${state.selectedSize === size ? "selected" : ""}"
                  data-size="${escapeHTML(size)}"
                  ${unavailable ? "disabled" : ""}>
                  ${escapeHTML(size)}
                </button>
              `;
            }).join("")}
          </div>
        </div>
      `);
    }

    if (state.colors.length) {
      parts.push(`
        <div class="variant-group">
          <label class="variant-label">Select Colour</label>

          <div class="variant-options">
            ${state.colors.map(color => {
              const unavailable = state.variants.length &&
                !state.variants.some(v =>
                  v.color === color &&
                  (!state.selectedSize || v.size === state.selectedSize) &&
                  v.stock > 0
                );

              return `
                <button
                  type="button"
                  class="variant-option ${state.selectedColor === color ? "selected" : ""}"
                  data-color="${escapeHTML(color)}"
                  ${unavailable ? "disabled" : ""}>
                  ${escapeHTML(color)}
                </button>
              `;
            }).join("")}
          </div>
        </div>
      `);
    }

    container.innerHTML = parts.join("");

    container.querySelectorAll("[data-size]").forEach(button => {
      button.addEventListener("click", () => {
        state.selectedSize = button.dataset.size;
        updateVariantUI();
      });
    });

    container.querySelectorAll("[data-color]").forEach(button => {
      button.addEventListener("click", () => {
        state.selectedColor = button.dataset.color;
        updateVariantUI();
      });
    });

    updateAvailability();
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
      if (!hasSelection) {
        availability.textContent =
          "Please select your size and colour.";

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

    const disabled = !hasSelection || stock <= 0;

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
        : "Please contact ZK FITS for return and exchange information.";

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

  /* =========================================
     RENDER PRODUCT PAGE
     ========================================= */

  function renderProduct(product) {
    state.product = product;
    state.images = getProductImages(product);
    state.imageIndex = 0;
    state.sizes = normalizeList(product.sizes);
    state.colors = normalizeList(product.colors);
    state.variants = normalizeVariants(product.variants);
    state.selectedSize = "";
    state.selectedColor = "";
    state.quantity = 1;

    updateDocumentDetails(product);

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
        product.description ||
        "Please contact us for further product details.";
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
      console.error("ZK FITS product loading error:", error);
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

    if (
      (state.sizes.length && !state.selectedSize) ||
      (state.colors.length && !state.selectedColor)
    ) {
      showToast("Please select size and colour first.");
      return false;
    }

    if (state.quantity > stock) {
      showToast("Selected quantity is not available.");
      return false;
    }

    const cart = readCart();
    const size = state.selectedSize;
    const color = state.selectedColor;

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
        image: product.image || state.images[0] || "",
        qty: state.quantity,
        quantity: state.quantity,
        size,
        color,
        stock,
        variant: { size, color, stock }
      });
    }

    saveCart(cart);

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
    if (!addProductToCart()) return;

    openExistingCart();

    $("checkoutButton")?.click();
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
      console.error("ZK FITS reviews loading error:", error);

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
        console.error("ZK FITS review submission error:", error);

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
     GALLERY CONTROLS
     ========================================= */

  function setupGallery() {
    $("galleryPrev")?.addEventListener("click", () => {
      moveGallery(-1);
    });

    $("galleryNext")?.addEventListener("click", () => {
      moveGallery(1);
    });
  }

  /* =========================================
     SHARE PRODUCT
     ========================================= */

  function setupShareButton() {
    $("shareProductButton")?.addEventListener("click", async () => {
      const product = state.product;
      if (!product) return;

      const shareData = {
        title: product.title || product.name || "ZK FITS",
        text: product.description ||
          "Discover this product at ZK FITS.",
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
     INITIALISE PAGE
     ========================================= */

  function init() {
    setupMenu();
    setupQuantityControls();
    setupPurchaseButtons();
    setupGallery();
    setupShareButton();
    setupReviewForm();

    loadStore();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
