"use strict";

// API thanh toán.
const DASHBOARD_PAYMENT_API =
    "http://127.0.0.1:8080/api/payments";

/**
 * Định dạng tiền Việt Nam.
 */
function dashboardPaymentMoney(value) {

    const amount = Number(value ?? 0);

    if (!Number.isFinite(amount)) {
        return "—";
    }

    return new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
        maximumFractionDigits: 0
    }).format(amount);
}

/**
 * Định dạng ngày tháng.
 */
function dashboardPaymentDate(value) {

    if (!value) {
        return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return new Intl.DateTimeFormat("vi-VN", {
        dateStyle: "short",
        timeStyle: String(value).includes("T")
            ? "short"
            : undefined
    }).format(date);
}

/**
 * Chống chèn HTML không an toàn.
 */
function dashboardPaymentEscape(value) {

    return String(value ?? "").replace(
        /[&<>"']/g,
        character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]
    );
}

/**
 * Hiển thị trạng thái giao dịch.
 */
function dashboardPaymentStatus(status) {

    return ({
        pending: "Đang chờ",
        paid: "Đã thanh toán",
        cancelled: "Đã hủy"
    })[String(status ?? "").toLowerCase()]
        || status
        || "Không xác định";
}

/**
 * Hiển thị phương thức thanh toán.
 */
function dashboardPaymentMethod(method) {

    return ({
        cash: "Tiền mặt",
        bank_transfer: "Chuyển khoản"
    })[String(method ?? "").toLowerCase()]
        || method
        || "—";
}

/**
 * Tải tổng quan thanh toán lên Dashboard.
 */
async function loadDashboardPaymentOverview() {

    const message = document.getElementById(
        "dashboardPaymentMessage"
    );

    const section = document.querySelector(".payment-dashboard-section");

    try {
        const authResponse = await fetch(
            "http://127.0.0.1:8080/api/auth/me",
            {
                credentials: "include",
                headers: { Accept: "application/json" }
            }
        );

        const auth = authResponse.ok
            ? await authResponse.json()
            : null;
        const role = String(auth?.user?.role || "staff")
            .replace(/^ROLE_/i, "")
            .toLowerCase();

        if (!["admin", "manager"].includes(role)) {
            if (section) section.hidden = true;
            return;
        }

        if (section) section.hidden = false;
    } catch {
        if (section) section.hidden = true;
        return;
    }

    const table = document.getElementById(
        "dashboardPaymentTable"
    );

    try {

        // Gọi đồng thời API thống kê và API giao dịch.
        const [
            statsResponse,
            paymentsResponse
        ] = await Promise.all([

            fetch(
                `${DASHBOARD_PAYMENT_API}/statistics`,
                {
                    credentials: "include",
                    headers: {
                        Accept: "application/json"
                    }
                }
            ),

            fetch(
                `${DASHBOARD_PAYMENT_API}?`,
                {
                    credentials: "include",
                    headers: {
                        Accept: "application/json"
                    }
                }
            )

        ]);

        if (!statsResponse.ok) {
            throw new Error(
                `API thống kê HTTP ${statsResponse.status}`
            );
        }

        if (!paymentsResponse.ok) {
            throw new Error(
                `API giao dịch HTTP ${paymentsResponse.status}`
            );
        }

        const [
            stats,
            payments
        ] = await Promise.all([

            statsResponse.json(),

            paymentsResponse.json()

        ]);

        // Cập nhật số giao dịch đã thanh toán.
        document.getElementById(
            "dashboardPaidPayments"
        ).textContent = Number(
            stats.paidTransactions ?? 0
        ).toLocaleString("vi-VN");

        // Cập nhật số giao dịch đang chờ.
        document.getElementById(
            "dashboardPendingPayments"
        ).textContent = Number(
            stats.pendingTransactions ?? 0
        ).toLocaleString("vi-VN");

        // Cập nhật số chuyển khoản chờ đối soát.
        document.getElementById(
            "dashboardPendingTransfers"
        ).textContent = Number(
            stats.pendingBankTransfers ?? 0
        ).toLocaleString("vi-VN");

        // Cập nhật doanh thu đã thu.
        document.getElementById(
            "dashboardPaymentTotalRevenue"
        ).textContent = dashboardPaymentMoney(
            stats.totalRevenue
        );

        // Lấy 5 giao dịch gần nhất.
        const rows = Array.isArray(payments)
            ? payments.slice(0, 5)
            : [];

        if (rows.length === 0) {

            table.innerHTML = `
                <tr>
                    <td
                        colspan="5"
                        class="dashboard-payment-empty">

                        Chưa có giao dịch.

                    </td>
                </tr>
            `;

        } else {

            table.innerHTML = rows.map(row => {

                const status = String(
                    row.status ?? ""
                ).toLowerCase();

                return `
                    <tr>

                        <td>
                            <strong>
                                ${dashboardPaymentEscape(
                                    row.invoice_id || "—"
                                )}
                            </strong>
                        </td>

                        <td>
                            ${dashboardPaymentEscape(
                                row.customer_id || "—"
                            )}
                        </td>

                        <td>
                            ${dashboardPaymentEscape(
                                dashboardPaymentMethod(
                                    row.payment_method
                                )
                            )}
                        </td>

                        <td>
                            ${dashboardPaymentEscape(
                                dashboardPaymentMoney(
                                    row.amount
                                )
                            )}
                        </td>

                        <td>
                            <span class="dashboard-payment-badge ${dashboardPaymentEscape(status)}">

                                ${dashboardPaymentEscape(
                                    dashboardPaymentStatus(status)
                                )}

                            </span>
                        </td>

                    </tr>
                `;

            }).join("");
        }

        if (message) {
            message.textContent = "";
        }

    } catch (error) {

        if (message) {

            message.textContent =
                `Không tải được thống kê thanh toán: ${error.message}. ` +
                "Kiểm tra backend và CouchDB.";
        }

        if (table) {

            table.innerHTML = `
                <tr>
                    <td
                        colspan="5"
                        class="dashboard-payment-empty">

                        Không tải được giao dịch.

                    </td>
                </tr>
            `;
        }
    }
}

// Khởi tạo dữ liệu thanh toán khi tải Dashboard.
loadDashboardPaymentOverview();