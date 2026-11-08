package com.beautyshop.auth.controller;

import com.beautyshop.auth.dto.LoginResponse;
import com.beautyshop.auth.service.UserAccountService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/users")
public class UserAccountController {

    private final UserAccountService accountService;

    public UserAccountController(UserAccountService accountService) {
        this.accountService = accountService;
    }

    @GetMapping
    public List<Map<String, Object>> getAccounts() {
        return accountService.getAccounts();
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> createAccount(
            @RequestBody Map<String, Object> request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(accountService.createAccount(request));
    }

    @PutMapping("/{accountId}")
    public Map<String, Object> updateAccount(
            @PathVariable String accountId,
            @RequestBody Map<String, Object> request,
            HttpServletRequest httpRequest) {
        return accountService.updateAccount(
                accountId,
                request,
                currentUserId(httpRequest)
        );
    }

    @PostMapping("/{accountId}/reset-password")
    public Map<String, Object> resetPassword(
            @PathVariable String accountId,
            @RequestBody Map<String, Object> request,
            HttpServletRequest httpRequest) {
        accountService.resetPassword(
                accountId,
                request,
                currentUserId(httpRequest)
        );

        return Map.of(
                "success", true,
                "message", "Đã đặt lại mật khẩu. Người dùng phải đổi mật khẩu khi đăng nhập."
        );
    }

    private String currentUserId(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        Object value = session == null ? null : session.getAttribute("AUTH_USER");

        return value instanceof LoginResponse.UserInfo user
                ? user.id()
                : "";
    }
}