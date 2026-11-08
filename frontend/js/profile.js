
"use strict";

const PROFILE_API = "http://127.0.0.1:8080/api/auth";
const AVATAR_STORAGE_KEY = "beautyshop_profile_avatar";

let profileUser = null;

// ============================================
// 1. CHUYỂN ĐỔI ROLE
// ============================================

function getRoleName(role) {
    const roles = {
        admin: "Administrator",
        manager: "Quản lý",
        staff: "Nhân viên"
    };

    return roles[String(role || "").toLowerCase()]
        || "Người dùng";
}

// ============================================
// 2. TẠO CHỮ VIẾT TẮT AVATAR
// ============================================

function getInitials(name) {
    if (!name) return "BS";

    const words = name.trim().split(/\s+/);

    if (words.length === 1) {
        return words[0].substring(0, 2).toUpperCase();
    }

    return (
        words[0][0] +
        words[words.length - 1][0]
    ).toUpperCase();
}

// ============================================
// 3. HIỂN THỊ AVATAR
// ============================================

function renderAvatar(element, image, initials) {
    if (!element) return;

    element.replaceChildren();

    if (image) {
        const img = document.createElement("img");

        img.src = image;
        img.alt = "Ảnh đại diện";

        img.onerror = function () {
            element.textContent = initials;
        };

        element.appendChild(img);
    } else {
        element.textContent = initials;
    }
}

// ============================================
// 4. CẬP NHẬT THÔNG TIN HỒ SƠ
// ============================================

function updateProfileUI(user) {
    if (!user) return;

    const fullName =
        user.fullName ||
        user.name ||
        user.username ||
        "Người dùng";

    const roleName = getRoleName(user.role);
    const initials = getInitials(fullName);

    const savedAvatar = localStorage.getItem(
        AVATAR_STORAGE_KEY
    );

    const avatar =
        savedAvatar ||
        user.avatarUrl ||
        user.avatar ||
        user.avarta ||
        "";

    // Cập nhật tên
    [
        "currentUserName",
        "dropdownUserName",
        "dialogUserName"
    ].forEach(id => {
        const element = document.getElementById(id);

        if (element) {
            element.textContent = fullName;
        }
    });

    // Cập nhật chức vụ
    [
        "currentUserRole",
        "dropdownUserRole",
        "dialogUserRole"
    ].forEach(id => {
        const element = document.getElementById(id);

        if (element) {
            element.textContent = roleName;
        }
    });

    // Cập nhật avatar
    [
        "profileAvatar",
        "dropdownAvatar",
        "dialogAvatar"
    ].forEach(id => {
        renderAvatar(
            document.getElementById(id),
            avatar,
            initials
        );
    });

    // Thông tin chi tiết
    const details = {
        dialogUsername: user.username || "Chưa có",
        dialogEmployeeId: user.employeeId || "Chưa có",
        dialogBranchId: user.branchId || "Chưa có"
    };

    Object.entries(details).forEach(([id, value]) => {
        const element = document.getElementById(id);

        if (element) {
            element.textContent = value;
        }
    });
}

// ============================================
// 5. LẤY THÔNG TIN TỪ API
// ============================================

async function loadProfile() {
    try {
        const response = await fetch(
            `${PROFILE_API}/me`,
            {
                method: "GET",
                credentials: "include",
                headers: {
                    Accept: "application/json"
                }
            }
        );

        if (!response.ok) {
            throw new Error(
                "Không thể lấy thông tin tài khoản."
            );
        }

        const data = await response.json();

        if (!data.success || !data.user) {
            throw new Error(
                "Dữ liệu tài khoản không hợp lệ."
            );
        }

        profileUser = data.user;

        updateProfileUI(profileUser);

    } catch (error) {
        console.error("Lỗi hồ sơ:", error);
    }
}

// ============================================
// 6. ĐÓNG / MỞ MENU
// ============================================

function initializeProfileMenu() {
    const trigger = document.getElementById("profileTrigger");
    const dropdown = document.getElementById("profileDropdown");

    if (!trigger || !dropdown) return;

    trigger.addEventListener("click", function (event) {
        event.stopPropagation();

        const isOpening = dropdown.hidden;

        dropdown.hidden = !isOpening;

        trigger.setAttribute(
            "aria-expanded",
            String(isOpening)
        );
    });

    document.addEventListener("click", function (event) {
        if (!event.target.closest(".profile-container")) {
            dropdown.hidden = true;

            trigger.setAttribute(
                "aria-expanded",
                "false"
            );
        }
    });

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
            dropdown.hidden = true;

            trigger.setAttribute(
                "aria-expanded",
                "false"
            );
        }
    });
}

// ============================================
// 7. XEM THÔNG TIN TÀI KHOẢN
// ============================================

function initializeProfileDialog() {
    const dialog = document.getElementById("profileDialog");

    const viewButton =
        document.getElementById("viewProfileButton");

    const closeButton =
        document.getElementById("closeProfileDialog");

    if (!dialog || !viewButton || !closeButton) return;

    viewButton.addEventListener("click", function () {
        document.getElementById("profileDropdown").hidden = true;

        if (dialog.showModal) {
            dialog.showModal();
        }
    });

    closeButton.addEventListener("click", function () {
        dialog.close();
    });

    dialog.addEventListener("click", function (event) {
        if (event.target === dialog) {
            dialog.close();
        }
    });
}

// ============================================
// 8. THAY ĐỔI ẢNH ĐẠI DIỆN
// ============================================

function initializeAvatarUpload() {
    const changeButton =
        document.getElementById("changeAvatarButton");

    const fileInput =
        document.getElementById("profileAvatarInput");

    if (!changeButton || !fileInput) return;

    changeButton.addEventListener("click", function () {
        document.getElementById("profileDropdown").hidden = true;

        fileInput.click();
    });

    fileInput.addEventListener("change", function () {
        const file = fileInput.files[0];

        if (!file) return;

        if (!file.type.startsWith("image/")) {
            alert("Vui lòng chọn file hình ảnh.");
            fileInput.value = "";
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            alert("Ảnh đại diện không được vượt quá 2 MB.");
            fileInput.value = "";
            return;
        }

        const reader = new FileReader();

        reader.onload = function (event) {
            try {
                const image = event.target.result;

                localStorage.setItem(
                    AVATAR_STORAGE_KEY,
                    image
                );

                if (profileUser) {
                    updateProfileUI(profileUser);
                }

            } catch (error) {
                alert(
                    "Không thể lưu ảnh đại diện trên trình duyệt."
                );

                console.error(error);
            }
        };

        reader.readAsDataURL(file);
    });
}

// ============================================
// 9. ĐĂNG XUẤT
// ============================================

function initializeProfileLogout() {
    const button =
        document.getElementById("profileLogoutButton");

    if (!button) return;

    button.addEventListener("click", function () {
        const logoutButton =
            document.getElementById("logoutButton");

        if (logoutButton) {
            logoutButton.click();
        }
    });
}

// ============================================
// 10. KHỞI TẠO
// ============================================

document.addEventListener("DOMContentLoaded", async function () {

    await loadProfile();

    initializeProfileMenu();
    initializeProfileDialog();
    initializeAvatarUpload();
    initializeProfileLogout();

});
