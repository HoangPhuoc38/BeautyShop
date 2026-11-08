
package com.beautyshop.employee;

import com.beautyshop.auth.service.UserAccountService;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.UriUtils;

import java.nio.charset.StandardCharsets;

@RestController
@RequestMapping("/api/employees")
@CrossOrigin(origins = {
    "http://localhost:5500",
    "http://127.0.0.1:5500"
})
public class EmployeeController {

    private final RestClient couch;
    private final UserAccountService userAccountService;

    private static final Set<String> ROLES =
        Set.of("admin", "manager", "staff");

    private static final Set<String> STATUSES =
        Set.of("active", "inactive");

    public EmployeeController(
        RestClient.Builder builder,
        @Value("${couchdb.url:http://localhost:5984}") String couchUrl,
        @Value("${couchdb.database:beautyshop}") String database,
        @Value("${couchdb.username:}") String username,
        @Value("${couchdb.password:}") String password,
        UserAccountService userAccountService
    ) {
        this.userAccountService = userAccountService;

        String dbUrl = couchUrl.replaceAll("/+$", "")
            + "/" + database;

        RestClient.Builder configured = builder.baseUrl(dbUrl);

        if (username != null && !username.isBlank()) {
            configured.defaultHeaders(headers ->
                headers.setBasicAuth(username, password)
            );
        }

        this.couch = configured.build();
    }

    // =====================================================
    // LẤY DANH SÁCH NHÂN VIÊN
    // =====================================================

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> getAllDocuments() {
        Map<String, Object> result = couch.get()
            .uri("/_all_docs?include_docs=true")
            .retrieve()
            .body(Map.class);

        List<Map<String, Object>> employees = new ArrayList<>();

        if (result == null) {
            return employees;
        }

        List<Map<String, Object>> rows =
            (List<Map<String, Object>>) result.get("rows");

        if (rows == null) {
            return employees;
        }

        for (Map<String, Object> row : rows) {
            Object value = row.get("doc");

            if (value instanceof Map<?, ?> doc
                && "employee".equals(doc.get("type"))) {

                employees.add(
                    new LinkedHashMap<>(
                        (Map<String, Object>) doc
                    )
                );
            }
        }

        return employees;
    }

    // =====================================================
    // LẤY MỘT TÀI LIỆU THEO ID
    // =====================================================

    private Map<String, Object> getDocument(String id) {
        try {
            Map<?, ?> doc = couch.get()
                .uri("/{id}", UriUtils.encodePathSegment(
                    id, StandardCharsets.UTF_8))
                .retrieve()
                .body(Map.class);

            if (doc == null || !"employee".equals(doc.get("type"))) {
                throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Không tìm thấy nhân viên"
                );
            }

            @SuppressWarnings("unchecked")
            Map<String, Object> result =
                new LinkedHashMap<>((Map<String, Object>) doc);

            return result;

        } catch (HttpClientErrorException.NotFound e) {
            throw new ResponseStatusException(
                HttpStatus.NOT_FOUND,
                "Không tìm thấy nhân viên"
            );
        }
    }

    // =====================================================
    // KIỂM TRA DỮ LIỆU
    // =====================================================

    private String requiredText(
        Map<String, Object> data,
        String key
    ) {
        Object value = data.get(key);
        String text = value == null ? "" : value.toString().trim();

        if (text.isBlank()) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Trường " + key + " không được để trống"
            );
        }

        return text;
    }

    private void validate(Map<String, Object> data) {
        requiredText(data, "full_name");
        requiredText(data, "username");
        requiredText(data, "phone");
        requiredText(data, "email");
        requiredText(data, "role");
        requiredText(data, "status");
        requiredText(data, "branch_id");

        String role = requiredText(data, "role");
        String status = requiredText(data, "status");
        String email = requiredText(data, "email");

        if (!ROLES.contains(role)) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Vai trò không hợp lệ"
            );
        }

        if (!STATUSES.contains(status)) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Trạng thái không hợp lệ"
            );
        }

        if (!email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Email không hợp lệ"
            );
        }
    }

    // =====================================================
    // TẠO MÃ NHÂN VIÊN TIẾP THEO
    // =====================================================

    private String nextEmployeeCode(
        List<Map<String, Object>> employees
    ) {
        int max = 0;

        for (Map<String, Object> employee : employees) {
            Object value = employee.get("employee_id");

            if (value == null) {
                continue;
            }

            String code = value.toString();

            if (code.matches("EMP\\d+")) {
                try {
                    int number = Integer.parseInt(code.substring(3));
                    max = Math.max(max, number);
                } catch (NumberFormatException ignored) {
                    // Bỏ qua mã không hợp lệ hoặc vượt giới hạn số nguyên.
                }
            }
        }

        return String.format("EMP%03d", max + 1);
    }

    // =====================================================
    // KIỂM TRA USERNAME VÀ EMAIL TRÙNG
    // =====================================================

    private void checkDuplicate(
        String username,
        String email,
        String excludeId
    ) {
        List<Map<String, Object>> employees = getAllDocuments();

        boolean duplicate = employees.stream().anyMatch(employee -> {
            String id = String.valueOf(
                employee.getOrDefault("_id", "")
            );

            if (excludeId != null && excludeId.equals(id)) {
                return false;
            }

            String existingUsername = String.valueOf(
                employee.getOrDefault("username", "")
            );

            String existingEmail = String.valueOf(
                employee.getOrDefault("email", "")
            );

            return username.equalsIgnoreCase(existingUsername)
                || email.equalsIgnoreCase(existingEmail);
        });

        if (duplicate) {
            throw new ResponseStatusException(
                HttpStatus.CONFLICT,
                "Tên đăng nhập hoặc email đã tồn tại"
            );
        }
    }

    // =====================================================
    // GET /api/employees
    // =====================================================

    @GetMapping
    public List<Map<String, Object>> getEmployees() {
        List<Map<String, Object>> employees = getAllDocuments();

        employees.sort(Comparator.comparing(
            e -> String.valueOf(
                e.getOrDefault("employee_id", "")
            )
        ));

        return employees;
    }

    // =====================================================
    // GET /api/employees/{id}
    // =====================================================

    @GetMapping("/{id}")
    public Map<String, Object> getEmployee(
        @PathVariable String id
    ) {
        return getDocument(id);
    }

    // =====================================================
    // POST /api/employees
    // TẠO MỚI NHÂN VIÊN
    // =====================================================

    @PostMapping
    public ResponseEntity<Map<String, Object>> createEmployee(
        @RequestBody Map<String, Object> data
    ) {
        validate(data);

        String username = requiredText(data, "username");
        String email = requiredText(data, "email");

        checkDuplicate(username, email, null);

        String employeeCode = nextEmployeeCode(getAllDocuments());
        String documentId = employeeCode.toLowerCase(Locale.ROOT);

        Map<String, Object> doc = new LinkedHashMap<>();

        doc.put("_id", documentId);
        doc.put("type", "employee");
        doc.put("employee_id", employeeCode);
        doc.put("full_name", requiredText(data, "full_name"));
        doc.put("username", username);
        doc.put("role", requiredText(data, "role"));
        doc.put("phone", requiredText(data, "phone"));
        doc.put("email", email);
        doc.put("status", requiredText(data, "status"));
        doc.put("branch_id", requiredText(data, "branch_id"));

        try {
            Map<?, ?> saved = couch.put()
                .uri("/{id}", documentId)
                .body(doc)
                .retrieve()
                .body(Map.class);

            if (saved == null || saved.get("rev") == null) {
                throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "CouchDB không trả về revision của nhân viên"
                );
            }

            doc.put("_rev", saved.get("rev"));

            return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(doc);

        } catch (HttpClientErrorException.Conflict e) {
            throw new ResponseStatusException(
                HttpStatus.CONFLICT,
                "CouchDB báo trùng ID hoặc revision. "
                    + "Hãy tải lại danh sách và thử lại."
            );
        }
    }

    // =====================================================
    // PUT /api/employees/{id}
    // CẬP NHẬT NHÂN VIÊN
    // =====================================================

    @PutMapping("/{id}")
    public Map<String, Object> updateEmployee(
        @PathVariable String id,
        @RequestBody Map<String, Object> data
    ) {
        validate(data);

        String username = requiredText(data, "username");
        String email = requiredText(data, "email");

        checkDuplicate(username, email, id);

        Map<String, Object> current = getDocument(id);

        /*
         * CouchDB cần _rev mới nhất.
         * Lấy revision từ tài liệu hiện tại thay vì tin _rev
         * cũ gửi từ frontend.
         */
        current.put("full_name", requiredText(data, "full_name"));
        current.put("username", username);
        current.put("role", requiredText(data, "role"));
        current.put("phone", requiredText(data, "phone"));
        current.put("email", email);
        current.put("status", requiredText(data, "status"));
        current.put("branch_id", requiredText(data, "branch_id"));

        try {
            Map<?, ?> saved = couch.put()
                .uri("/{id}", UriUtils.encodePathSegment(
                    id, StandardCharsets.UTF_8))
                .body(current)
                .retrieve()
                .body(Map.class);

            if (saved != null && saved.get("rev") != null) {
                current.put("_rev", saved.get("rev"));
            }

            userAccountService.syncEmployeeAccount(current);

            return current;

        } catch (HttpClientErrorException.Conflict e) {
            throw new ResponseStatusException(
                HttpStatus.CONFLICT,
                "Nhân viên đã được thay đổi ở nơi khác. "
                    + "Hãy tải lại danh sách rồi thử lại."
            );
        }
    }

    // =====================================================
    // DELETE /api/employees/{id}?rev=...
    // XÓA NHÂN VIÊN
    // =====================================================

    @DeleteMapping("/{id}")
    public Map<?, ?> deleteEmployee(
        @PathVariable String id,
        @RequestParam String rev
    ) {
        Map<String, Object> current = getDocument(id);

        String currentRev = String.valueOf(
            current.getOrDefault("_rev", "")
        );

        if (!rev.equals(currentRev)) {
            throw new ResponseStatusException(
                HttpStatus.CONFLICT,
                "Revision đã thay đổi. Hãy tải lại danh sách."
            );
        }

        userAccountService.deactivateAccountForEmployee(
            String.valueOf(current.get("employee_id"))
        );

        return couch.delete()
            .uri("/" + UriUtils.encodePathSegment(
                id, StandardCharsets.UTF_8)
                + "?rev=" + UriUtils.encodeQueryParam(
                    rev, StandardCharsets.UTF_8))
            .retrieve()
            .body(Map.class);
    }
}
