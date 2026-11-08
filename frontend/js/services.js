
"use strict";

// ============================================
// 1. CẤU HÌNH API
// ============================================

const API_URL = "http://127.0.0.1:8080/api/services";
const AUTH_API_URL = "http://127.0.0.1:8080/api/auth/me";

const $ = (id) => document.getElementById(id);

let services = [];
let currentPage = 1;
let currentUserRole = "staff";
let isSaving = false;
let isBackingUp = false;

const PAGE_SIZE = 10;

const categoryNames = {
    nail: "Nail",
    skincare: "Chăm sóc da",
    hair: "Tóc",
    massage: "Massage",
    other: "Khác"
};


// ============================================
// 2. HIỂN THỊ THÔNG BÁO
// ============================================

function showMessage(message, isError = false) {
    const element = $("message");

    if (!element) return;

    element.textContent = message;

    element.style.color = isError
        ? "#b42323"
        : "#237443";
}


// ============================================
// 3. CHUYỂN ĐỔI HTML AN TOÀN
// ============================================

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}


// ============================================
// 4. ĐỊNH DẠNG GIÁ TIỀN
// ============================================

function formatPrice(price) {
    return Number(price || 0).toLocaleString("vi-VN") + " ₫";
}


// ============================================
// 5. XỬ LÝ LỖI
// ============================================

function errorText(error) {
    const message = String(error?.message || "");

    if (/failed to fetch|networkerror|load failed/i.test(message)) {
        return "Không thể kết nối backend. Hãy kiểm tra Spring Boot và CouchDB.";
    }

    if (/401|đăng nhập|phiên đăng nhập/i.test(message)) {
        return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
    }

    if (/mã dịch vụ đã tồn tại/i.test(message)) {
        return "Mã dịch vụ đã tồn tại. Vui lòng nhập mã khác.";
    }

    if (/conflict|xung đột dữ liệu/i.test(message)) {
        return "Dữ liệu đã thay đổi. Hãy làm mới danh sách rồi thử lại.";
    }

    return message || "Đã xảy ra lỗi không xác định.";
}


// ============================================
// 6. HÀM GỌI API
// ============================================

async function apiRequest(url, options = {}) {
    let response;

    try {
        response = await fetch(url, {
            ...options,

            // Gửi cookie phiên đăng nhập
            credentials: "include",

            headers: {
                ...(options.headers || {}),
                "Content-Type": "application/json",
                "Accept": "application/json"
            }
        });

    } catch {
        throw new Error(
            "Không thể kết nối backend. Kiểm tra Spring Boot và API."
        );
    }

    const text = await response.text();

    let result = {};

    try {
        result = text ? JSON.parse(text) : {};
    } catch {
        result = {
            message: text
        };
    }

    if (!response.ok) {
        if (response.status === 401) {
            throw new Error(
                "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
            );
        }

        throw new Error(
            result.detail ||
            result.message ||
            result.error ||
            `Yêu cầu thất bại (HTTP ${response.status})`
        );
    }

    return result;
}


// ============================================
// 7. LẤY DANH SÁCH DỊCH VỤ TỪ RESPONSE
// ============================================

function extractServices(result) {
    if (Array.isArray(result)) {
        return result;
    }

    if (Array.isArray(result.services)) {
        return result.services;
    }

    if (Array.isArray(result.data)) {
        return result.data;
    }

    if (Array.isArray(result.docs)) {
        return result.docs;
    }

    return [];
}


// ============================================
// 8. TẢI DANH SÁCH DỊCH VỤ
// ============================================

async function loadServices() {
    showMessage("Đang tải danh sách dịch vụ...");

    try {
        const result = await apiRequest(API_URL);

        services = extractServices(result);

        currentPage = 1;

        renderServices();

        showMessage(
            `Đã tải ${services.length} dịch vụ.`
        );

    } catch (error) {
        services = [];

        renderServices();

        showMessage(
            "Không tải được danh sách dịch vụ: " +
            errorText(error),
            true
        );
    }
}


// ============================================
// 9. TÌM KIẾM VÀ LỌC DỊCH VỤ
// ============================================

function getFilteredServices() {
    const keyword = $("searchInput").value
        .trim()
        .toLowerCase();

    const category = $("categoryFilter").value;

    const status = $("statusFilter").value;

    return services.filter((service) => {

        const searchable = [
            service.service_id,
            service.name,
            service.category
        ].join(" ").toLowerCase();

        return searchable.includes(keyword)
            && (!category || service.category === category)
            && (!status || service.status === status);
    });
}


// ============================================
// 10. HIỂN THỊ DANH SÁCH DỊCH VỤ
// ============================================


function renderServices() {
    const filtered = getFilteredServices();

    const pageSize = Number($("pageSize").value) || PAGE_SIZE;

    const totalRecords = filtered.length;

    const totalPages = Math.max(
        1,
        Math.ceil(totalRecords / pageSize)
    );

    currentPage = Math.max(
        1,
        Math.min(currentPage, totalPages)
    );

    const start = (currentPage - 1) * pageSize;

    const pageItems = filtered.slice(
        start,
        start + pageSize
    );

    // ========================================
    // THỐNG KÊ
    // ========================================

    $("totalServices").textContent = services.length;

    $("activeServices").textContent = services.filter(
        service => service.status === "active"
    ).length;

    $("inactiveServices").textContent = services.filter(
        service => service.status === "inactive"
    ).length;

    // ========================================
    // HIỂN THỊ BẢNG
    // ========================================

    const tbody = $("serviceTableBody");

    if (pageItems.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7">
                    Không tìm thấy dịch vụ.
                </td>
            </tr>
        `;
    } else {
        tbody.innerHTML = pageItems.map(service => {

            const statusText = service.status === "active"
                ? "Đang hoạt động"
                : "Ngừng hoạt động";

            const statusClass = service.status === "active"
                ? "active"
                : "inactive";

            return `
                <tr>
                    <td>
                        ${escapeHtml(service.service_id || "-")}
                    </td>

                    <td>
                        <strong>
                            ${escapeHtml(service.name || "-")}
                        </strong>
                    </td>

                    <td>
                        ${escapeHtml(
                            categoryNames[service.category] ||
                            service.category ||
                            "-"
                        )}
                    </td>

                    <td>
                        ${escapeHtml(formatPrice(service.price))}
                    </td>

                    <td>
                        ${escapeHtml(service.duration_minutes ?? 0)} phút
                    </td>

                    <td>
                        <span class="service-status ${statusClass}">
                            ${statusText}
                        </span>
                    </td>

                    <td>
                        <div class="service-action-group">

                            ${["admin", "manager"].includes(currentUserRole) ? `
                                <button
                                    type="button"
                                    class="service-action-button service-edit-button"
                                    data-action="edit"
                                    data-id="${escapeHtml(service._id)}">
                                    ✎ Sửa
                                </button>

                                <button
                                    type="button"
                                    class="service-action-button service-delete-button"
                                    data-action="delete"
                                    data-id="${escapeHtml(service._id)}">
                                    × Xóa
                                </button>
                            ` : `<span class="read-only-label">Chỉ xem</span>`}

                        </div>
                    </td>
                </tr>
            `;
        }).join("");
    }

    // ========================================
    // THÔNG TIN SỐ BẢN GHI
    // ========================================

    $("paginationStart").textContent =
        totalRecords === 0 ? 0 : start + 1;

    $("paginationEnd").textContent =
        Math.min(start + pageSize, totalRecords);

    $("paginationTotal").textContent = totalRecords;

    // ========================================
    // NÚT TRANG TRƯỚC / SAU
    // ========================================

    $("prevButton").disabled = currentPage <= 1;

    $("nextButton").disabled = currentPage >= totalPages;

    // ========================================
    // HIỂN THỊ CÁC NÚT SỐ TRANG
    // ========================================

    renderPaginationNumbers(totalPages);
}


// ============================================
// TẠO CÁC NÚT SỐ TRANG
// ============================================

function renderPaginationNumbers(totalPages) {
    const container = $("paginationNumbers");

    let pages = [];

    if (totalPages <= 5) {

        for (let i = 1; i <= totalPages; i++) {
            pages.push(i);
        }

    } else {

        pages.push(1);

        if (currentPage > 3) {
            pages.push("...");
        }

        const startPage = Math.max(2, currentPage - 1);

        const endPage = Math.min(
            totalPages - 1,
            currentPage + 1
        );

        for (let i = startPage; i <= endPage; i++) {
            pages.push(i);
        }

        if (currentPage < totalPages - 2) {
            pages.push("...");
        }

        pages.push(totalPages);
    }

    container.innerHTML = pages.map(page => {

        if (page === "...") {
            return `
                <span class="pagination-dots">...</span>
            `;
        }

        return `
            <button
                type="button"
                class="pagination-number ${page === currentPage ? "active" : ""}"
                data-page="${page}"
                aria-label="Trang ${page}"
                aria-current="${page === currentPage ? "page" : "false"}">
                ${page}
            </button>
        `;

    }).join("");
}


// ============================================
// 11. MỞ FORM THÊM / SỬA
// ============================================

function openForm(service = null) {
    $("serviceForm").reset();

    $("documentId").value = service?._id || "";

    $("documentRev").value = service?._rev || "";

    $("formTitle").textContent = service
        ? "Cập nhật dịch vụ"
        : "Thêm dịch vụ";

    $("serviceId").value = service?.service_id || "";

    $("serviceName").value = service?.name || "";

    $("category").value = service?.category || "nail";

    $("price").value = service?.price ?? "";

    $("duration").value = service?.duration_minutes ?? "";

    $("status").value = service?.status || "active";

    $("serviceId").readOnly = false;

    $("formCard").hidden = false;

    $("formCard").scrollIntoView({
        behavior: "smooth",
        block: "start"
    });

    $("serviceName").focus();
}


// ============================================
// 12. ĐÓNG FORM
// ============================================

function closeForm() {
    $("formCard").hidden = true;

    $("serviceForm").reset();

    $("documentId").value = "";

    $("documentRev").value = "";
}


// ============================================
// 13. LƯU DỊCH VỤ
// ============================================

async function saveService(event) {
    event.preventDefault();

    if (isSaving) return;

    const id = $("documentId").value.trim();

    const data = {
        service_id: $("serviceId").value.trim(),
        name: $("serviceName").value.trim(),
        category: $("category").value,
        price: Number($("price").value),
        duration_minutes: Number($("duration").value),
        status: $("status").value
    };

    // Kiểm tra tên
    if (!data.name || !data.category) {
        showMessage(
            "Vui lòng nhập tên và danh mục dịch vụ.",
            true
        );

        return;
    }

    // Kiểm tra giá
    if (
        !Number.isFinite(data.price) ||
        data.price < 0
    ) {
        showMessage(
            "Giá dịch vụ phải là số không âm.",
            true
        );

        $("price").focus();

        return;
    }

    // Kiểm tra thời lượng
    if (
        !Number.isInteger(data.duration_minutes) ||
        data.duration_minutes <= 0
    ) {
        showMessage(
            "Thời lượng phải là số nguyên lớn hơn 0.",
            true
        );

        $("duration").focus();

        return;
    }

    // Kiểm tra mã dịch vụ trùng
    if (data.service_id) {
        const duplicate = services.find((service) =>
            String(service.service_id || "").toLowerCase()
                === data.service_id.toLowerCase()
            && service._id !== id
        );

        if (duplicate) {
            showMessage(
                "Mã dịch vụ đã tồn tại. Vui lòng nhập mã khác.",
                true
            );

            $("serviceId").focus();

            return;
        }
    }

    const saveButton = $("saveButton");

    const originalText = saveButton.innerHTML;

    try {
        isSaving = true;

        saveButton.disabled = true;

        saveButton.textContent = "Đang lưu...";

        if (id) {

            data._rev = $("documentRev").value;

            await apiRequest(
                `${API_URL}/${encodeURIComponent(id)}`,
                {
                    method: "PUT",
                    body: JSON.stringify(data)
                }
            );

        } else {

            await apiRequest(API_URL, {
                method: "POST",
                body: JSON.stringify(data)
            });

        }

        closeForm();

        await loadServices();

        showMessage(
            id
                ? "Cập nhật dịch vụ thành công."
                : "Thêm dịch vụ thành công."
        );

    } catch (error) {

        showMessage(
            "Không lưu được dịch vụ: " + errorText(error),
            true
        );

    } finally {

        isSaving = false;

        saveButton.disabled = false;

        saveButton.innerHTML = originalText;
    }
}


// ============================================
// 14. CHỈNH SỬA DỊCH VỤ
// ============================================

async function editService(id) {
    try {
        const service = await apiRequest(
            `${API_URL}/${encodeURIComponent(id)}`
        );

        openForm(service);

    } catch (error) {

        showMessage(
            "Không tải được dịch vụ: " + errorText(error),
            true
        );
    }
}


// ============================================
// 15. XÓA DỊCH VỤ
// ============================================

async function deleteService(id) {
    const service = services.find(
        (item) => item._id === id
    );

    if (!service) {
        showMessage(
            "Không tìm thấy dịch vụ cần xóa.",
            true
        );

        return;
    }

    const confirmed = confirm(
        `Bạn có chắc muốn xóa dịch vụ "${service.name}" (${service.service_id}) không?`
    );

    if (!confirmed) return;

    if (!service._rev) {
        showMessage(
            "Dịch vụ không có _rev. Hãy làm mới danh sách.",
            true
        );

        return;
    }

    try {
        const url =
            `${API_URL}/${encodeURIComponent(id)}` +
            `?rev=${encodeURIComponent(service._rev)}`;

        await apiRequest(url, {
            method: "DELETE"
        });

        await loadServices();

        showMessage("Xóa dịch vụ thành công.");

    } catch (error) {

        showMessage(
            "Không xóa được dịch vụ: " + errorText(error),
            true
        );
    }
}


// ============================================
// 16. SAO LƯU DỮ LIỆU DỊCH VỤ
// ============================================

async function backupServices() {
    if (isBackingUp) return;

    const backupButton = $("backupServicesButton");

    const originalHTML = backupButton.innerHTML;

    try {
        isBackingUp = true;

        backupButton.disabled = true;

        backupButton.innerHTML = "<span>⏳</span> Đang sao lưu...";

        // Lấy dữ liệu mới nhất từ API
        const result = await apiRequest(API_URL);

        const backupList = extractServices(result);

        const backupData = {
            backup_type: "services",
            backup_name: "BeautyShop Services Backup",
            backup_date: new Date().toISOString(),
            total_records: backupList.length,
            data: backupList
        };

        const json = JSON.stringify(
            backupData,
            null,
            4
        );

        const blob = new Blob(
            [json],
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

        const timeString = [
            String(now.getHours()).padStart(2, "0"),
            String(now.getMinutes()).padStart(2, "0"),
            String(now.getSeconds()).padStart(2, "0")
        ].join("-");

        const link = document.createElement("a");

        link.href = downloadURL;

        link.download =
            `BeautyShop_DichVu_${dateString}_${timeString}.json`;

        document.body.appendChild(link);

        link.click();

        link.remove();

        URL.revokeObjectURL(downloadURL);

        showMessage(
            `Sao lưu thành công ${backupList.length} dịch vụ.`
        );

    } catch (error) {

        showMessage(
            "Không sao lưu được dữ liệu: " + errorText(error),
            true
        );

    } finally {

        isBackingUp = false;

        backupButton.disabled = false;

        backupButton.innerHTML = originalHTML;
    }
}


// ============================================
// 17. ĐĂNG KÝ SỰ KIỆN
// ============================================

function registerEvents() {

    // Thêm dịch vụ
    $("addButton").addEventListener("click", () => {
        openForm();
    });

    // Đóng form
    $("cancelButton").addEventListener("click", closeForm);

    // Lưu dịch vụ
    $("serviceForm").addEventListener("submit", saveService);

    // Sao lưu
    $("backupServicesButton").addEventListener(
        "click",
        backupServices
    );

    // Làm mới
    $("refreshButton").addEventListener("click", loadServices);

    // Tìm kiếm
    $("searchInput").addEventListener("input", () => {
        currentPage = 1;
        renderServices();
    });

    // Lọc danh mục
    $("categoryFilter").addEventListener("change", () => {
        currentPage = 1;
        renderServices();
    });

    // Lọc trạng thái
    $("statusFilter").addEventListener("change", () => {
        currentPage = 1;
        renderServices();
    });

    // Trang trước
    $("prevButton").addEventListener("click", () => {

        if (currentPage > 1) {
            currentPage--;
            renderServices();
        }

    });

    // Trang tiếp theo
    $("nextButton").addEventListener("click", () => {

        const totalPages = Math.max(
            1,
            Math.ceil(
                getFilteredServices().length / PAGE_SIZE
            )
        );

        if (currentPage < totalPages) {
            currentPage++;
            renderServices();
        }

    });

    // Sự kiện sửa / xóa
    $("serviceTableBody").addEventListener("click", (event) => {

        const button = event.target.closest(
            "button[data-action]"
        );

        if (!button) return;

        const { action, id } = button.dataset;

        if (action === "edit") {
            editService(id);
        }

        if (action === "delete") {
            deleteService(id);
        }

    });

    // Năm hiện tại
    const yearElement = $("currentYear");

    if (yearElement) {
        yearElement.textContent = new Date().getFullYear();
    }
}


// ============================================
// 18. KHỞI TẠO TRANG
// ============================================

document.addEventListener("DOMContentLoaded", async () => {

    try {
        const auth = await apiRequest(AUTH_API_URL);
        currentUserRole = String(auth?.user?.role || "staff")
            .replace(/^ROLE_/i, "")
            .toLowerCase();
    } catch (error) {
        console.error("Không xác minh được quyền dịch vụ:", error);
    }

    const canManageServices = ["admin", "manager"].includes(currentUserRole);
    $("addButton").hidden = !canManageServices;
    $("backupServicesButton").hidden = !canManageServices;

    registerEvents();

    loadServices();

});
