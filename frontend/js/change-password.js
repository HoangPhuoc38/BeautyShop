
"use strict";

const AUTH_API = "http://127.0.0.1:8080/api/auth";

document.addEventListener("DOMContentLoaded", () => {

    const form = document.getElementById("changePasswordForm");
    const currentPasswordInput = document.getElementById("currentPassword");
    const newPasswordInput = document.getElementById("newPassword");
    const confirmPasswordInput = document.getElementById("confirmPassword");
    const message = document.getElementById("changePasswordMessage");
    const submitButton = document.getElementById("changePasswordButton");

    if (
        !form ||
        !currentPasswordInput ||
        !newPasswordInput ||
        !confirmPasswordInput ||
        !message ||
        !submitButton
    ) {
        console.error("Không tìm thấy các thành phần của form đổi mật khẩu.");
        return;
    }

    checkLoginStatus();

    // =========================================
    // KIỂM TRA TRẠNG THÁI ĐĂNG NHẬP
    // =========================================

    async function checkLoginStatus() {
        try {
            const response = await fetch(`${AUTH_API}/me`, {
                method: "GET",
                credentials: "include"
            });

            if (!response.ok) {
                window.location.replace("login.html");
                return;
            }

            const result = await response.json();

            if (!result.success) {
                window.location.replace("login.html");
                return;
            }

            // Đã đổi mật khẩu thì chuyển vào hệ thống.
            if (result.mustChangePassword === false) {
                window.location.replace("index.html");
            }

        } catch (error) {
            console.error("Lỗi kiểm tra đăng nhập:", error);
            showMessage("Không thể kết nối máy chủ.", "error");
        }
    }

    // =========================================
    // XỬ LÝ ĐỔI MẬT KHẨU
    // =========================================

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const currentPassword = currentPasswordInput.value;
        const newPassword = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        if (!currentPassword || !newPassword || !confirmPassword) {
            showMessage("Vui lòng nhập đầy đủ thông tin.", "error");
            return;
        }

        if (newPassword.length < 8) {
            showMessage("Mật khẩu mới phải có ít nhất 8 ký tự.", "error");
            return;
        }

        if (newPassword !== confirmPassword) {
            showMessage("Mật khẩu xác nhận không khớp.", "error");
            return;
        }

        if (currentPassword === newPassword) {
            showMessage("Mật khẩu mới phải khác mật khẩu hiện tại.", "error");
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = "Đang cập nhật...";

        try {
            const response = await fetch(`${AUTH_API}/change-password`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                credentials: "include",
                body: JSON.stringify({
                    currentPassword: currentPassword,
                    newPassword: newPassword,
                    confirmPassword: confirmPassword
                })
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                showMessage(
                    result.message || "Đổi mật khẩu thất bại.",
                    "error"
                );
                return;
            }

            showMessage(
                "Đổi mật khẩu thành công! Đang chuyển vào hệ thống...",
                "success"
            );

            form.reset();

            setTimeout(() => {
                window.location.replace("index.html");
            }, 1000);

        } catch (error) {
            console.error("Lỗi đổi mật khẩu:", error);
            showMessage(
                "Không thể kết nối máy chủ. Vui lòng thử lại.",
                "error"
            );
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = "Xác nhận đổi mật khẩu";
        }
    });

    // =========================================
    // HIỂN THỊ THÔNG BÁO
    // =========================================

    function showMessage(text, type) {
        message.textContent = text;
        message.className = type;
    }

});
