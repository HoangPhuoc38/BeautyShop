
"use strict";

const LOGIN_API = "http://127.0.0.1:8080/api/auth";

document.addEventListener("DOMContentLoaded", () => {

    const loginForm = document.getElementById("loginForm");
    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");
    const loginMessage = document.getElementById("loginMessage");
    const loginButton = document.getElementById("loginButton");

    // Kiểm tra các thành phần HTML.
    if (!loginForm || !usernameInput || !passwordInput
            || !loginMessage || !loginButton) {

        console.error("Không tìm thấy thành phần đăng nhập trong HTML.");
        return;
    }

    // Kiểm tra phiên đăng nhập khi mở trang.
    checkExistingLogin();

    // =========================================
    // KIỂM TRA PHIÊN ĐĂNG NHẬP
    // =========================================

    async function checkExistingLogin() {

        try {
            const response = await fetch(`${LOGIN_API}/me`, {
                method: "GET",
                credentials: "include"
            });

            if (!response.ok) {
                return;
            }

            const result = await response.json();

            if (!result.success) {
                return;
            }

            // Chuyển hướng theo trạng thái mật khẩu.
            if (result.mustChangePassword === true) {

                window.location.replace("change-password.html");

            } else {

                window.location.replace("index.html");
            }

        } catch (error) {
            console.error(
                "Không thể kiểm tra phiên đăng nhập:",
                error
            );
        }
    }

    // =========================================
    // XỬ LÝ ĐĂNG NHẬP
    // =========================================

    loginForm.addEventListener("submit", async (event) => {

        event.preventDefault();

        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        if (!username || !password) {

            showMessage(
                "Vui lòng nhập đầy đủ tài khoản và mật khẩu.",
                "error"
            );

            return;
        }

        loginButton.disabled = true;
        loginButton.textContent = "Đang đăng nhập...";

        try {

            const response = await fetch(`${LOGIN_API}/login`, {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                credentials: "include",

                body: JSON.stringify({
                    username: username,
                    password: password
                })
            });

            const result = await response.json();

            if (!response.ok || !result.success) {

                showMessage(
                    result.message || "Đăng nhập thất bại.",
                    "error"
                );

                return;
            }

            // Lấy trạng thái đổi mật khẩu.
            const mustChangePassword =
                result.user?.mustChangePassword === true;

            showMessage(
                mustChangePassword
                    ? "Đăng nhập thành công. Vui lòng đổi mật khẩu."
                    : "Đăng nhập thành công!",
                "success"
            );

            // Chuyển trang.
            if (mustChangePassword) {

                window.location.replace("change-password.html");

            } else {

                window.location.replace("index.html");
            }

        } catch (error) {

            console.error("Lỗi đăng nhập:", error);

            showMessage(
                "Không thể kết nối máy chủ. Vui lòng kiểm tra Backend.",
                "error"
            );

        } finally {

            loginButton.disabled = false;
            loginButton.textContent = "Đăng nhập";
        }
    });

    // =========================================
    // HIỂN THỊ THÔNG BÁO
    // =========================================

    function showMessage(message, type) {

        loginMessage.textContent = message;
        loginMessage.className = type;
    }

});
