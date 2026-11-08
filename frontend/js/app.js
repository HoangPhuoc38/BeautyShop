"use strict";

document.addEventListener("DOMContentLoaded", function () {

    const menuToggle = document.getElementById("menuToggle");
    const sidebar = document.getElementById("sidebar");
    const sidebarOverlay = document.getElementById("sidebarOverlay");
    const logoutButton = document.getElementById("logoutButton");
    const currentYear = document.getElementById("currentYear");

    const AUTH_API = "http://127.0.0.1:8080/api/auth";


    // =========================================
    // SIDEBAR
    // =========================================

    function openSidebar() {

        if (!sidebar) return;

        sidebar.classList.add("open");

        if (sidebarOverlay) {
            sidebarOverlay.classList.add("active");
        }

        document.body.classList.add("sidebar-open");
    }


    function closeSidebar() {

        if (!sidebar) return;

        sidebar.classList.remove("open");

        if (sidebarOverlay) {
            sidebarOverlay.classList.remove("active");
        }

        document.body.classList.remove("sidebar-open");
    }


    if (menuToggle && sidebar) {

        menuToggle.addEventListener("click", function (event) {

            event.stopPropagation();

            if (sidebar.classList.contains("open")) {
                closeSidebar();
            } else {
                openSidebar();
            }

        });

    }


    if (sidebarOverlay) {

        sidebarOverlay.addEventListener("click", closeSidebar);

    }


    // Đóng sidebar khi chọn một liên kết.
    if (sidebar) {

        sidebar.querySelectorAll(".nav-item").forEach(function (item) {

            item.addEventListener("click", function () {

                if (window.innerWidth <= 900) {
                    closeSidebar();
                }

            });

        });

    }


    // Đóng sidebar bằng phím Escape.
    document.addEventListener("keydown", function (event) {

        if (event.key === "Escape") {
            closeSidebar();
        }

    });


    // Khi chuyển từ mobile sang desktop.
    window.addEventListener("resize", function () {

        if (window.innerWidth > 900) {
            closeSidebar();
        }

    });


    // =========================================
    // CURRENT YEAR
    // =========================================

    if (currentYear) {

        currentYear.textContent = new Date().getFullYear();

    }


    // =========================================
    // LOGOUT
    // =========================================

    if (logoutButton) {

        logoutButton.addEventListener("click", async function () {

            const confirmed = window.confirm(
                "Bạn có muốn đăng xuất khỏi BeautyShop không?"
            );

            if (!confirmed) return;


            try {

                const response = await fetch(`${AUTH_API}/logout`, {

                    method: "POST",

                    credentials: "include",

                    headers: {
                        "Accept": "application/json"
                    }

                });


                if (!response.ok) {

                    throw new Error(
                        `Không thể đăng xuất. HTTP ${response.status}`
                    );

                }


                window.location.href = "login.html";


            } catch (error) {

                console.error("Lỗi đăng xuất:", error);

                alert(
                    "Không thể đăng xuất. Vui lòng kiểm tra kết nối máy chủ."
                );

            }

        });

    }

});