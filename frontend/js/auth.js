
"use strict";

const AUTH_API = "http://127.0.0.1:8080/api/auth";

// ============================================
// KHỞI TẠO VÀ KIỂM TRA ĐĂNG NHẬP
// ============================================

(async function initializeAuthentication() {

    try {

        const response = await fetch(`${AUTH_API}/me`, {
            method: "GET",
            credentials: "include"
        });

        // Chưa đăng nhập hoặc phiên hết hạn
        if (response.status === 401) {
            window.location.replace("login.html");
            return;
        }

        if (!response.ok) {
            throw new Error("Không thể xác thực tài khoản.");
        }

        const result = await response.json();

        if (!result.success || !result.user) {
            window.location.replace("login.html");
            return;
        }

        const user = result.user;

        // ========================================
        // KIỂM TRA BẮT BUỘC ĐỔI MẬT KHẨU
        // ========================================

        if (
            result.mustChangePassword === true ||
            user.mustChangePassword === true
        ) {
            window.location.replace("change-password.html");
            return;
        }

        // ========================================
        // HIỂN THỊ TÊN NHÂN VIÊN
        // ========================================

        const nameElement = document.getElementById("currentUserName");

        if (nameElement) {
            nameElement.textContent = user.fullName || user.username;
        }

        // ========================================
        // HIỂN THỊ CHỨC VỤ
        // ========================================

        const roleElement = document.getElementById("currentUserRole");

        if (roleElement) {
            roleElement.textContent = getRoleName(user.role);
        }

        // ========================================
        // HIỂN THỊ THÔNG TIN NGƯỜI DÙNG
        // ========================================

        console.log("Người dùng hiện tại:", user);

        // ========================================
        // XỬ LÝ ĐĂNG XUẤT
        // ========================================

        const logoutButton = document.getElementById("logoutButton");

        if (logoutButton) {
            logoutButton.addEventListener("click", logout);
        }

    } catch (error) {

        console.error("Lỗi xác thực:", error);

        document.body.innerHTML = `
            <div style="padding: 40px; text-align: center;">
                <h2>Không thể kết nối máy chủ</h2>
                <p>Vui lòng kiểm tra Backend BeautyShop.</p>
                <button onclick="location.reload()">Thử lại</button>
            </div>
        `;

    }

})();

// ============================================
// CHUYỂN MÃ CHỨC VỤ THÀNH TÊN HIỂN THỊ
// ============================================

function getRoleName(role) {

    const roles = {
        manager: "Quản lý",
        employee: "Nhân viên",
        staff: "Nhân viên",
        admin: "Quản trị viên"
    };

    return roles[role] || role || "Nhân viên";
}

// ============================================
// ĐĂNG XUẤT
// ============================================

async function logout() {

    const logoutButton = document.getElementById("logoutButton");

    if (logoutButton) {
        logoutButton.disabled = true;
    }

    try {

        const response = await fetch(`${AUTH_API}/logout`, {
            method: "POST",
            credentials: "include"
        });

        if (!response.ok) {
            throw new Error("Đăng xuất không thành công.");
        }

        window.location.replace("login.html");

    } catch (error) {

        console.error("Lỗi đăng xuất:", error);

        alert("Không thể đăng xuất. Vui lòng thử lại.");

        if (logoutButton) {
            logoutButton.disabled = false;
        }

    }

}
