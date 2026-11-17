const $ = selector => document.querySelector(selector);

let allProducts = [];
let allOrders = [];

async function api(path, options = {}) {
  const response = await fetch("/api/" + path, {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "Request failed");
  }

  return response.json();
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function showDash() {
  $("#login").hidden = true;
  $("#dashboard").hidden = false;
  loadAll();
}

$("#loginForm").onsubmit = async event => {
  event.preventDefault();

  try {
    await api("login", {
      method: "POST",
      body: JSON.stringify({
        password: $("#password").value
      })
    });

    showDash();
  } catch (error) {
    $("#loginError").textContent =
      "Login failed. Check your admin password.";
  }
};

async function checkSession() {
  try {
    await api("me");
    showDash();
  } catch (error) {
    // Admin login is required.
  }
}

checkSession();

// DASHBOARD TABS
document.querySelectorAll("[data-tab]").forEach(button => {
  button.onclick = () => {
    document.querySelectorAll("[data-tab]").forEach(item =>
      item.classList.remove("active")
    );

    button.classList.add("active");

    document.querySelectorAll(".panel").forEach(panel => {
      panel.hidden = true;
    });

    const panel = $("#" + button.dataset.tab);
    if (panel) panel.hidden = false;

    $("#pageTitle").textContent = button.textContent;
  };
});

// LOGOUT
$("#logout").onclick = async () => {
  try {
    await api("logout", { method: "POST" });
  } finally {
    location.reload();
  }
};

// LOAD DASHBOARD DATA
async function loadAll() {
  try {
    const data = await api("admin");

    allProducts = data.products || [];
    allOrders = data.orders || [];

    $("#statProducts").textContent = allProducts.length;
    $("#statOrders").textContent = allOrders.length;

    const revenue = allOrders
      .filter(order => order.status !== "Cancelled")
      .reduce((sum, order) => sum + Number(order.total || 0), 0);

    $("#statRevenue").textContent =
      "PKR " + revenue.toLocaleString("en-PK");

    renderProducts();
    renderOrders();
    fillSettings(data.settings || {});
  } catch (error) {
    console.error(error);
    alert("Dashboard data could not be loaded: " + error.message);
  }
}

// PRODUCT LIST
function renderProducts() {
  $("#productList").innerHTML = allProducts.map(product => `
    <div class="item-row">
      <span>
        <b>${esc(product.title)}</b><br>
        <small>
          ${esc(product.category)} ·
          PKR ${Number(product.sale_price || product.price).toLocaleString("en-PK")}
          · Stock ${Number(product.stock || 0)}
        </small>
      </span>

      <span>
        <button onclick="editProduct(${JSON.stringify(product.id)})">
          Edit
        </button>

        <button onclick="deleteProduct(${JSON.stringify(product.id)})">
          Delete
        </button>
      </span>
    </div>
  `).join("") || "<p>No products yet. Add your first product.</p>";
}

// ORDERS LIST
function renderOrders() {
  $("#orderList").innerHTML = allOrders.map(order => `
    <div class="order-row">
      <span>
        <b>#${esc(order.id)}</b> · ${esc(order.customer_name)}
        <br>
        ${esc(order.phone)} · PKR ${Number(order.total || 0).toLocaleString("en-PK")}
        <br>
        <small>
          ${esc(order.payment_method || order.payment)}
          · ${esc(order.created_at)}
        </small>
        <br>
        <small>${esc(order.address)}</small>
      </span>

      <span>
        <select onchange="updateStatus(${JSON.stringify(order.id)}, this.value)">
          ${["Pending", "Confirmed", "Shipped", "Delivered", "Cancelled"]
            .map(status => `
              <option value="${status}"
                ${order.status === status ? "selected" : ""}>
                ${status}
              </option>
            `).join("")}
        </select>
      </span>
    </div>
  `).join("") || "<p>No orders yet.</p>";
}

// PRODUCT EDITOR
$("#addProduct").onclick = () => openEditor();

$("#cancelProduct").onclick = () => {
  $("#productEditor").hidden = true;
};

function openEditor(product = {}) {
  const form = $("#productForm");

  form.reset();

  form.elements.id.value = product.id || "";

  [
    "title",
    "category",
    "price",
    "sale_price",
    "stock",
    "image",
    "description"
  ].forEach(key => {
    if (form.elements[key]) {
      form.elements[key].value = product[key] ?? "";
    }
  });

  form.elements.sizes.value = Array.isArray(product.sizes)
    ? product.sizes.join(", ")
    : product.sizes || "";

  form.elements.colors.value = Array.isArray(product.colors)
    ? product.colors.join(", ")
    : product.colors || "";

  form.elements.featured.checked = !!product.featured;
  form.elements.active.checked = product.active !== false &&
    Number(product.active) !== 0;

  $("#editorTitle").textContent = product.id
    ? "Edit Product"
    : "Add Product";

  $("#productEditor").hidden = false;
  $("#productEditor").scrollIntoView({ behavior: "smooth" });
}

window.editProduct = id => {
  const product = allProducts.find(item => item.id === id);
  if (product) openEditor(product);
};

// DELETE PRODUCT
window.deleteProduct = async id => {
  if (!confirm("Are you sure you want to delete this product?")) return;

  try {
    await api("products/" + encodeURIComponent(id), {
      method: "DELETE"
    });

    await loadAll();
  } catch (error) {
    alert("Could not delete product: " + error.message);
  }
};

// UPLOAD IMAGE TO R2
async function uploadImage(file, folder) {
  if (!file) return "";

  const form = new FormData();
  form.append("file", file);
  form.append("folder", folder);

  const result = await api("upload", {
    method: "POST",
    body: form
  });

  return result.url;
}

// SAVE PRODUCT
$("#productForm").onsubmit = async event => {
  event.preventDefault();

  const form = event.target;
  const formData = new FormData(form);
  const product = Object.fromEntries(formData);

  product.featured = form.elements.featured.checked ? 1 : 0;
  product.active = form.elements.active.checked ? 1 : 0;

  product.sizes = String(product.sizes || "")
    .split(",").map(value => value.trim()).filter(Boolean);

  product.colors = String(product.colors || "")
    .split(",").map(value => value.trim()).filter(Boolean);

  try {
    const file = $("#productImage")?.files?.[0];

    if (file) {
      product.image = await uploadImage(file, "products");
    }

    const id = product.id;
    delete product.id;

    await api(
      "products" + (id ? "/" + encodeURIComponent(id) : ""),
      {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(product)
      }
    );

    $("#productEditor").hidden = true;
    await loadAll();

    alert("Product saved successfully!");
  } catch (error) {
    alert("Could not save product: " + error.message);
  }
};

// STORE SETTINGS
function fillSettings(settings) {
  const form = $("#settingsForm");
  if (!form) return;

  for (const [key, value] of Object.entries(settings)) {
    if (form.elements[key]) {
      form.elements[key].value = value ?? "";
    }
  }
}

// SAVE SETTINGS AND OPTIONAL IMAGE UPLOADS
$("#settingsForm").onsubmit = async event => {
  event.preventDefault();

  const form = event.target;
  const settings = Object.fromEntries(new FormData(form));

  try {
    const uploadInputs = form.querySelectorAll("[data-upload-setting]");

    for (const input of uploadInputs) {
      const file = input.files?.[0];
      if (!file) continue;

      const settingName = input.dataset.uploadSetting;
      const folder = input.dataset.uploadFolder || "store";

      settings[settingName] = await uploadImage(file, folder);

      const urlInput = form.elements[settingName];
      if (urlInput) urlInput.value = settings[settingName];
    }

    await api("settings", {
      method: "PUT",
      body: JSON.stringify(settings)
    });

    alert("Store settings saved successfully!");
  } catch (error) {
    alert("Could not save settings: " + error.message);
  }
};

// UPDATE ORDER STATUS
window.updateStatus = async (id, status) => {
  try {
    await api("orders/" + encodeURIComponent(id), {
      method: "PUT",
      body: JSON.stringify({ status })
    });

    await loadAll();
  } catch (error) {
    alert("Could not update order: " + error.message);
  }
};
