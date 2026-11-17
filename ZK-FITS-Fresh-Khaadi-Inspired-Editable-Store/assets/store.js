const $ = selector => document.querySelector(selector);

let products = [];
let cart = [];
let settings = {};

const money = amount =>
  "PKR " + Number(amount || 0).toLocaleString("en-PK");

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function safeUrl(value) {
  const url = String(value || "").trim();

  if (/^(https?:\/\/|\/)/i.test(url)) return url;

  return "";
}

async function api(path, options = {}) {
  const response = await fetch("/api/" + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "Request failed");
  }

  return response.json();
}

function productPrice(product) {
  return Number(product.sale_price || product.price || 0);
}

function productImage(product) {
  return safeUrl(product.image) ||
    "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=700&q=80";
}

function productCard(product) {
  const id = esc(product.id);
  const image = esc(productImage(product));
  const title = esc(product.title || product.name);
  const price = productPrice(product);
  const oldPrice = Number(product.sale_price)
    ? `<span class="old-price">${money(product.price)}</span>`
    : "";

  return `
    <article class="product-card">
      <div class="product-image" data-details="${id}" role="button" tabindex="0">
        <img src="${image}" alt="${title}" loading="lazy">
      </div>

      <div class="product-info">
        <h3 data-details="${id}" role="button" tabindex="0">${title}</h3>
        <p>${money(price)} ${oldPrice}</p>

        <button type="button" data-add="${id}">
          ADD TO BAG
        </button>
      </div>
    </article>
  `;
}

// PRODUCT DETAILS MODAL
function createDetailsModal() {
  if ($("#productDetailsModal")) return;

  document.body.insertAdjacentHTML("beforeend", `
    <div id="productDetailsModal" class="product-details-modal">
      <div class="product-details-box">
        <button type="button" id="closeProductDetails" class="details-close">×</button>
        <div id="productDetailsContent"></div>
      </div>
    </div>
  `);

  $("#closeProductDetails").onclick = closeProductDetails;

  $("#productDetailsModal").addEventListener("click", event => {
    if (event.target.id === "productDetailsModal") {
      closeProductDetails();
    }
  });
}

function openProductDetails(id) {
  const product = products.find(item => item.id === id);
  if (!product) return;

  createDetailsModal();

  const sizes = Array.isArray(product.sizes) ? product.sizes : [];
  const colors = Array.isArray(product.colors) ? product.colors : [];

  $("#productDetailsContent").innerHTML = `
    <div class="details-layout">
      <div class="details-image">
        <img src="${esc(productImage(product))}" alt="${esc(product.title)}">
      </div>

      <div class="details-info">
        <p class="details-category">${esc(product.category)}</p>
        <h2>${esc(product.title || product.name)}</h2>

        <p class="details-price">
          ${money(productPrice(product))}
          ${Number(product.sale_price)
            ? `<span class="old-price">${money(product.price)}</span>`
            : ""}
        </p>

        <p>${esc(product.description || "Discover this beautiful ZK FITS collection piece.")}</p>

        ${sizes.length ? `
          <label>Choose Size</label>
          <select id="detailSize">
            <option value="">Select size</option>
            ${sizes.map(size => `<option value="${esc(size)}">${esc(size)}</option>`).join("")}
          </select>
        ` : ""}

        ${colors.length ? `
          <label>Choose Color</label>
          <select id="detailColor">
            <option value="">Select color</option>
            ${colors.map(color => `<option value="${esc(color)}">${esc(color)}</option>`).join("")}
          </select>
        ` : ""}

        <p>Available Stock: ${Number(product.stock || 0)}</p>

        <button type="button" id="detailAddToCart">
          ADD TO BAG
        </button>
      </div>
    </div>
  `;

  $("#detailAddToCart").onclick = () => {
    const size = $("#detailSize")?.value || "";
    const color = $("#detailColor")?.value || "";

    if (sizes.length && !size) {
      alert("Please select a size.");
      return;
    }

    if (colors.length && !color) {
      alert("Please select a color.");
      return;
    }

    addToCart(id, size, color);
    closeProductDetails();
  };

  $("#productDetailsModal").classList.add("show");
}

function closeProductDetails() {
  $("#productDetailsModal")?.classList.remove("show");
}

// CART
function addToCart(id, size = "", color = "") {
  const product = products.find(item => item.id === id);
  if (!product) return;

  const existing = cart.find(item =>
    item.id === id &&
    item.size === size &&
    item.color === color
  );

  const quantityInCart = cart
    .filter(item => item.id === id)
    .reduce((sum, item) => sum + item.quantity, 0);

  if (quantityInCart >= Number(product.stock || 0)) {
    alert("Sorry, this product is out of stock.");
    return;
  }

  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({
      id,
      title: product.title || product.name,
      price: productPrice(product),
      image: productImage(product),
      quantity: 1,
      size,
      color
    });
  }

  renderCart();
  openCart();
}

function renderCart() {
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);

  if ($("#cartCount")) {
    $("#cartCount").textContent = count;
  }

  if (!$("#cartItems")) return;

  $("#cartItems").innerHTML = cart.map((item, index) => `
    <div class="cart-line">
      <img src="${esc(item.image)}" alt="${esc(item.title)}">

      <div class="cart-line-info">
        <b>${esc(item.title)}</b>
        <p>${money(item.price)}</p>

        ${item.size ? `<small>Size: ${esc(item.size)}</small>` : ""}
        ${item.color ? `<small>Color: ${esc(item.color)}</small>` : ""}

        <div class="quantity-controls">
          <button type="button" data-minus="${index}">−</button>
          <span>${item.quantity}</span>
          <button type="button" data-plus="${index}">+</button>
        </div>

        <button type="button" class="remove-cart" data-remove="${index}">
          Remove
        </button>
      </div>
    </div>
  `).join("") || "<p>Your bag is empty.</p>";

  const subtotal = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  const threshold = Number(settings.free_shipping_threshold ?? 5000);
  const shippingFee = Number(settings.shipping_fee ?? 250);
  const shipping = subtotal >= threshold ? 0 : shippingFee;

  if ($("#cartTotal")) {
    $("#cartTotal").textContent = money(subtotal + shipping);
  }

  if ($("#cartShipping")) {
    $("#cartShipping").textContent = money(shipping);
  }
}

function changeQuantity(index, amount) {
  const item = cart[index];
  if (!item) return;

  const product = products.find(p => p.id === item.id);
  const currentQuantity = cart
    .filter(p => p.id === item.id)
    .reduce((sum, p) => sum + p.quantity, 0);

  if (amount > 0 && product && currentQuantity >= Number(product.stock || 0)) {
    alert("No more stock available.");
    return;
  }

  item.quantity += amount;

  if (item.quantity <= 0) {
    cart.splice(index, 1);
  }

  renderCart();
}

function openCart() {
  $("#cart")?.classList.add("open");
  $("#overlay")?.classList.add("show");
}

function closePanels() {
  $("#cart")?.classList.remove("open");
  $("#overlay")?.classList.remove("show");
  $("#checkoutModal")?.classList.remove("show");
}

$("#cartItems")?.addEventListener("click", event => {
  const plus = event.target.closest("[data-plus]");
  const minus = event.target.closest("[data-minus]");
  const remove = event.target.closest("[data-remove]");

  if (plus) changeQuantity(Number(plus.dataset.plus), 1);
  if (minus) changeQuantity(Number(minus.dataset.minus), -1);

  if (remove) {
    cart.splice(Number(remove.dataset.remove), 1);
    renderCart();
  }
});

// PRODUCT CARD CLICKS
document.addEventListener("click", event => {
  const addButton = event.target.closest("[data-add]");
  const detailsButton = event.target.closest("[data-details]");

  if (addButton) {
    addToCart(addButton.dataset.add);
  } else if (detailsButton) {
    openProductDetails(detailsButton.dataset.details);
  }
});

document.addEventListener("keydown", event => {
  if (
    (event.key === "Enter" || event.key === " ") &&
    event.target.matches("[data-details]")
  ) {
    event.preventDefault();
    openProductDetails(event.target.dataset.details);
  }
});

// HEADER MENU
$("#menuBtn")?.addEventListener("click", () => {
  $("#mainNav")?.classList.toggle("open");
});

$("#mainNav")?.querySelectorAll("a").forEach(link => {
  link.addEventListener("click", () => {
    $("#mainNav")?.classList.remove("open");
  });
});

// CART BUTTONS
$("#closeCart")?.addEventListener("click", closePanels);
$("#overlay")?.addEventListener("click", closePanels);

$("#cart")?.addEventListener("click", event => {
  if (event.target.closest("#checkoutBtn")) {
    if (!cart.length) {
      alert("Your bag is empty.");
      return;
    }

    $("#checkoutModal")?.classList.add("show");
  }
});

$("#closeCheckout")?.addEventListener("click", () => {
  $("#checkoutModal")?.classList.remove("show");
});

// CHECKOUT
$("#checkoutForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (!cart.length) {
    alert("Your bag is empty.");
    return;
  }

  const form = new FormData(event.target);
  const payload = Object.fromEntries(form);

  payload.items = cart.map(item => ({
    id: item.id,
    quantity: item.quantity,
    size: item.size,
    color: item.color
  }));

  const button = event.target.querySelector('[type="submit"]');
  if (button) button.disabled = true;

  try {
    const result = await api("orders", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    alert(
      "Thank you for shopping with ZK FITS!\n" +
      "Your order number is: " + result.id +
      "\nTotal: " + money(result.total)
    );

    cart = [];
    renderCart();
    closePanels();
    event.target.reset();

    await loadStore();
  } catch (error) {
    alert("Order could not be placed: " + error.message);
  } finally {
    if (button) button.disabled = false;
  }
});

// SETTINGS AND HOMEPAGE
function applySettings() {
  if ($("#announcement")) {
    $("#announcement").textContent = settings.announcement || "";
  }

  if ($("#heroTitle")) {
    $("#heroTitle").textContent =
      settings.hero_title || "Dress beautifully. Feel confident.";
  }

  if ($("#heroSubtitle")) {
    $("#heroSubtitle").textContent =
      settings.hero_subtitle || "";
  }

  if (settings.hero_image && $("#hero")) {
    $("#hero").style.setProperty(
      "--hero-image",
      `url("${safeUrl(settings.hero_image)}")`
    );
  }

  if (settings.logo && $("#logo")) {
    $("#logo").src = safeUrl(settings.logo);
    $("#logo").hidden = false;

    if ($("#brandText")) {
      $("#brandText").hidden = true;
    }
  }

  if ($("#footerText")) {
    $("#footerText").textContent = settings.footer_text || "";
  }

  if (settings.whatsapp && $("#waCta")) {
    $("#waCta").href = safeUrl(settings.whatsapp);
  }

  // CATEGORY BANNERS
  const womenTile = $(".women-tile");
  const girlsTile = $(".girls-tile");

  if (womenTile && settings.women_banner) {
    womenTile.style.backgroundImage =
      `url("${safeUrl(settings.women_banner)}")`;
  }

  if (girlsTile && settings.girls_banner) {
    girlsTile.style.backgroundImage =
      `url("${safeUrl(settings.girls_banner)}")`;
  }

  // EDITORIAL BANNER
  const editorial = $(".editorial-art");

  if (editorial && settings.editorial_image) {
    editorial.style.backgroundImage =
      `url("${safeUrl(settings.editorial_image)}")`;
  }

  const editorialTitle = $("#editorialTitle");
  const editorialText = $("#editorialText");

  if (editorialTitle && settings.editorial_title) {
    editorialTitle.textContent = settings.editorial_title;
  }

  if (editorialText && settings.editorial_text) {
    editorialText.textContent = settings.editorial_text;
  }

  // CUSTOM MENU LABELS
  const menuLabels = [
    ["menu_new_arrivals", "New Arrivals"],
    ["menu_women", "Women"],
    ["menu_girls", "Girls"],
    ["menu_featured", "Featured"],
    ["menu_contact", "Contact"]
  ];

  const menuLinks = $("#mainNav")?.querySelectorAll("a") || [];

  menuLabels.forEach(([key, fallback], index) => {
    if (menuLinks[index]) {
      menuLinks[index].textContent = settings[key] || fallback;
    }
  });

  // SOCIAL LINKS
  const socials = $("#socials");

  if (socials) {
    const socialItems = [
      ["Instagram", settings.instagram],
      ["Facebook", settings.facebook],
      ["TikTok", settings.tiktok],
      ["WhatsApp", settings.whatsapp_social || settings.whatsapp]
    ];

    socials.innerHTML = socialItems
      .filter(([, url]) => safeUrl(url))
      .map(([name, url]) => `
        <a href="${esc(safeUrl(url))}" target="_blank" rel="noopener">
          ${name}
        </a>
      `).join("");
  }

  // CONTACT DETAILS
  const contactPhone = $("#contactPhone");
  const contactEmail = $("#contactEmail");
  const contactAddress = $("#contactAddress");
  const contactHeading = $("#contactHeading");
  const contactDescription = $("#contactDescription");

  if (contactPhone) {
    contactPhone.textContent = settings.contact_phone || "";
  }

  if (contactEmail) {
    contactEmail.textContent = settings.contact_email || "";
  }

  if (contactAddress) {
    contactAddress.textContent = settings.contact_address || "";
  }

  if (contactHeading) {
    contactHeading.textContent = settings.contact_heading || "Contact Us";
  }

  if (contactDescription) {
    contactDescription.textContent = settings.contact_description || "";
  }
}

function renderProducts() {
  const newGrid = $("#newGrid");
  const womenGrid = $("#womenGrid");
  const girlsGrid = $("#girlsGrid");
  const featuredGrid = $("#featuredGrid");

  if (newGrid) {
    newGrid.innerHTML = products.slice(0, 8).map(productCard).join("") ||
      '<div class="empty">New arrivals coming soon.</div>';
  }

  if (womenGrid) {
    womenGrid.innerHTML = products
      .filter(p => p.category === "Women")
      .map(productCard).join("") ||
      '<div class="empty">Women collection coming soon.</div>';
  }

  if (girlsGrid) {
    girlsGrid.innerHTML = products
      .filter(p => ["Girls", "Kids"].includes(p.category))
      .map(productCard).join("") ||
      '<div class="empty">Girls collection coming soon.</div>';
  }

  if (featuredGrid) {
    featuredGrid.innerHTML = products
      .filter(p => Number(p.featured) === 1 || p.featured === true)
      .map(productCard).join("") ||
      '<div class="empty">Featured pieces coming soon.</div>';
  }
}

async function loadStore() {
  try {
    const data = await api("store");

    products = data.products || [];
    settings = data.settings || {};

    applySettings();
    renderProducts();
    renderCart();
  } catch (error) {
    console.error("Store loading error:", error);
  }
}

// INITIALIZE
if ($("#year")) {
  $("#year").textContent = new Date().getFullYear();
}

createDetailsModal();
loadStore();
