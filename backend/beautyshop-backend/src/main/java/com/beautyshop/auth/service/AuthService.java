
package com.beautyshop.auth.service;

import com.beautyshop.auth.dto.LoginResponse;
import com.beautyshop.couchdb.CouchDbClient;

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

@Service
public class AuthService {

    private final CouchDbClient couchDbClient;
    private final BCryptPasswordEncoder passwordEncoder;

    public AuthService(CouchDbClient couchDbClient) {
        this.couchDbClient = couchDbClient;
        this.passwordEncoder = new BCryptPasswordEncoder();
    }

    // =========================================
    // ĐĂNG NHẬP
    // =========================================

    public LoginResponse.UserInfo login(
            String username,
            String password) {

        if (username == null || username.isBlank()
                || password == null || password.isBlank()) {

            throw new IllegalArgumentException(
                    "Vui lòng nhập tài khoản và mật khẩu."
            );
        }

        String inputUsername = username.trim();

        List<Map<String, Object>> documents =
                couchDbClient.getAllDocuments();

        if (documents == null || documents.isEmpty()) {
            throw new IllegalArgumentException(
                    "Hệ thống chưa có tài khoản đăng nhập."
            );
        }

        Map<String, Object> account = null;

        // Tìm tài khoản.
        for (Map<String, Object> document : documents) {

            if (document == null) {
                continue;
            }

            if (!"user".equalsIgnoreCase(
                    getValue(document, "type"))) {
                continue;
            }

            String storedUsername =
                    getValue(document, "username");

            if (storedUsername != null
                    && storedUsername.equalsIgnoreCase(inputUsername)) {

                account = document;
                break;
            }
        }

        if (account == null) {
            throw new IllegalArgumentException(
                    "Tài khoản hoặc mật khẩu không chính xác."
            );
        }

        // Kiểm tra trạng thái tài khoản.
        if (!"active".equalsIgnoreCase(
                getValue(account, "status"))) {

            throw new IllegalArgumentException(
                    "Tài khoản đã bị khóa hoặc ngừng hoạt động."
            );
        }

        // Kiểm tra BCrypt.
        String passwordHash =
                getValue(account, "password_hash");

        if (passwordHash == null
                || !isBcryptHash(passwordHash)
                || !passwordEncoder.matches(password, passwordHash)) {

            throw new IllegalArgumentException(
                    "Tài khoản hoặc mật khẩu không chính xác."
            );
        }

        // Lấy mã nhân viên.
        String employeeId =
                getValue(account, "employee_id");

        if (employeeId == null || employeeId.isBlank()) {
            throw new IllegalArgumentException(
                    "Tài khoản chưa được liên kết với nhân viên."
            );
        }

        // Tìm nhân viên.
        Map<String, Object> employee =
                findEmployee(documents, employeeId);

        if (employee == null) {
            throw new IllegalArgumentException(
                    "Không tìm thấy thông tin nhân viên."
            );
        }

        if (!"active".equalsIgnoreCase(
                getValue(employee, "status"))) {

            throw new IllegalArgumentException(
                    "Nhân viên đã ngừng hoạt động."
            );
        }

        String role = getValue(account, "role");

        if (role == null || role.isBlank()) {
            throw new IllegalArgumentException(
                    "Tài khoản chưa được phân quyền."
            );
        }

        String branchId = getValue(employee, "branch_id");

        if (branchId == null) {
            branchId = getValue(account, "branch_id");
        }

        // Kiểm tra có bắt buộc đổi mật khẩu không.
        boolean mustChangePassword = Boolean.parseBoolean(
                getValue(account, "must_change_password")
        );

        return new LoginResponse.UserInfo(
                getValue(account, "_id"),
                employeeId,
                getValue(account, "username"),
                getValue(employee, "full_name"),
                role,
                branchId,
                mustChangePassword
        );
    }

    // =========================================
    // ĐỔI MẬT KHẨU
    // =========================================

    public void changePassword(
            String userId,
            String currentPassword,
            String newPassword) {

        if (userId == null || userId.isBlank()) {
            throw new IllegalArgumentException(
                    "Không xác định được tài khoản."
            );
        }

        if (currentPassword == null || currentPassword.isBlank()) {
            throw new IllegalArgumentException(
                    "Vui lòng nhập mật khẩu hiện tại."
            );
        }

        if (newPassword == null || newPassword.isBlank()) {
            throw new IllegalArgumentException(
                    "Vui lòng nhập mật khẩu mới."
            );
        }

        // Không cho phép mật khẩu mới quá ngắn.
        if (newPassword.length() < 8) {
            throw new IllegalArgumentException(
                    "Mật khẩu mới phải có ít nhất 8 ký tự."
            );
        }

        // Đọc tài khoản từ CouchDB.
        Map<String, Object> account =
                couchDbClient.getDocument(userId);

        if (account == null
                || !"user".equalsIgnoreCase(
                        getValue(account, "type"))) {

            throw new IllegalArgumentException(
                    "Không tìm thấy tài khoản."
            );
        }

        if (!"active".equalsIgnoreCase(
                getValue(account, "status"))) {

            throw new IllegalArgumentException(
                    "Tài khoản đã bị khóa hoặc ngừng hoạt động."
            );
        }

        // Kiểm tra mật khẩu hiện tại.
        String currentHash =
                getValue(account, "password_hash");

        if (currentHash == null
                || !isBcryptHash(currentHash)
                || !passwordEncoder.matches(
                        currentPassword, currentHash)) {

            throw new IllegalArgumentException(
                    "Mật khẩu hiện tại không chính xác."
            );
        }

        // Không cho dùng lại mật khẩu hiện tại.
        if (passwordEncoder.matches(newPassword, currentHash)) {
            throw new IllegalArgumentException(
                    "Mật khẩu mới phải khác mật khẩu hiện tại."
            );
        }

        // Mã hóa mật khẩu mới.
        String newPasswordHash =
                passwordEncoder.encode(newPassword);

        account.put("password_hash", newPasswordHash);

        // Đánh dấu đã đổi mật khẩu lần đầu.
        account.put("must_change_password", false);

        account.put(
                "updated_at",
                OffsetDateTime.now().toString()
        );

        // Lưu document, giữ nguyên _rev hiện tại.
        couchDbClient.saveDocument(userId, account);
    }

    // =========================================
    // TÌM NHÂN VIÊN
    // =========================================

    private Map<String, Object> findEmployee(
            List<Map<String, Object>> documents,
            String employeeId) {

        for (Map<String, Object> document : documents) {

            if (document == null) {
                continue;
            }

            if (!"employee".equalsIgnoreCase(
                    getValue(document, "type"))) {
                continue;
            }

            String storedId =
                    getValue(document, "employee_id");

            if (storedId != null
                    && storedId.equalsIgnoreCase(employeeId)) {

                return document;
            }
        }

        return null;
    }

    // =========================================
    // KIỂM TRA ĐỊNH DẠNG BCRYPT
    // =========================================

    private boolean isBcryptHash(String hash) {

        return hash != null
                && hash.matches(
                "^\\$2[aby]\\$\\d{2}\\$[./A-Za-z0-9]{53}$"
        );
    }

    // =========================================
    // LẤY GIÁ TRỊ DOCUMENT
    // =========================================

    private String getValue(
            Map<String, Object> document,
            String key) {

        Object value = document.get(key);

        return value == null
                ? null
                : value.toString().trim();
    }
}
