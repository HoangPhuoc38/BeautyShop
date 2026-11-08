
package com.beautyshop.service;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.UriUtils;

@RestController
@RequestMapping("/api/services")
@CrossOrigin(origins = {
    "http://localhost:5500",
    "http://127.0.0.1:5500"
})
public class ServiceController {

    private final RestClient restClient;
    private final String couchDbUrl;
    private final String database;
    private final String authorization;

    public ServiceController(
            @Value("${couchdb.url:http://localhost:5984}") String couchDbUrl,
            @Value("${couchdb.database:beautyshop}") String database,
            @Value("${couchdb.username:admin}") String username,
            @Value("${couchdb.password:password}") String password) {

        this.couchDbUrl = couchDbUrl.replaceAll("/+$", "");
        this.database = database;

        this.authorization = "Basic " + Base64.getEncoder().encodeToString(
            (username + ":" + password).getBytes(StandardCharsets.UTF_8)
        );

        this.restClient = RestClient.builder().build();
    }

    private String databaseUrl() {
        return couchDbUrl + "/" +
            UriUtils.encodePathSegment(database, StandardCharsets.UTF_8);
    }

    private String documentUrl(String id) {
        return databaseUrl() + "/" +
            UriUtils.encodePathSegment(id, StandardCharsets.UTF_8);
    }

    private RestClient.RequestHeadersSpec<?> authorized(
            RestClient.RequestHeadersSpec<?> request) {
        return request.header(HttpHeaders.AUTHORIZATION, authorization);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> getDocument(String id) {
        try {
            return (Map<String, Object>) authorized(
                restClient.get().uri(documentUrl(id))
            ).retrieve().body(Map.class);
        } catch (RestClientResponseException ex) {
            if (ex.getStatusCode().value() == 404) {
                throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND, "Không tìm thấy dịch vụ"
                );
            }
            throw couchDbError(ex);
        }
    }

    @SuppressWarnings("unchecked")
    private List<BeautyService> getAllServices() {
        try {
            Map<String, Object> response = authorized(
                restClient.get().uri(databaseUrl() + "/_all_docs?include_docs=true")
            ).retrieve().body(Map.class);

            List<BeautyService> services = new ArrayList<>();
            if (response == null) return services;

            Object rowsObject = response.get("rows");
            if (!(rowsObject instanceof List<?> rows)) return services;

            for (Object item : rows) {
                if (!(item instanceof Map<?, ?> row)) continue;

                Object docObject = row.get("doc");
                if (!(docObject instanceof Map<?, ?> doc)) continue;

                if (!"service".equals(doc.get("type"))) continue;

                BeautyService service = new BeautyService();
                service.setId(stringValue(doc.get("_id")));
                service.setRev(stringValue(doc.get("_rev")));
                service.setType("service");
                service.setServiceId(stringValue(doc.get("service_id")));
                service.setName(stringValue(doc.get("name")));
                service.setCategory(stringValue(doc.get("category")));
                service.setPrice(numberValue(doc.get("price")));
                service.setDurationMinutes(
                    (int) numberValue(doc.get("duration_minutes"))
                );
                service.setStatus(stringValue(doc.get("status")));

                services.add(service);
            }

            return services;
        } catch (RestClientResponseException ex) {
            throw couchDbError(ex);
        }
    }

    private String stringValue(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private double numberValue(Object value) {
        if (value instanceof Number number) {
            return number.doubleValue();
        }

        try {
            return value == null ? 0 : Double.parseDouble(value.toString());
        } catch (NumberFormatException ex) {
            return 0;
        }
    }

    private ResponseStatusException couchDbError(
            RestClientResponseException ex) {
        String message = ex.getResponseBodyAsString();

        if (ex.getStatusCode().value() == 409) {
            return new ResponseStatusException(
                HttpStatus.CONFLICT,
                "Xung đột dữ liệu CouchDB. Hãy tải lại dịch vụ rồi thử lại."
            );
        }

        return new ResponseStatusException(
            HttpStatus.BAD_GATEWAY,
            "Lỗi khi thao tác với CouchDB: " + message
        );
    }

    private void validateService(BeautyService service) {
        if (service.getName() == null || service.getName().isBlank()) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST, "Tên dịch vụ không được để trống"
            );
        }

        if (service.getCategory() == null ||
                service.getCategory().isBlank()) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST, "Vui lòng chọn danh mục dịch vụ"
            );
        }

        if (!Double.isFinite(service.getPrice()) ||
                service.getPrice() < 0) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST, "Giá dịch vụ không hợp lệ"
            );
        }

        if (service.getDurationMinutes() <= 0) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Thời lượng dịch vụ phải lớn hơn 0 phút"
            );
        }

        if (!List.of("active", "inactive").contains(service.getStatus())) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST, "Trạng thái dịch vụ không hợp lệ"
            );
        }
    }

    private void checkDuplicateServiceId(String serviceId, String currentId) {
        if (serviceId == null || serviceId.isBlank()) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST, "Mã dịch vụ không được để trống"
            );
        }

        boolean duplicate = getAllServices().stream().anyMatch(service ->
            serviceId.equalsIgnoreCase(service.getServiceId())
                && !service.getId().equals(currentId)
        );

        if (duplicate) {
            throw new ResponseStatusException(
                HttpStatus.CONFLICT, "Mã dịch vụ đã tồn tại"
            );
        }
    }

    private String generateServiceId() {
        int maxNumber = 0;

        for (BeautyService service : getAllServices()) {
            String code = service.getServiceId();

            if (code != null && code.matches("(?i)SRV\\d+")) {
                try {
                    maxNumber = Math.max(
                        maxNumber,
                        Integer.parseInt(code.substring(3))
                    );
                } catch (NumberFormatException ignored) {
                    // Bỏ qua mã có phần số vượt giới hạn int.
                }
            }
        }

        return String.format("SRV%03d", maxNumber + 1);
    }

    @GetMapping
    public List<BeautyService> getServices() {
        return getAllServices();
    }

    @GetMapping("/{id}")
    public BeautyService getService(@PathVariable String id) {
        Map<String, Object> doc = getDocument(id);

        if (!"service".equals(doc.get("type"))) {
            throw new ResponseStatusException(
                HttpStatus.NOT_FOUND, "Document này không phải dịch vụ"
            );
        }

        BeautyService service = new BeautyService();
        service.setId(stringValue(doc.get("_id")));
        service.setRev(stringValue(doc.get("_rev")));
        service.setType("service");
        service.setServiceId(stringValue(doc.get("service_id")));
        service.setName(stringValue(doc.get("name")));
        service.setCategory(stringValue(doc.get("category")));
        service.setPrice(numberValue(doc.get("price")));
        service.setDurationMinutes((int) numberValue(doc.get("duration_minutes")));
        service.setStatus(stringValue(doc.get("status")));

        return service;
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> createService(
            @RequestBody BeautyService service) {

        validateService(service);

        String serviceId = service.getServiceId();
        if (serviceId == null || serviceId.isBlank()) {
            serviceId = generateServiceId();
        }

        checkDuplicateServiceId(serviceId, "");

        String id = "srv" + UUID.randomUUID().toString().replace("-", "");

        service.setId(id);
        service.setRev(null);
        service.setType("service");
        service.setServiceId(serviceId);

        Map<String, Object> document = toDocument(service);

        try {
            Map<?, ?> result = authorized(
                restClient.put().uri(documentUrl(id)).body(document)
            ).retrieve().body(Map.class);

            return ResponseEntity.status(HttpStatus.CREATED)
                .body((Map<String, Object>) result);
        } catch (RestClientResponseException ex) {
            throw couchDbError(ex);
        }
    }

    @PutMapping("/{id}")
    public Map<String, Object> updateService(
            @PathVariable String id,
            @RequestBody BeautyService service) {

        Map<String, Object> existing = getDocument(id);

        if (!"service".equals(existing.get("type"))) {
            throw new ResponseStatusException(
                HttpStatus.NOT_FOUND, "Document này không phải dịch vụ"
            );
        }

        if (service.getRev() == null || service.getRev().isBlank()) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Thiếu _rev. Hãy tải lại dữ liệu trước khi cập nhật."
            );
        }

        validateService(service);

        String serviceId = service.getServiceId();
        if (serviceId == null || serviceId.isBlank()) {
            serviceId = stringValue(existing.get("service_id"));
        }

        checkDuplicateServiceId(serviceId, id);

        service.setId(id);
        service.setType("service");
        service.setServiceId(serviceId);

        Map<String, Object> document = toDocument(service);
        document.put("_rev", service.getRev());

        try {
            Map<?, ?> result = authorized(
                restClient.put().uri(documentUrl(id)).body(document)
            ).retrieve().body(Map.class);

            return (Map<String, Object>) result;
        } catch (RestClientResponseException ex) {
            throw couchDbError(ex);
        }
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> deleteService(
            @PathVariable String id,
            @RequestParam("rev") String rev) {

        Map<String, Object> existing = getDocument(id);

        if (!"service".equals(existing.get("type"))) {
            throw new ResponseStatusException(
                HttpStatus.NOT_FOUND, "Document này không phải dịch vụ"
            );
        }

        String url = documentUrl(id) + "?rev=" +
            UriUtils.encodeQueryParam(rev, StandardCharsets.UTF_8);

        try {
            Map<?, ?> result = authorized(
                restClient.delete().uri(url)
            ).retrieve().body(Map.class);

            return (Map<String, Object>) result;
        } catch (RestClientResponseException ex) {
            throw couchDbError(ex);
        }
    }

    
private Map<String, Object> toDocument(BeautyService service) {
    Map<String, Object> document = new java.util.LinkedHashMap<>();

    if (service.getId() != null) {
        document.put("_id", service.getId());
    }

    document.put("type", "service");
    document.put("service_id", service.getServiceId());
    document.put("name", service.getName());
    document.put("category", service.getCategory());
    document.put("price", service.getPrice());
    document.put("duration_minutes", service.getDurationMinutes());
    document.put("status", service.getStatus());

    return document;
}

}
