"use strict";
// ============================================
// HÀM CHUYỂN ĐỔI HTML AN TOÀN
// ============================================

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (char) {
        const htmlEntities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return htmlEntities[char];
    });
}
// =====================================================
// 1. CẤU HÌNH API
// =====================================================

const CUSTOMER_API_URL = "http://127.0.0.1:8080/api/customers";
const AUTH_ME_URL = "http://127.0.0.1:8080/api/auth/me";

// Dữ liệu khách hàng hiện tại.
let customerList = [];
let currentCustomerRole = "staff";

// Phân trang.
let currentPage = 1;
let pageSize = 10;

// =====================================================
// 2. DOM ELEMENTS
// =====================================================

const customerElements = {
    tableBody: document.getElementById("customersTableBody"),

    customerCount: document.getElementById("customerCount"),
    totalPoints: document.getElementById("totalPoints"),
    goldCount: document.getElementById("goldCount"),

    search: document.getElementById("customerSearch"),
    globalSearch: document.getElementById("globalSearch"),
    membershipFilter: document.getElementById("membershipFilter"),

    refreshButton: document.getElementById("refreshCustomersButton"),
    backupButton: document.getElementById("backupCustomersButton"),
    newButton: document.getElementById("newCustomerButton"),

    formCard: document.getElementById("customerFormCard"),
    form: document.getElementById("customerForm"),
    formTitle: document.getElementById("formTitle"),

    docId: document.getElementById("customerDocId"),
    revision: document.getElementById("customerRevision"),

    name: document.getElementById("customerName"),
    phone: document.getElementById("customerPhone"),
    email: document.getElementById("customerEmail"),
    membership: document.getElementById("customerMembership"),

    saveButton: document.getElementById("saveCustomerButton"),
    cancelButton: document.getElementById("cancelCustomerButton"),
    cancelFormButton: document.getElementById("cancelCustomerFormButton"),

    message: document.getElementById("customerMessage"),

    paginationStart: document.getElementById("paginationStart"),
    paginationEnd: document.getElementById("paginationEnd"),
    paginationTotal: document.getElementById("paginationTotal"),

    pageSizeSelect: document.getElementById("pageSize"),
    prevPageButton: document.getElementById("prevPageButton"),
    nextPageButton: document.getElementById("nextPageButton"),
    paginationNumbers: document.getElementById("paginationNumbers")
};

// =====================================================
// 3. KHỞI TẠO TRANG
// =====================================================

document.addEventListener("DOMContentLoaded", initializeCustomerPage);

async function initializeCustomerPage() {
    const currentYear = document.getElementById("currentYear");

    if (currentYear) {
        currentYear.textContent = new Date().getFullYear();
    }

    registerCustomerEvents();

    const authenticated = await checkCustomerAuthentication();

    if (!authenticated) {
        return;
    }

    if (customerElements.backupButton) {
        customerElements.backupButton.hidden = currentCustomerRole === "staff";
    }

    await loadCustomers();
}

// =====================================================
// 4. KIỂM TRA ĐĂNG NHẬP
// =====================================================

async function checkCustomerAuthentication() {
    try {
        const response = await fetch(AUTH_ME_URL, {
            method: "GET",
            credentials: "include"
        });

        if (!response.ok) {
            window.location.href = "login.html";
            return false;
        }

        const data = await response.json();

        if (!data.success || !data.user) {
            window.location.href = "login.html";
            return false;
        }

        currentCustomerRole = String(data.user.role || "staff")
            .replace(/^ROLE_/i, "")
            .toLowerCase();

        return true;

    } catch (error) {
        console.error("Lỗi kiểm tra đăng nhập:", error);

        showCustomerMessage(
            "Không thể kết nối máy chủ xác thực.",
            "error"
        );

        return false;
    }
}

// =====================================================
// 5. HÀM GỌI API
// =====================================================

async function customerFetch(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });

    const contentType = response.headers.get("content-type") || "";

    let data = null;

    if (contentType.includes("application/json")) {
        data = await response.json();
    } else {
        data = await response.text();
    }

    if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
            window.location.href = "login.html";
        }

        const message =
            typeof data === "object" && data !== null
                ? data.message || "Có lỗi xảy ra khi xử lý yêu cầu."
                : data || "Có lỗi xảy ra khi xử lý yêu cầu.";

        throw new Error(message);
    }

    return data;
}

// =====================================================
// 6. ĐĂNG KÝ SỰ KIỆN
// =====================================================

function registerCustomerEvents() {

    // Mở form thêm khách hàng.
    customerElements.newButton?.addEventListener(
        "click",
        openCreateCustomerForm
    );

    // Đóng form.
    customerElements.cancelButton?.addEventListener(
        "click",
        closeCustomerForm
    );

    customerElements.cancelFormButton?.addEventListener(
        "click",
        closeCustomerForm
    );

    // Submit form.
    customerElements.form?.addEventListener(
        "submit",
        saveCustomer
    );

    // Tìm kiếm.
    customerElements.search?.addEventListener(
        "input",
        handleCustomerSearch
    );

    customerElements.globalSearch?.addEventListener(
        "input",
        handleGlobalSearch
    );

    // Lọc hạng thành viên.
    customerElements.membershipFilter?.addEventListener(
        "change",
        handleCustomerFilter
    );

    // Làm mới.
    customerElements.refreshButton?.addEventListener(
        "click",
        loadCustomers
    );

    // Sao lưu.
    customerElements.backupButton?.addEventListener(
        "click",
        backupCustomers
    );

    // Thay đổi số dòng mỗi trang.
    customerElements.pageSizeSelect?.addEventListener(
        "change",
        function () {
            pageSize = Number(this.value) || 10;
            currentPage = 1;
            renderCustomers();
        }
    );

    // Trang trước.
    customerElements.prevPageButton?.addEventListener(
        "click",
        function () {
            if (currentPage > 1) {
                currentPage--;
                renderCustomers();
            }
        }
    );

    // Trang tiếp theo.
    customerElements.nextPageButton?.addEventListener(
        "click",
        function () {
            const totalPages = getTotalPages();

            if (currentPage < totalPages) {
                currentPage++;
                renderCustomers();
            }
        }
    );

    // Sự kiện sửa/xóa trên bảng.
    customerElements.tableBody?.addEventListener(
        "click",
        handleCustomerTableAction
    );
}

// =====================================================
// 7. TẢI DANH SÁCH KHÁCH HÀNG
// =====================================================

async function loadCustomers() {
    const refreshButton = customerElements.refreshButton;

    try {
        showCustomerMessage(
            "Đang tải danh sách khách hàng...",
            "info"
        );

        if (refreshButton) {
            refreshButton.disabled = true;
            refreshButton.classList.add("loading");
        }

        const data = await customerFetch(CUSTOMER_API_URL);

        if (!Array.isArray(data)) {
            throw new Error("Dữ liệu khách hàng trả về không hợp lệ.");
        }

        customerList = data.filter(
            customer => customer.type === "customer"
        );

        currentPage = 1;

        updateCustomerStatistics();
        renderCustomers();

        hideCustomerMessage();

    } catch (error) {
        console.error("Lỗi tải khách hàng:", error);

        customerElements.tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="table-error">
                    ${escapeCustomerHTML(error.message)}
                </td>
            </tr>
        `;

        showCustomerMessage(error.message, "error");

    } finally {
        if (refreshButton) {
            refreshButton.disabled = false;
            refreshButton.classList.remove("loading");
        }
    }
}

// =====================================================
// 8. THỐNG KÊ KHÁCH HÀNG
// =====================================================

function updateCustomerStatistics() {
    const totalCustomers = customerList.length;

    const totalPoints = customerList.reduce(
        (total, customer) => {
            return total + (Number(customer.points) || 0);
        },
        0
    );

    const totalGold = customerList.filter(
        customer =>
            normalizeMembership(customer.membership) === "gold"
    ).length;

    customerElements.customerCount.textContent =
        totalCustomers.toLocaleString("vi-VN");

    customerElements.totalPoints.textContent =
        totalPoints.toLocaleString("vi-VN");

    customerElements.goldCount.textContent =
        totalGold.toLocaleString("vi-VN");
}

// =====================================================
// 9. CHUẨN HÓA HẠNG THÀNH VIÊN
// =====================================================

function normalizeMembership(value) {
    const membership = String(value || "")
        .trim()
        .toLowerCase();

    const validMemberships = [
        "standard",
        "silver",
        "gold",
        "platinum"
    ];

    return validMemberships.includes(membership)
        ? membership
        : "standard";
}

const membershipMinimumPoints = {
    standard: 0,
    silver: 500,
    gold: 1000,
    platinum: 2000
};

function membershipForPoints(points) {
    if (points >= membershipMinimumPoints.platinum) return "platinum";
    if (points >= membershipMinimumPoints.gold) return "gold";
    if (points >= membershipMinimumPoints.silver) return "silver";
    return "standard";
}

function setEligibleMembershipOptions(points) {
    Array.from(customerElements.membership.options).forEach(option => {
        option.disabled = points < membershipMinimumPoints[option.value];
    });
}

function membershipName(value) {
    const names = {
        standard: "Standard",
        silver: "Silver",
        gold: "Gold",
        platinum: "Platinum"
    };

    return names[normalizeMembership(value)];
}

function membershipClass(value) {
    return normalizeMembership(value);
}

// =====================================================
// 10. LỌC VÀ TÌM KIẾM
// =====================================================

function handleCustomerSearch() {
    currentPage = 1;
    renderCustomers();
}

function handleGlobalSearch() {
    if (customerElements.search) {
        customerElements.search.value =
            customerElements.globalSearch.value;
    }

    currentPage = 1;
    renderCustomers();
}

function handleCustomerFilter() {
    currentPage = 1;
    renderCustomers();
}

function getFilteredCustomers() {
    const keyword = (
        customerElements.search?.value || ""
    ).trim().toLowerCase();

    const membership =
        customerElements.membershipFilter?.value || "";

    return customerList.filter(customer => {

        const customerCode = String(
            customer.customer_id || customer._id || ""
        ).toLowerCase();

        const customerName = String(
            customer.full_name || ""
        ).toLowerCase();

        const phone = String(
            customer.phone || ""
        ).toLowerCase();

        const email = String(
            customer.email || ""
        ).toLowerCase();

        const matchesKeyword =
            !keyword ||
            customerCode.includes(keyword) ||
            customerName.includes(keyword) ||
            phone.includes(keyword) ||
            email.includes(keyword);

        const matchesMembership =
            !membership ||
            normalizeMembership(customer.membership) === membership;

        return matchesKeyword && matchesMembership;
    });
}

// =====================================================
// 11. HIỂN THỊ DANH SÁCH
// =====================================================

function renderCustomers() {
    const filteredCustomers = getFilteredCustomers();

    const totalItems = filteredCustomers.length;
    const totalPages = Math.max(
        1,
        Math.ceil(totalItems / pageSize)
    );

    if (currentPage > totalPages) {
        currentPage = totalPages;
    }

    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(
        startIndex + pageSize,
        totalItems
    );

    const currentCustomers = filteredCustomers.slice(
        startIndex,
        endIndex
    );

    if (currentCustomers.length === 0) {
        customerElements.tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="table-empty">
                    Không tìm thấy khách hàng phù hợp.
                </td>
            </tr>
        `;
    } else {
        customerElements.tableBody.innerHTML =
            currentCustomers.map(renderCustomerRow).join("");
    }

    updatePagination(totalItems, startIndex, endIndex);
}

// =====================================================
// 12. TẠO HTML MỘT DÒNG KHÁCH HÀNG
// =====================================================

function renderCustomerRow(customer) {
    const id = String(customer._id || "");

    const customerCode =
        customer.customer_id || id || "N/A";

    const fullName =
        customer.full_name || "Chưa cập nhật";

    const phone =
        customer.phone || "Chưa cập nhật";

    const email =
        customer.email || "Chưa cập nhật";

    const points = Number(customer.points) || 0;

    const membership = normalizeMembership(
        customer.membership
    );

    return `
        <tr>
            <td>
                <span class="customer-code">
                    ${escapeCustomerHTML(customerCode)}
                </span>
            </td>

            <td>
                <span class="customer-name">
                    ${escapeCustomerHTML(fullName)}
                </span>
            </td>

            <td>
                ${escapeCustomerHTML(phone)}
            </td>

            <td>
                <span class="customer-email">
                    ${escapeCustomerHTML(email)}
                </span>
            </td>

            <td>
                <span class="membership-badge ${membership}">
                    ${membershipName(membership)}
                </span>
            </td>

            <td>
                <span class="customer-points">
                    ${points.toLocaleString("vi-VN")}
                </span>
            </td>

            <!-- CHỈ CÓ MỘT THẺ TD CHO CỘT THAO TÁC -->
            <td>
                <div class="customer-actions">

                    <button
                        type="button"
                        class="customer-action-btn btn-edit"
                        data-action="edit"
                        data-id="${escapeCustomerHTML(id)}">
                        ✎ Sửa
                    </button>

                    ${["admin", "manager"].includes(currentCustomerRole) ? `
                        <button
                            type="button"
                            class="customer-action-btn btn-delete"
                            data-action="delete"
                            data-id="${escapeCustomerHTML(id)}">
                            ✕ Xóa
                        </button>
                    ` : ""}

                </div>
            </td>
        </tr>
    `;
}

// =====================================================
// 13. XỬ LÝ NÚT SỬA VÀ XÓA
// =====================================================

function handleCustomerTableAction(event) {
    const button = event.target.closest(
        "button[data-action]"
    );

    if (!button) {
        return;
    }

    const action = button.dataset.action;
    const id = button.dataset.id;

    if (!id) {
        return;
    }

    if (action === "edit") {
        editCustomer(id);
    }

    if (action === "delete") {
        deleteCustomer(id);
    }
}

// =====================================================
// 14. MỞ FORM THÊM KHÁCH HÀNG
// =====================================================

function openCreateCustomerForm() {
    resetCustomerForm();
    customerElements.membership.disabled = true;

    customerElements.formTitle.textContent =
        "Thêm khách hàng mới";

    customerElements.saveButton.textContent =
        "Lưu khách hàng";

    customerElements.formCard.hidden = false;

    customerElements.name.focus();

    customerElements.formCard.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

// =====================================================
// 15. MỞ FORM SỬA KHÁCH HÀNG
// =====================================================

async function editCustomer(id) {
    try {
        const customer = await customerFetch(
            `${CUSTOMER_API_URL}/${encodeURIComponent(id)}`
        );

        if (customer.type !== "customer") {
            throw new Error("Dữ liệu không phải khách hàng.");
        }

        customerElements.docId.value =
            customer._id || "";

        customerElements.revision.value =
            customer._rev || "";

        customerElements.name.value =
            customer.full_name || "";

        customerElements.phone.value =
            customer.phone || "";

        customerElements.email.value =
            customer.email || "";

        const points = Math.max(0, Number(customer.points) || 0);
        setEligibleMembershipOptions(points);
        customerElements.membership.disabled = false;
        const currentMembership = normalizeMembership(customer.membership);
        customerElements.membership.value =
            points >= membershipMinimumPoints[currentMembership]
                ? currentMembership
                : membershipForPoints(points);

        customerElements.formTitle.textContent =
            "Cập nhật thông tin khách hàng";

        customerElements.saveButton.textContent =
            "Cập nhật khách hàng";

        customerElements.formCard.hidden = false;

        customerElements.formCard.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

    } catch (error) {
        console.error("Lỗi lấy thông tin khách hàng:", error);
        showCustomerMessage(error.message, "error");
    }
}

// =====================================================
// 16. LƯU KHÁCH HÀNG
// =====================================================

async function saveCustomer(event) {
    event.preventDefault();

    const id = customerElements.docId.value.trim();

    const fullName = customerElements.name.value.trim();
    const phone = customerElements.phone.value.trim();
    const email = customerElements.email.value.trim();

    const membership = id
        ? normalizeMembership(customerElements.membership.value)
        : "standard";

    if (!fullName) {
        showCustomerMessage(
            "Vui lòng nhập họ và tên khách hàng.",
            "error"
        );
        customerElements.name.focus();
        return;
    }

    if (!phone) {
        showCustomerMessage(
            "Vui lòng nhập số điện thoại.",
            "error"
        );
        customerElements.phone.focus();
        return;
    }

    const normalizedPhone = phone.replace(/[\s().-]/g, "");

    if (!/^(?:0\d{9}|\+84\d{9})$/.test(normalizedPhone)) {
        showCustomerMessage(
            "Số điện thoại phải có 10 số bắt đầu bằng 0 hoặc mã +84 và 9 số.",
            "error"
        );
        customerElements.phone.focus();
        return;
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showCustomerMessage(
            "Địa chỉ email không đúng định dạng.",
            "error"
        );
        customerElements.email.focus();
        return;
    }

    const validMemberships = [
        "standard",
        "silver",
        "gold",
        "platinum"
    ];

    if (!validMemberships.includes(membership)) {
        showCustomerMessage(
            "Hạng thành viên không hợp lệ.",
            "error"
        );
        return;
    }

    const customerData = {
        full_name: fullName,
        phone: phone,
        email: email,
        membership: membership
    };

    const isEditing = Boolean(id);

    const url = isEditing
        ? `${CUSTOMER_API_URL}/${encodeURIComponent(id)}`
        : CUSTOMER_API_URL;

    const method = isEditing ? "PUT" : "POST";

    try {
        customerElements.saveButton.disabled = true;

        customerElements.saveButton.textContent =
            isEditing ? "Đang cập nhật..." : "Đang lưu...";

        const result = await customerFetch(url, {
            method: method,
            body: JSON.stringify(customerData)
        });

        showCustomerMessage(
            result.message ||
                (isEditing
                    ? "Cập nhật khách hàng thành công."
                    : "Thêm khách hàng thành công."),
            "success"
        );

        closeCustomerForm();

        await loadCustomers();

    } catch (error) {
        console.error("Lỗi lưu khách hàng:", error);

        showCustomerMessage(error.message, "error");

    } finally {
        customerElements.saveButton.disabled = false;

        customerElements.saveButton.textContent =
            customerElements.docId.value
                ? "Cập nhật khách hàng"
                : "Lưu khách hàng";
    }
}

// =====================================================
// 17. XÓA KHÁCH HÀNG
// =====================================================

async function deleteCustomer(id) {
    const customer = customerList.find(
        item => item._id === id
    );

    if (!customer) {
        showCustomerMessage(
            "Không tìm thấy khách hàng cần xóa.",
            "error"
        );
        return;
    }

    const customerName =
        customer.full_name || customer.customer_id || id;

    const confirmed = window.confirm(
        `Bạn có chắc chắn muốn xóa khách hàng "${customerName}" không?`
    );

    if (!confirmed) {
        return;
    }

    try {
        const result = await customerFetch(
            `${CUSTOMER_API_URL}/${encodeURIComponent(id)}`,
            {
                method: "DELETE"
            }
        );

        showCustomerMessage(
            result.message || "Xóa khách hàng thành công.",
            "success"
        );

        await loadCustomers();

    } catch (error) {
        console.error("Lỗi xóa khách hàng:", error);
        showCustomerMessage(error.message, "error");
    }
}

// =====================================================
// 18. ĐÓNG VÀ RESET FORM
// =====================================================

function closeCustomerForm() {
    customerElements.formCard.hidden = true;
    resetCustomerForm();
}

function resetCustomerForm() {
    customerElements.form.reset();

    customerElements.docId.value = "";
    customerElements.revision.value = "";

    customerElements.membership.disabled = false;
    Array.from(customerElements.membership.options).forEach(option => {
        option.disabled = false;
    });
    // Mặc định là Standard theo CouchDB.
    customerElements.membership.value = "standard";

    customerElements.formTitle.textContent =
        "Thêm khách hàng mới";

    customerElements.saveButton.textContent =
        "Lưu khách hàng";
}

// =====================================================
// 19. PHÂN TRANG
// =====================================================

function getTotalPages() {
    const totalItems = getFilteredCustomers().length;

    return Math.max(
        1,
        Math.ceil(totalItems / pageSize)
    );
}

function updatePagination(totalItems, startIndex, endIndex) {
    customerElements.paginationStart.textContent =
        totalItems === 0 ? 0 : startIndex + 1;

    customerElements.paginationEnd.textContent =
        endIndex;

    customerElements.paginationTotal.textContent =
        totalItems;

    const totalPages = getTotalPages();

    customerElements.prevPageButton.disabled =
        currentPage <= 1;

    customerElements.nextPageButton.disabled =
        currentPage >= totalPages;

    let html = "";

    for (let page = 1; page <= totalPages; page++) {
        html += `
            <button
                type="button"
                class="pagination-number ${
                    page === currentPage ? "active" : ""
                }"
                data-page="${page}">
                ${page}
            </button>
        `;
    }

    customerElements.paginationNumbers.innerHTML = html;

    customerElements.paginationNumbers
        .querySelectorAll("[data-page]")
        .forEach(button => {
            button.addEventListener("click", function () {
                currentPage = Number(this.dataset.page);
                renderCustomers();
            });
        });
}

// =====================================================
// 20. SAO LƯU KHÁCH HÀNG
// =====================================================

async function backupCustomers() {
    try {
        customerElements.backupButton.disabled = true;

        customerElements.backupButton.textContent =
            "Đang sao lưu...";

        const backupData = await customerFetch(
            `${CUSTOMER_API_URL}/backup`
        );

        const jsonContent = JSON.stringify(
            backupData,
            null,
            4
        );

        const blob = new Blob(
            [jsonContent],
            { type: "application/json;charset=utf-8" }
        );

        const downloadUrl = URL.createObjectURL(blob);

        const link = document.createElement("a");

        const date = new Date()
            .toISOString()
            .replace(/[:.]/g, "-");

        link.href = downloadUrl;
        link.download = `beautyshop-customers-backup-${date}.json`;

        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(downloadUrl);

        showCustomerMessage(
            `Sao lưu thành công ${backupData.total_customers || 0} khách hàng.`,
            "success"
        );

    } catch (error) {
        console.error("Lỗi sao lưu khách hàng:", error);

        showCustomerMessage(
            "Không thể sao lưu dữ liệu: " + error.message,
            "error"
        );

    } finally {
        customerElements.backupButton.disabled = false;

        customerElements.backupButton.innerHTML =
            "<span>⇩</span> Sao lưu dữ liệu";
    }
}

// =====================================================
// 21. THÔNG BÁO
// =====================================================

let customerMessageTimer = null;

function showCustomerMessage(message, type = "info") {
    const element = customerElements.message;

    if (!element) {
        return;
    }

    clearTimeout(customerMessageTimer);

    element.textContent = message;
    element.className = `customer-message ${type}`;
    element.hidden = false;

    if (type === "success") {
        customerMessageTimer = setTimeout(() => {
            hideCustomerMessage();
        }, 4000);
    }
}

function hideCustomerMessage() {
    const element = customerElements.message;

    if (!element) {
        return;
    }

    element.hidden = true;
    element.textContent = "";
    element.className = "customer-message";
}

// =====================================================
// 22. ESCAPE HTML
// Ngăn dữ liệu nhập vào được hiểu thành HTML.
// =====================================================

function escapeCustomerHTML(value) {
    return String(value ?? "").replace(
        /[&<>"']/g,
        character => {
            const entities = {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#039;"
            };

            return entities[character];
        }
    );
}
// ==========================================
// HIỆU ỨNG TÌM KIẾM VÀ LÀM MỚI
// ==========================================

document.addEventListener("DOMContentLoaded", function () {
    const searchInput = document.getElementById("customerSearch");
    const searchBox = document.querySelector(".customer-search-box");
    const clearButton = document.getElementById("clearCustomerSearch");
    const refreshButton = document.getElementById("refreshCustomersButton");

    // Hiển thị hoặc ẩn nút xóa tìm kiếm
    function updateSearchClearButton() {
        if (!searchInput || !searchBox) return;

        searchBox.classList.toggle(
            "has-value",
            searchInput.value.trim().length > 0
        );
    }

    searchInput?.addEventListener("input", updateSearchClearButton);

    // Xóa nội dung tìm kiếm
    clearButton?.addEventListener("click", function () {
        if (!searchInput) return;

        searchInput.value = "";
        searchInput.dispatchEvent(new Event("input", {
            bubbles: true
        }));

        searchInput.focus();
        updateSearchClearButton();
    });

    updateSearchClearButton();

    // Hiệu ứng nút làm mới
    // Không đăng ký thêm sự kiện click vì có thể customers.js
    // đã có sẵn chức năng tải lại dữ liệu.
});