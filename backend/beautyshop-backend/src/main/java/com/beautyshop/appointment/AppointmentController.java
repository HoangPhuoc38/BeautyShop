
package com.beautyshop.appointment;

import com.beautyshop.auth.dto.LoginResponse;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

@RestController
@RequestMapping("/api/appointments")
@CrossOrigin(origins = {
    "http://localhost:5500",
    "http://127.0.0.1:5500"
})
public class AppointmentController {

    private final RestClient couchClient;
    private final String database;

    public AppointmentController(
            @Value("${couchdb.url:http://localhost:5984}") String couchUrl,
            @Value("${couchdb.database:beautyshop}") String database,
            @Value("${couchdb.username:admin}") String username,
            @Value("${couchdb.password:}") String password) {

        this.database = database;

        this.couchClient = RestClient.builder()
                .baseUrl(couchUrl + "/" + database)
                .defaultHeaders(headers ->
                    headers.setBasicAuth(username, password))
                .build();
    }

    // Lấy danh sách lịch hẹn
    @GetMapping
    public List<Map<String, Object>> getAllAppointments(
            HttpServletRequest request) {

        LoginResponse.UserInfo user = currentUser(request);

        Map<?, ?> response = couchClient.get()
                .uri("/_all_docs?include_docs=true")
                .retrieve()
                .body(Map.class);

        List<Map<String, Object>> appointments =
                new ArrayList<>();

        if (response == null || !(response.get("rows") instanceof List<?> rows)) {
            return appointments;
        }

        for (Object item : rows) {
            if (!(item instanceof Map<?, ?> row)) {
                continue;
            }

            Object docObject = row.get("doc");

            if (docObject instanceof Map<?, ?> doc
                    && "appointment".equals(doc.get("type"))) {

                Map<String, Object> appointment = toMap(doc);

                if (canAccessAppointment(appointment, user)) {
                    appointments.add(appointment);
                }
            }
        }

        return appointments;
    }

    // Xem một lịch hẹn theo CouchDB _id
    @GetMapping("/{id}")
    public ResponseEntity<?> getAppointmentById(
            @PathVariable String id,
            HttpServletRequest request) {

        try {
            Map<?, ?> doc = couchClient.get()
                    .uri("/{id}", id)
                    .retrieve()
                    .body(Map.class);

            if (doc == null ||
                    !"appointment".equals(doc.get("type"))) {
                return ResponseEntity.notFound().build();
            }

            Map<String, Object> appointment = toMap(doc);

            if (!canAccessAppointment(appointment, currentUser(request))) {
                return ResponseEntity.notFound().build();
            }

            return ResponseEntity.ok(appointment);

        } catch (RestClientResponseException e) {
            if (e.getStatusCode().value() == 404) {
                return ResponseEntity.notFound().build();
            }

            return ResponseEntity.status(e.getStatusCode())
                    .body(Map.of("message",
                            "Không thể lấy lịch hẹn."));
        }
    }

    // Thêm lịch hẹn
    @PostMapping
    public ResponseEntity<?> createAppointment(
            @RequestBody Map<String, Object> input,
            HttpServletRequest request) {

        LoginResponse.UserInfo user = currentUser(request);
        Map<String, Object> scopedInput = new LinkedHashMap<>(input);

        if (!"admin".equalsIgnoreCase(user.role())) {
            String branchId = user.branchId();

            if (branchId == null || branchId.isBlank()) {
                return forbidden("Tài khoản chưa được gán chi nhánh.");
            }

            scopedInput.put("branch_id", branchId);

            if ("staff".equalsIgnoreCase(user.role())) {
                scopedInput.put("employee_id", user.employeeId());
            } else if (!employeeBelongsToBranch(
                    stringValue(scopedInput.get("employee_id")),
                    branchId)) {
                return forbidden(
                        "Chỉ có thể đặt lịch cho nhân viên thuộc chi nhánh của bạn."
                );
            }
        }

        String appointmentId =
                stringValue(scopedInput.get("appointment_id"));

        if (appointmentId.isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message",
                            "Mã lịch hẹn không được để trống."));
        }

        if (!validAppointment(scopedInput)) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message",
                            "Vui lòng kiểm tra đầy đủ thông tin lịch hẹn."));
        }

        String id = stringValue(scopedInput.get("_id"));

        if (id.isBlank()) {
            id = appointmentId.toLowerCase();
        }

        Map<String, Object> doc = cleanDocument(scopedInput);
        doc.put("_id", id);
        doc.put("type", "appointment");
        doc.remove("_rev");

        try {
            Map<?, ?> result = couchClient.post()
                    .uri("/")
                    .body(doc)
                    .retrieve()
                    .body(Map.class);

            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(result);

        } catch (RestClientResponseException e) {
            if (e.getStatusCode().value() == 409) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.of("message",
                                "Mã lịch hẹn đã tồn tại."));
            }

            return ResponseEntity.status(e.getStatusCode())
                    .body(Map.of("message",
                            "Không thể tạo lịch hẹn."));
        }
    }

    // Cập nhật lịch hẹn
    @PutMapping("/{id}")
    public ResponseEntity<?> updateAppointment(
            @PathVariable String id,
            @RequestBody Map<String, Object> input,
            HttpServletRequest request) {

        try {
            Map<?, ?> existing = couchClient.get()
                    .uri("/{id}", id)
                    .retrieve()
                    .body(Map.class);

            if (existing == null ||
                    !"appointment".equals(existing.get("type"))) {
                return ResponseEntity.notFound().build();
            }

            LoginResponse.UserInfo user = currentUser(request);
            Map<String, Object> existingAppointment = toMap(existing);

            if (!canAccessAppointment(existingAppointment, user)) {
                return ResponseEntity.notFound().build();
            }

            Map<String, Object> scopedInput = new LinkedHashMap<>(input);

            if (!"admin".equalsIgnoreCase(user.role())) {
                scopedInput.put("branch_id", user.branchId());

                if ("staff".equalsIgnoreCase(user.role())) {
                    scopedInput.put("employee_id", user.employeeId());
                } else if (!employeeBelongsToBranch(
                        stringValue(scopedInput.get("employee_id")),
                        user.branchId())) {
                    return forbidden(
                            "Chỉ có thể đặt lịch cho nhân viên thuộc chi nhánh của bạn."
                    );
                }
            }

            if (!validAppointment(scopedInput)) {
                return ResponseEntity.badRequest()
                        .body(Map.of("message",
                                "Thông tin lịch hẹn không hợp lệ."));
            }

            String revision = stringValue(scopedInput.get("_rev"));

            if (revision.isBlank()) {
                revision = stringValue(existing.get("_rev"));
            }

            Map<String, Object> doc = cleanDocument(scopedInput);
            doc.put("_id", id);
            doc.put("_rev", revision);
            doc.put("type", "appointment");

            Map<?, ?> result = couchClient.put()
                    .uri("/{id}", id)
                    .body(doc)
                    .retrieve()
                    .body(Map.class);

            return ResponseEntity.ok(result);

        } catch (RestClientResponseException e) {
            if (e.getStatusCode().value() == 404) {
                return ResponseEntity.notFound().build();
            }

            if (e.getStatusCode().value() == 409) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.of("message",
                                "Lịch hẹn đã thay đổi. Hãy tải lại dữ liệu."));
            }

            return ResponseEntity.status(e.getStatusCode())
                    .body(Map.of("message",
                            "Không thể cập nhật lịch hẹn."));
        }
    }

    // Xóa lịch hẹn
    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteAppointment(
            @PathVariable String id,
            HttpServletRequest request) {

        try {
            Map<?, ?> existing = couchClient.get()
                    .uri("/{id}", id)
                    .retrieve()
                    .body(Map.class);

            if (existing == null ||
                    !"appointment".equals(existing.get("type"))) {
                return ResponseEntity.notFound().build();
            }

            if (!canAccessAppointment(toMap(existing), currentUser(request))) {
                return ResponseEntity.notFound().build();
            }

            String revision = stringValue(existing.get("_rev"));

            Map<?, ?> result = couchClient.delete()
                    .uri("/{id}?rev={rev}", id, revision)
                    .retrieve()
                    .body(Map.class);

            return ResponseEntity.ok(result);

        } catch (RestClientResponseException e) {
            if (e.getStatusCode().value() == 404) {
                return ResponseEntity.notFound().build();
            }

            if (e.getStatusCode().value() == 409) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.of("message",
                                "Lịch hẹn đã thay đổi. Hãy tải lại dữ liệu."));
            }

            return ResponseEntity.status(e.getStatusCode())
                    .body(Map.of("message",
                            "Không thể xóa lịch hẹn."));
        }
    }

    private boolean validAppointment(Map<String, Object> doc) {
        if (stringValue(doc.get("appointment_id")).isBlank()
                || stringValue(doc.get("customer_id")).isBlank()
                || stringValue(doc.get("employee_id")).isBlank()
                || stringValue(doc.get("branch_id")).isBlank()
                || stringValue(doc.get("appointment_date")).isBlank()
                || stringValue(doc.get("start_time")).isBlank()
                || stringValue(doc.get("status")).isBlank()) {
            return false;
        }

        Object services = doc.get("service_ids");

        return services instanceof List<?> list
                && !list.isEmpty()
                && list.stream().allMatch(
                    s -> s instanceof String
                        && !((String) s).isBlank());
    }

    private Map<String, Object> cleanDocument(
            Map<String, Object> input) {

        Map<String, Object> doc = new LinkedHashMap<>();

        String[] fields = {
            "appointment_id",
            "customer_id",
            "employee_id",
            "service_ids",
            "branch_id",
            "appointment_date",
            "start_time",
            "status",
            "note"
        };

        for (String field : fields) {
            if (input.containsKey(field)) {
                doc.put(field, input.get(field));
            }
        }

        return doc;
    }

    private Map<String, Object> toMap(Map<?, ?> source) {
        Map<String, Object> result = new LinkedHashMap<>();

        source.forEach((key, value) ->
                result.put(String.valueOf(key), value));

        return result;
    }

    private LoginResponse.UserInfo currentUser(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        Object value = session == null ? null : session.getAttribute("AUTH_USER");

        return value instanceof LoginResponse.UserInfo user ? user : null;
    }

    private boolean canAccessAppointment(
            Map<String, Object> appointment,
            LoginResponse.UserInfo user) {

        if (user == null || "admin".equalsIgnoreCase(user.role())) {
            return user != null;
        }

        if (user.branchId() == null || user.branchId().isBlank()
                || !user.branchId().equals(
                        stringValue(appointment.get("branch_id")))) {
            return false;
        }

        return "manager".equalsIgnoreCase(user.role())
                || ("staff".equalsIgnoreCase(user.role())
                && user.employeeId().equals(
                        stringValue(appointment.get("employee_id"))));
    }

    private boolean employeeBelongsToBranch(
            String employeeId,
            String branchId) {

        Map<?, ?> response = couchClient.get()
                .uri("/_all_docs?include_docs=true")
                .retrieve()
                .body(Map.class);

        if (response == null || !(response.get("rows") instanceof List<?> rows)) {
            return false;
        }

        for (Object item : rows) {
            if (!(item instanceof Map<?, ?> row)
                    || !(row.get("doc") instanceof Map<?, ?> doc)) {
                continue;
            }

            if ("employee".equals(doc.get("type"))
                    && (employeeId.equals(stringValue(doc.get("employee_id")))
                    || employeeId.equals(stringValue(doc.get("_id"))))
                    && branchId.equals(stringValue(doc.get("branch_id")))) {
                return true;
            }
        }

        return false;
    }

    private ResponseEntity<Map<String, String>> forbidden(String message) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("message", message));
    }

    private String stringValue(Object value) {
        return value == null ? "" : value.toString().trim();
    }
}
