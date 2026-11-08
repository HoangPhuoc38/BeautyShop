
"use strict";

(() => {

    // =====================================================
    // 1. CẤU HÌNH
    // =====================================================

    const PAYMENT_API =
        "http://127.0.0.1:8080/api/payments";


    // =====================================================
    // 2. LẤY CÁC PHẦN TỬ HTML
    // =====================================================

    const elements = {
        search: document.getElementById("globalSearch"),

        searchResults: document.getElementById(
            "dashboardSearchResults"
        ),

        notificationButton: document.getElementById(
            "notificationButton"
        ),

        notificationCount: document.getElementById(
            "notificationCount"
        ),

        notificationDot: document.getElementById(
            "notificationDot"
        ),

        notificationPanel: document.getElementById(
            "notificationPanel"
        ),

        notificationList: document.getElementById(
            "notificationList"
        ),

        closeNotification: document.getElementById(
            "closeNotification"
        ),

        supportButton: document.getElementById(
            "supportButton"
        ),

        supportDialog: document.getElementById(
            "supportDialog"
        ),

        closeSupportDialog: document.getElementById(
            "closeSupportDialog"
        ),

        userName: document.getElementById(
            "currentUserName"
        ),

        userRole: document.getElementById(
            "currentUserRole"
        )
    };


    // =====================================================
    // 3. HÀM TIỆN ÍCH
    // =====================================================

    function escapeHtml(value) {

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


    function formatMoney(value) {

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


    function formatDate(value) {

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


    // =====================================================
    // 4. CHUẨN HÓA TỪ KHÓA TÌM KIẾM
    // =====================================================

    /*
     * Chuyển tiếng Việt có dấu thành không dấu.
     *
     * Nguyễn Thị Mai -> nguyen thi mai
     * Chăm sóc da    -> cham soc da
     * Đã xác nhận    -> da xac nhan
     */

    function normalizeSearchText(value) {

        return String(value ?? "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[đĐ]/g, "d")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();
    }


    // =====================================================
    // 5. GỌI API
    // =====================================================

    async function getJson(url) {

        const response = await fetch(url, {
            method: "GET",
            credentials: "include",

            headers: {
                Accept: "application/json"
            },

            signal: AbortSignal.timeout(10000)
        });

        let data = null;

        try {
            data = await response.json();
        } catch {
            data = null;
        }

        if (!response.ok) {

            throw new Error(
                data?.message ||
                `Lỗi HTTP ${response.status}`
            );
        }

        return data;
    }


    // =====================================================
    // 6. THÔNG TIN TÀI KHOẢN
    // =====================================================

    const USER_STORAGE_KEYS = [
        "beautyshop_user",
        "beautyshopUser",
        "currentUser",
        "current_user",
        "authUser",
        "loggedInUser",
        "user"
    ];


    function readStoredUser() {

        const storages = [
            window.localStorage,
            window.sessionStorage
        ];

        for (const storage of storages) {

            for (const key of USER_STORAGE_KEYS) {

                try {

                    const raw = storage.getItem(key);

                    if (!raw) {
                        continue;
                    }

                    let user;

                    try {

                        user = JSON.parse(raw);

                    } catch {

                        user = {
                            username: raw
                        };
                    }

                    if (
                        !user ||
                        typeof user !== "object" ||
                        Array.isArray(user)
                    ) {
                        continue;
                    }

                    if (user.data?.user) {

                        user = user.data.user;

                    } else if (user.user) {

                        user = user.user;
                    }

                    return user;

                } catch (error) {

                    console.warn(
                        "[Dashboard] Không đọc được tài khoản:",
                        error
                    );
                }
            }
        }

        return null;
    }


    function displayCurrentUser() {

        const user = readStoredUser();

        if (!user) {
            return;
        }

        const name =
            user.fullName ||
            user.full_name ||
            user.displayName ||
            user.name ||
            user.username ||
            user.email;

        const role =
            user.roleName ||
            user.role_name ||
            user.role ||
            user.authority;

        if (name && elements.userName) {

            elements.userName.textContent =
                String(name);
        }

        if (role && elements.userRole) {

            const normalizedRole = String(role)
                .replace(/^ROLE_/i, "")
                .replaceAll("_", " ");

            elements.userRole.textContent =
                normalizedRole.charAt(0).toUpperCase() +
                normalizedRole.slice(1).toLowerCase();
        }
    }


    // =====================================================
    // 7. CHỨC NĂNG HỖ TRỢ
    // =====================================================

    function openSupport() {

        if (!elements.supportDialog) {
            return;
        }

        if (
            typeof elements.supportDialog.showModal ===
            "function"
        ) {

            if (!elements.supportDialog.open) {
                elements.supportDialog.showModal();
            }

        } else {

            elements.supportDialog.setAttribute("open", "");
        }
    }


    function closeSupport() {

        if (!elements.supportDialog) {
            return;
        }

        if (
            typeof elements.supportDialog.close ===
            "function"
        ) {

            if (elements.supportDialog.open) {
                elements.supportDialog.close();
            }

        } else {

            elements.supportDialog.removeAttribute("open");
        }
    }


    elements.supportButton?.addEventListener(
        "click",
        openSupport
    );


    elements.closeSupportDialog?.addEventListener(
        "click",
        closeSupport
    );


    elements.supportDialog?.addEventListener(
        "click",
        event => {

            if (event.target === elements.supportDialog) {
                closeSupport();
            }
        }
    );


    // =====================================================
    // 8. LẤY TOÀN BỘ DỮ LIỆU LỊCH HẸN
    // =====================================================

    function getAllAppointments() {

        if (
            typeof dashboardData === "undefined" ||
            !Array.isArray(dashboardData.appointments)
        ) {
            return [];
        }

        return dashboardData.appointments;
    }


    // =====================================================
    // 9. TẠO NỘI DUNG TÌM KIẾM CỦA LỊCH HẸN
    // =====================================================

    function getAppointmentSearchContent(appointment) {

        if (
            typeof buildAppointmentSearchText ===
            "function"
        ) {

            return buildAppointmentSearchText(appointment);
        }

        // Phương án dự phòng nếu hàm chưa được tải.
        return [
            appointment.appointment_id,
            appointment.customer_id,
            appointment.customer_name,
            appointment.customerName,
            appointment.service_ids,
            appointment.service_name,
            appointment.appointment_date,
            appointment.start_time,
            appointment.status,
            appointment.note
        ]
            .filter(Boolean)
            .join(" ");
    }


    // =====================================================
    // 10. LẤY CÁC DÒNG LỊCH HẸN ĐANG HIỂN THỊ
    // =====================================================

    function getAppointmentRows() {

        const table = document.getElementById(
            "appointmentTable"
        );

        if (!table) {
            return [];
        }

        return Array.from(
            table.querySelectorAll("tr")
        ).filter(row => {

            return !row.querySelector("[colspan]");
        });
    }


    // =====================================================
    // 11. HIỂN THỊ KẾT QUẢ TÌM KIẾM
    // =====================================================

    function renderSearchResults(keyword, matchedRows) {

        if (!elements.searchResults) {
            return;
        }

        if (!keyword) {

            elements.searchResults.hidden = true;

            elements.searchResults.innerHTML = "";

            return;
        }

        elements.searchResults.hidden = false;

        if (matchedRows.length === 0) {

            elements.searchResults.innerHTML = `

                <div class="search-empty">

                    <strong>Không tìm thấy lịch hẹn</strong>

                    <p>
                        Không có lịch hẹn nào phù hợp với
                        từ khóa "${escapeHtml(keyword)}".
                    </p>

                    <a href="appointments.html">
                        Mở quản lý lịch hẹn →
                    </a>

                </div>
            `;

            return;
        }

        // Hiển thị tối đa 6 gợi ý trong hộp tìm kiếm.
        const resultItems = matchedRows
            .slice(0, 6)
            .map((row, index) => {

                const title = row.innerText
                    .replace(/\s+/g, " ")
                    .trim();

                return `

                    <button
                        type="button"
                        class="search-result-item"
                        data-search-index="${index}">

                        <span class="search-result-icon">
                            ▣
                        </span>

                        <span>
                            ${escapeHtml(title)}
                        </span>

                    </button>
                `;
            })
            .join("");


        elements.searchResults.innerHTML = `

            <div class="search-result-heading">

                Tìm thấy ${matchedRows.length} lịch hẹn

            </div>

            ${resultItems}

            <a
                href="appointments.html"
                class="search-all-link">

                Xem toàn bộ lịch hẹn →

            </a>
        `;


        // Nhấn kết quả để cuộn đến dòng tương ứng.
        elements.searchResults
            .querySelectorAll("[data-search-index]")
            .forEach(button => {

                button.addEventListener("click", () => {

                    const index = Number(
                        button.dataset.searchIndex
                    );

                    const row = matchedRows[index];

                    if (!row) {
                        return;
                    }

                    row.scrollIntoView({
                        behavior: "smooth",
                        block: "center"
                    });

                    row.classList.add(
                        "dashboard-search-highlight"
                    );

                    window.setTimeout(() => {

                        row.classList.remove(
                            "dashboard-search-highlight"
                        );

                    }, 1800);

                    elements.searchResults.hidden = true;
                });
            });
    }


    // =====================================================
    // 12. TÌM KIẾM TRÊN TOÀN BỘ LỊCH HẸN
    // =====================================================

    function searchAppointments() {

        if (!elements.search) {
            return;
        }

        const rawKeyword =
            elements.search.value.trim();

        const keyword =
            normalizeSearchText(rawKeyword);

        const table = document.getElementById(
            "appointmentTable"
        );

        if (!table) {
            return;
        }


        // -------------------------------------
        // XÓA TỪ KHÓA: HIỂN THỊ LẠI 5 LỊCH GẦN NHẤT
        // -------------------------------------

        if (!keyword) {

            elements.searchResults &&
                (elements.searchResults.hidden = true);

            if (elements.searchResults) {
                elements.searchResults.innerHTML = "";
            }

            if (
                typeof loadAppointments === "function"
            ) {
                loadAppointments();
            }

            return;
        }


        // -------------------------------------
        // LẤY TOÀN BỘ LỊCH HẸN TỪ DASHBOARD DATA
        // -------------------------------------

        const allAppointments =
            getAllAppointments();


        // -------------------------------------
        // KIỂM TRA DỮ LIỆU ĐÃ TẢI HAY CHƯA
        // -------------------------------------

        if (allAppointments.length === 0) {

            table.innerHTML = `

                <tr>
                    <td colspan="4" class="empty">

                        Chưa có dữ liệu lịch hẹn để tìm kiếm.

                    </td>
                </tr>

            `;

            renderSearchResults(rawKeyword, []);

            return;
        }


        // -------------------------------------
        // TÌM TRÊN TẤT CẢ LỊCH HẸN
        // -------------------------------------

        const matchedAppointments =
            allAppointments.filter(appointment => {

                const searchContent =
                    getAppointmentSearchContent(appointment);

                const normalizedContent =
                    normalizeSearchText(searchContent);

                return normalizedContent.includes(keyword);
            });


        // -------------------------------------
        // HIỂN THỊ KẾT QUẢ TRÊN BẢNG
        // -------------------------------------

        table.replaceChildren();

        const renderedRows = [];

        if (matchedAppointments.length === 0) {

            const row = document.createElement("tr");

            const cell = document.createElement("td");

            cell.colSpan = 4;

            cell.className = "empty";

            cell.textContent =
                "Không tìm thấy lịch hẹn phù hợp.";

            row.appendChild(cell);

            table.appendChild(row);

            renderSearchResults(rawKeyword, []);

            console.log(
                `[Dashboard Search] Không tìm thấy: ${rawKeyword}`
            );

            return;
        }


        // Tạo lại tất cả dòng khớp.
        matchedAppointments.forEach(appointment => {

            if (
                typeof createAppointmentRow !==
                "function"
            ) {
                return;
            }

            const row = createAppointmentRow(appointment);

            table.appendChild(row);

            renderedRows.push(row);
        });


        // Hiển thị hộp kết quả.
        renderSearchResults(
            rawKeyword,
            renderedRows
        );

        console.log(
            `[Dashboard Search] Từ khóa "${rawKeyword}" tìm thấy ${matchedAppointments.length}/${allAppointments.length} lịch hẹn.`
        );
    }


    // =====================================================
    // 13. ĐĂNG KÝ SỰ KIỆN TÌM KIẾM
    // =====================================================

    elements.search?.addEventListener(
        "input",
        searchAppointments
    );


    /*
     * Nếu người dùng bắt đầu tìm trước khi API tải xong,
     * tìm kiếm tự chạy lại sau khi toàn bộ lịch hẹn tải xong.
     */

    document.addEventListener(
        "dashboard:appointments-loaded",
        () => {

            if (elements.search?.value.trim()) {
                searchAppointments();
            }
        }
    );


    // =====================================================
    // 14. ĐÓNG HỘP KẾT QUẢ KHI CLICK RA NGOÀI
    // =====================================================

    document.addEventListener("click", event => {

        const container = document.querySelector(
            ".dashboard-search-container"
        );

        if (
            container &&
            !container.contains(event.target) &&
            elements.searchResults
        ) {

            elements.searchResults.hidden = true;
        }
    });


    // =====================================================
    // 15. THÔNG TIN PHƯƠNG THỨC THANH TOÁN
    // =====================================================

    function paymentMethodName(method) {

        const labels = {
            cash: "Tiền mặt",
            bank_transfer: "Chuyển khoản"
        };

        return labels[String(method ?? "").toLowerCase()]
            || method
            || "Không xác định";
    }


    // =====================================================
    // 16. HIỂN THỊ TRẠNG THÁI THÔNG BÁO
    // =====================================================

    function setNotificationCount(count) {

        const total = Math.max(
            0,
            Number(count) || 0
        );

        if (elements.notificationCount) {

            elements.notificationCount.textContent =
                total > 99 ? "99+" : String(total);

            elements.notificationCount.hidden =
                total === 0;
        }

        if (elements.notificationDot) {

            elements.notificationDot.hidden =
                total === 0;
        }
    }


    // =====================================================
    // 17. HIỂN THỊ DANH SÁCH THÔNG BÁO
    // =====================================================

    function renderNotifications(stats, payments) {

        if (!elements.notificationList) {
            return;
        }

        const pendingCount = Number(
            stats.pendingTransactions ?? 0
        );

        const pendingTransfers = Number(
            stats.pendingBankTransfers ?? 0
        );

        const rows = Array.isArray(payments)
            ? payments
            : [];

        let html = "";

        // Thông báo giao dịch đang chờ.
        if (pendingCount > 0) {

            html += `

                <a
                    href="payments.html"
                    class="notification-item">

                    <span class="notification-item-icon warning">
                        ₫
                    </span>

                    <span class="notification-item-content">

                        <strong>
                            Có ${pendingCount} giao dịch đang chờ
                        </strong>

                        <small>
                            ${pendingTransfers}
                            giao dịch chuyển khoản cần đối soát.
                        </small>

                    </span>

                    <span class="notification-arrow">
                        →
                    </span>

                </a>
            `;
        }


        // Các giao dịch đang chờ.
        rows.slice(0, 5).forEach(payment => {

            const invoiceId = payment.invoice_id || "—";

            html += `

                <a
                    href="payments.html"
                    class="notification-item">

                    <span class="notification-item-icon">
                        ₫
                    </span>

                    <span class="notification-item-content">

                        <strong>
                            Hóa đơn ${escapeHtml(invoiceId)}
                        </strong>

                        <small>
                            ${escapeHtml(
                                paymentMethodName(
                                    payment.payment_method
                                )
                            )}

                            ·

                            ${escapeHtml(
                                formatMoney(payment.amount)
                            )}
                        </small>

                        <small>
                            Tạo lúc:
                            ${escapeHtml(
                                formatDate(payment.created_at)
                            )}
                        </small>

                    </span>

                    <span class="notification-arrow">
                        →
                    </span>

                </a>
            `;
        });


        // Không có thông báo.
        if (!html) {

            html = `

                <div class="notification-empty">

                    <span>✓</span>

                    <strong>
                        Không có việc cần xử lý
                    </strong>

                    <p>
                        Hiện không có giao dịch thanh toán đang chờ.
                    </p>

                </div>
            `;
        }

        elements.notificationList.innerHTML = html;
    }


    // =====================================================
    // 18. TẢI THÔNG BÁO TỪ API THANH TOÁN
    // =====================================================

    async function loadDashboardNotifications() {

        if (!elements.notificationList) {
            return;
        }

        elements.notificationList.innerHTML = `
            <p class="notification-loading">
                Đang tải thông báo...
            </p>
        `;

        try {

            const [stats, payments] = await Promise.all([

                getJson(
                    `${PAYMENT_API}/statistics`
                ),

                getJson(
                    `${PAYMENT_API}?status=pending`
                )

            ]);

            setNotificationCount(
                stats.pendingTransactions
            );

            renderNotifications(
                stats,
                payments
            );

        } catch (error) {

            console.error(
                "[Dashboard] Lỗi tải thông báo:",
                error
            );

            elements.notificationList.innerHTML = `

                <div class="notification-error">

                    <strong>
                        Không tải được thông báo
                    </strong>

                    <p>
                        ${escapeHtml(error.message)}
                    </p>

                    <button
                        type="button"
                        id="retryNotifications">

                        Thử lại

                    </button>

                </div>
            `;

            elements.notificationList
                .querySelector("#retryNotifications")
                ?.addEventListener(
                    "click",
                    loadDashboardNotifications
                );
        }
    }


    // =====================================================
    // 19. MỞ / ĐÓNG BẢNG THÔNG BÁO
    // =====================================================

    function openNotificationPanel() {

        if (!elements.notificationPanel) {
            return;
        }

        const willOpen =
            elements.notificationPanel.hidden;

        elements.notificationPanel.hidden =
            !willOpen;

        elements.notificationButton?.setAttribute(
            "aria-expanded",
            String(willOpen)
        );

        if (willOpen) {
            loadDashboardNotifications();
        }
    }


    function closeNotificationPanel() {

        if (!elements.notificationPanel) {
            return;
        }

        elements.notificationPanel.hidden = true;

        elements.notificationButton?.setAttribute(
            "aria-expanded",
            "false"
        );
    }


    elements.notificationButton?.addEventListener(
        "click",
        openNotificationPanel
    );


    elements.closeNotification?.addEventListener(
        "click",
        closeNotificationPanel
    );


    // Click ngoài khu vực thông báo thì đóng.
    document.addEventListener("click", event => {

        const container = document.querySelector(
            ".dashboard-notification-container"
        );

        if (
            container &&
            !container.contains(event.target)
        ) {

            closeNotificationPanel();
        }
    });


    // Phím Escape đóng các bảng nổi.
    document.addEventListener("keydown", event => {

        if (event.key === "Escape") {

            closeNotificationPanel();

            if (elements.searchResults) {
                elements.searchResults.hidden = true;
            }

            closeSupport();
        }
    });


    // =====================================================
    // 20. KHỞI TẠO
    // =====================================================

    displayCurrentUser();

    // Tải số lượng thông báo khi mở Dashboard.
    loadDashboardNotifications();

})();
