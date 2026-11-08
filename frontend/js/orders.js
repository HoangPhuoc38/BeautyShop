"use strict";

// ============================================
// BEAUTYSHOP - ORDER MANAGEMENT
// ============================================

const ORDER_API = "http://127.0.0.1:8080/api/invoices";
const CUSTOMER_API = "http://127.0.0.1:8080/api/customers";
const PRODUCT_API = "http://127.0.0.1:8080/api/products";
const SERVICE_API = "http://127.0.0.1:8080/api/services";
const AUTH_API = "http://127.0.0.1:8080/api/auth/me";
const PAYMENT_API = "http://127.0.0.1:8080/api/payments";

const ORDER_PAGE_SIZE = 10;

const orderState = {
    customers: [],
    products: [],
    services: [],
    cart: [],
    currentCatalog: "service",
    invoices: [],
    filteredInvoices: [],
    currentPage: 1,
    employeeId: "",
    branchId: "",
    currentUser: null,
    creating: false
};

const orderElements = {
    customerSelect: document.getElementById("customerSelect"),
    customerInfo: document.getElementById("customerInfo"),
    appointmentId: document.getElementById("appointmentId"),

    catalogSearch: document.getElementById("catalogSearch"),
    catalogMessage: document.getElementById("catalogMessage"),
    catalogGrid: document.getElementById("catalogGrid"),
    catalogTabs: document.querySelectorAll(".catalog-tab"),

    cartTableBody: document.getElementById("cartTableBody"),

    discountType: document.getElementById("discountType"),
    discountValue: document.getElementById("discountValue"),
    subtotalAmount: document.getElementById("subtotalAmount"),
    discountAmount: document.getElementById("discountAmount"),
    totalAmount: document.getElementById("totalAmount"),

    orderNote: document.getElementById("orderNote"),
    orderWarning: document.getElementById("orderWarning"),
    createOrderButton: document.getElementById("createOrderButton"),
    resetOrderButton: document.getElementById("resetOrderButton"),
    newOrderButton: document.getElementById("newOrderButton"),

    totalOrders: document.getElementById("totalOrders"),
    paidOrders: document.getElementById("paidOrders"),
    pendingOrders: document.getElementById("pendingOrders"),
    orderRevenue: document.getElementById("orderRevenue"),

    orderSearch: document.getElementById("orderSearch"),
    orderStatusFilter: document.getElementById("orderStatusFilter"),
    orderMethodFilter: document.getElementById("orderMethodFilter"),
    ordersTableBody: document.getElementById("ordersTableBody"),
    refreshOrdersButton: document.getElementById("refreshOrdersButton"),
    orderPageInfo: document.getElementById("orderPageInfo"),
    orderPrevPage: document.getElementById("orderPrevPage"),
    orderNextPage: document.getElementById("orderNextPage"),

    resultDialog: document.getElementById("orderResultDialog"),
    resultContent: document.getElementById("orderResultContent"),
    closeResult: document.getElementById("closeOrderResult"),

    detailDialog: document.getElementById("orderDetailDialog"),
    detailContent: document.getElementById("orderDetailContent"),
    closeDetail: document.getElementById("closeOrderDetail")
};

// ============================================
// COMMON HELPERS
// ============================================

function orderEscape(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function orderMoney(value) {
    const amount = Number(value || 0);
    return new Intl.NumberFormat("vi-VN").format(
        Number.isFinite(amount) ? amount : 0
    ) + "đ";
}

function orderNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function orderDate(value) {
    if (!value) return "—";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function orderGetInvoiceId(invoice) {
    return String(
        invoice?.invoice_id ??
        invoice?.invoiceId ??
        invoice?._id ??
        ""
    );
}

function orderGetCustomerName(customerId) {
    const customer = orderState.customers.find(item =>
        String(item.customer_id || "").toLowerCase() ===
            String(customerId || "").toLowerCase() ||
        String(item._id || "").toLowerCase() ===
            String(customerId || "").toLowerCase()
    );

    return customer?.full_name || customer?.name || customerId || "Khách lẻ";
}

async function orderFetch(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        credentials: "include",
        headers: {
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...(options.headers || {})
        }
    });

    const raw = await response.text();
    let data = null;

    if (raw) {
        try {
            data = JSON.parse(raw);
        } catch {
            data = raw;
        }
    }

    if (!response.ok) {
        const message =
            data?.message ||
            data?.error ||
            (typeof data === "string" ? data : "") ||
            `Yêu cầu thất bại (${response.status})`;

        throw new Error(message);
    }

    return data;
}

function orderExtractList(data, possibleKeys = []) {
    if (Array.isArray(data)) return data;

    for (const key of possibleKeys) {
        if (Array.isArray(data?.[key])) return data[key];
    }

    return [];
}

function orderShowWarning(message, type = "warning") {
    if (!orderElements.orderWarning) return;

    orderElements.orderWarning.textContent = message;
    orderElements.orderWarning.className = `order-warning ${type}`;
    orderElements.orderWarning.hidden = false;
}

function orderHideWarning() {
    if (orderElements.orderWarning) {
        orderElements.orderWarning.hidden = true;
    }
}

// ============================================
// LOAD AUTHENTICATED USER
// ============================================

async function loadOrderCurrentUser() {
    try {
        const data = await orderFetch(AUTH_API);
        const user = data?.user || data;

        orderState.currentUser = user;
        orderState.employeeId =
            user?.employeeId ||
            user?.employee_id ||
            "";

        orderState.branchId =
            user?.branchId ||
            user?.branch_id ||
            "";

    } catch (error) {
        console.error("Không tải được thông tin tài khoản:", error);
    }
}

// ============================================
// LOAD CUSTOMERS
// ============================================

async function loadOrderCustomers() {
    const select = orderElements.customerSelect;

    try {
        const data = await orderFetch(CUSTOMER_API);
        orderState.customers = orderExtractList(data, ["customers"])
            .filter(customer => customer.type === "customer" || !customer.type)
            .filter(customer => customer.status !== "inactive");

        select.innerHTML = `
            <option value="">-- Chọn khách hàng --</option>
            ${orderState.customers.map(customer => {
                const id = customer.customer_id || customer._id;
                const name = customer.full_name || customer.name || "Chưa có tên";
                const phone = customer.phone || "";

                return `
                    <option value="${orderEscape(id)}"
                            data-document-id="${orderEscape(customer._id || "")}">
                        ${orderEscape(name)}${phone ? " - " + orderEscape(phone) : ""}
                    </option>
                `;
            }).join("")}
        `;

        if (!orderState.customers.length) {
            select.innerHTML = `<option value="">Chưa có khách hàng</option>`;
        }

    } catch (error) {
        console.error(error);
        select.innerHTML = `<option value="">Không tải được khách hàng</option>`;
        orderShowWarning("Không thể tải danh sách khách hàng: " + error.message);
    }
}

function handleOrderCustomerChange() {
    const customerId = orderElements.customerSelect.value;
    const customer = orderState.customers.find(item =>
        String(item.customer_id || item._id) === String(customerId)
    );

    if (!customer) {
        orderElements.customerInfo.textContent =
            "Chọn khách hàng để tiếp tục.";
        return;
    }

    orderElements.customerInfo.textContent =
        `Điện thoại: ${customer.phone || "Chưa cập nhật"} · ` +
        `Điểm hiện có: ${orderNumber(customer.points)}`;
}

// ============================================
// LOAD PRODUCTS AND SERVICES
// ============================================

async function loadOrderCatalog() {
    orderElements.catalogMessage.textContent = "Đang tải danh mục...";

    const results = await Promise.allSettled([
        orderFetch(PRODUCT_API),
        orderFetch(SERVICE_API)
    ]);

    if (results[0].status === "fulfilled") {
        orderState.products = orderExtractList(
            results[0].value,
            ["products", "data"]
        ).filter(item => item.status !== "inactive");
    } else {
        console.error("Lỗi tải sản phẩm:", results[0].reason);
        orderState.products = [];
    }

    if (results[1].status === "fulfilled") {
        orderState.services = orderExtractList(
            results[1].value,
            ["services", "data"]
        ).filter(item => item.status !== "inactive");
    } else {
        console.error("Lỗi tải dịch vụ:", results[1].reason);
        orderState.services = [];
    }

    renderOrderCatalog();
}

function getCatalogItemId(item, type) {
    return type === "product"
        ? (item.product_id || item._id)
        : (item.service_id || item._id);
}

function getCatalogItems() {
    return orderState.currentCatalog === "product"
        ? orderState.products
        : orderState.services;
}

function renderOrderCatalog() {
    const type = orderState.currentCatalog;
    const keyword = orderElements.catalogSearch.value
        .trim()
        .toLocaleLowerCase("vi-VN");

    const items = getCatalogItems().filter(item => {
        const name = String(item.name || item.product_name || "")
            .toLocaleLowerCase("vi-VN");

        const id = String(getCatalogItemId(item, type) || "")
            .toLocaleLowerCase("vi-VN");

        return name.includes(keyword) || id.includes(keyword);
    });

    orderElements.catalogMessage.textContent =
        items.length ? `Có ${items.length} hạng mục.` : "Không tìm thấy hạng mục phù hợp.";

    if (!items.length) {
        orderElements.catalogGrid.innerHTML = `
            <div class="empty-cart">Không có dữ liệu để hiển thị.</div>
        `;
        return;
    }

    orderElements.catalogGrid.innerHTML = items.map(item => {
        const id = getCatalogItemId(item, type);
        const name = item.name || item.product_name || "Chưa có tên";
        const price = orderNumber(item.price);

        return `
            <article class="catalog-item">
                <div>
                    <h5>${orderEscape(name)}</h5>
                    <p>${type === "product" ? "Sản phẩm" : "Dịch vụ"} · ${orderEscape(id)}</p>
                </div>
                <div class="catalog-item-bottom">
                    <strong class="catalog-price">${orderMoney(price)}</strong>
                    <button type="button" class="catalog-add"
                            data-add-type="${type}"
                            data-add-id="${orderEscape(id)}">
                        ＋ Thêm
                    </button>
                </div>
            </article>
        `;
    }).join("");
}

function setOrderCatalog(type) {
    if (!["product", "service"].includes(type)) return;

    orderState.currentCatalog = type;

    orderElements.catalogTabs.forEach(tab => {
        tab.classList.toggle("active", tab.dataset.catalog === type);
    });

    renderOrderCatalog();
}

// ============================================
// CART MANAGEMENT
// ============================================

function addOrderItem(type, itemId) {
    const source = type === "product"
        ? orderState.products
        : orderState.services;

    const item = source.find(row =>
        String(getCatalogItemId(row, type)) === String(itemId)
    );

    if (!item) {
        orderShowWarning("Không tìm thấy hạng mục vừa chọn.");
        return;
    }

    const existing = orderState.cart.find(row =>
        row.itemType === type && row.itemId === String(itemId)
    );

    if (existing) {
        existing.quantity += 1;
    } else {
        orderState.cart.push({
            itemType: type,
            itemId: String(itemId),
            name: item.name || item.product_name || "Chưa có tên",
            unitPrice: orderNumber(item.price),
            quantity: 1
        });
    }

    renderOrderCart();
    orderHideWarning();
}

function changeOrderQuantity(type, itemId, delta) {
    const item = orderState.cart.find(row =>
        row.itemType === type && row.itemId === itemId
    );

    if (!item) return;

    item.quantity += delta;

    if (item.quantity <= 0) {
        orderState.cart = orderState.cart.filter(row => row !== item);
    }

    renderOrderCart();
}

function removeOrderItem(type, itemId) {
    orderState.cart = orderState.cart.filter(row =>
        !(row.itemType === type && row.itemId === itemId)
    );

    renderOrderCart();
}

function getOrderSubtotal() {
    return orderState.cart.reduce((sum, item) => {
        return sum + item.unitPrice * item.quantity;
    }, 0);
}

function getOrderDiscount() {
    const subtotal = getOrderSubtotal();
    const value = Math.max(0, orderNumber(orderElements.discountValue.value));

    if (orderElements.discountType.value === "percent") {
        return Math.min(subtotal, subtotal * Math.min(value, 100) / 100);
    }

    return Math.min(subtotal, value);
}

function getOrderTotal() {
    return Math.max(0, getOrderSubtotal() - getOrderDiscount());
}

function renderOrderCart() {
    if (!orderState.cart.length) {
        orderElements.cartTableBody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-cart">
                    Chưa có sản phẩm hoặc dịch vụ nào.
                </td>
            </tr>
        `;
    } else {
        orderElements.cartTableBody.innerHTML = orderState.cart.map(item => `
            <tr>
                <td>
                    <span class="cart-item-name">${orderEscape(item.name)}</span>
                    <span class="cart-item-type">
                        ${item.itemType === "product" ? "Sản phẩm" : "Dịch vụ"}
                    </span>
                </td>
                <td>${orderMoney(item.unitPrice)}</td>
                <td>
                    <div class="quantity-control">
                        <button type="button"
                                data-cart-action="decrease"
                                data-cart-type="${item.itemType}"
                                data-cart-id="${orderEscape(item.itemId)}">−</button>
                        <span>${item.quantity}</span>
                        <button type="button"
                                data-cart-action="increase"
                                data-cart-type="${item.itemType}"
                                data-cart-id="${orderEscape(item.itemId)}">＋</button>
                    </div>
                </td>
                <td><strong>${orderMoney(item.unitPrice * item.quantity)}</strong></td>
                <td>
                    <button type="button" class="remove-cart-item"
                            data-cart-action="remove"
                            data-cart-type="${item.itemType}"
                            data-cart-id="${orderEscape(item.itemId)}"
                            aria-label="Xóa">×</button>
                </td>
            </tr>
        `).join("");
    }

    orderElements.subtotalAmount.textContent = orderMoney(getOrderSubtotal());
    orderElements.discountAmount.textContent = orderMoney(getOrderDiscount());
    orderElements.totalAmount.textContent = orderMoney(getOrderTotal());
}

// ============================================
// CREATE INVOICE
// ============================================

function getSelectedPaymentMethod() {
    return document.querySelector(
        'input[name="paymentMethod"]:checked'
    )?.value || "cash";
}

function validateOrderForm() {
    if (!orderElements.customerSelect.value) {
        return "Vui lòng chọn khách hàng.";
    }

    if (!orderState.cart.length) {
        return "Vui lòng thêm ít nhất một sản phẩm hoặc dịch vụ.";
    }

    if (getOrderTotal() <= 0) {
        return "Tổng thanh toán phải lớn hơn 0.";
    }

    if (orderState.cart.some(item =>
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 999
    )) {
        return "Số lượng mỗi hạng mục phải từ 1 đến 999.";
    }

    const discountValue = orderNumber(orderElements.discountValue.value);

    if (discountValue < 0) {
        return "Giá trị giảm giá không hợp lệ.";
    }

    if (
        orderElements.discountType.value === "percent" &&
        discountValue > 100
    ) {
        return "Giảm giá theo phần trăm không được vượt quá 100%.";
    }

    return "";
}

async function createOrderInvoice() {
    if (orderState.creating) return;

    const validationMessage = validateOrderForm();

    if (validationMessage) {
        orderShowWarning(validationMessage);
        return;
    }

    const customerOption =
        orderElements.customerSelect.selectedOptions[0];

    const selectedCustomer = orderState.customers.find(customer =>
        String(customer.customer_id || customer._id) ===
        String(orderElements.customerSelect.value)
    );

    const customerId =
        selectedCustomer?.customer_id ||
        orderElements.customerSelect.value;

    const payload = {
        customerId,
        appointmentId: orderElements.appointmentId.value.trim() || null,
        employeeId: orderState.employeeId || null,
        branchId: orderState.branchId || null,
        items: orderState.cart.map(item => ({
            itemType: item.itemType,
            itemId: item.itemId,
            quantity: item.quantity
        })),
        discountType:
    orderElements.discountType.value === "percent"
        ? "percent"
        : "amount",
        discountValue: orderNumber(orderElements.discountValue.value),
        paymentMethod: getSelectedPaymentMethod(),
        note: orderElements.orderNote.value.trim()
    };

    orderState.creating = true;
    orderElements.createOrderButton.disabled = true;
    orderElements.createOrderButton.textContent = "Đang tạo hóa đơn...";

    try {
        const result = await orderFetch(ORDER_API, {
            method: "POST",
            body: JSON.stringify(payload)
        });

        const invoice = result?.invoice || result?.data?.invoice || result;
        const invoiceId = orderGetInvoiceId(invoice);

        if (!invoiceId) {
            throw new Error(
                "Backend đã phản hồi nhưng không tìm thấy mã hóa đơn. " +
                "Hãy kiểm tra cấu trúc response của POST /api/invoices."
            );
        }

        let paymentResult = null;

        // Tiền mặt: gọi API xác nhận sau khi nhân viên đã thu tiền.
        if (payload.paymentMethod === "cash") {
            const confirmUrl =
                `${PAYMENT_API}/invoices/${encodeURIComponent(invoiceId)}/confirm` +
                `?paymentMethod=cash`;

            try {
                paymentResult = await orderFetch(confirmUrl, {
                    method: "POST"
                });
            } catch (confirmError) {
                console.error("Không xác nhận được thanh toán tiền mặt:", confirmError);
                showOrderResult({
                    invoice,
                    result,
                    paymentResult: null,
                    confirmError: confirmError.message,
                    customer: selectedCustomer
                });
                await refreshOrdersData();
                return;
            }
        }

        showOrderResult({
            invoice,
            result,
            paymentResult,
            customer: selectedCustomer
        });

        resetOrderForm(false);
        await refreshOrdersData();

    } catch (error) {
        console.error("Lỗi tạo hóa đơn:", error);
        orderShowWarning("Không thể tạo hóa đơn: " + error.message);
    } finally {
        orderState.creating = false;
        orderElements.createOrderButton.disabled = false;
        orderElements.createOrderButton.textContent = "Tạo hóa đơn";
    }
}

// ============================================
// RESULT DIALOG
// ============================================

function showOrderResult(context) {
    const invoice = context.invoice || {};
    const response = context.result || {};
    const paymentResult = context.paymentResult;
    const invoiceId = orderGetInvoiceId(invoice);
    const paymentMethod = invoice.payment_method ||
        invoice.paymentMethod ||
        getSelectedPaymentMethod();

    const amount = orderNumber(
        invoice.total ??
        invoice.amount ??
        getOrderTotal()
    );

    const isCash = paymentMethod === "cash";
    const isConfirmed = Boolean(paymentResult);
    const confirmError = context.confirmError;

    const qrUrl =
        response?.paymentInstructions?.qrUrl ||
        response?.paymentInstructions?.qr_url ||
        response?.paymentInstructions?.qrImageUrl ||
        response?.paymentInstructions?.qr_image_url ||
        response?.qrUrl ||
        response?.qr_url ||
        "assets/bank-qr.jpg";

    const transferReference =
        response?.transferReference ||
        response?.paymentInstructions?.transferReference ||
        invoiceId;

    let paymentHtml = "";

    if (isCash && isConfirmed) {
        paymentHtml = `
            <div class="qr-payment-area">
                <h4>Đã xác nhận thanh toán tiền mặt</h4>
                <p>Hóa đơn đã được cập nhật trạng thái thanh toán.</p>
                <span class="status-pill paid">Đã thanh toán</span>
            </div>
        `;
    } else if (isCash && confirmError) {
        paymentHtml = `
            <div class="qr-payment-area">
                <h4>Hóa đơn đã tạo nhưng chưa xác nhận thanh toán</h4>
                <p>${orderEscape(confirmError)}</p>
                <span class="status-pill pending">Cần kiểm tra</span>
            </div>
        `;
    } else if (!isCash && qrUrl) {
        paymentHtml = `
            <div class="qr-payment-area">
                <h4>Quét mã QR để chuyển khoản</h4>
                <img class="qr-payment-image"
                     src="${orderEscape(qrUrl)}"
                     alt="Mã QR thanh toán"
                     referrerpolicy="no-referrer"
                     onerror="this.hidden = true; this.nextElementSibling.hidden = false">
                <p class="qr-unavailable" hidden>
                    Không tải được ảnh QR. Kiểm tra file frontend/assets/bank-qr.jpg.
                </p>
                <p>
                    Nội dung chuyển khoản:
                    <strong>${orderEscape(transferReference)}</strong>
                </p>
                <p>
                    Số tiền cần chuyển:
                    <strong>${orderMoney(amount)}</strong>
                </p>
                <p>Vui lòng kiểm tra đúng số tiền và thông tin người nhận trước khi chuyển.</p>
                <span class="status-pill pending">Chờ thanh toán</span>
            </div>
        `;
    } else if (!isCash) {
        paymentHtml = `
            <div class="qr-payment-area">
                <h4>Hóa đơn đang chờ chuyển khoản</h4>
                <div class="qr-unavailable">
                    Backend hiện chưa trả về địa chỉ ảnh QR.
                    Hóa đơn đã được tạo; kiểm tra lại cấu hình ảnh QR mặc định.
                    <br><br>
                    Nội dung chuyển khoản dự kiến:
                    <strong>${orderEscape(transferReference)}</strong>
                </div>
                <span class="status-pill pending">Chờ thanh toán</span>
            </div>
        `;
    }

    orderElements.resultContent.innerHTML = `
        <div class="result-success-icon">✓</div>
        <h3 class="result-heading" id="resultDialogTitle">Tạo hóa đơn thành công</h3>
        <p class="result-description">
            Hóa đơn đã được lưu vào hệ thống BeautyShop.
        </p>

        <div class="result-info">
            <div class="result-info-row">
                <span>Mã hóa đơn</span>
                <strong>${orderEscape(invoiceId)}</strong>
            </div>
            <div class="result-info-row">
                <span>Khách hàng</span>
                <strong>${orderEscape(
                    context.customer?.full_name ||
                    context.customer?.name ||
                    invoice.customer_id ||
                    "—"
                )}</strong>
            </div>
            <div class="result-info-row">
                <span>Phương thức</span>
                <strong>${isCash ? "Tiền mặt" : "Chuyển khoản MB"}</strong>
            </div>
            <div class="result-info-row">
                <span>Tổng thanh toán</span>
                <strong class="result-total">${orderMoney(amount)}</strong>
            </div>
        </div>

        ${paymentHtml}

        <div class="result-actions">
            <button type="button" class="btn btn-light"
                    id="resultCloseButton">Đóng</button>
            <button type="button" class="btn btn-primary"
                    id="resultViewInvoiceButton">Xem hóa đơn</button>
        </div>
    `;

    orderElements.resultDialog.hidden = false;

    document.getElementById("resultCloseButton")
        ?.addEventListener("click", closeOrderResult);

    document.getElementById("resultViewInvoiceButton")
        ?.addEventListener("click", () => {
            closeOrderResult();
            if (invoiceId) openOrderDetail(invoiceId);
        });
}

function closeOrderResult() {
    orderElements.resultDialog.hidden = true;
}

// ============================================
// LOAD INVOICE LIST
// ============================================

async function loadOrderInvoices() {
    orderElements.ordersTableBody.innerHTML = `
        <tr><td colspan="7" class="table-empty">Đang tải hóa đơn...</td></tr>
    `;

    try {
        const data = await orderFetch(ORDER_API);
        orderState.invoices = orderExtractList(data, ["invoices", "data"])
            .filter(invoice => invoice.type === "invoice" || !invoice.type);

        applyOrderFilters();

    } catch (error) {
        console.error("Lỗi tải hóa đơn:", error);

        orderElements.ordersTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="table-empty">
                    Không thể tải danh sách hóa đơn: ${orderEscape(error.message)}
                </td>
            </tr>
        `;

        orderState.invoices = [];
        updateOrderStatistics([]);
    }
}

function applyOrderFilters() {
    const keyword = orderElements.orderSearch.value
        .trim()
        .toLocaleLowerCase("vi-VN");

    const status = orderElements.orderStatusFilter.value;
    const method = orderElements.orderMethodFilter.value;

    orderState.filteredInvoices = orderState.invoices.filter(invoice => {
        const invoiceId = orderGetInvoiceId(invoice).toLowerCase();
        const customerId = String(invoice.customer_id || "").toLowerCase();
        const customerName = orderGetCustomerName(invoice.customer_id)
            .toLocaleLowerCase("vi-VN");

        const invoiceStatus = String(
            invoice.payment_status || invoice.paymentStatus || ""
        ).toLowerCase();

        const invoiceMethod = String(
            invoice.payment_method || invoice.paymentMethod || ""
        ).toLowerCase();

        const matchKeyword =
            !keyword ||
            invoiceId.includes(keyword) ||
            customerId.includes(keyword) ||
            customerName.includes(keyword);

        const matchStatus = !status || invoiceStatus === status;
        const matchMethod = !method || invoiceMethod === method;

        return matchKeyword && matchStatus && matchMethod;
    });

    orderState.currentPage = 1;
    renderOrderInvoices();
    updateOrderStatistics(orderState.invoices);
}

function renderOrderInvoices() {
    const list = orderState.filteredInvoices;
    const totalPages = Math.max(1, Math.ceil(list.length / ORDER_PAGE_SIZE));

    if (orderState.currentPage > totalPages) {
        orderState.currentPage = totalPages;
    }

    const start = (orderState.currentPage - 1) * ORDER_PAGE_SIZE;
    const pageItems = list.slice(start, start + ORDER_PAGE_SIZE);

    if (!pageItems.length) {
        orderElements.ordersTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="table-empty">
                    Không có hóa đơn phù hợp.
                </td>
            </tr>
        `;
    } else {
        orderElements.ordersTableBody.innerHTML = pageItems.map(invoice => {
            const invoiceId = orderGetInvoiceId(invoice);
            const status = String(
                invoice.payment_status || invoice.paymentStatus || "pending"
            ).toLowerCase();

            const method = String(
                invoice.payment_method || invoice.paymentMethod || ""
            ).toLowerCase();

            const statusInfo = getOrderStatusInfo(status);

            return `
                <tr>
                    <td><span class="order-id">${orderEscape(invoiceId)}</span></td>
                    <td>${orderEscape(orderGetCustomerName(invoice.customer_id))}</td>
                    <td>${orderDate(invoice.created_at || invoice.createdAt)}</td>
                    <td>
                        <span class="status-pill ${statusInfo.className}">
                            ${statusInfo.label}
                        </span>
                    </td>
                    <td>
                        <span class="method-pill">
                            ${method === "cash" ? "Tiền mặt" :
                                method === "bank_transfer" ? "Chuyển khoản" : "—"}
                        </span>
                    </td>
                    <td><strong>${orderMoney(invoice.total)}</strong></td>
                    <td>
                        <button type="button" class="table-action"
                                data-order-detail="${orderEscape(invoiceId)}">
                            Chi tiết
                        </button>
                    </td>
                </tr>
            `;
        }).join("");
    }

    orderElements.orderPageInfo.textContent =
        `Trang ${orderState.currentPage}/${totalPages} · ${list.length} hóa đơn`;

    orderElements.orderPrevPage.disabled = orderState.currentPage <= 1;
    orderElements.orderNextPage.disabled = orderState.currentPage >= totalPages;
}

function getOrderStatusInfo(status) {
    const normalized = String(status || "").toLowerCase();

    if (normalized === "paid") {
        return { label: "Đã thanh toán", className: "paid" };
    }

    if (["pending", "unpaid"].includes(normalized)) {
        return { label: "Chờ thanh toán", className: "pending" };
    }

    if (normalized === "cancelled") {
        return { label: "Đã hủy", className: "cancelled" };
    }

    return { label: status || "Không rõ", className: "unknown" };
}

// ============================================
// ORDER STATISTICS
// ============================================

function updateOrderStatistics(invoices) {
    const paid = invoices.filter(invoice =>
        String(invoice.payment_status || "").toLowerCase() === "paid"
    );

    const pending = invoices.filter(invoice =>
        ["pending", "unpaid"].includes(
            String(invoice.payment_status || "").toLowerCase()
        )
    );

    const revenue = paid.reduce((sum, invoice) => {
        return sum + orderNumber(invoice.total);
    }, 0);

    orderElements.totalOrders.textContent = invoices.length;
    orderElements.paidOrders.textContent = paid.length;
    orderElements.pendingOrders.textContent = pending.length;
    orderElements.orderRevenue.textContent = orderMoney(revenue);
}

// ============================================
// INVOICE DETAIL
// ============================================

async function openOrderDetail(invoiceId) {
    orderElements.detailContent.innerHTML = `
        <p class="table-empty">Đang tải chi tiết hóa đơn...</p>
    `;
    orderElements.detailDialog.hidden = false;

    try {
        const data = await orderFetch(
            `${ORDER_API}/${encodeURIComponent(invoiceId)}`
        );

        const invoice = data?.invoice || data;
        const items = Array.isArray(data?.items)
            ? data.items
            : Array.isArray(data?.invoice_items)
                ? data.invoice_items
                : [];

        const invoiceItemsHtml = items.length
            ? items.map(item => `
                <tr>
                    <td>${orderEscape(item.item_name || item.name || item.item_id || "—")}</td>
                    <td>${orderNumber(item.quantity)}</td>
                    <td>${orderMoney(item.unit_price)}</td>
                    <td>${orderMoney(item.subtotal)}</td>
                </tr>
            `).join("")
            : `
                <tr><td colspan="4" class="table-empty">
                    Không có dữ liệu chi tiết mặt hàng.
                </td></tr>
            `;

        const status = getOrderStatusInfo(invoice.payment_status);

        orderElements.detailContent.innerHTML = `
            <h3 class="detail-title" id="detailDialogTitle">
                Chi tiết hóa đơn ${orderEscape(orderGetInvoiceId(invoice))}
            </h3>

            <div class="result-info">
                <div class="result-info-row">
                    <span>Khách hàng</span>
                    <strong>${orderEscape(orderGetCustomerName(invoice.customer_id))}</strong>
                </div>
                <div class="result-info-row">
                    <span>Nhân viên</span>
                    <strong>${orderEscape(invoice.employee_id || "—")}</strong>
                </div>
                <div class="result-info-row">
                    <span>Ngày tạo</span>
                    <strong>${orderDate(invoice.created_at)}</strong>
                </div>
                <div class="result-info-row">
                    <span>Trạng thái</span>
                    <strong>
                        <span class="status-pill ${status.className}">
                            ${status.label}
                        </span>
                    </strong>
                </div>
                <div class="result-info-row">
                    <span>Phương thức</span>
                    <strong>
                        ${invoice.payment_method === "cash"
                            ? "Tiền mặt"
                            : invoice.payment_method === "bank_transfer"
                                ? "Chuyển khoản"
                                : "—"}
                    </strong>
                </div>
            </div>

            <h4 class="detail-section-title">Chi tiết sản phẩm / dịch vụ</h4>
            <div class="order-table-wrap">
                <table class="detail-items">
                    <thead>
                    <tr>
                        <th>Hạng mục</th>
                        <th>Số lượng</th>
                        <th>Đơn giá</th>
                        <th>Thành tiền</th>
                    </tr>
                    </thead>
                    <tbody>${invoiceItemsHtml}</tbody>
                </table>
            </div>

            <div class="result-info" style="margin-top:15px">
                <div class="result-info-row">
                    <span>Tạm tính</span>
                    <strong>${orderMoney(invoice.subtotal)}</strong>
                </div>
                <div class="result-info-row">
                    <span>Giảm giá</span>
                    <strong>${orderMoney(invoice.discount)}</strong>
                </div>
                <div class="result-info-row">
                    <span>Tổng thanh toán</span>
                    <strong class="result-total">${orderMoney(invoice.total)}</strong>
                </div>
            </div>

            ${invoice.note ? `
                <div class="detail-note">
                    <strong>Ghi chú:</strong> ${orderEscape(invoice.note)}
                </div>
            ` : ""}
        `;

    } catch (error) {
        orderElements.detailContent.innerHTML = `
            <h3 class="detail-title">Không tải được hóa đơn</h3>
            <p>${orderEscape(error.message)}</p>
        `;
    }
}

function closeOrderDetail() {
    orderElements.detailDialog.hidden = true;
}

// ============================================
// RESET AND REFRESH
// ============================================

function resetOrderForm(clearCustomer = true) {
    if (clearCustomer) {
        orderElements.customerSelect.value = "";
        handleOrderCustomerChange();
    }

    orderState.cart = [];
    orderElements.appointmentId.value = "";
    orderElements.discountType.value = "fixed";
    orderElements.discountValue.value = "0";
    orderElements.orderNote.value = "";

    const cashRadio = document.querySelector(
        'input[name="paymentMethod"][value="cash"]'
    );

    if (cashRadio) cashRadio.checked = true;

    renderOrderCart();
    orderHideWarning();
}

async function refreshOrdersData() {
    await Promise.allSettled([
        loadOrderInvoices(),
        loadOrderCatalog()
    ]);
}

// ============================================
// EVENT LISTENERS
// ============================================

function bindOrderEvents() {
    orderElements.customerSelect.addEventListener(
        "change",
        handleOrderCustomerChange
    );

    orderElements.catalogTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            setOrderCatalog(tab.dataset.catalog);
        });
    });

    orderElements.catalogSearch.addEventListener(
        "input",
        renderOrderCatalog
    );

    orderElements.catalogGrid.addEventListener("click", event => {
        const button = event.target.closest("[data-add-type]");
        if (!button) return;

        addOrderItem(
            button.dataset.addType,
            button.dataset.addId
        );
    });

    orderElements.cartTableBody.addEventListener("click", event => {
        const button = event.target.closest("[data-cart-action]");
        if (!button) return;

        const action = button.dataset.cartAction;
        const type = button.dataset.cartType;
        const id = button.dataset.cartId;

        if (action === "increase") {
            changeOrderQuantity(type, id, 1);
        } else if (action === "decrease") {
            changeOrderQuantity(type, id, -1);
        } else if (action === "remove") {
            removeOrderItem(type, id);
        }
    });

    orderElements.discountType.addEventListener(
        "change",
        renderOrderCart
    );

    orderElements.discountValue.addEventListener(
        "input",
        renderOrderCart
    );

    orderElements.createOrderButton.addEventListener(
        "click",
        createOrderInvoice
    );

    orderElements.resetOrderButton.addEventListener(
        "click",
        () => resetOrderForm(true)
    );

    orderElements.newOrderButton.addEventListener("click", () => {
        document.getElementById("createOrderSection")
            .scrollIntoView({ behavior: "smooth", block: "start" });
    });

    orderElements.orderSearch.addEventListener(
        "input",
        applyOrderFilters
    );

    orderElements.orderStatusFilter.addEventListener(
        "change",
        applyOrderFilters
    );

    orderElements.orderMethodFilter.addEventListener(
        "change",
        applyOrderFilters
    );

    orderElements.refreshOrdersButton.addEventListener(
        "click",
        refreshOrdersData
    );

    orderElements.orderPrevPage.addEventListener("click", () => {
        if (orderState.currentPage > 1) {
            orderState.currentPage--;
            renderOrderInvoices();
        }
    });

    orderElements.orderNextPage.addEventListener("click", () => {
        const totalPages = Math.max(
            1,
            Math.ceil(orderState.filteredInvoices.length / ORDER_PAGE_SIZE)
        );

        if (orderState.currentPage < totalPages) {
            orderState.currentPage++;
            renderOrderInvoices();
        }
    });

    orderElements.ordersTableBody.addEventListener("click", event => {
        const button = event.target.closest("[data-order-detail]");
        if (!button) return;

        openOrderDetail(button.dataset.orderDetail);
    });

    orderElements.closeResult.addEventListener(
        "click",
        closeOrderResult
    );

    orderElements.closeDetail.addEventListener(
        "click",
        closeOrderDetail
    );

    orderElements.resultDialog.addEventListener("click", event => {
        if (event.target === orderElements.resultDialog) {
            closeOrderResult();
        }
    });

    orderElements.detailDialog.addEventListener("click", event => {
        if (event.target === orderElements.detailDialog) {
            closeOrderDetail();
        }
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closeOrderResult();
            closeOrderDetail();
        }
    });
}

// ============================================
// INITIALIZE
// ============================================

async function initializeOrdersPage() {
    document.getElementById("currentYear").textContent =
        new Date().getFullYear();

    bindOrderEvents();

    renderOrderCart();

    await Promise.allSettled([
        loadOrderCurrentUser(),
        loadOrderCustomers(),
        loadOrderCatalog(),
        loadOrderInvoices()
    ]);
}

document.addEventListener("DOMContentLoaded", initializeOrdersPage);