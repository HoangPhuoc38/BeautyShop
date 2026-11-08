
package com.beautyshop.auth.controller;

import com.beautyshop.auth.dto.LoginRequest;
import com.beautyshop.auth.dto.LoginResponse;
import com.beautyshop.auth.service.AuthService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    // =========================================
    // ĐĂNG NHẬP
    // =========================================

    @PostMapping("/login")
    public ResponseEntity<?> login(
            @RequestBody LoginRequest request,
            HttpServletRequest httpRequest) {

        try {
            LoginResponse.UserInfo user = authService.login(
                    request.username(),
                    request.password()
            );

            // Hủy Session cũ.
            HttpSession oldSession =
                    httpRequest.getSession(false);

            if (oldSession != null) {
                oldSession.invalidate();
            }

            // Tạo Session mới.
            HttpSession session =
                    httpRequest.getSession(true);

            session.setMaxInactiveInterval(8 * 60 * 60);

            session.setAttribute("AUTH_USER", user);

            session.setAttribute(
                    "MUST_CHANGE_PASSWORD",
                    user.mustChangePassword()
            );

            return ResponseEntity.ok(
                    new LoginResponse(
                            true,
                            user.mustChangePassword()
                                    ? "Đăng nhập thành công. Vui lòng đổi mật khẩu."
                                    : "Đăng nhập thành công.",
                            user
                    )
            );

        } catch (IllegalArgumentException e) {

            return ResponseEntity
                    .status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of(
                            "success", false,
                            "message", e.getMessage()
                    ));
        }
    }

    // =========================================
    // KIỂM TRA ĐĂNG NHẬP
    // =========================================

    @GetMapping("/me")
    public ResponseEntity<?> getCurrentUser(
            HttpServletRequest request) {

        HttpSession session =
                request.getSession(false);

        if (session == null) {
            return ResponseEntity
                    .status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of(
                            "success", false,
                            "message", "Bạn chưa đăng nhập."
                    ));
        }

        Object user = session.getAttribute("AUTH_USER");

        if (user == null) {
            return ResponseEntity
                    .status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of(
                            "success", false,
                            "message", "Phiên đăng nhập không hợp lệ."
                    ));
        }

        boolean mustChangePassword = Boolean.TRUE.equals(
                session.getAttribute("MUST_CHANGE_PASSWORD")
        );

        return ResponseEntity.ok(
                Map.of(
                        "success", true,
                        "user", user,
                        "mustChangePassword", mustChangePassword
                )
        );
    }

    // =========================================
    // ĐỔI MẬT KHẨU
    // =========================================

    @PostMapping("/change-password")
    public ResponseEntity<?> changePassword(
            @RequestBody Map<String, String> requestBody,
            HttpServletRequest request) {

        HttpSession session =
                request.getSession(false);

        if (session == null) {
            return ResponseEntity
                    .status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of(
                            "success", false,
                            "message", "Bạn chưa đăng nhập."
                    ));
        }

        Object userObject =
                session.getAttribute("AUTH_USER");

        if (!(userObject instanceof LoginResponse.UserInfo user)) {
            return ResponseEntity
                    .status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of(
                            "success", false,
                            "message", "Phiên đăng nhập không hợp lệ."
                    ));
        }

        String currentPassword =
                requestBody.get("currentPassword");

        String newPassword =
                requestBody.get("newPassword");

        String confirmPassword =
                requestBody.get("confirmPassword");

        if (newPassword == null
                || !newPassword.equals(confirmPassword)) {

            return ResponseEntity
                    .badRequest()
                    .body(Map.of(
                            "success", false,
                            "message", "Mật khẩu xác nhận không khớp."
                    ));
        }

        try {
            authService.changePassword(
                    user.id(),
                    currentPassword,
                    newPassword
            );

            // Cập nhật trạng thái Session.
            LoginResponse.UserInfo updatedUser =
                    new LoginResponse.UserInfo(
                            user.id(),
                            user.employeeId(),
                            user.username(),
                            user.fullName(),
                            user.role(),
                            user.branchId(),
                            false
                    );

            session.setAttribute("AUTH_USER", updatedUser);

            session.setAttribute(
                    "MUST_CHANGE_PASSWORD",
                    false
            );

            return ResponseEntity.ok(
                    Map.of(
                            "success", true,
                            "message", "Đổi mật khẩu thành công.",
                            "mustChangePassword", false
                    )
            );

        } catch (IllegalArgumentException e) {

            return ResponseEntity
                    .badRequest()
                    .body(Map.of(
                            "success", false,
                            "message", e.getMessage()
                    ));
        }
    }

    // =========================================
    // ĐĂNG XUẤT
    // =========================================

    @PostMapping("/logout")
    public ResponseEntity<?> logout(
            HttpServletRequest request) {

        HttpSession session =
                request.getSession(false);

        if (session != null) {
            session.invalidate();
        }

        return ResponseEntity.ok(
                Map.of(
                        "success", true,
                        "message", "Đã đăng xuất."
                )
        );
    }
}
