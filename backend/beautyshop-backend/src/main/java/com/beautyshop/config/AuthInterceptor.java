
package com.beautyshop.config;

import com.beautyshop.auth.dto.LoginResponse;
import com.beautyshop.couchdb.CouchDbClient;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.io.IOException;
import java.util.Map;
import java.util.Locale;

@Component
public class AuthInterceptor implements HandlerInterceptor {

        private final CouchDbClient couchDb;

        public AuthInterceptor(CouchDbClient couchDb) {
                this.couchDb = couchDb;
        }

    @Override
    public boolean preHandle(
            HttpServletRequest request,
            HttpServletResponse response,
            Object handler
    ) throws IOException {

        // 1. Cho phép CORS preflight.
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }

        String requestURI = request.getRequestURI();

        // 2. Lấy Session hiện tại.
        HttpSession session = request.getSession(false);

        // 3. Kiểm tra đăng nhập.
        if (session == null
                || session.getAttribute("AUTH_USER") == null) {

            writeError(
                    response,
                    HttpServletResponse.SC_UNAUTHORIZED,
                    "Vui lòng đăng nhập."
            );

            return false;
        }

        Object authenticatedUser = session.getAttribute("AUTH_USER");

        if (!(authenticatedUser instanceof LoginResponse.UserInfo user)) {
            session.invalidate();
            writeError(
                    response,
                    HttpServletResponse.SC_UNAUTHORIZED,
                    "Phiên đăng nhập không hợp lệ."
            );
            return false;
        }

        Map<String, Object> account = couchDb.getDocument(user.id());

        if (account == null
                || !"user".equals(account.get("type"))
                || !"active".equalsIgnoreCase(text(account.get("status")))) {
            session.invalidate();
            writeError(
                    response,
                    HttpServletResponse.SC_UNAUTHORIZED,
                    "Tài khoản đã bị khóa hoặc không còn hợp lệ."
            );
            return false;
        }

        String role = text(account.get("role"));
        boolean mustChangePassword = Boolean.parseBoolean(
                text(account.get("must_change_password"))
        );

        session.setAttribute(
                "AUTH_USER",
                new LoginResponse.UserInfo(
                        user.id(),
                        text(account.get("employee_id")),
                        text(account.get("username")),
                        user.fullName(),
                        role,
                        text(account.get("branch_id")),
                        mustChangePassword
                )
        );
        session.setAttribute("MUST_CHANGE_PASSWORD", mustChangePassword);

        RoleAccessPolicy accessPolicy = new RoleAccessPolicy();

        if (!accessPolicy.isAllowed(
                role,
                request.getMethod(),
                requestURI,
                request.getParameter("paymentMethod"))) {
            writeError(
                    response,
                    HttpServletResponse.SC_FORBIDDEN,
                    "Tài khoản không có quyền thực hiện thao tác này."
            );
            return false;
        }

        // 5. Nếu chưa đổi mật khẩu, chỉ cho phép một số API.
        if (mustChangePassword) {

            boolean allowed =
                    requestURI.endsWith("/api/auth/me")
                    || requestURI.endsWith("/api/auth/logout")
                    || requestURI.endsWith("/api/auth/change-password");

            if (!allowed) {

                writeError(
                        response,
                        HttpServletResponse.SC_FORBIDDEN,
                        "Bạn phải đổi mật khẩu trước khi sử dụng hệ thống."
                );

                return false;
            }
        }

        // 6. Cho phép truy cập.
        return true;
    }

        private String text(Object value) {
                return value == null ? "" : String.valueOf(value).trim();
        }

    // =========================================
    // TRẢ RESPONSE JSON LỖI
    // =========================================

    private void writeError(
            HttpServletResponse response,
            int status,
            String message
    ) throws IOException {

        response.setStatus(status);
        response.setCharacterEncoding("UTF-8");
        response.setContentType("application/json;charset=UTF-8");

        response.getWriter().write(
                "{\"success\":false,\"message\":\""
                        + message
                        + "\"}"
        );
    }
}
