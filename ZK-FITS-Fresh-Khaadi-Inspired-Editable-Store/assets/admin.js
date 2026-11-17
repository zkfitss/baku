(() => {
  "use strict";

  const API = "/api";
  let products = [];
  let orders = [];
  let settings = {};
  let editingProductImage = "";
  let uploadedSettingsImages = {};

  const $ = (selector, root = document) => root.querySelector(selector);

  const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, char => ({
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
    notify.timer = setTimeout(() => toast.classList.remove("show"), 3500);
  }

  function setLoading(button, loading, text = "Please wait...") {
    if (!button) return;

    if (loading) {
      button.dataset.originalText = button.textContent;
      button.textContent = text;
      button.disabled = true;
    } else {
      button.textContent = button.dataset.originalText || button.textContent;
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

  document.querySelectorAll("[data-tab]").forEach(button => {
    button.addEventListener("click", () => {
      const tab = button.dataset.tab;

      document.querySelectorAll("[data-tab]").forEach(item => {
        item.classList.toggle("active", item === button);
      });

      document.querySelectorAll(".admin-main .panel").forEach(panel => {
        panel.hidden = panel.id !== tab;
      });

      const titles = {
        overview: "Overview",
        products: "Products",
        orders: "Customer Orders",
        settings: "Store Customization"
      };

      $("#pageTitle").textContent = titles[tab] || "ZK FITS";
    });
  });

  // ------------------------------------
  // LOAD ADMIN DATA
  // ------------------------------------

  async function loadAdmin() {
    try {
      const data = await api("/admin");

      products = data.products || [];
      orders = data.orders || [];
      settings = data.settings || {};

      renderProducts();
      renderOrders();
      populateSettings();
      renderStats();
    } catch (error) {
      notify(error.message, true);
    }
  }

  function renderStats() {
    $("#statProducts").textContent = products.length;
    $("#statOrders").textContent = orders.length;

    const revenue = orders
      .filter(order => order.status !== "Cancelled")
      .reduce((sum, order) => sum + Number(order.total || 0), 0);

    $("#statRevenue").textContent = money(revenue);
  }

  // ------------------------------------
  // PRODUCT LIST
  // ------------------------------------

  function renderProducts() {
    const container = $("#productList");

    if (!products.length) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No products added yet</h3>
          <p>Add your first ZK FITS product.</p>
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
          <button type="button" class="danger" data-delete="${escapeHTML(product.id)}">
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

    form.elements.id.value = product?.id || "";
    form.elements.title.value = product?.title || product?.name || "";
    form.elements.category.value = product?.category || "Women";
    form.elements.price.value = product?.price ?? "";
    form.elements.sale_price.value = product?.sale_price ?? "";
    form.elements.sizes.value = (product?.sizes || []).join(", ");
    form.elements.colors.value = (product?.colors || []).join(", ");
    form.elements.description.value = product?.description || "";
    form.elements.image.value = editingProductImage;

    form.elements.featured.checked = Boolean(product?.featured);
    form.elements.active.value = product?.active === 0 ? "0" : "1";

    $("#editorTitle").textContent = product ? "Edit Product" : "Add New Product";

    $("#productImagePreview").innerHTML = editingProductImage
      ? `<img src="${escapeHTML(editingProductImage)}" alt="Product preview">`
      : "";

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
    $("#productEditor").scrollIntoView({ behavior: "smooth" });
  }

  // ------------------------------------
  // VARIANT INVENTORY
  // ------------------------------------

  function addVariantRow(variant = {}) {
    const row = document.createElement("div");
    row.className = "variant-row";

    row.innerHTML = `
      <input
        type="text"
        class="variant-size"
        placeholder="Size e.g. S"
        value="${escapeHTML(variant.size || "")}"
      >

      <input
        type="text"
        class="variant-color"
        placeholder="Colour e.g. Black"
        value="${escapeHTML(variant.color || "")}"
      >

      <input
        type="number"
        class="variant-stock"
        min="0"
        step="1"
        placeholder="Stock"
        value="${Math.max(0, Number(variant.stock) || 0)}"
      >

      <button type="button" class="remove-variant danger" aria-label="Remove variant">
        ×
      </button>
    `;

    row.querySelector(".remove-variant").addEventListener("click", () => {
      row.remove();
    });

    $("#variantRows").appendChild(row);
  }

  $("#addVariant")?.addEventListener("click", () => {
    addVariantRow();
  });

  function collectVariants() {
    return [...document.querySelectorAll("#variantRows .variant-row")]
      .map(row => ({
        size: row.querySelector(".variant-size").value.trim(),
        color: row.querySelector(".variant-color").value.trim(),
        stock: Math.max(
          0,
          Math.floor(Number(row.querySelector(".variant-stock").value) || 0)
        )
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

  $("#productImage")?.addEventListener("change", async event => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const preview = $("#productImagePreview");
      preview.textContent = "Uploading image...";

      const url = await uploadImage(file, "products");

      editingProductImage = url;
      $("#productForm").elements.image.value = url;

      preview.innerHTML = `
        <img src="${escapeHTML(url)}" alt="Product image preview">
      `;

      notify("Product image uploaded.");
    } catch (error) {
      notify(error.message, true);
      $("#productImagePreview").textContent = "";
    }
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
      sizes: form.elements.sizes.value.split(",")
        .map(value => value.trim()).filter(Boolean),
      colors: form.elements.colors.value.split(",")
        .map(value => value.trim()).filter(Boolean),
      description: form.elements.description.value,
      image: editingProductImage,
      variants,
      stock: variants.length
        ? variants.reduce((sum, item) => sum + item.stock, 0)
        : 0,
      featured: form.elements.featured.checked,
      active: form.elements.active.value === "1"
    };

    if (!product.image) {
      notify("Please upload a product image.", true);
      return;
    }

    if (!product.title || product.price < 0) {
      notify("Please enter valid product information.", true);
      return;
    }

    setLoading(button, true, "SAVING PRODUCT...");

    try {
      await api(id ? "/products/" + encodeURIComponent(id) : "/products", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(product)
      });

      $("#productEditor").hidden = true;
      await loadAdmin();

      notify(id ? "Product updated successfully." : "Product added successfully.");
    } catch (error) {
      notify(error.message, true);
    } finally {
      setLoading(button, false);
    }
  });

  // Product edit and delete actions
  $("#productList")?.addEventListener("click", async event => {
    const editButton = event.target.closest("[data-edit]");
    const deleteButton = event.target.closest("[data-delete]");

    if (editButton) {
      const product = products.find(item => item.id === editButton.dataset.edit);
      if (product) openProductEditor(product);
    }

    if (deleteButton) {
      const id = deleteButton.dataset.delete;

      if (!confirm("Are you sure you want to delete this product?")) return;

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
      const items = Array.isArray(order.items) ? order.items : [];

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
                <span>${money(Number(item.price) * Number(item.quantity))}</span>
              </div>
            `).join("")}
          </div>

          <div class="order-status-control">
            <label>
              Order Status
              <select data-order-status="${escapeHTML(order.id)}">
                ${["Pending", "Confirmed", "Shipped", "Delivered", "Cancelled"]
                  .map(status => `
                    <option value="${status}" ${order.status === status ? "selected" : ""}>
                      ${status}
                    </option>
                  `).join("")}
              </select>
            </label>

            <button type="button" data-save-order="${escapeHTML(order.id)}">
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
      await api("/orders/" + encodeURIComponent(id), {
        method: "PUT",
        body: JSON.stringify({ status: select.value })
      });

      await loadAdmin();
      notify("Order status updated.");
    } catch (error) {
      notify(error.message, true);
    } finally {
      setLoading(button, false);
    }
  });

  // ------------------------------------
  // STORE SETTINGS
  // ------------------------------------

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
    }
  };

  function populateSettings() {
    const form = $("#settingsForm");

    for (const element of form.elements) {
      if (!element.name) continue;

      const value = settings[element.name];

      if (value === undefined) continue;

      element.value = value;
    }

    Object.entries(settingFileFields).forEach(([inputId, config]) => {
      const preview = $("#" + config.preview);
      const url = settings[config.key];

      preview.innerHTML = url
        ? `<img src="${escapeHTML(url)}" alt="Uploaded image preview">`
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
        preview.innerHTML = `
          <img src="${escapeHTML(url)}" alt="Uploaded image preview">
        `;

        notify("Website image uploaded.");
      } catch (error) {
        preview.textContent = "";
        notify(error.message, true);
      }
    });
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
  // START
  // ------------------------------------

  checkSession();
})();
