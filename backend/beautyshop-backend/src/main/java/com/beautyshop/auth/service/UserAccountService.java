package com.beautyshop.auth.service;

import com.beautyshop.couchdb.CouchDbClient;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
public class UserAccountService {

    private static final Set<String> ALLOWED_ROLES =
            Set.of("admin", "manager", "staff");

    private final CouchDbClient couchDb;
    private final BCryptPasswordEncoder passwordEncoder =
            new BCryptPasswordEncoder();

    public UserAccountService(CouchDbClient couchDb) {
        this.couchDb = couchDb;
    }

    public List<Map<String, Object>> getAccounts() {
        List<Map<String, Object>> documents = couchDb.getAllDocuments();
        Map<String, Map<String, Object>> employees = new HashMap<>();

        for (Map<String, Object> document : documents) {
            if (!"employee".equals(document.get("type"))) {
                continue;
            }

            employees.put(text(document.get("employee_id")), document);
            employees.put(text(document.get("_id")), document);
        }

        List<Map<String, Object>> result = new ArrayList<>();

        for (Map<String, Object> document : documents) {
            if ("user".equals(document.get("type"))) {
                result.add(toSafeAccount(
                        document,
                        employees.get(text(document.get("employee_id")))
                ));
            }
        }

        return result;
    }

    public Map<String, Object> createAccount(Map<String, Object> request) {
        if (request == null) {
            throw badRequest("Dữ liệu tạo tài khoản không hợp lệ.");
        }

        String employeeId = text(request.get("employee_id"));
        Map<String, Object> employee = findEmployee(employeeId);

        if (employee == null) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Không tìm thấy nhân viên được chọn."
            );
        }

        if (!"active".equalsIgnoreCase(text(employee.get("status")))) {
            throw badRequest(
                    "Chỉ có thể tạo tài khoản cho nhân viên đang hoạt động."
            );
        }

        String username = text(employee.get("username"));
        String role = normalizeRole(employee.get("role"));
        String temporaryPassword = text(request.get("temporary_password"));

        if (username.isBlank()) {
            throw badRequest(
                    "Nhân viên cần có tên đăng nhập trước khi tạo tài khoản."
            );
        }

        validatePassword(temporaryPassword);

        for (Map<String, Object> document : couchDb.getAllDocuments()) {
            if (!"user".equals(document.get("type"))) {
                continue;
            }

            if (employeeId.equals(text(document.get("employee_id")))) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "Nhân viên này đã có tài khoản đăng nhập."
                );
            }

            if (username.equalsIgnoreCase(text(document.get("username")))) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "Tên đăng nhập đã được một tài khoản khác sử dụng."
                );
            }
        }

        String userCode = nextUserCode();
        String documentId = userCode.toLowerCase(Locale.ROOT);
        String now = OffsetDateTime.now().toString();

        Map<String, Object> account = new LinkedHashMap<>();
        account.put("_id", documentId);
        account.put("type", "user");
        account.put("user_id", userCode);
        account.put("username", username);
        account.put("employee_id", text(employee.get("employee_id")));
        account.put("role", role);
        account.put("branch_id", text(employee.get("branch_id")));
        account.put("status", "active");
        account.put("password_hash", passwordEncoder.encode(temporaryPassword));
        account.put("must_change_password", true);
        account.put("created_at", now);
        account.put("updated_at", now);

        couchDb.saveDocument(documentId, account);

        return toSafeAccount(account, employee);
    }

    public Map<String, Object> updateAccount(
            String accountId,
            Map<String, Object> request,
            String actorId) {

        Map<String, Object> account = findAccount(accountId);

        if (account == null) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Không tìm thấy tài khoản."
            );
        }

        String role = normalizeRole(
                request == null
                        ? account.get("role")
                        : request.getOrDefault("role", account.get("role"))
        );
        String status = normalizeStatus(
                request == null
                        ? account.get("status")
                        : request.getOrDefault("status", account.get("status"))
        );

        if (accountId.equals(actorId)
                && (!"admin".equals(role) || !"active".equals(status))) {
            throw badRequest(
                    "Không thể tự hạ quyền hoặc khóa tài khoản đang sử dụng."
            );
        }

        boolean wasActiveAdmin = "admin".equals(text(account.get("role")))
                && "active".equals(text(account.get("status")));
        boolean willRemainActiveAdmin =
                "admin".equals(role) && "active".equals(status);

        if (wasActiveAdmin && !willRemainActiveAdmin
                && countActiveAdmins() <= 1) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Không thể khóa hoặc hạ quyền admin cuối cùng."
            );
        }

        account.put("role", role);
        account.put("status", status);
        account.put("updated_at", OffsetDateTime.now().toString());

        couchDb.saveDocument(accountId, account);

        Map<String, Object> employee =
            findEmployee(text(account.get("employee_id")));

        if (employee != null) {
            employee.put("role", role);
            couchDb.saveDocument(text(employee.get("_id")), employee);
        }

        return toSafeAccount(
                account,
            employee
        );
    }

    public void resetPassword(
            String accountId,
            Map<String, Object> request,
            String actorId) {

        if (accountId.equals(actorId)) {
            throw badRequest(
                    "Hãy dùng chức năng đổi mật khẩu để đổi mật khẩu của chính bạn."
            );
        }

        Map<String, Object> account = findAccount(accountId);

        if (account == null) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Không tìm thấy tài khoản."
            );
        }

        String temporaryPassword = request == null
                ? ""
                : text(request.get("temporary_password"));

        validatePassword(temporaryPassword);

        account.put("password_hash", passwordEncoder.encode(temporaryPassword));
        account.put("must_change_password", true);
        account.put("updated_at", OffsetDateTime.now().toString());

        couchDb.saveDocument(accountId, account);
    }

    public void syncEmployeeAccount(Map<String, Object> employee) {
        String employeeId = text(employee.get("employee_id"));
        Map<String, Object> account = findAccountByEmployee(employeeId);

        if (account == null) {
            return;
        }

        String username = text(employee.get("username"));

        for (Map<String, Object> document : couchDb.getAllDocuments()) {
            if ("user".equals(document.get("type"))
                    && !text(account.get("_id")).equals(text(document.get("_id")))
                    && username.equalsIgnoreCase(text(document.get("username")))) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "Tên đăng nhập đã được một tài khoản khác sử dụng."
                );
            }
        }

        account.put("username", username);
        account.put("role", normalizeRole(employee.get("role")));
        account.put("branch_id", text(employee.get("branch_id")));
        if ("inactive".equalsIgnoreCase(text(employee.get("status")))) {
            account.put("status", "inactive");
        }
        account.put("updated_at", OffsetDateTime.now().toString());
        couchDb.saveDocument(text(account.get("_id")), account);
    }

    public void deactivateAccountForEmployee(String employeeId) {
        Map<String, Object> account = findAccountByEmployee(employeeId);

        if (account == null) {
            return;
        }

        account.put("status", "inactive");
        account.put("updated_at", OffsetDateTime.now().toString());
        couchDb.saveDocument(text(account.get("_id")), account);
    }

    private long countActiveAdmins() {
        return couchDb.getAllDocuments().stream()
                .filter(document -> "user".equals(document.get("type")))
                .filter(document -> "admin".equals(text(document.get("role"))))
                .filter(document -> "active".equals(text(document.get("status"))))
                .count();
    }

    private String nextUserCode() {
        int maxNumber = 0;

        for (Map<String, Object> document : couchDb.getAllDocuments()) {
            if (!"user".equals(document.get("type"))) {
                continue;
            }

            String code = text(document.get("user_id"));

            if (code.isBlank()) {
                code = text(document.get("_id"));
            }

            if (code.matches("(?i)USR\\d+")) {
                try {
                    maxNumber = Math.max(
                            maxNumber,
                            Integer.parseInt(code.substring(3))
                    );
                } catch (NumberFormatException ignored) {
                    // Ignore legacy IDs whose sequence exceeds integer range.
                }
            }
        }

        return String.format(Locale.ROOT, "USR%03d", maxNumber + 1);
    }

    private Map<String, Object> findAccount(String id) {
        if (id == null || id.isBlank()) {
            return null;
        }

        Map<String, Object> account = couchDb.getDocument(id);

        return account != null && "user".equals(account.get("type"))
                ? account
                : null;
    }

    private Map<String, Object> findAccountByEmployee(String employeeId) {
        return couchDb.getAllDocuments().stream()
                .filter(document -> "user".equals(document.get("type")))
                .filter(document -> employeeId.equals(text(document.get("employee_id"))))
                .findFirst()
                .orElse(null);
    }

    private Map<String, Object> findEmployee(String id) {
        return couchDb.getAllDocuments().stream()
                .filter(document -> "employee".equals(document.get("type")))
                .filter(document -> id.equals(text(document.get("employee_id")))
                        || id.equals(text(document.get("_id"))))
                .findFirst()
                .orElse(null);
    }

    private String normalizeRole(Object value) {
        String role = text(value).toLowerCase(Locale.ROOT);

        if (!ALLOWED_ROLES.contains(role)) {
            throw badRequest("Vai trò tài khoản không hợp lệ.");
        }

        return role;
    }

    private String normalizeStatus(Object value) {
        String status = text(value).toLowerCase(Locale.ROOT);

        if (!Set.of("active", "inactive").contains(status)) {
            throw badRequest("Trạng thái tài khoản không hợp lệ.");
        }

        return status;
    }

    private void validatePassword(String password) {
        if (password.length() < 8 || password.length() > 72) {
            throw badRequest(
                    "Mật khẩu tạm phải dài từ 8 đến 72 ký tự."
            );
        }
    }

    private Map<String, Object> toSafeAccount(
            Map<String, Object> account,
            Map<String, Object> employee) {

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("_id", account.get("_id"));
        result.put("user_id", account.get("user_id"));
        result.put("username", account.get("username"));
        result.put("employee_id", account.get("employee_id"));
        result.put("employee_name", employee == null
                ? ""
                : text(employee.get("full_name")));
        result.put("role", account.get("role"));
        result.put("status", account.get("status"));
        result.put("must_change_password", account.get("must_change_password"));
        result.put("created_at", account.get("created_at"));
        return result;
    }

    private String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}