"use strict";

// ============================================
// 1. CẤU HÌNH API
// ============================================

const PAYMENT_API_BASE = "http://127.0.0.1:8080/api/payments";
const INVOICE_API_BASE = "http://127.0.0.1:8080/api/invoices";
const AUTH_API_URL = "http://127.0.0.1:8080/api/auth/me";

const PAYMENT_PAGE_SIZE = 10;

let paymentList = [];
let paymentCurrentPage = 1;
let paymentIsLoading = false;
let paymentUserRole = "staff";

// ============================================
// 2. HÀM TIỆN ÍCH
// ============================================

const paymentElement = (id) => document.getElementById(id);

function escapePaymentHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return entities[char];
    });
}

function formatPaymentMoney(value) {
    const amount = Number(value ?? 0);

    if (!Number.isFinite(amount)) {
        return "0 ₫";
    }

    return new Intl.NumberFormat("vi-VN", {
        maximumFractionDigits: 0
    }).format(amount) + " ₫";
}

function formatPaymentDate(value) {
    if (!value) {
        return "Chưa có thông tin";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return escapePaymentHTML(value);
    }

    return new Intl.DateTimeFormat("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    }).format(date);
}

function normalizePaymentStatus(status) {
    const value = String(status ?? "").trim().toLowerCase();

    if (["paid", "completed", "success", "successful"].includes(value)) {
        return "paid";
    }

    if (["pending", "unpaid", "waiting", "processing"].includes(value)) {
        return "pending";
    }

    if (["cancelled", "canceled", "failed"].includes(value)) {
        return "cancelled";
    }

    return "unknown";
}

function getPaymentStatusLabel(status) {
    const normalized = normalizePaymentStatus(status);

    const labels = {
        paid: "Đã thanh toán",
        pending: "Chờ thanh toán",
        cancelled: "Đã hủy",
        unknown: "Không xác định"
    };

    return labels[normalized];
}

function getPaymentMethodLabel(method) {
    const value = String(method ?? "").trim().toLowerCase();

    if (value === "cash") {
        return "Tiền mặt";
    }

    if (value === "bank_transfer") {
        return "Chuyển khoản";
    }

    return value
        ? escapePaymentHTML(method)
        : "Chưa xác định";
}

function getPaymentInvoiceId(row) {
    return String(
        row?.invoice_id ??
        row?.invoiceId ??
        ""
    );
}

function getPaymentId(row) {
    return String(
        row?.payment_id ??
        row?._id ??
        row?.transaction_id ??
        getPaymentInvoiceId(row)
    );
}

function getPaymentAmount(row) {
    return Number(
        row?.amount ??
        row?.total ??
        0
    );
}

function showPaymentNotice(message) {
    const notice = paymentElement("paymentNotice");
    const text = paymentElement("paymentNoticeText");

    if (!notice || !text) {
        return;
    }

    text.textContent = message;
    notice.hidden = false;
}

function hidePaymentNotice() {
    const notice = paymentElement("paymentNotice");

    if (notice) {
        notice.hidden = true;
    }
}

// ============================================
// 3. GỌI API
// ============================================

async function paymentFetchJson(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        credentials: "include",
        headers: {
            "Accept": "application/json",
            ...(options.body ? {
                "Content-Type": "application/json"
            } : {}),
            ...(options.headers || {})
        }
    });

    const responseText = await response.text();

    let data = null;

    if (responseText) {
        try {
            data = JSON.parse(responseText);
        } catch {
            data = responseText;
        }
    }

    if (!response.ok) {
        let message = "Không thể thực hiện yêu cầu.";

        if (data && typeof data === "object") {
            message =
                data.message ||
                data.error ||
                data.detail ||
                message;
        } else if (typeof data === "string" && data.trim()) {
            message = data;
        }

        if (response.status === 401) {
            message = "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
        } else if (response.status === 403) {
            message = "Bạn không có quyền thực hiện thao tác này.";
        } else if (response.status === 404) {
            message = "Không tìm thấy dữ liệu yêu cầu.";
        }

        throw new Error(message);
    }

    return data;
}

// ============================================
// 4. THỐNG KÊ THANH TOÁN
// ============================================

async function loadPaymentStatistics() {
    const data = await paymentFetchJson(
        `${PAYMENT_API_BASE}/statistics`
    );

    const total = Number(data?.totalTransactions ?? 0);
    const paid = Number(data?.paidTransactions ?? 0);
    const pending = Number(data?.pendingTransactions ?? 0);
    const pendingBank = Number(data?.pendingBankTransfers ?? 0);

    const todayRevenue = Number(data?.todayRevenue ?? 0);
    const cashRevenue = Number(data?.cashRevenue ?? 0);
    const bankRevenue = Number(data?.bankTransferRevenue ?? 0);

    paymentElement("totalTransactions").textContent = total;
    paymentElement("paidTransactions").textContent = paid;
    paymentElement("pendingTransactions").textContent = pending;
    paymentElement("pendingBankTransfers").textContent = pendingBank;

    paymentElement("todayRevenue").textContent =
        formatPaymentMoney(todayRevenue);

    paymentElement("cashRevenue").textContent =
        formatPaymentMoney(cashRevenue);

    paymentElement("bankTransferRevenue").textContent =
        formatPaymentMoney(bankRevenue);

    paymentElement("statisticDate").textContent =
        data?.statisticDate
            ? `Ngày ${data.statisticDate}`
            : "Hôm nay";
}

// ============================================
// 5. TẠO QUERY LỌC
// ============================================

function buildPaymentQuery() {
    const params = new URLSearchParams();

    const keyword = paymentElement("paymentKeyword").value.trim();
    const status = paymentElement("paymentStatusFilter").value;
    const method = paymentElement("paymentMethodFilter").value;
    const fromDate = paymentElement("paymentFromDate").value;
    const toDate = paymentElement("paymentToDate").value;

    if (keyword) {
        params.set("keyword", keyword);
    }

    if (status) {
        params.set("status", status);
    }

    if (method) {
        params.set("paymentMethod", method);
    }

    if (fromDate) {
        params.set("fromDate", fromDate);
    }

    if (toDate) {
        params.set("toDate", toDate);
    }

    return params.toString();
}

// ============================================
// 6. TẢI DANH SÁCH GIAO DỊCH
// ============================================

async function loadPayments() {
    if (paymentIsLoading) {
        return;
    }

    paymentIsLoading = true;

    const tableBody = paymentElement("paymentTableBody");
    const refreshButton = paymentElement("refreshPayments");

    refreshButton.disabled = true;

    tableBody.innerHTML = `
        <tr>
            <td colspan="8" class="payment-empty-cell">
                Đang tải danh sách giao dịch...
            </td>
        </tr>
    `;

    try {
        const query = buildPaymentQuery();

        const url = query
            ? `${PAYMENT_API_BASE}?${query}`
            : PAYMENT_API_BASE;

        const data = await paymentFetchJson(url);

        paymentList = Array.isArray(data)
            ? data
            : Array.isArray(data?.payments)
                ? data.payments
                : Array.isArray(data?.transactions)
                    ? data.transactions
                    : [];

        paymentCurrentPage = 1;

        renderPayments();
        hidePaymentNotice();

    } catch (error) {
        paymentList = [];
        renderPayments();

        showPaymentNotice(
            error.message || "Không thể tải danh sách giao dịch."
        );

    } finally {
        paymentIsLoading = false;
        refreshButton.disabled = false;
    }
}

// ============================================
// 7. HIỂN THỊ TRẠNG THÁI
// ============================================

function renderPaymentStatus(status) {
    const normalized = normalizePaymentStatus(status);
    const label = getPaymentStatusLabel(status);

    return `
        <span class="payment-status ${normalized}">
            ${label}
        </span>
    `;
}

// ============================================
// 8. HIỂN THỊ BẢNG THANH TOÁN
// ============================================

function renderPayments() {
    const tableBody = paymentElement("paymentTableBody");

    const totalItems = paymentList.length;
    const totalPages = Math.max(
        1,
        Math.ceil(totalItems / PAYMENT_PAGE_SIZE)
    );

    if (paymentCurrentPage > totalPages) {
        paymentCurrentPage = totalPages;
    }

    const startIndex =
        (paymentCurrentPage - 1) * PAYMENT_PAGE_SIZE;

    const currentItems = paymentList.slice(
        startIndex,
        startIndex + PAYMENT_PAGE_SIZE
    );

    paymentElement("paymentResultCount").textContent =
        `${totalItems} giao dịch`;

    paymentElement("paymentPageInfo").textContent =
        `Trang ${paymentCurrentPage} / ${totalPages}`;

    paymentElement("paymentPrevPage").disabled =
        paymentCurrentPage <= 1;

    paymentElement("paymentNextPage").disabled =
        paymentCurrentPage >= totalPages;

    if (currentItems.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" class="payment-empty-cell">
                    Không tìm thấy giao dịch phù hợp.
                </td>
            </tr>
        `;

        return;
    }

    tableBody.innerHTML = currentItems.map((row) => {
        const paymentId = getPaymentId(row);
        const invoiceId = getPaymentInvoiceId(row);

        const customerId =
            row.customer_id ??
            row.customerId ??
            "—";

        const method = row.payment_method ?? row.paymentMethod;
        const status = row.status ?? row.payment_status;

        const amount = getPaymentAmount(row);

        const date =
            row.confirmed_at ??
            row.paid_at ??
            row.created_at ??
            row.paymentDate;

        const normalizedStatus = normalizePaymentStatus(status);
        const canManagePayments = ["admin", "manager"].includes(paymentUserRole);
        const canConfirm = canManagePayments ||
            (paymentUserRole === "staff" &&
            String(method || "").toLowerCase() === "cash");

        const safeInvoiceId = escapePaymentHTML(invoiceId);
        const safePaymentId = escapePaymentHTML(paymentId);

        return `
            <tr>
                <td>
                    <span class="payment-id">
                        ${safePaymentId}
                    </span>
                </td>

                <td>
                    <span class="payment-invoice-id">
                        ${safeInvoiceId || "—"}
                    </span>
                </td>

                <td>
                    <span class="payment-customer-id">
                        ${escapePaymentHTML(customerId)}
                    </span>
                </td>

                <td>
                    <span class="payment-method">
                        ${getPaymentMethodLabel(method)}
                    </span>
                </td>

                <td>
                    <span class="payment-amount">
                        ${formatPaymentMoney(amount)}
                    </span>
                </td>

                <td>
                    ${renderPaymentStatus(status)}
                </td>

                <td>
                    <span class="payment-date">
                        ${formatPaymentDate(date)}
                    </span>
                </td>

                <td>
                    <div class="payment-actions">
                        <button
                            type="button"
                            class="payment-action-button"
                            data-action="detail"
                            data-invoice-id="${safeInvoiceId}">
                            Chi tiết
                        </button>

                        ${
                            normalizedStatus === "pending" && canConfirm
                                ? `
                                    <button
                                        type="button"
                                        class="payment-action-button confirm"
                                        data-action="confirm"
                                        data-invoice-id="${safeInvoiceId}"
                                        data-method="${escapePaymentHTML(method ?? "")}">
                                        Xác nhận
                                    </button>
                                `
                                : ""
                        }
                        ${
                            normalizedStatus === "pending" && canManagePayments
                                ? `
                                    <button
                                        type="button"
                                        class="payment-action-button cancel"
                                        data-action="cancel"
                                        data-invoice-id="${safeInvoiceId}">
                                        Hủy đơn
                                    </button>
                                `
                                : ""
                        }
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

// ============================================
// 9. XÁC NHẬN THANH TOÁN
// ============================================

async function confirmPayment(invoiceId, method) {
    if (!invoiceId) {
        showPaymentNotice("Không xác định được mã hóa đơn.");
        return;
    }

    const normalizedMethod = String(method ?? "").toLowerCase();

    if (paymentUserRole === "staff" && normalizedMethod !== "cash") {
        showPaymentNotice("Nhân viên chỉ được xác nhận thanh toán tiền mặt.");
        return;
    }

    if (!["cash", "bank_transfer"].includes(normalizedMethod)) {
        showPaymentNotice("Phương thức thanh toán không hợp lệ.");
        return;
    }

    let confirmMessage =
        `Bạn có chắc chắn muốn xác nhận thanh toán hóa đơn ${invoiceId}?`;

    if (normalizedMethod === "bank_transfer") {
        confirmMessage =
            `Chỉ xác nhận hóa đơn ${invoiceId} sau khi đã kiểm tra giao dịch chuyển khoản thực tế. Bạn đã xác minh khoản tiền đã nhận chưa?`;
    }

    if (!window.confirm(confirmMessage)) {
        return;
    }

    try {
        const params = new URLSearchParams({
            paymentMethod: normalizedMethod
        });

        await paymentFetchJson(
            `${PAYMENT_API_BASE}/invoices/${encodeURIComponent(invoiceId)}/confirm?${params}`,
            {
                method: "POST"
            }
        );

        showPaymentNotice(
            `Đã gửi yêu cầu xác nhận thanh toán hóa đơn ${invoiceId}.`
        );

        await refreshPaymentsPage();

    } catch (error) {
        showPaymentNotice(
            error.message || "Không thể xác nhận thanh toán."
        );
    }
}

async function cancelPayment(invoiceId) {
    if (!invoiceId || !["admin", "manager"].includes(paymentUserRole)) {
        showPaymentNotice("Bạn không có quyền hủy giao dịch này.");
        return;
    }

    if (!window.confirm(
        `Hủy hóa đơn ${invoiceId} đang chờ thanh toán? Lịch sử sẽ được giữ lại.`
    )) {
        return;
    }

    try {
        await paymentFetchJson(
            `${PAYMENT_API_BASE}/invoices/${encodeURIComponent(invoiceId)}/cancel`,
            { method: "POST" }
        );
        showPaymentNotice(`Đã hủy hóa đơn ${invoiceId}. Lịch sử được giữ lại.`);
        await refreshPaymentsPage();
    } catch (error) {
        showPaymentNotice(error.message || "Không thể hủy hóa đơn.");
    }
}

// ============================================
// 10. HIỂN THỊ CHI TIẾT HÓA ĐƠN
// ============================================

function openPaymentDetailDialog() {
    const dialog = paymentElement("paymentDetailDialog");

    dialog.hidden = false;
    document.body.style.overflow = "hidden";
}

function closePaymentDetailDialog() {
    const dialog = paymentElement("paymentDetailDialog");

    dialog.hidden = true;
    document.body.style.overflow = "";
}

async function openPaymentDetail(invoiceId) {
    if (!invoiceId) {
        showPaymentNotice("Không xác định được mã hóa đơn.");
        return;
    }

    const dialog = paymentElement("paymentDetailDialog");
    const content = paymentElement("paymentDetailContent");

    paymentElement("paymentDetailInvoiceId").textContent =
        `Hóa đơn: ${invoiceId}`;

    content.innerHTML = `
        <div class="payment-detail-loading">
            Đang tải thông tin hóa đơn...
        </div>
    `;

    openPaymentDetailDialog();

    try {
        const encodedId = encodeURIComponent(invoiceId);

        const [invoiceData, historyData] = await Promise.all([
            paymentFetchJson(
                `${INVOICE_API_BASE}/${encodedId}`
            ),

            paymentFetchJson(
                `${PAYMENT_API_BASE}/invoices/${encodedId}/history`
            )
        ]);

        const invoice = invoiceData?.invoice ?? invoiceData;
        const items = Array.isArray(invoiceData?.items)
            ? invoiceData.items
            : Array.isArray(invoice?.items)
                ? invoice.items
                : Array.isArray(invoice?.invoice_items)
                    ? invoice.invoice_items
                    : [];

        const history = Array.isArray(historyData)
            ? historyData
            : Array.isArray(historyData?.history)
                ? historyData.history
                : [];

        renderPaymentDetail(invoice, items, history);

    } catch (error) {
        content.innerHTML = `
            <div class="payment-detail-loading">
                ${escapePaymentHTML(error.message)}
            </div>
        `;
    }
}

// ============================================
// 11. RENDER CHI TIẾT HÓA ĐƠN
// ============================================

function renderPaymentDetail(invoice, items, history) {
    const content = paymentElement("paymentDetailContent");

    if (!invoice || typeof invoice !== "object") {
        content.innerHTML = `
            <div class="payment-detail-loading">
                Không tìm thấy thông tin hóa đơn.
            </div>
        `;

        return;
    }

    const invoiceId =
        invoice.invoice_id ??
        invoice.invoiceId ??
        invoice._id ??
        "—";

    const customerId =
        invoice.customer_id ??
        invoice.customerId ??
        "—";

    const employeeId =
        invoice.employee_id ??
        invoice.employeeId ??
        "—";

    const branchId =
        invoice.branch_id ??
        invoice.branchId ??
        "—";

    const method =
        invoice.payment_method ??
        invoice.paymentMethod;

    const status =
        invoice.payment_status ??
        invoice.paymentStatus ??
        invoice.status;

    const subtotal = Number(invoice.subtotal ?? 0);
    const discount = Number(invoice.discount ?? 0);
    const total = Number(invoice.total ?? invoice.amount ?? 0);

    const createdAt =
        invoice.created_at ??
        invoice.createdAt;

    const paidAt =
        invoice.paid_at ??
        invoice.paidAt;

    const transferReference =
        invoice.transfer_reference ??
        invoice.transferReference ??
        "";

    const note = invoice.note ?? "";

    const itemRows = items.length
        ? items.map((item, index) => {
            const name =
                item.item_name ??
                item.name ??
                item.product_name ??
                item.service_name ??
                item.item_id ??
                "Sản phẩm / dịch vụ";

            const quantity = Number(item.quantity ?? 1);
            const price = Number(
                item.unit_price ??
                item.price ??
                0
            );

            const itemSubtotal = Number(
                item.subtotal ??
                price * quantity
            );

            return `
                <tr>
                    <td>${index + 1}</td>
                    <td>${escapePaymentHTML(name)}</td>
                    <td>${quantity}</td>
                    <td>${formatPaymentMoney(price)}</td>
                    <td>${formatPaymentMoney(itemSubtotal)}</td>
                </tr>
            `;
        }).join("")
        : `
            <tr>
                <td colspan="5" class="payment-empty-cell">
                    Không có dữ liệu sản phẩm hoặc dịch vụ.
                </td>
            </tr>
        `;

    const historyHTML = history.length
        ? history.map((item) => `
            <div class="payment-history-item">
                <div>
                    <strong>
                        ${getPaymentStatusLabel(item.status)}
                    </strong>
                    <div>
                        ${getPaymentMethodLabel(item.payment_method)}
                    </div>
                </div>

                <span>
                    ${formatPaymentDate(
                        item.confirmed_at ??
                        item.paid_at ??
                        item.created_at
                    )}
                </span>
            </div>
        `).join("")
        : `
            <div class="payment-detail-note">
                Chưa có lịch sử giao dịch được ghi nhận.
            </div>
        `;

    content.innerHTML = `
        <div class="payment-detail-section">
            <h3>Thông tin hóa đơn</h3>

            <div class="payment-detail-grid">
                <div class="payment-detail-item">
                    <span>Mã hóa đơn</span>
                    <strong>${escapePaymentHTML(invoiceId)}</strong>
                </div>

                <div class="payment-detail-item">
                    <span>Trạng thái</span>
                    <strong>
                        ${renderPaymentStatus(status)}
                    </strong>
                </div>

                <div class="payment-detail-item">
                    <span>Mã khách hàng</span>
                    <strong>${escapePaymentHTML(customerId)}</strong>
                </div>

                <div class="payment-detail-item">
                    <span>Mã nhân viên</span>
                    <strong>${escapePaymentHTML(employeeId)}</strong>
                </div>

                <div class="payment-detail-item">
                    <span>Mã chi nhánh</span>
                    <strong>${escapePaymentHTML(branchId)}</strong>
                </div>

                <div class="payment-detail-item">
                    <span>Phương thức thanh toán</span>
                    <strong>${getPaymentMethodLabel(method)}</strong>
                </div>

                <div class="payment-detail-item">
                    <span>Ngày tạo hóa đơn</span>
                    <strong>${formatPaymentDate(createdAt)}</strong>
                </div>

                <div class="payment-detail-item">
                    <span>Ngày thanh toán</span>
                    <strong>${formatPaymentDate(paidAt)}</strong>
                </div>
            </div>
        </div>

        <div class="payment-detail-section">
            <h3>Danh sách sản phẩm / dịch vụ</h3>

            <div class="payment-detail-table-wrapper">
                <table class="payment-detail-table">
                    <thead>
                        <tr>
                            <th>STT</th>
                            <th>Tên sản phẩm / dịch vụ</th>
                            <th>SL</th>
                            <th>Đơn giá</th>
                            <th>Thành tiền</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${itemRows}
                    </tbody>
                </table>
            </div>
        </div>

        <div class="payment-detail-section">
            <h3>Tổng kết hóa đơn</h3>

            <div class="payment-detail-grid">
                <div class="payment-detail-item">
                    <span>Tạm tính</span>
                    <strong>${formatPaymentMoney(subtotal)}</strong>
                </div>

                <div class="payment-detail-item">
                    <span>Giảm giá</span>
                    <strong>${formatPaymentMoney(discount)}</strong>
                </div>

                <div class="payment-detail-item">
                    <span>Tổng thanh toán</span>
                    <strong class="payment-detail-total">
                        ${formatPaymentMoney(total)}
                    </strong>
                </div>

                <div class="payment-detail-item">
                    <span>Mã tham chiếu chuyển khoản</span>
                    <strong>
                        ${escapePaymentHTML(transferReference || "—")}
                    </strong>
                </div>
            </div>
        </div>

        <div class="payment-detail-section">
            <h3>Lịch sử thanh toán</h3>

            <div class="payment-detail-history">
                ${historyHTML}
            </div>
        </div>

        ${
            note
                ? `
                    <div class="payment-detail-section">
                        <h3>Ghi chú</h3>
                        <div class="payment-detail-note">
                            ${escapePaymentHTML(note)}
                        </div>
                    </div>
                `
                : ""
        }
    `;
}

// ============================================
// 12. LÀM MỚI TOÀN BỘ TRANG
// ============================================

async function refreshPaymentsPage() {
    const tasks = [loadPayments()];
    const canViewPaymentReports = ["admin", "manager"].includes(
        paymentUserRole
    );

    const statsGrid = document.querySelector(".payment-stats-grid");
    const revenueGrid = document.querySelector(".payment-revenue-grid");
    if (statsGrid) statsGrid.hidden = !canViewPaymentReports;
    if (revenueGrid) revenueGrid.hidden = !canViewPaymentReports;

    if (canViewPaymentReports) {
        tasks.unshift(loadPaymentStatistics());
    } else {
        const heading = document.querySelector(".payment-page-heading h2");
        if (heading) heading.textContent = "Giao dịch trong phạm vi của tôi";
    }

    const results = await Promise.allSettled(tasks);
    const statisticsFailed = canViewPaymentReports
        && results[0]?.status === "rejected";

    if (statisticsFailed) {
        showPaymentNotice(
            results[0].reason?.message ||
            "Không thể tải thống kê thanh toán."
        );
    }
}

// ============================================
// 13. XÓA BỘ LỌC
// ============================================

function clearPaymentFilters() {
    paymentElement("paymentKeyword").value = "";
    paymentElement("paymentStatusFilter").value = "";
    paymentElement("paymentMethodFilter").value = "";
    paymentElement("paymentFromDate").value = "";
    paymentElement("paymentToDate").value = "";

    paymentCurrentPage = 1;

    loadPayments();
}

// ============================================
// 14. SỰ KIỆN
// ============================================

function initializePaymentEvents() {
    // Lọc giao dịch
    paymentElement("paymentFilterForm").addEventListener(
        "submit",
        (event) => {
            event.preventDefault();
            paymentCurrentPage = 1;
            loadPayments();
        }
    );

    // Xóa bộ lọc
    paymentElement("clearPaymentFilters").addEventListener(
        "click",
        clearPaymentFilters
    );

    // Làm mới
    paymentElement("refreshPayments").addEventListener(
        "click",
        refreshPaymentsPage
    );

    // Đóng thông báo
    paymentElement("closePaymentNotice").addEventListener(
        "click",
        hidePaymentNotice
    );

    // Phân trang trước
    paymentElement("paymentPrevPage").addEventListener(
        "click",
        () => {
            if (paymentCurrentPage > 1) {
                paymentCurrentPage--;
                renderPayments();
            }
        }
    );

    // Phân trang tiếp
    paymentElement("paymentNextPage").addEventListener(
        "click",
        () => {
            const totalPages = Math.max(
                1,
                Math.ceil(paymentList.length / PAYMENT_PAGE_SIZE)
            );

            if (paymentCurrentPage < totalPages) {
                paymentCurrentPage++;
                renderPayments();
            }
        }
    );

    // Thao tác trên bảng
    paymentElement("paymentTableBody").addEventListener(
        "click",
        async (event) => {
            const button = event.target.closest("button[data-action]");

            if (!button) {
                return;
            }

            const action = button.dataset.action;
            const invoiceId = button.dataset.invoiceId;

            if (!invoiceId) {
                showPaymentNotice("Không tìm thấy mã hóa đơn.");
                return;
            }

            if (action === "detail") {
                await openPaymentDetail(invoiceId);
            }

            if (action === "confirm") {
                button.disabled = true;

                try {
                    await confirmPayment(
                        invoiceId,
                        button.dataset.method
                    );
                } finally {
                    button.disabled = false;
                }
            }

            if (action === "cancel") {
                button.disabled = true;

                try {
                    await cancelPayment(invoiceId);
                } finally {
                    button.disabled = false;
                }
            }
        }
    );

    // Đóng dialog chi tiết
    paymentElement("closePaymentDetail").addEventListener(
        "click",
        closePaymentDetailDialog
    );

    paymentElement("paymentDetailCloseButton").addEventListener(
        "click",
        closePaymentDetailDialog
    );

    // Đóng dialog bằng phím Escape
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closePaymentDetailDialog();
        }
    });
}

// ============================================
// 15. KHỞI TẠO
// ============================================

document.addEventListener("DOMContentLoaded", async () => {
    paymentElement("paymentCurrentYear").textContent =
        new Date().getFullYear();

    try {
        const auth = await paymentFetchJson(AUTH_API_URL);
        paymentUserRole = String(auth?.user?.role || "staff")
            .replace(/^ROLE_/i, "")
            .toLowerCase();
    } catch (error) {
        showPaymentNotice("Không xác minh được quyền: " + error.message);
        return;
    }

    initializePaymentEvents();
    refreshPaymentsPage();
});