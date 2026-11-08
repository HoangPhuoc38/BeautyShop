
"use strict";

// =====================================================
// 1. CẤU HÌNH API VÀ BIẾN TOÀN CỤC
// =====================================================

const API_URL = "http://127.0.0.1:8080/api/employees";
const AUTH_API_URL = "http://127.0.0.1:8080/api/auth/me";
const USERS_API_URL = "http://127.0.0.1:8080/api/users";

const $ = (id) => document.getElementById(id);

let employees = [];
let userAccounts = [];
let currentUserId = "";
let currentUserRole = "staff";
let currentPage = 1;
let isSaving = false;
let isDeleting = false;
let isLoading = false;

const roleNames = {
    admin: "Quản trị viên",
    manager: "Quản lý",
    staff: "Nhân viên"
};

// =====================================================
// 2. HIỂN THỊ THÔNG BÁO
// =====================================================

function showMessage(message, isError = false) {
    const messageElement = $("message");

    if (!messageElement) {
        console.error("Không tìm thấy phần tử #message.");
        return;
    }

    messageElement.textContent = message;

    messageElement.style.color = isError
        ? "#b42323"
        : "#237443";
}

// =====================================================
// 3. XỬ LÝ LỖI BACKEND
// =====================================================

function getErrorMessage(error) {
    const message = String(error?.message || "").trim();
    const normalized = message.toLowerCase();

    if (
        normalized.includes("username đã tồn tại") ||
        normalized.includes("tên đăng nhập đã tồn tại") ||
        normalized.includes("username already exists") ||
        normalized.includes("duplicate username") ||
        normalized.includes("trùng tên đăng nhập")
    ) {
        return "Tên đăng nhập này đã tồn tại. Vui lòng chọn tên khác.";
    }

    if (
        normalized.includes("email đã tồn tại") ||
        normalized.includes("email already exists") ||
        normalized.includes("duplicate email") ||
        normalized.includes("trùng email")
    ) {
        return "Email này đã được sử dụng. Vui lòng nhập email khác.";
    }

    if (
        normalized.includes("conflict") ||
        normalized.includes("document update conflict")
    ) {
        return "Dữ liệu đã thay đổi. Vui lòng tải lại danh sách rồi thử lại.";
    }

    if (
        normalized.includes("failed to fetch") ||
        normalized.includes("networkerror") ||
        normalized.includes("load failed")
    ) {
        return "Không thể kết nối backend. Hãy kiểm tra Spring Boot.";
    }

    return message || "Đã xảy ra lỗi không xác định.";
}

// =====================================================
// 4. CHUYỂN ĐỔI KÝ TỰ HTML
// =====================================================

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

// =====================================================
// 5. GỌI REST API
// =====================================================

async function apiRequest(url, options = {}) {
    let response;

    try {
        response = await fetch(url, {
            ...options,

            // Gửi session cookie
            credentials: "include",

            headers: {
                ...(options.headers || {}),
                "Content-Type": "application/json"
            }
        });
    } catch {
        throw new Error(
            "Không thể kết nối đến backend. " +
            "Vui lòng kiểm tra Spring Boot và API."
        );
    }

    const responseText = await response.text();

    let result = {};

    try {
        result = responseText
            ? JSON.parse(responseText)
            : {};
    } catch {
        result = {
            message: responseText
        };
    }

    if (!response.ok) {

        if (response.status === 401) {
            throw new Error(
                "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
            );
        }

        if (response.status === 403) {
            throw new Error(
                "Bạn không có quyền thực hiện thao tác này."
            );
        }

        const errorMessage =
            result.detail ||
            result.message ||
            result.error ||
            result.title ||
            "";

        if (response.status === 409) {
            throw new Error(
                errorMessage ||
                "Tên đăng nhập hoặc email đã tồn tại."
            );
        }

        if (response.status === 400 && !errorMessage) {
            throw new Error(
                "Dữ liệu không hợp lệ. Vui lòng kiểm tra lại."
            );
        }

        if (response.status === 500 && !errorMessage) {
            throw new Error(
                "Backend gặp lỗi nội bộ. Vui lòng kiểm tra log Spring Boot."
            );
        }

        throw new Error(
            errorMessage ||
            `Yêu cầu thất bại (HTTP ${response.status}).`
        );
    }

    return result;
}

// =====================================================
// 6. TẢI DANH SÁCH NHÂN VIÊN
// =====================================================

async function loadEmployees() {
    if (isLoading) return;

    isLoading = true;

    const refreshButton = $("refreshButton");

    if (refreshButton) {
        refreshButton.disabled = true;
        refreshButton.textContent = "Đang tải...";
    }

    showMessage("Đang tải danh sách nhân viên...");

    try {
        const result = await apiRequest(API_URL);

        employees = Array.isArray(result)
            ? result
            : Array.isArray(result.employees)
                ? result.employees
                : [];

        currentPage = 1;

        renderEmployees();

        showMessage(
            `Đã tải thành công ${employees.length} nhân viên.`
        );

    } catch (error) {
        employees = [];

        renderEmployees();

        showMessage(
            "Không tải được danh sách nhân viên: " +
            getErrorMessage(error),
            true
        );

    } finally {
        isLoading = false;

        if (refreshButton) {
            refreshButton.disabled = false;
            refreshButton.textContent = "Làm mới";
        }
    }
}

// =====================================================
// 7. LỌC DANH SÁCH NHÂN VIÊN
// =====================================================

function getFilteredEmployees() {
    const keyword = $("searchInput").value
        .trim()
        .toLowerCase();

    const role = $("roleFilter").value;
    const status = $("statusFilter").value;

    return employees.filter((employee) => {

        const searchable = [
            employee.employee_id,
            employee.full_name,
            employee.username,
            employee.phone,
            employee.email,
            employee.branch_id
        ].join(" ").toLowerCase();

        return searchable.includes(keyword)
            && (!role || employee.role === role)
            && (!status || employee.status === status);
    });
}

// =====================================================
// 8. HIỂN THỊ BẢNG NHÂN VIÊN
// =====================================================

function renderEmployees() {
    const filtered = getFilteredEmployees();

    const pageSize = Number($("pageSize").value) || 10;

    const totalPages = Math.max(
        1,
        Math.ceil(filtered.length / pageSize)
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

    // Thống kê
    $("totalEmployees").textContent = employees.length;

    $("activeEmployees").textContent =
        employees.filter(
            employee => employee.status === "active"
        ).length;

    $("managerEmployees").textContent =
        employees.filter(
            employee => employee.role === "manager"
        ).length;

    // Hiển thị bảng
    const tbody = $("employeeTableBody");

    if (!tbody) return;

    if (pageItems.length === 0) {

        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align:center;padding:30px;">
                    Không tìm thấy nhân viên.
                </td>
            </tr>
        `;

    } else {

        tbody.innerHTML = pageItems.map(employee => {

            const id = escapeHtml(employee._id);

            const statusText = employee.status === "active"
                ? "Đang hoạt động"
                : "Ngừng hoạt động";

            const statusClass = employee.status === "active"
                ? "active"
                : "inactive";

            return `
                <tr>
                    <td>${escapeHtml(employee.employee_id)}</td>

                    <td>${escapeHtml(employee.full_name)}</td>

                    <td>${escapeHtml(employee.username)}</td>

                    <td>
                        ${escapeHtml(
                            roleNames[employee.role] || employee.role
                        )}
                    </td>

                    <td>${escapeHtml(employee.phone)}</td>

                    <td>${escapeHtml(employee.email)}</td>

                    <td>${escapeHtml(employee.branch_id)}</td>

                    <td>
                        <span class="badge ${statusClass}">
                            ${statusText}
                        </span>
                    </td>

                    <td>
                        ${currentUserRole === "admin" ? `
                            <button
                                type="button"
                                class="action-button edit-button"
                                data-action="edit"
                                data-id="${id}">
                                Sửa
                            </button>

                            <button
                                type="button"
                                class="action-button delete-button"
                                data-action="delete"
                                data-id="${id}">
                                Xóa
                            </button>
                        ` : `<span class="read-only-label">Chỉ xem</span>`}
                    </td>
                </tr>
            `;
        }).join("");
    }

    // Thông tin phân trang
    $("pageInfo").textContent =
        `Trang ${currentPage}/${totalPages} · ${filtered.length} nhân viên`;

    $("prevButton").disabled = currentPage <= 1;
    $("nextButton").disabled = currentPage >= totalPages;
}

// =====================================================
// 9. MỞ FORM THÊM / SỬA NHÂN VIÊN
// =====================================================

function openForm(employee = null) {
    $("employeeForm").reset();

    $("documentId").value = employee?._id || "";
    $("documentRev").value = employee?._rev || "";

    $("formTitle").textContent = employee
        ? "Cập nhật nhân viên"
        : "Thêm nhân viên";

    $("fullName").value = employee?.full_name || "";
    $("username").value = employee?.username || "";
    $("phone").value = employee?.phone || "";
    $("email").value = employee?.email || "";
    $("role").value = employee?.role || "staff";
    $("status").value = employee?.status || "active";
    $("branchId").value = employee?.branch_id || "BR001";

    $("formCard").hidden = false;

    $("formCard").scrollIntoView({
        behavior: "smooth",
        block: "start"
    });

    $("fullName").focus();
}

// =====================================================
// 10. ĐÓNG FORM
// =====================================================

function closeForm() {
    $("formCard").hidden = true;

    $("employeeForm").reset();

    $("documentId").value = "";
    $("documentRev").value = "";

    showMessage("");
}

// =====================================================
// 11. THÊM / CẬP NHẬT NHÂN VIÊN
// =====================================================

async function saveEmployee(event) {
    event.preventDefault();

    if (isSaving) return;

    const id = $("documentId").value.trim();

    const data = {
        full_name: $("fullName").value.trim(),
        username: $("username").value.trim(),
        phone: $("phone").value.trim(),
        email: $("email").value.trim(),
        role: $("role").value,
        status: $("status").value,
        branch_id: $("branchId").value.trim()
    };

    // Kiểm tra dữ liệu
    if (
        !data.full_name ||
        !data.username ||
        !data.phone ||
        !data.email ||
        !data.branch_id
    ) {
        showMessage(
            "Vui lòng nhập đầy đủ các trường bắt buộc.",
            true
        );
        return;
    }

    // Kiểm tra email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(data.email)) {
        showMessage("Email không đúng định dạng.", true);
        $("email").focus();
        return;
    }

    // Kiểm tra role
    if (!["admin", "manager", "staff"].includes(data.role)) {
        showMessage("Vai trò nhân viên không hợp lệ.", true);
        return;
    }

    // Kiểm tra status
    if (!["active", "inactive"].includes(data.status)) {
        showMessage("Trạng thái nhân viên không hợp lệ.", true);
        return;
    }

    // Kiểm tra trùng username
    const duplicateUsername = employees.find(employee =>
        String(employee.username || "").trim().toLowerCase()
            === data.username.toLowerCase()
        && employee._id !== id
    );

    if (duplicateUsername) {
        showMessage(
            "Tên đăng nhập này đã tồn tại.",
            true
        );
        $("username").focus();
        return;
    }

    // Kiểm tra trùng email
    const duplicateEmail = employees.find(employee =>
        String(employee.email || "").trim().toLowerCase()
            === data.email.toLowerCase()
        && employee._id !== id
    );

    if (duplicateEmail) {
        showMessage(
            "Email này đã được sử dụng.",
            true
        );
        $("email").focus();
        return;
    }

    const saveButton = $("saveButton");

    try {
        isSaving = true;

        saveButton.disabled = true;
        saveButton.textContent = "Đang lưu...";

        if (id) {

            // Cập nhật
            await apiRequest(
                `${API_URL}/${encodeURIComponent(id)}`,
                {
                    method: "PUT",
                    body: JSON.stringify({
                        ...data,
                        _rev: $("documentRev").value
                    })
                }
            );

            showMessage("Cập nhật nhân viên thành công.");

        } else {

            // Thêm mới
            await apiRequest(API_URL, {
                method: "POST",
                body: JSON.stringify(data)
            });

            showMessage("Thêm nhân viên thành công.");
        }

        closeForm();

        await loadEmployees();

    } catch (error) {

        showMessage(
            "Không lưu được nhân viên: " +
            getErrorMessage(error),
            true
        );

    } finally {

        isSaving = false;

        saveButton.disabled = false;
        saveButton.textContent = "Lưu nhân viên";
    }
}

// =====================================================
// 12. LẤY THÔNG TIN NHÂN VIÊN ĐỂ SỬA
// =====================================================

async function editEmployee(id) {
    try {
        const employee = await apiRequest(
            `${API_URL}/${encodeURIComponent(id)}`
        );

        openForm(employee);

    } catch (error) {

        showMessage(
            "Không tải được thông tin nhân viên: " +
            getErrorMessage(error),
            true
        );
    }
}

// =====================================================
// 13. XÓA NHÂN VIÊN
// =====================================================

async function deleteEmployee(id) {
    if (isDeleting) return;

    const employee = employees.find(
        item => item._id === id
    );

    if (!employee) {
        showMessage("Không tìm thấy nhân viên cần xóa.", true);
        return;
    }

    const confirmed = confirm(
        `Bạn có chắc muốn xóa nhân viên ${employee.full_name} ` +
        `(${employee.employee_id}) không?`
    );

    if (!confirmed) return;

    try {
        isDeleting = true;

        if (!employee._rev) {
            throw new Error(
                "Nhân viên không có _rev để xóa."
            );
        }

        const url =
            `${API_URL}/${encodeURIComponent(id)}` +
            `?rev=${encodeURIComponent(employee._rev)}`;

        await apiRequest(url, {
            method: "DELETE"
        });

        showMessage("Xóa nhân viên thành công.");

        await loadEmployees();

    } catch (error) {

        showMessage(
            "Không xóa được nhân viên: " +
            getErrorMessage(error),
            true
        );

    } finally {
        isDeleting = false;
    }
}

// =====================================================
// 14. SAO LƯU DỮ LIỆU NHÂN VIÊN
// =====================================================

function backupEmployees() {
    if (employees.length === 0) {
        showMessage(
            "Không có dữ liệu nhân viên để sao lưu.",
            true
        );
        return;
    }

    // Chỉ xuất các trường được phép.
    // Không xuất password, password_hash, token hoặc _rev.
    const safeEmployees = employees.map(employee => ({
        employee_id: employee.employee_id || "",
        full_name: employee.full_name || "",
        username: employee.username || "",
        phone: employee.phone || "",
        email: employee.email || "",
        role: employee.role || "staff",
        branch_id: employee.branch_id || "",
        status: employee.status || "active"
    }));

    const backupData = {
        type: "beautyshop_employee_backup",
        version: 1,
        export_date: new Date().toISOString(),
        total_employees: safeEmployees.length,
        employees: safeEmployees
    };

    const blob = new Blob(
        [JSON.stringify(backupData, null, 4)],
        {
            type: "application/json;charset=utf-8"
        }
    );

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    const date = new Date()
        .toISOString()
        .replace(/[:.]/g, "-");

    link.href = url;

    link.download =
        `BeautyShop_Employees_${date}.json`;

    document.body.appendChild(link);

    link.click();

    link.remove();

    setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 1000);

    showMessage(
        `Sao lưu thành công ${safeEmployees.length} nhân viên.`
    );
}

// =====================================================
// 15. KIỂM TRA FILE KHÔI PHỤC
// =====================================================

async function restoreEmployees(file) {
    if (!file) return;

    try {
        // Kiểm tra phần mở rộng
        if (!file.name.toLowerCase().endsWith(".json")) {
            throw new Error("Vui lòng chọn file JSON.");
        }

        // Giới hạn kích thước file 10 MB
        if (file.size > 10 * 1024 * 1024) {
            throw new Error("File không được vượt quá 10 MB.");
        }

        const content = await file.text();

        const backupData = JSON.parse(content);

        // Kiểm tra định dạng
        if (
            backupData.type !== "beautyshop_employee_backup" ||
            backupData.version !== 1 ||
            !Array.isArray(backupData.employees)
        ) {
            throw new Error(
                "File không đúng định dạng sao lưu nhân viên BeautyShop."
            );
        }

        if (backupData.employees.length === 0) {
            throw new Error(
                "File sao lưu không có nhân viên."
            );
        }

        const requiredFields = [
            "employee_id",
            "full_name",
            "username",
            "email",
            "role",
            "status"
        ];

        const validRoles = [
            "admin",
            "manager",
            "staff"
        ];

        const validStatuses = [
            "active",
            "inactive"
        ];

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        const usernames = new Set();
        const emails = new Set();
        const employeeIds = new Set();

        backupData.employees.forEach((employee, index) => {

            if (
                !employee ||
                typeof employee !== "object" ||
                Array.isArray(employee)
            ) {
                throw new Error(
                    `Dữ liệu nhân viên thứ ${index + 1} không hợp lệ.`
                );
            }

            for (const field of requiredFields) {
                if (
                    !String(employee[field] ?? "").trim()
                ) {
                    throw new Error(
                        `Nhân viên thứ ${index + 1} thiếu ${field}.`
                    );
                }
            }

            if (!validRoles.includes(employee.role)) {
                throw new Error(
                    `Vai trò nhân viên thứ ${index + 1} không hợp lệ.`
                );
            }

            if (!validStatuses.includes(employee.status)) {
                throw new Error(
                    `Trạng thái nhân viên thứ ${index + 1} không hợp lệ.`
                );
            }

            if (!emailRegex.test(employee.email)) {
                throw new Error(
                    `Email nhân viên thứ ${index + 1} không hợp lệ.`
                );
            }

            const username = employee.username
                .trim()
                .toLowerCase();

            const email = employee.email
                .trim()
                .toLowerCase();

            const employeeId = employee.employee_id
                .trim()
                .toLowerCase();

            if (usernames.has(username)) {
                throw new Error(
                    `File có tên đăng nhập trùng: ${employee.username}.`
                );
            }

            if (emails.has(email)) {
                throw new Error(
                    `File có email trùng: ${employee.email}.`
                );
            }

            if (employeeIds.has(employeeId)) {
                throw new Error(
                    `File có mã nhân viên trùng: ${employee.employee_id}.`
                );
            }

            usernames.add(username);
            emails.add(email);
            employeeIds.add(employeeId);
        });

        const confirmed = confirm(
            "File sao lưu hợp lệ.\n\n" +
            `Số nhân viên: ${backupData.employees.length}\n` +
            `Ngày sao lưu: ${backupData.export_date || "Không xác định"}\n\n` +
            "Bạn có muốn tiếp tục kiểm tra dữ liệu khôi phục không?"
        );

        if (!confirmed) return;

        // Chưa ghi vào CouchDB.
        // Cần API import ở backend để xử lý an toàn.
        showMessage(
            "File hợp lệ. Backend chưa có API khôi phục dữ liệu."
        );

    } catch (error) {

        showMessage(
            "Không thể khôi phục: " + error.message,
            true
        );
    }
}

// =====================================================
// 16. ĐĂNG KÝ SỰ KIỆN
// =====================================================

function registerEvents() {

    // Thêm nhân viên
    $("addButton").addEventListener("click", () => {
        openForm();
    });

    // Hủy form
    $("cancelButton").addEventListener(
        "click",
        closeForm
    );

    // Lưu form
    $("employeeForm").addEventListener(
        "submit",
        saveEmployee
    );

    // Làm mới
    $("refreshButton").addEventListener(
        "click",
        loadEmployees
    );

    // Tìm kiếm
    $("searchInput").addEventListener("input", () => {
        currentPage = 1;
        renderEmployees();
    });

    // Lọc vai trò
    $("roleFilter").addEventListener("change", () => {
        currentPage = 1;
        renderEmployees();
    });

    // Lọc trạng thái
    $("statusFilter").addEventListener("change", () => {
        currentPage = 1;
        renderEmployees();
    });

    // Thay đổi số dòng
    $("pageSize").addEventListener("change", () => {
        currentPage = 1;
        renderEmployees();
    });

    // Trang trước
    $("prevButton").addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage--;
            renderEmployees();
        }
    });

    // Trang sau
    $("nextButton").addEventListener("click", () => {
        const pageSize = Number($("pageSize").value) || 10;

        const totalPages = Math.max(
            1,
            Math.ceil(
                getFilteredEmployees().length / pageSize
            )
        );

        if (currentPage < totalPages) {
            currentPage++;
            renderEmployees();
        }
    });

    // Sửa / xóa thông qua event delegation
    $("employeeTableBody").addEventListener(
        "click",
        event => {

            const button = event.target.closest(
                "button[data-action]"
            );

            if (!button) return;

            const id = button.dataset.id;

            if (button.dataset.action === "edit") {
                editEmployee(id);
            }

            if (button.dataset.action === "delete") {
                deleteEmployee(id);
            }
        }
    );

    // Sao lưu
    $("backupEmployeesButton")?.addEventListener(
        "click",
        backupEmployees
    );

    // Mở chọn file khôi phục
    $("restoreEmployeesButton")?.addEventListener(
        "click",
        () => {
            $("restoreEmployeesInput")?.click();
        }
    );

    // Đọc file khôi phục
    $("restoreEmployeesInput")?.addEventListener(
        "change",
        async event => {

            const file = event.target.files?.[0];

            if (file) {
                await restoreEmployees(file);
            }

            // Cho phép chọn lại cùng file
            event.target.value = "";
        }
    );

    $("manageAccountsButton")?.addEventListener(
        "click",
        async () => {
            $("accountManagementPanel").hidden = false;
            await loadUserAccounts();
            $("accountManagementPanel").scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        }
    );

    $("closeAccountsButton")?.addEventListener("click", () => {
        $("accountManagementPanel").hidden = true;
    });

    $("refreshAccountsButton")?.addEventListener(
        "click",
        loadUserAccounts
    );

    $("accountCreateForm")?.addEventListener(
        "submit",
        createUserAccount
    );

    $("accountTableBody")?.addEventListener(
        "click",
        handleUserAccountAction
    );
}

// =====================================================
// 18. QUẢN LÝ TÀI KHOẢN ĐĂNG NHẬP
// =====================================================

async function initializeAccountManagement() {
    try {
        const response = await apiRequest(AUTH_API_URL);
        const user = response?.user;
        const role = String(user?.role || "")
            .replace(/^ROLE_/i, "")
            .toLowerCase();

        currentUserRole = role;

        if (role === "admin") {
            currentUserId = String(user.id || "");
            $("manageAccountsButton").hidden = false;
            $("addButton").hidden = false;
            $("backupEmployeesButton").hidden = false;
            $("restoreEmployeesButton").hidden = false;
        }
    } catch (error) {
        console.error("Không kiểm tra được quyền quản lý tài khoản:", error);
    }

    if (currentUserRole !== "admin") {
        $("addButton").hidden = true;
        $("backupEmployeesButton").hidden = true;
        $("restoreEmployeesButton").hidden = true;
    }
}

function showAccountMessage(message, isError = false) {
    const element = $("accountMessage");
    if (!element) return;

    element.textContent = message;
    element.classList.toggle("error", isError);
    element.hidden = false;
}

function populateAccountEmployeeSelect() {
    const select = $("accountEmployeeSelect");
    if (!select) return;

    const existingEmployeeIds = new Set(
        userAccounts.map(account => String(account.employee_id || ""))
    );

    const availableEmployees = employees.filter(employee =>
        String(employee.status || "active").toLowerCase() === "active" &&
        !existingEmployeeIds.has(String(employee.employee_id || "")) &&
        String(employee.username || "").trim()
    );

    select.innerHTML = `
        <option value="">Chọn nhân viên</option>
        ${availableEmployees.map(employee => `
            <option value="${escapeHtml(employee.employee_id)}">
                ${escapeHtml(employee.full_name)} · ${escapeHtml(employee.employee_id)} · ${escapeHtml(employee.username)}
            </option>
        `).join("")}
    `;

    $("createAccountButton").disabled = availableEmployees.length === 0;
}

function renderUserAccounts() {
    const tableBody = $("accountTableBody");

    if (!userAccounts.length) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="table-empty">
                    Chưa có tài khoản đăng nhập.
                </td>
            </tr>
        `;
        return;
    }

    tableBody.innerHTML = userAccounts.map(account => {
        const id = String(account._id || "");
        const isCurrentUser = id === currentUserId;
        const role = String(account.role || "staff");
        const status = String(account.status || "inactive");

        return `
            <tr data-account-id="${escapeHtml(id)}">
                <td>${escapeHtml(account.username || "—")}</td>
                <td>
                    ${escapeHtml(account.employee_name || "—")}
                    <small class="account-employee-id">${escapeHtml(account.employee_id || "")}</small>
                </td>
                <td>
                    <select data-account-role aria-label="Quyền đăng nhập">
                        <option value="staff" ${role === "staff" ? "selected" : ""}>Nhân viên</option>
                        <option value="manager" ${role === "manager" ? "selected" : ""}>Quản lý</option>
                        <option value="admin" ${role === "admin" ? "selected" : ""}>Quản trị viên</option>
                    </select>
                </td>
                <td>
                    <select data-account-status aria-label="Trạng thái tài khoản">
                        <option value="active" ${status === "active" ? "selected" : ""}>Đang hoạt động</option>
                        <option value="inactive" ${status === "inactive" ? "selected" : ""}>Đã khóa</option>
                    </select>
                </td>
                <td>${account.must_change_password ? "Bắt buộc đổi" : "Đã đổi"}</td>
                <td>
                    <div class="account-row-actions">
                        <button type="button" class="action-button edit-button"
                                data-account-action="save" ${isCurrentUser ? "disabled" : ""}>
                            Cập nhật
                        </button>
                        <button type="button" class="action-button reset-password-button"
                                data-account-action="reset" ${isCurrentUser ? "disabled" : ""}>
                            Đặt lại mật khẩu
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

async function loadUserAccounts() {
    const body = $("accountTableBody");
    if (body) {
        body.innerHTML = `
            <tr><td colspan="6" class="table-loading">Đang tải tài khoản...</td></tr>
        `;
    }

    try {
        const result = await apiRequest(USERS_API_URL);
        userAccounts = Array.isArray(result) ? result : [];
        renderUserAccounts();
        populateAccountEmployeeSelect();
        showAccountMessage(`Đã tải ${userAccounts.length} tài khoản.`);
    } catch (error) {
        userAccounts = [];
        renderUserAccounts();
        populateAccountEmployeeSelect();
        showAccountMessage(
            "Không tải được tài khoản: " + getErrorMessage(error),
            true
        );
    }
}

async function createUserAccount(event) {
    event.preventDefault();

    const employeeId = $("accountEmployeeSelect").value;
    const temporaryPassword = $("accountTemporaryPassword").value;

    if (!employeeId) {
        showAccountMessage("Hãy chọn nhân viên.", true);
        return;
    }

    if (temporaryPassword.length < 8 || temporaryPassword.length > 72) {
        showAccountMessage("Mật khẩu tạm phải dài từ 8 đến 72 ký tự.", true);
        $("accountTemporaryPassword").focus();
        return;
    }

    const button = $("createAccountButton");

    try {
        button.disabled = true;
        button.textContent = "Đang tạo...";

        await apiRequest(USERS_API_URL, {
            method: "POST",
            body: JSON.stringify({
                employee_id: employeeId,
                temporary_password: temporaryPassword
            })
        });

        $("accountCreateForm").reset();
        showAccountMessage("Đã tạo tài khoản. Nhân viên phải đổi mật khẩu ở lần đăng nhập đầu tiên.");
        await loadUserAccounts();
    } catch (error) {
        showAccountMessage(
            "Không tạo được tài khoản: " + getErrorMessage(error),
            true
        );
    } finally {
        button.textContent = "Tạo tài khoản";
        populateAccountEmployeeSelect();
    }
}

async function handleUserAccountAction(event) {
    const button = event.target.closest("button[data-account-action]");
    if (!button) return;

    const row = button.closest("tr[data-account-id]");
    const accountId = row?.dataset.accountId;
    if (!accountId) return;

    if (button.dataset.accountAction === "save") {
        try {
            button.disabled = true;
            await apiRequest(`${USERS_API_URL}/${encodeURIComponent(accountId)}`, {
                method: "PUT",
                body: JSON.stringify({
                    role: row.querySelector("[data-account-role]").value,
                    status: row.querySelector("[data-account-status]").value
                })
            });
            showAccountMessage("Đã cập nhật quyền và trạng thái tài khoản.");
            await loadUserAccounts();
            await loadEmployees();
        } catch (error) {
            showAccountMessage(
                "Không cập nhật được tài khoản: " + getErrorMessage(error),
                true
            );
        } finally {
            button.disabled = false;
        }
    }

    if (button.dataset.accountAction === "reset") {
        const temporaryPassword = window.prompt(
            "Nhập mật khẩu tạm mới (8-72 ký tự):"
        );
        if (temporaryPassword === null) return;

        if (temporaryPassword.length < 8 || temporaryPassword.length > 72) {
            showAccountMessage("Mật khẩu tạm phải dài từ 8 đến 72 ký tự.", true);
            return;
        }

        try {
            await apiRequest(
                `${USERS_API_URL}/${encodeURIComponent(accountId)}/reset-password`,
                {
                    method: "POST",
                    body: JSON.stringify({ temporary_password: temporaryPassword })
                }
            );
            showAccountMessage("Đã đặt lại mật khẩu; nhân viên phải đổi mật khẩu ở lần đăng nhập kế tiếp.");
            await loadUserAccounts();
        } catch (error) {
            showAccountMessage(
                "Không đặt lại được mật khẩu: " + getErrorMessage(error),
                true
            );
        }
    }
}

// =====================================================
// 17. KHỞI ĐỘNG TRANG
// =====================================================

document.addEventListener("DOMContentLoaded", async () => {
    registerEvents();
    await initializeAccountManagement();
    await loadEmployees();
});
