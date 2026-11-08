
"use strict";

// =====================================================
// 1. CẤU HÌNH API
// =====================================================

const API_BASE = "http://127.0.0.1:8080/api";

const PRODUCT_API = `${API_BASE}/products`;
const AUTH_API = `${API_BASE}/auth`;

// =====================================================
// 2. BIẾN TOÀN CỤC
// =====================================================

let productList = [];
let filteredProducts = [];

let currentPage = 1;
let pageSize = 10;

let currentUser = null;
let isSaving = false;

// =====================================================
// 3. DANH MỤC SẢN PHẨM
// =====================================================

const categoryNames = {
    nail_polish: "Sơn móng",
    nail_care: "Chăm sóc móng",
    skincare: "Chăm sóc da",
    makeup: "Trang điểm",
    lipstick: "Son môi",
    haircare: "Chăm sóc tóc",
    cosmetics: "Mỹ phẩm",
    perfume: "Nước hoa",
    tools: "Dụng cụ làm đẹp",
    accessories: "Phụ kiện",
    other: "Khác"
};

// =====================================================
// 4. HÀM LẤY PHẦN TỬ HTML
// =====================================================

const $ = (id) => document.getElementById(id);

function normalizeProductCategory(category) {
    if (category === "hair_care") return "haircare";

    return category || "other";
}

// =====================================================
// 5. ESCAPE HTML
// =====================================================

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return entities[character];
    });
}

// =====================================================
// 6. ĐỊNH DẠNG TIỀN TỆ
// =====================================================

function formatCurrency(value) {
    const price = Number(value) || 0;

    return new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND"
    }).format(price);
}

// =====================================================
// 7. ĐỊNH DẠNG NGÀY
// =====================================================

function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "—";
    }

    return date.toLocaleDateString("vi-VN");
}

// =====================================================
// 8. HIỂN THỊ THÔNG BÁO
// =====================================================

function showProductMessage(message, type = "success") {
    const messageElement = $("productMessage");

    if (!messageElement) {
        console.log(message);
        return;
    }

    messageElement.textContent = message;
    messageElement.className = `product-message ${type}`;
    messageElement.style.display = "block";

    window.clearTimeout(showProductMessage.timeout);

    showProductMessage.timeout = window.setTimeout(() => {
        messageElement.style.display = "none";
    }, 4000);
}

// =====================================================
// 9. GỌI API CHUNG
// =====================================================

async function fetchAPI(url, options = {}) {
    const headers = {
        "Accept": "application/json",
        ...(options.headers || {})
    };

    if (options.body && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
        ...options,
        headers,
        credentials: "include"
    });

    if (response.status === 401) {
        window.location.replace("login.html");
        throw new Error("SESSION_EXPIRED");
    }

    const responseText = await response.text();

    let result = null;

    if (responseText) {
        try {
            result = JSON.parse(responseText);
        } catch {
            result = responseText;
        }
    }

    if (!response.ok) {
        const message =
            typeof result === "object" && result !== null
                ? result.message || result.error
                : result;

        throw new Error(
            message || `Yêu cầu thất bại. HTTP ${response.status}`
        );
    }

    return result;
}

// =====================================================
// 10. KIỂM TRA ĐĂNG NHẬP
// =====================================================

async function checkAuthentication() {
    try {
        const result = await fetchAPI(`${AUTH_API}/me`);

        if (!result || !result.success || !result.user) {
            window.location.replace("login.html");
            return false;
        }

        currentUser = result.user;

        if (
            result.mustChangePassword === true ||
            currentUser.mustChangePassword === true
        ) {
            window.location.replace("change-password.html");
            return false;
        }

        updateUserProfile();

        return true;

    } catch (error) {
        if (error.message !== "SESSION_EXPIRED") {
            console.error("Lỗi xác thực:", error);
            window.location.replace("login.html");
        }

        return false;
    }
}

// =====================================================
// 11. CẬP NHẬT THÔNG TIN NGƯỜI DÙNG
// =====================================================

function updateUserProfile() {
    if (!currentUser) return;

    const fullName =
        currentUser.fullName ||
        currentUser.username ||
        "Người dùng";

    const role = currentUser.role || "Nhân viên";

    const nameElements = [
        "currentUserName",
        "dropdownUserName",
        "dialogUserName"
    ];

    const roleElements = [
        "currentUserRole",
        "dropdownUserRole",
        "dialogUserRole"
    ];

    nameElements.forEach(id => {
        const element = $(id);

        if (element) {
            element.textContent = fullName;
        }
    });

    roleElements.forEach(id => {
        const element = $(id);

        if (element) {
            element.textContent = role;
        }
    });

    const usernameElement = $("dialogUsername");
    const employeeElement = $("dialogEmployeeId");
    const branchElement = $("dialogBranchId");

    if (usernameElement) {
        usernameElement.textContent = currentUser.username || "—";
    }

    if (employeeElement) {
        employeeElement.textContent = currentUser.employeeId || "—";
    }

    if (branchElement) {
        branchElement.textContent = currentUser.branchId || "—";
    }
}

// =====================================================
// 12. LẤY DANH SÁCH SẢN PHẨM
// =====================================================

async function loadProductList() {
    try {
        const result = await fetchAPI(PRODUCT_API);

        let products = [];

        if (Array.isArray(result)) {
            products = result;
        } else if (result && Array.isArray(result.products)) {
            products = result.products;
        } else if (result && Array.isArray(result.data)) {
            products = result.data;
        } else if (result && Array.isArray(result.rows)) {
            products = result.rows;
        }

        // Chỉ lấy document có type = product
        productList = products.filter(product => {
            return product && product.type === "product";
        }).map(product => ({
            ...product,
            category: normalizeProductCategory(product.category)
        }));

        // Sắp xếp theo mã sản phẩm
        productList.sort((a, b) => {
            return String(a.product_id || "").localeCompare(
                String(b.product_id || ""),
                "vi"
            );
        });

        filteredProducts = [...productList];

        currentPage = 1;

        renderProductStatistics();
        renderProductList();

    } catch (error) {
        if (error.message === "SESSION_EXPIRED") return;

        console.error("Lỗi tải sản phẩm:", error);

        productList = [];
        filteredProducts = [];

        renderProductStatistics();
        renderProductList();

        showProductMessage(
            "Không thể tải danh sách sản phẩm. Hãy kiểm tra Backend.",
            "error"
        );
    }
}

// =====================================================
// 13. THỐNG KÊ SẢN PHẨM
// =====================================================

function renderProductStatistics() {
    const total = productList.length;

    const active = productList.filter(product => {
        return String(product.status || "active").toLowerCase() === "active";
    }).length;

    const inactive = total - active;

    const lowStock = productList.filter(product => {
        return Number(product.stock || 0) <= 5;
    }).length;

    if ($("totalProducts")) {
        $("totalProducts").textContent = total;
    }

    if ($("activeProducts")) {
        $("activeProducts").textContent = active;
    }

    if ($("inactiveProducts")) {
        $("inactiveProducts").textContent = inactive;
    }

    if ($("lowStockProducts")) {
        $("lowStockProducts").textContent = lowStock;
    }

    renderProductCategoryStatistics();
}

// =====================================================
// 14. THỐNG KÊ DANH MỤC
// =====================================================

function renderProductCategoryStatistics() {
    const categoryElement = $("productCategoryList");

    const categories = {};

    productList.forEach(product => {
        const category = product.category || "other";

        categories[category] = (categories[category] || 0) + 1;
    });

    const categoryCount = Object.keys(categories).length;

    if ($("categoryTotal")) {
        $("categoryTotal").textContent = categoryCount;
    }

    if (!categoryElement) return;

    if (categoryCount === 0) {
        categoryElement.innerHTML = `
            <div class="empty-category">
                Chưa có dữ liệu danh mục
            </div>
        `;

        return;
    }

    categoryElement.innerHTML = Object.entries(categories)
        .sort((a, b) => b[1] - a[1])
        .map(([category, count]) => {
            const name = categoryNames[category] || category;
            const percentage = productList.length > 0
                ? (count / productList.length) * 100
                : 0;

            return `
                <div class="category-stat-item">
                    <div class="category-stat-info">
                        <span>${escapeHTML(name)}</span>
                        <strong>${count}</strong>
                    </div>

                    <div class="category-progress">
                        <div
                            class="category-progress-bar"
                            style="width: ${percentage}%">
                        </div>
                    </div>
                </div>
            `;
        }).join("");
}

// =====================================================
// 15. HIỂN THỊ DANH SÁCH SẢN PHẨM
// =====================================================

function renderProductList() {
    const tableBody = $("productsTableBody");
    const canManageProducts = ["admin", "manager"].includes(
        String(currentUser?.role || "").toLowerCase()
    );

    if (!tableBody) return;

    if (filteredProducts.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-table">
                    Không tìm thấy sản phẩm
                </td>
            </tr>
        `;

        updatePagination();
        return;
    }

    const startIndex = (currentPage - 1) * pageSize;

    const pageProducts = filteredProducts.slice(
        startIndex,
        startIndex + pageSize
    );

    tableBody.innerHTML = pageProducts.map(product => {
        const documentId = product._id || "";
        const revision = product._rev || "";

        const productCode = product.product_id || documentId;
        const productName = product.name || "Chưa có tên";

        const category = product.category || "other";
        const categoryName = categoryNames[category] || category;

        const price = Number(product.price || 0);
        const stock = Number(product.stock || 0);

        const status = String(
            product.status || "active"
        ).toLowerCase();

        const isActive = status === "active";

        const statusHTML = isActive
            ? `<span class="status-badge active">Đang kinh doanh</span>`
            : `<span class="status-badge inactive">Ngừng kinh doanh</span>`;

        const stockClass = stock <= 5
            ? "stock-low"
            : "stock-normal";

        return `
            <tr>
                <td>
                    <span class="product-code">
                        ${escapeHTML(productCode)}
                    </span>
                </td>

                <td>
                    <div class="product-name">
                        ${escapeHTML(productName)}
                    </div>
                </td>

                <td>
                    ${escapeHTML(categoryName)}
                </td>

                <td>
                    <strong>${formatCurrency(price)}</strong>
                </td>

                <td>
                    <span class="${stockClass}">
                        ${stock}
                    </span>
                </td>

                <td>
                    ${statusHTML}
                </td>

                <td>
                    <div class="product-actions">
                        ${canManageProducts ? `
                            <button
                                type="button"
                                class="btn-edit"
                                data-action="edit"
                                data-id="${escapeHTML(documentId)}"
                                title="Sửa sản phẩm">
                                Sửa
                            </button>

                            <button
                                type="button"
                                class="btn-stop"
                                data-action="stop"
                                data-id="${escapeHTML(documentId)}"
                                data-rev="${escapeHTML(revision)}"
                                ${!isActive ? "disabled" : ""}
                                title="Ngừng kinh doanh">
                                Ngừng KD
                            </button>

                            <button
                                type="button"
                                class="btn-delete"
                                data-action="delete"
                                data-id="${escapeHTML(documentId)}"
                                data-rev="${escapeHTML(revision)}"
                                title="Xóa document khỏi CouchDB">
                                Xóa
                            </button>
                        ` : `<span class="read-only-label">Chỉ xem</span>`}
                    </div>
                </td>
            </tr>
        `;
    }).join("");

    updatePagination();
}

// =====================================================
// 16. PHÂN TRANG
// =====================================================

function updatePagination() {
    const total = filteredProducts.length;

    const totalPages = Math.max(
        1,
        Math.ceil(total / pageSize)
    );

    if (currentPage > totalPages) {
        currentPage = totalPages;
    }

    const start = total === 0
        ? 0
        : (currentPage - 1) * pageSize + 1;

    const end = Math.min(
        currentPage * pageSize,
        total
    );

    if ($("paginationStart")) {
        $("paginationStart").textContent = start;
    }

    if ($("paginationEnd")) {
        $("paginationEnd").textContent = end;
    }

    if ($("paginationTotal")) {
        $("paginationTotal").textContent = total;
    }

    if ($("prevPageButton")) {
        $("prevPageButton").disabled = currentPage <= 1;
    }

    if ($("nextPageButton")) {
        $("nextPageButton").disabled = currentPage >= totalPages;
    }

    const numbersElement = $("paginationNumbers");

    if (numbersElement) {
        let html = "";

        for (let page = 1; page <= totalPages; page++) {
            html += `
                <button
                    type="button"
                    class="pagination-number ${page === currentPage ? "active" : ""}"
                    data-page="${page}">
                    ${page}
                </button>
            `;
        }

        numbersElement.innerHTML = html;
    }
}

// =====================================================
// 17. CHUYỂN TRANG
// =====================================================

function changePage(page) {
    const totalPages = Math.max(
        1,
        Math.ceil(filteredProducts.length / pageSize)
    );

    if (page < 1 || page > totalPages) return;

    currentPage = page;

    renderProductList();
}

// =====================================================
// 18. TÌM KIẾM SẢN PHẨM
// =====================================================

function searchProducts(keyword) {
    const normalizedKeyword = String(keyword || "")
        .trim()
        .toLowerCase();

    const categoryFilter = $("filterCategory")?.value || "all";
    const statusFilter = $("filterStatus")?.value || "all";
    const stockFilter = $("filterStock")?.value || "all";

    filteredProducts = productList.filter(product => {
        const category = String(product.category || "other").toLowerCase();
        const status = String(product.status || "active").toLowerCase();
        const stock = Number(product.stock || 0);
        const categoryName = String(categoryNames[category] || "").toLowerCase();

        const matchesKeyword = !normalizedKeyword || [
            product.name,
            product._id,
            product.product_id,
            category,
            categoryName
        ].some(value => String(value || "").toLowerCase().includes(normalizedKeyword));

        const matchesCategory = categoryFilter === "all" || category === categoryFilter;
        const matchesStatus = statusFilter === "all" || status === statusFilter;
        const matchesStock = stockFilter === "all" ||
            (stockFilter === "low" && stock >= 1 && stock <= 5) ||
            (stockFilter === "normal" && stock > 5) ||
            (stockFilter === "out" && stock === 0);

        return matchesKeyword && matchesCategory && matchesStatus && matchesStock;
    });

    currentPage = 1;

    renderProductList();
}

// =====================================================
// 19. MỞ FORM THÊM SẢN PHẨM
// =====================================================

function openCreateProductForm() {
    const formCard = $("productFormCard");
    const form = $("productForm");

    if (!formCard || !form) return;

    form.reset();

    if ($("productDocId")) {
        $("productDocId").value = "";
    }

    if ($("productRevision")) {
        $("productRevision").value = "";
    }

    if ($("productCode")) {
        $("productCode").value = "Tự động tạo";
    }

    if ($("productStatus")) {
        $("productStatus").value = "active";
    }

    const title = $("formTitle");

    if (title) {
        title.textContent = "Thêm sản phẩm";
    }

    const saveButton = $("saveProductButton");

    if (saveButton) {
        saveButton.textContent = "Thêm sản phẩm";
    }

    formCard.hidden = false;
    formCard.style.display = "block";

    formCard.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

// =====================================================
// 20. ĐÓNG FORM
// =====================================================

function closeProductForm() {
    const formCard = $("productFormCard");

    if (formCard) {
        formCard.hidden = true;
        formCard.style.display = "none";
    }

    const form = $("productForm");

    if (form) {
        form.reset();
    }
}

// =====================================================
// 21. MỞ FORM SỬA SẢN PHẨM
// =====================================================

function editProduct(documentId) {
    const product = productList.find(item => {
        return item._id === documentId;
    });

    if (!product) {
        showProductMessage(
            "Không tìm thấy sản phẩm cần sửa.",
            "error"
        );

        return;
    }

    const formCard = $("productFormCard");

    if (!formCard) return;

    $("productDocId").value = product._id || "";
    $("productRevision").value = product._rev || "";
    $("productCode").value = product.product_id || "";

    $("productName").value = product.name || "";
    $("productCategory").value = product.category || "other";
    $("productPrice").value = product.price ?? 0;
    $("productStock").value = product.stock ?? 0;
    $("productStatus").value = product.status || "active";

    const title = $("formTitle");

    if (title) {
        title.textContent = "Cập nhật sản phẩm";
    }

    const saveButton = $("saveProductButton");

    if (saveButton) {
        saveButton.textContent = "Lưu thay đổi";
    }

    formCard.hidden = false;
    formCard.style.display = "block";

    formCard.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

// =====================================================
// 22. LƯU SẢN PHẨM
// =====================================================

async function saveProduct() {
    if (isSaving) return;

    const documentId = $("productDocId")?.value.trim() || "";
    const revision = $("productRevision")?.value.trim() || "";

    const name = $("productName")?.value.trim() || "";
    const category = $("productCategory")?.value || "other";

    const price = Number($("productPrice")?.value);
    const stock = Number($("productStock")?.value);

    const status = $("productStatus")?.value || "active";

    // Kiểm tra dữ liệu
    if (!name) {
        showProductMessage("Vui lòng nhập tên sản phẩm.", "error");
        return;
    }

    if (!Number.isFinite(price) || price < 0) {
        showProductMessage("Giá sản phẩm không hợp lệ.", "error");
        return;
    }

    if (
        !Number.isInteger(stock) ||
        stock < 0
    ) {
        showProductMessage("Số lượng tồn kho phải là số nguyên không âm.", "error");
        return;
    }

    if (documentId && !revision) {
        showProductMessage(
            "Thiếu revision của sản phẩm. Hãy tải lại danh sách.",
            "error"
        );

        return;
    }

    const requestData = {
        name,
        category,
        price,
        stock,
        status
    };

    // Khi cập nhật cần gửi _rev
    if (documentId) {
        requestData._rev = revision;
    }

    isSaving = true;

    const saveButton = $("saveProductButton");

    if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = "Đang lưu...";
    }

    try {
        if (documentId) {
            // CẬP NHẬT
            await fetchAPI(`${PRODUCT_API}/${encodeURIComponent(documentId)}`, {
                method: "PUT",
                body: JSON.stringify(requestData)
            });

            showProductMessage(
                "Cập nhật sản phẩm thành công.",
                "success"
            );

        } else {
            // THÊM MỚI
            await fetchAPI(PRODUCT_API, {
                method: "POST",
                body: JSON.stringify(requestData)
            });

            showProductMessage(
                "Thêm sản phẩm thành công.",
                "success"
            );
        }

        closeProductForm();

        await loadProductList();

    } catch (error) {
        if (error.message === "SESSION_EXPIRED") return;

        console.error("Lỗi lưu sản phẩm:", error);

        showProductMessage(
            error.message || "Không thể lưu sản phẩm.",
            "error"
        );

    } finally {
        isSaving = false;

        if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent = documentId
                ? "Lưu thay đổi"
                : "Thêm sản phẩm";
        }
    }
}

// =====================================================
// 23. NGỪNG KINH DOANH SẢN PHẨM
// =====================================================

async function stopProduct(documentId, revision) {
    const product = productList.find(item => {
        return item._id === documentId;
    });

    if (!product) {
        showProductMessage("Không tìm thấy sản phẩm.", "error");
        return;
    }

    if (product.status !== "active") {
        showProductMessage(
            "Sản phẩm này đã ngừng kinh doanh.",
            "error"
        );

        return;
    }

    const confirmed = window.confirm(
        `Bạn có chắc muốn ngừng kinh doanh sản phẩm "${product.name}" không?\n\n` +
        "Document vẫn được giữ lại trong CouchDB."
    );

    if (!confirmed) return;

    try {
        const requestData = {
            _rev: revision,
            name: product.name,
            category: product.category,
            price: product.price,
            stock: product.stock,
            status: "inactive"
        };

        await fetchAPI(`${PRODUCT_API}/${encodeURIComponent(documentId)}`, {
            method: "PUT",
            body: JSON.stringify(requestData)
        });

        showProductMessage(
            "Đã ngừng kinh doanh sản phẩm. Document vẫn còn trong CouchDB.",
            "success"
        );

        await loadProductList();

    } catch (error) {
        if (error.message === "SESSION_EXPIRED") return;

        console.error("Lỗi ngừng kinh doanh:", error);

        showProductMessage(
            error.message || "Không thể ngừng kinh doanh sản phẩm.",
            "error"
        );
    }
}

// =====================================================
// 24. XÓA DOCUMENT KHỎI COUCHDB
// =====================================================

async function deleteProduct(documentId, revision) {
    const product = productList.find(item => {
        return item._id === documentId;
    });

    if (!product) {
        showProductMessage("Không tìm thấy sản phẩm.", "error");
        return;
    }

    const confirmed = window.confirm(
        `Bạn có chắc muốn xóa sản phẩm "${product.name}" không?\n\n` +
        "Thao tác này gửi DELETE đến CouchDB. Document sẽ bị đánh dấu xóa (tombstone) và không còn xuất hiện trong danh sách thông thường."
    );

    if (!confirmed) return;

    try {
        await fetchAPI(
            `${PRODUCT_API}/${encodeURIComponent(documentId)}?rev=${encodeURIComponent(revision)}`,
            {
                method: "DELETE"
            }
        );

        showProductMessage(
            "Đã gửi yêu cầu xóa document sản phẩm khỏi CouchDB.",
            "success"
        );

        await loadProductList();

    } catch (error) {
        if (error.message === "SESSION_EXPIRED") return;

        console.error("Lỗi xóa sản phẩm:", error);

        showProductMessage(
            error.message || "Không thể xóa sản phẩm.",
            "error"
        );
    }
}

// =====================================================
// 25. SAO LƯU SẢN PHẨM JSON
// =====================================================

async function backupProducts() {
    try {
        const result = await fetchAPI(`${PRODUCT_API}/backup`);

        const products = Array.isArray(result)
            ? result
            : result.products || [];

        const backupData = {
            database: "beauty_shop",
            type: "product_backup",
            backup_time: new Date().toISOString(),
            total: products.length,
            products
        };

        const json = JSON.stringify(
            backupData,
            null,
            4
        );

        const blob = new Blob(
            [json],
            { type: "application/json;charset=utf-8" }
        );

        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");

        link.href = url;

        link.download =
            `beautyshop-products-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;

        document.body.appendChild(link);

        link.click();

        link.remove();

        URL.revokeObjectURL(url);

        showProductMessage(
            `Sao lưu thành công ${products.length} sản phẩm.`,
            "success"
        );

    } catch (error) {
        if (error.message === "SESSION_EXPIRED") return;

        console.error("Lỗi sao lưu:", error);

        showProductMessage(
            error.message || "Không thể sao lưu sản phẩm.",
            "error"
        );
    }
}

// =====================================================
// 26. GẮN SỰ KIỆN CHO BẢNG SẢN PHẨM
// =====================================================

function initializeProductTableEvents() {
    const tableBody = $("productsTableBody");

    if (!tableBody) return;

    tableBody.addEventListener("click", async event => {
        const button = event.target.closest("button[data-action]");

        if (!button) return;

        const action = button.dataset.action;
        const documentId = button.dataset.id;
        const revision = button.dataset.rev;

        if (!documentId) return;

        if (action === "edit") {
            editProduct(documentId);
            return;
        }

        if (!revision) {
            showProductMessage(
                "Không tìm thấy revision của sản phẩm.",
                "error"
            );

            return;
        }

        if (action === "stop") {
            await stopProduct(documentId, revision);
        }

        if (action === "delete") {
            await deleteProduct(documentId, revision);
        }
    });
}

// =====================================================
// 27. KHỞI TẠO CÁC SỰ KIỆN TRANG
// =====================================================

function initializeProductEvents() {

    // Tìm kiếm trên thanh header
    const searchInput = $("globalSearch");

    if (searchInput) {
        searchInput.addEventListener("input", event => {
            const productSearchInput = $("productSearchInput");
            if (productSearchInput) {
                productSearchInput.value = event.target.value;
            }
            searchProducts(event.target.value);
        });
    }

    // Tìm kiếm trong bộ lọc sản phẩm
    const productSearchInput = $("productSearchInput");
    const productSearchButton = $("searchProductButton");

    if (productSearchInput) {
        productSearchInput.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                event.preventDefault();
                searchProducts(productSearchInput.value);
            }
        });

        productSearchInput.addEventListener("input", event => {
            if (!event.target.value.trim()) {
                searchProducts("");
            }
        });
    }

    if (productSearchButton && productSearchInput) {
        productSearchButton.addEventListener("click", () => {
            searchProducts(productSearchInput.value);
        });
    }

    // Tải lại danh sách
    const refreshButton = $("refreshProductsButton");

    if (refreshButton) {
        refreshButton.addEventListener("click", () => {
            loadProductList();
        });
    }

    // Mở form thêm
    const addButton = $("newProductButton");

    if (addButton) {
        addButton.addEventListener("click", () => {
            openCreateProductForm();
        });
    }

    // Đóng form
    const cancelButton = $("cancelProductButton");

    if (cancelButton) {
        cancelButton.addEventListener("click", () => {
            closeProductForm();
        });
    }

    // Lưu sản phẩm
    const productForm = $("productForm");

    if (productForm) {
        productForm.addEventListener("submit", event => {
            event.preventDefault();
            saveProduct();
        });
    }

    const resetFiltersButton = $("resetProductFilters");

    if (resetFiltersButton) {
        resetFiltersButton.addEventListener("click", () => {
            if ($("productSearchInput")) $("productSearchInput").value = "";
            if ($("globalSearch")) $("globalSearch").value = "";
            if ($("filterCategory")) $("filterCategory").value = "all";
            if ($("filterStatus")) $("filterStatus").value = "active";
            if ($("filterStock")) $("filterStock").value = "all";
            searchProducts("");
        });
    }

    // Sao lưu
    const backupButton = $("backupProductsButton");

    if (backupButton) {
        backupButton.addEventListener("click", () => {
            backupProducts();
        });
    }

    // Sự kiện bảng sản phẩm
    initializeProductTableEvents();

    // Chọn số lượng hiển thị
    const pageSizeSelect = $("pageSize");

    if (pageSizeSelect) {
        pageSizeSelect.addEventListener("change", event => {
            const newSize = Number(event.target.value);

            if (!Number.isInteger(newSize) || newSize <= 0) {
                return;
            }

            pageSize = newSize;
            currentPage = 1;

            renderProductList();
        });
    }

    // Trang trước
    const prevButton = $("prevPageButton");

    if (prevButton) {
        prevButton.addEventListener("click", () => {
            changePage(currentPage - 1);
        });
    }

    // Trang tiếp theo
    const nextButton = $("nextPageButton");

    if (nextButton) {
        nextButton.addEventListener("click", () => {
            changePage(currentPage + 1);
        });
    }

    // Chọn trang cụ thể
    const paginationNumbers = $("paginationNumbers");

    if (paginationNumbers) {
        paginationNumbers.addEventListener("click", event => {
            const button = event.target.closest("button[data-page]");

            if (!button) return;

            changePage(Number(button.dataset.page));
        });
    }
}

// =====================================================
// 28. KHỞI ĐỘNG TRANG
// =====================================================

document.addEventListener("DOMContentLoaded", async () => {
    initializeProductEvents();

    const authenticated = await checkAuthentication();

    if (!authenticated) return;

    const canManageProducts = ["admin", "manager"].includes(
        String(currentUser?.role || "").toLowerCase()
    );

    $("newProductButton").hidden = !canManageProducts;
    $("backupProductsButton").hidden = !canManageProducts;

    await loadProductList();
});
