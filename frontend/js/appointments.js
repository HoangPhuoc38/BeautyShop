
"use strict";

// =====================================================
// 1. CẤU HÌNH API
// =====================================================

const API_BASE = "http://127.0.0.1:8080/api";
const APPOINTMENT_API_URL = `${API_BASE}/appointments`;
const AUTH_API_URL = `${API_BASE}/auth/me`;

let appointmentList = [];
let filteredAppointments = [];
let currentAppointmentUser = null;

let currentPage = 1;
let pageSize = 10;
let isSavingAppointment = false;

// =====================================================
// 2. DOM ELEMENTS
// =====================================================

const appointmentElements = {
    tableBody: document.getElementById("appointmentsTableBody"),

    appointmentCount: document.getElementById("appointmentCount"),
    bookedCount: document.getElementById("bookedCount"),
    confirmedCount: document.getElementById("confirmedCount"),
    completedCount: document.getElementById("completedCount"),

    search: document.getElementById("appointmentSearch"),
    globalSearch: document.getElementById("globalSearch"),
    dateFilter: document.getElementById("dateFilter"),
    statusFilter: document.getElementById("statusFilter"),

    refreshButton: document.getElementById("refreshAppointmentsButton"),
    newButton: document.getElementById("newAppointmentButton"),

    formCard: document.getElementById("appointmentFormCard"),
    form: document.getElementById("appointmentForm"),
    formTitle: document.getElementById("formTitle"),

    docId: document.getElementById("appointmentDocId"),
    revision: document.getElementById("appointmentRevision"),

    appointmentId: document.getElementById("appointmentId"),
    customerId: document.getElementById("customerId"),
    employeeId: document.getElementById("employeeId"),
    serviceIds: document.getElementById("serviceIds"),
    branchId: document.getElementById("branchId"),
    appointmentDate: document.getElementById("appointmentDate"),
    startTime: document.getElementById("startTime"),
    status: document.getElementById("appointmentStatus"),
    note: document.getElementById("note"),

    saveButton: document.getElementById("saveAppointmentButton"),
    closeButton: document.getElementById("closeAppointmentFormButton"),
    cancelButton: document.getElementById("cancelAppointmentButton"),

    message: document.getElementById("appointmentMessage"),

    paginationStart: document.getElementById("paginationStart"),
    paginationEnd: document.getElementById("paginationEnd"),
    paginationTotal: document.getElementById("paginationTotal"),

    pageSizeSelect: document.getElementById("pageSize"),
    prevPageButton: document.getElementById("prevPageButton"),
    nextPageButton: document.getElementById("nextPageButton"),
    paginationNumbers: document.getElementById("paginationNumbers")
};

// =====================================================
// 3. NHÃN TRẠNG THÁI
// =====================================================

const APPOINTMENT_STATUS_LABELS = {
    booked: "Đã đặt lịch",
    confirmed: "Đã xác nhận",
    completed: "Hoàn thành",
    cancelled: "Đã hủy"
};

// =====================================================
// 4. KHỞI TẠO TRANG
// =====================================================

document.addEventListener(
    "DOMContentLoaded",
    initializeAppointmentPage
);

async function initializeAppointmentPage() {
    const currentYear = document.getElementById("currentYear");

    if (currentYear) {
        currentYear.textContent = new Date().getFullYear();
    }

    registerAppointmentEvents();

    const authenticated = await checkAppointmentAuthentication();

    if (!authenticated) {
        return;
    }

    const appointmentRole = String(currentAppointmentUser?.role || "")
        .replace(/^ROLE_/i, "")
        .toLowerCase();

    const backupButton = document.getElementById("backupAppointmentsButton");
    if (backupButton) backupButton.hidden = appointmentRole === "staff";

    await loadAppointments();
}

// =====================================================
// 5. KIỂM TRA ĐĂNG NHẬP
// =====================================================

async function checkAppointmentAuthentication() {
    try {
        const response = await fetch(AUTH_API_URL, {
            method: "GET",
            credentials: "include",
            headers: {
                Accept: "application/json"
            }
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

        currentAppointmentUser = data.user;

        console.log(
            "Tài khoản đang đăng nhập:",
            data.user
        );

        return true;

    } catch (error) {
        console.error(
            "Lỗi kiểm tra đăng nhập:",
            error
        );

        showAppointmentMessage(
            "Không thể kết nối máy chủ xác thực.",
            "error"
        );

        return false;
    }
}

// =====================================================
// 6. HÀM GỌI API
// =====================================================

async function appointmentFetch(url, options = {}) {
    const headers = {
        Accept: "application/json",
        ...(options.headers || {})
    };

    if (options.body && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
        ...options,
        credentials: "include",
        headers
    });

    const contentType =
        response.headers.get("content-type") || "";

    let data = null;

    if (contentType.includes("application/json")) {
        data = await response.json();
    } else {
        data = await response.text();
    }

    if (!response.ok) {
        if (
            response.status === 401 ||
            response.status === 403
        ) {
            window.location.href = "login.html";
        }

        const message =
            typeof data === "object" && data !== null
                ? data.message || data.error ||
                  "Có lỗi xảy ra khi xử lý yêu cầu."
                : data || "Có lỗi xảy ra khi xử lý yêu cầu.";

        throw new Error(message);
    }

    return data;
}

// =====================================================
// 7. ESCAPE HTML
// =====================================================

function escapeAppointmentHTML(value) {
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

// =====================================================
// 8. HIỂN THỊ THÔNG BÁO
// =====================================================

let appointmentMessageTimer = null;

function showAppointmentMessage(message, type = "info") {
    const element = appointmentElements.message;

    if (!element) return;

    clearTimeout(appointmentMessageTimer);

    element.textContent = message;
    element.className = `appointment-message ${type}`;
    element.hidden = false;

    if (type === "success") {
        appointmentMessageTimer = setTimeout(() => {
            hideAppointmentMessage();
        }, 4000);
    }
}

function hideAppointmentMessage() {
    const element = appointmentElements.message;

    if (!element) return;

    element.hidden = true;
    element.textContent = "";
    element.className = "appointment-message";
}

// =====================================================
// 9. ĐĂNG KÝ SỰ KIỆN
// =====================================================

function registerAppointmentEvents() {

    // Mở form thêm lịch hẹn.
    appointmentElements.newButton?.addEventListener(
        "click",
        openCreateAppointmentForm
    );

    // Đóng form.
    appointmentElements.closeButton?.addEventListener(
        "click",
        closeAppointmentForm
    );

    appointmentElements.cancelButton?.addEventListener(
        "click",
        closeAppointmentForm
    );

    // Lưu form.
    appointmentElements.form?.addEventListener(
        "submit",
        saveAppointment
    );

    // Tải lại danh sách.
    appointmentElements.refreshButton?.addEventListener(
        "click",
        loadAppointments
    );

    // Tìm kiếm trong danh sách.
    appointmentElements.search?.addEventListener(
        "input",
        handleAppointmentSearch
    );

    // Tìm kiếm từ topbar.
    appointmentElements.globalSearch?.addEventListener(
        "input",
        handleGlobalAppointmentSearch
    );

    // Lọc ngày.
    appointmentElements.dateFilter?.addEventListener(
        "change",
        handleAppointmentFilter
    );

    // Lọc trạng thái.
    appointmentElements.statusFilter?.addEventListener(
        "change",
        handleAppointmentFilter
    );

    // Thay đổi số dòng mỗi trang.
    appointmentElements.pageSizeSelect?.addEventListener(
        "change",
        function () {
            pageSize = Number(this.value) || 10;
            currentPage = 1;
            renderAppointments();
        }
    );

    // Trang trước.
    appointmentElements.prevPageButton?.addEventListener(
        "click",
        function () {
            if (currentPage > 1) {
                currentPage--;
                renderAppointments();
            }
        }
    );

    // Trang tiếp theo.
    appointmentElements.nextPageButton?.addEventListener(
        "click",
        function () {
            const totalPages = getAppointmentTotalPages();

            if (currentPage < totalPages) {
                currentPage++;
                renderAppointments();
            }
        }
    );

    // Sửa và xóa.
    appointmentElements.tableBody?.addEventListener(
        "click",
        handleAppointmentTableAction
    );
}

// =====================================================
// 10. TẢI DANH SÁCH LỊCH HẸN
// =====================================================

async function loadAppointments() {
    const refreshButton = appointmentElements.refreshButton;
    const tableBody = appointmentElements.tableBody;

    try {
        showAppointmentMessage(
            "Đang tải danh sách lịch hẹn...",
            "info"
        );

        if (refreshButton) {
            refreshButton.disabled = true;
            refreshButton.classList.add("loading");
        }

        if (tableBody) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="9">
                        Đang tải dữ liệu...
                    </td>
                </tr>
            `;
        }

        const data = await appointmentFetch(
            APPOINTMENT_API_URL
        );

        let records = [];

        if (Array.isArray(data)) {
            records = data;
        } else if (data && Array.isArray(data.data)) {
            records = data.data;
        } else if (
            data &&
            Array.isArray(data.appointments)
        ) {
            records = data.appointments;
        } else if (data && Array.isArray(data.rows)) {
            records = data.rows;
        }

        appointmentList = records.filter(appointment => {
            return appointment &&
                (
                    !appointment.type ||
                    appointment.type === "appointment"
                );
        });

        currentPage = 1;

        updateAppointmentStatistics();
        renderAppointments();

        hideAppointmentMessage();

        console.log(
            "Danh sách lịch hẹn:",
            appointmentList
        );

        return appointmentList;

    } catch (error) {
        console.error(
            "Lỗi tải danh sách lịch hẹn:",
            error
        );

        if (
            error.message.includes("401") ||
            error.message.includes("403")
        ) {
            window.location.href = "login.html";
            return [];
        }

        appointmentList = [];
        filteredAppointments = [];

        updateAppointmentStatistics();
        renderAppointments();

        showAppointmentMessage(
            "Không thể tải lịch hẹn: " + error.message,
            "error"
        );

        return [];

    } finally {
        if (refreshButton) {
            refreshButton.disabled = false;
            refreshButton.classList.remove("loading");
        }
    }
}

// =====================================================
// 11. THỐNG KÊ LỊCH HẸN
// =====================================================

function updateAppointmentStatistics() {
    const total = appointmentList.length;

    const booked = appointmentList.filter(
        appointment => appointment.status === "booked"
    ).length;

    const confirmed = appointmentList.filter(
        appointment => appointment.status === "confirmed"
    ).length;

    const completed = appointmentList.filter(
        appointment => appointment.status === "completed"
    ).length;

    appointmentElements.appointmentCount.textContent =
        total.toLocaleString("vi-VN");

    appointmentElements.bookedCount.textContent =
        booked.toLocaleString("vi-VN");

    appointmentElements.confirmedCount.textContent =
        confirmed.toLocaleString("vi-VN");

    appointmentElements.completedCount.textContent =
        completed.toLocaleString("vi-VN");
}

// =====================================================
// 12. TÌM KIẾM VÀ LỌC
// =====================================================

function handleAppointmentSearch() {
    currentPage = 1;
    renderAppointments();
}

function handleGlobalAppointmentSearch() {
    if (appointmentElements.search) {
        appointmentElements.search.value =
            appointmentElements.globalSearch.value;
    }

    currentPage = 1;
    renderAppointments();
}

function handleAppointmentFilter() {
    currentPage = 1;
    renderAppointments();
}

function getFilteredAppointments() {
    const keyword = (
        appointmentElements.search?.value || ""
    ).trim().toLowerCase();

    const date = appointmentElements.dateFilter?.value || "";

    const status =
        appointmentElements.statusFilter?.value || "";

    return appointmentList.filter(appointment => {
        const serviceIds = Array.isArray(appointment.service_ids)
            ? appointment.service_ids
            : [];

        const searchable = [
            appointment.appointment_id,
            appointment.customer_id,
            appointment.employee_id,
            appointment.branch_id,
            ...serviceIds
        ]
            .join(" ")
            .toLowerCase();

        const matchesKeyword =
            !keyword || searchable.includes(keyword);

        const matchesDate =
            !date || appointment.appointment_date === date;

        const matchesStatus =
            !status || appointment.status === status;

        return (
            matchesKeyword &&
            matchesDate &&
            matchesStatus
        );
    });
}

// =====================================================
// 13. HIỂN THỊ DANH SÁCH LỊCH HẸN
// =====================================================

function renderAppointments() {
    const filtered = getFilteredAppointments();

    filteredAppointments = filtered;

    const totalItems = filtered.length;

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

    const currentAppointments = filtered.slice(
        startIndex,
        endIndex
    );

    if (currentAppointments.length === 0) {
        appointmentElements.tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="table-empty">
                    Không tìm thấy lịch hẹn phù hợp.
                </td>
            </tr>
        `;
    } else {
        appointmentElements.tableBody.innerHTML =
            currentAppointments
                .map(renderAppointmentRow)
                .join("");
    }

    updateAppointmentPagination(
        totalItems,
        startIndex,
        endIndex
    );
}

// =====================================================
// 14. TẠO HTML MỘT DÒNG LỊCH HẸN
// =====================================================

function renderAppointmentRow(appointment) {
    const id = String(appointment._id || "");

    const appointmentCode =
        appointment.appointment_id || id || "N/A";

    const customerId =
        appointment.customer_id || "Chưa cập nhật";

    const employeeId =
        appointment.employee_id || "Chưa cập nhật";

    const branchId =
        appointment.branch_id || "Chưa cập nhật";

    const services = Array.isArray(appointment.service_ids)
        ? appointment.service_ids.join(", ")
        : "";

    const date = formatAppointmentDate(
        appointment.appointment_date
    );

    const time = appointment.start_time || "";

    const status = String(
        appointment.status || ""
    ).toLowerCase();

    const statusClass = {
        booked: "status-booked",
        confirmed: "status-confirmed",
        completed: "status-completed",
        cancelled: "status-cancelled"
    }[status] || "";

    const statusText =
        APPOINTMENT_STATUS_LABELS[status] ||
        "Không xác định";

    return `
        <tr>
            <td>
                <strong>
                    ${escapeAppointmentHTML(appointmentCode)}
                </strong>
            </td>

            <td>
                ${escapeAppointmentHTML(customerId)}
            </td>

            <td>
                ${escapeAppointmentHTML(employeeId)}
            </td>

            <td>
                ${escapeAppointmentHTML(services || "Chưa có dịch vụ")}
            </td>

            <td>
                ${escapeAppointmentHTML(branchId)}
            </td>

            <td>
                ${escapeAppointmentHTML(date)}
            </td>

            <td>
                ${escapeAppointmentHTML(time)}
            </td>

            <td>
                <span class="appointment-status ${statusClass}">
                    ${escapeAppointmentHTML(statusText)}
                </span>
            </td>

            <td>
                <div class="appointment-actions">

                    <button
                        type="button"
                        class="appointment-action-button appointment-edit-button"
                        data-action="edit"
                        data-id="${escapeAppointmentHTML(id)}">
                        ✎ Sửa
                    </button>

                    ${["admin", "manager"].includes(
                        String(currentAppointmentUser?.role || "")
                            .replace(/^ROLE_/i, "")
                            .toLowerCase()
                    ) ? `
                        <button
                            type="button"
                            class="appointment-action-button appointment-delete-button"
                            data-action="delete"
                            data-id="${escapeAppointmentHTML(id)}">
                            ✕ Xóa
                        </button>
                    ` : ""}

                </div>
            </td>
        </tr>
    `;
}

// =====================================================
// 15. ĐỊNH DẠNG NGÀY
// =====================================================

function formatAppointmentDate(value) {
    if (!value) return "";

    const parts = String(value).split("-");

    if (parts.length !== 3) {
        return value;
    }

    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// =====================================================
// 16. XỬ LÝ NÚT SỬA VÀ XÓA
// =====================================================

function handleAppointmentTableAction(event) {
    const button = event.target.closest(
        "button[data-action]"
    );

    if (!button) return;

    const action = button.dataset.action;
    const id = button.dataset.id;

    if (!id) return;

    if (action === "edit") {
        editAppointment(id);
    }

    if (action === "delete") {
        deleteAppointment(id);
    }
}

// =====================================================
// 17. RESET FORM
// =====================================================

function resetAppointmentForm() {
    appointmentElements.form.reset();

    appointmentElements.docId.value = "";
    appointmentElements.revision.value = "";

    appointmentElements.appointmentId.readOnly = false;

    appointmentElements.formTitle.textContent =
        "Thêm lịch hẹn mới";

    appointmentElements.saveButton.textContent =
        "Lưu lịch hẹn";
}

// =====================================================
// 18. MỞ FORM THÊM
// =====================================================

function openCreateAppointmentForm() {
    resetAppointmentForm();

    appointmentElements.formCard.hidden = false;

    appointmentElements.formCard.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });

    appointmentElements.appointmentId.focus();
}

// =====================================================
// 19. MỞ FORM SỬA
// =====================================================

function editAppointment(id) {
    const appointment = appointmentList.find(
        item => item._id === id
    );

    if (!appointment) {
        showAppointmentMessage(
            "Không tìm thấy lịch hẹn cần sửa.",
            "error"
        );

        return;
    }

    resetAppointmentForm();

    appointmentElements.docId.value =
        appointment._id || "";

    appointmentElements.revision.value =
        appointment._rev || "";

    appointmentElements.appointmentId.value =
        appointment.appointment_id || "";

    appointmentElements.appointmentId.readOnly = true;

    appointmentElements.customerId.value =
        appointment.customer_id || "";

    appointmentElements.employeeId.value =
        appointment.employee_id || "";

    appointmentElements.serviceIds.value =
        Array.isArray(appointment.service_ids)
            ? appointment.service_ids.join(", ")
            : "";

    appointmentElements.branchId.value =
        appointment.branch_id || "";

    appointmentElements.appointmentDate.value =
        appointment.appointment_date || "";

    appointmentElements.startTime.value =
        appointment.start_time || "";

    appointmentElements.status.value =
        appointment.status || "booked";

    appointmentElements.note.value =
        appointment.note || "";

    appointmentElements.formTitle.textContent =
        "Cập nhật thông tin lịch hẹn";

    appointmentElements.saveButton.textContent =
        "Cập nhật lịch hẹn";

    appointmentElements.formCard.hidden = false;

    appointmentElements.formCard.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

// =====================================================
// 20. ĐÓNG FORM
// =====================================================

function closeAppointmentForm() {
    appointmentElements.formCard.hidden = true;
    resetAppointmentForm();
    hideAppointmentMessage();
}

// =====================================================
// 21. LƯU LỊCH HẸN
// =====================================================

async function saveAppointment(event) {
    event.preventDefault();

    if (isSavingAppointment) return;

    const id = appointmentElements.docId.value.trim();

    const revision =
        appointmentElements.revision.value.trim();

    const serviceIds = appointmentElements.serviceIds.value
        .split(",")
        .map(value => value.trim())
        .filter(Boolean);

    const appointmentData = {
        type: "appointment",

        appointment_id:
            appointmentElements.appointmentId.value.trim(),

        customer_id:
            appointmentElements.customerId.value.trim(),

        employee_id:
            appointmentElements.employeeId.value.trim(),

        service_ids: serviceIds,

        branch_id:
            appointmentElements.branchId.value.trim(),

        appointment_date:
            appointmentElements.appointmentDate.value,

        start_time:
            appointmentElements.startTime.value,

        status:
            appointmentElements.status.value,

        note:
            appointmentElements.note.value.trim()
    };

    // Kiểm tra dữ liệu.
    if (
        !appointmentData.appointment_id ||
        !appointmentData.customer_id ||
        !appointmentData.employee_id ||
        !appointmentData.branch_id ||
        serviceIds.length === 0 ||
        !appointmentData.appointment_date ||
        !appointmentData.start_time
    ) {
        showAppointmentMessage(
            "Vui lòng nhập đầy đủ các thông tin bắt buộc.",
            "error"
        );

        return;
    }

    if (id && !revision) {
        showAppointmentMessage(
            "Không tìm thấy phiên bản dữ liệu (_rev). Hãy tải lại trang.",
            "error"
        );

        return;
    }

    if (id) {
        appointmentData._rev = revision;
    }

    const isEditing = Boolean(id);

    const url = isEditing
        ? `${APPOINTMENT_API_URL}/${encodeURIComponent(id)}`
        : APPOINTMENT_API_URL;

    const method = isEditing ? "PUT" : "POST";

    const saveButton = appointmentElements.saveButton;
    const originalText = saveButton.textContent;

    try {
        isSavingAppointment = true;

        saveButton.disabled = true;
        saveButton.textContent = "Đang lưu...";

        const result = await appointmentFetch(url, {
            method: method,
            body: JSON.stringify(appointmentData)
        });

        closeAppointmentForm();

        await loadAppointments();

        showAppointmentMessage(
            result?.message ||
                (
                    isEditing
                        ? "Cập nhật lịch hẹn thành công."
                        : "Thêm lịch hẹn thành công."
                ),
            "success"
        );

    } catch (error) {
        console.error(
            "Lỗi lưu lịch hẹn:",
            error
        );

        showAppointmentMessage(
            "Không thể lưu lịch hẹn: " + error.message,
            "error"
        );

    } finally {
        isSavingAppointment = false;

        saveButton.disabled = false;

        saveButton.textContent =
            appointmentElements.docId.value
                ? "Cập nhật lịch hẹn"
                : originalText;
    }
}

// =====================================================
// 22. XÓA LỊCH HẸN
// =====================================================

async function deleteAppointment(id) {
    const appointment = appointmentList.find(
        item => item._id === id
    );

    if (!appointment) {
        showAppointmentMessage(
            "Không tìm thấy lịch hẹn cần xóa.",
            "error"
        );

        return;
    }

    const appointmentCode =
        appointment.appointment_id || id;

    const confirmed = window.confirm(
        `Bạn có chắc chắn muốn xóa lịch hẹn "${appointmentCode}" không?`
    );

    if (!confirmed) return;

    if (!appointment._rev) {
        showAppointmentMessage(
            "Không tìm thấy phiên bản dữ liệu (_rev). Hãy tải lại danh sách.",
            "error"
        );

        return;
    }

    try {
        const url =
            `${APPOINTMENT_API_URL}/${encodeURIComponent(id)}` +
            `?rev=${encodeURIComponent(appointment._rev)}`;

        const result = await appointmentFetch(url, {
            method: "DELETE"
        });

        await loadAppointments();

        showAppointmentMessage(
            result?.message || "Xóa lịch hẹn thành công.",
            "success"
        );

    } catch (error) {
        console.error(
            "Lỗi xóa lịch hẹn:",
            error
        );

        showAppointmentMessage(
            "Không thể xóa lịch hẹn: " + error.message,
            "error"
        );
    }
}

// =====================================================
// 23. PHÂN TRANG
// =====================================================

function getAppointmentTotalPages() {
    return Math.max(
        1,
        Math.ceil(filteredAppointments.length / pageSize)
    );
}

function updateAppointmentPagination(
    totalItems,
    startIndex,
    endIndex
) {
    appointmentElements.paginationStart.textContent =
        totalItems === 0 ? 0 : startIndex + 1;

    appointmentElements.paginationEnd.textContent =
        endIndex;

    appointmentElements.paginationTotal.textContent =
        totalItems;

    const totalPages = Math.max(
        1,
        Math.ceil(totalItems / pageSize)
    );

    appointmentElements.prevPageButton.disabled =
        currentPage <= 1;

    appointmentElements.nextPageButton.disabled =
        currentPage >= totalPages;

    let html = "";

    for (let page = 1; page <= totalPages; page++) {
        html += `
            <button
                type="button"
                class="appointment-page-number ${
                    page === currentPage ? "active" : ""
                }"
                data-page="${page}">
                ${page}
            </button>
        `;
    }

    appointmentElements.paginationNumbers.innerHTML = html;

    appointmentElements.paginationNumbers
        .querySelectorAll("[data-page]")
        .forEach(button => {
            button.addEventListener("click", function () {
                currentPage = Number(this.dataset.page);
                renderAppointments();
            });
        });
}

/* ========================================
   SAO LƯU DỮ LIỆU LỊCH HẸN
======================================== */

(function initializeAppointmentBackup() {
    "use strict";

    const backupButton = document.getElementById(
        "backupAppointmentsButton"
    );

    if (!backupButton) return;

    backupButton.addEventListener("click", async function () {
        const originalHTML = backupButton.innerHTML;

        try {
            backupButton.disabled = true;
            backupButton.innerHTML = "<span>⏳</span> Đang sao lưu...";

            const response = await fetch(
                "http://127.0.0.1:8080/api/appointments",
                {
                    method: "GET",
                    credentials: "include",
                    headers: {
                        "Accept": "application/json"
                    }
                }
            );

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error("Phiên đăng nhập đã hết hạn.");
                }

                throw new Error(
                    "Không thể tải dữ liệu lịch hẹn. Mã lỗi: " +
                    response.status
                );
            }

            const result = await response.json();

            // Chuẩn hóa dữ liệu trả về từ API
            let appointments;

            if (Array.isArray(result)) {
                appointments = result;
            } else if (Array.isArray(result.data)) {
                appointments = result.data;
            } else if (Array.isArray(result.appointments)) {
                appointments = result.appointments;
            } else if (Array.isArray(result.docs)) {
                appointments = result.docs;
            } else {
                throw new Error(
                    "API không trả về danh sách lịch hẹn hợp lệ."
                );
            }

            // Tạo nội dung file sao lưu
            const backupData = {
                backup_type: "appointments",
                backup_name: "BeautyShop Appointment Backup",
                backup_date: new Date().toISOString(),
                total_records: appointments.length,
                data: appointments
            };

            const jsonContent = JSON.stringify(
                backupData,
                null,
                4
            );

            const blob = new Blob(
                [jsonContent],
                {
                    type: "application/json;charset=utf-8"
                }
            );

            const downloadURL = URL.createObjectURL(blob);

            const now = new Date();

            const dateString = [
                now.getFullYear(),
                String(now.getMonth() + 1).padStart(2, "0"),
                String(now.getDate()).padStart(2, "0")
            ].join("-");

            const link = document.createElement("a");

            link.href = downloadURL;
            link.download =
                `BeautyShop_LichHen_${dateString}.json`;

            document.body.appendChild(link);
            link.click();
            link.remove();

            URL.revokeObjectURL(downloadURL);

            alert(
                "Sao lưu dữ liệu lịch hẹn thành công!\n" +
                "Tổng số lịch hẹn: " + appointments.length
            );

        } catch (error) {
            console.error("Lỗi sao lưu lịch hẹn:", error);

            alert(
                error.message ||
                "Đã xảy ra lỗi khi sao lưu dữ liệu lịch hẹn."
            );

        } finally {
            backupButton.disabled = false;
            backupButton.innerHTML = originalHTML;
        }
    });
})();
