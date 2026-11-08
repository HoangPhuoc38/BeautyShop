
package com.beautyshop.customer.service;

import com.beautyshop.couchdb.CouchDbClient;
import com.beautyshop.loyalty.service.LoyaltyMembershipPolicy;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.*;

@Service
public class CustomerService {

    private final CouchDbClient couchDb;

    private static final Set<String> ALLOWED_MEMBERSHIPS =
            Set.of("standard", "silver", "gold", "platinum");

    public CustomerService(CouchDbClient couchDb) {
        this.couchDb = couchDb;
    }

    // =========================================
    // HÀM HỖ TRỢ
    // =========================================

    private String text(Object value) {
        return value == null
                ? ""
                : String.valueOf(value).trim();
    }

        private long loyaltyPoints(Object value) {
                if (value instanceof Number number) {
                        return Math.max(0, number.longValue());
                }

                try {
                        return Math.max(0, Long.parseLong(text(value)));
                } catch (NumberFormatException exception) {
                        return 0;
                }
        }

    private List<Map<String, Object>> getCustomerDocuments() {

        return couchDb.getAllDocuments()
                .stream()
                .filter(doc ->
                        "customer".equals(doc.get("type")))
                .toList();
    }

    private Map<String, Object> findCustomer(String id) {

        if (id == null || id.isBlank()) {
            return null;
        }

        return getCustomerDocuments()
                .stream()
                .filter(doc ->
                        id.equals(text(doc.get("_id")))
                        || id.equals(text(doc.get("customer_id")))
                )
                .findFirst()
                .orElse(null);
    }

    private void validateCustomerId(String customerId) {

        if (customerId == null || customerId.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Mã khách hàng không được để trống."
            );
        }
    }

    private String normalizeMembership(Object value) {

        String membership = text(value).toLowerCase(Locale.ROOT);

        if (membership.isBlank()) {
            return "standard";
        }

        if (!ALLOWED_MEMBERSHIPS.contains(membership)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Hạng thành viên không hợp lệ."
            );
        }

        return membership;
    }

    private void validateCustomerData(
            String fullName,
            String phone,
            String email) {

        if (fullName == null || fullName.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Họ tên khách hàng không được để trống."
            );
        }

        if (phone == null || phone.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Số điện thoại không được để trống."
            );
        }

        String normalizedPhone = phone.replaceAll("[\\s().-]", "");

        if (!normalizedPhone.matches("^(?:0\\d{9}|\\+84\\d{9})$")) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Số điện thoại phải có 10 số bắt đầu bằng 0 "
                            + "hoặc mã +84 và 9 số."
            );
        }

        if (email != null && !email.isBlank()
                && !email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Địa chỉ email không đúng định dạng."
            );
        }
    }

    // =========================================
    // TỰ SINH MÃ KHÁCH HÀNG
    // =========================================

    private String generateCustomerId() {

        int maxNumber = 0;

        for (Map<String, Object> customer :
                getCustomerDocuments()) {

            String customerId =
                    text(customer.get("customer_id"));

            if (customerId.matches("CUS\\d+")) {

                int number = Integer.parseInt(
                        customerId.substring(3)
                );

                maxNumber = Math.max(maxNumber, number);
            }
        }

        return String.format(
                Locale.ROOT,
                "CUS%03d",
                maxNumber + 1
        );
    }

    // =========================================
    // DANH SÁCH KHÁCH HÀNG
    // =========================================

    public List<Map<String, Object>> getAllCustomers() {

        List<Map<String, Object>> customers =
                new ArrayList<>(getCustomerDocuments());

        customers.sort(
                Comparator.comparing(
                        doc -> text(doc.get("customer_id"))
                )
        );

        return customers;
    }

    // =========================================
    // CHI TIẾT KHÁCH HÀNG
    // =========================================

    public Map<String, Object> getCustomer(String customerId) {

        validateCustomerId(customerId);

        Map<String, Object> customer =
                findCustomer(customerId);

        if (customer == null) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Không tìm thấy khách hàng."
            );
        }

        return customer;
    }

    // =========================================
    // THÊM KHÁCH HÀNG
    // =========================================

    public Map<String, Object> createCustomer(
            Map<String, Object> request) {

        if (request == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Dữ liệu khách hàng không hợp lệ."
            );
        }

        String fullName = text(request.get("full_name"));
        String phone = text(request.get("phone"));
        String email = text(request.get("email"));

        String membership = "standard";

        validateCustomerData(fullName, phone, email);

        // Backend tự sinh mã, không lấy mã từ frontend.
        String customerId = generateCustomerId();

        String documentId =
                customerId.toLowerCase(Locale.ROOT);

        if (couchDb.documentExists(documentId)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Document khách hàng đã tồn tại."
            );
        }

        Map<String, Object> customer = new HashMap<>();

        customer.put("_id", documentId);
        customer.put("type", "customer");

        customer.put("customer_id", customerId);
        customer.put("full_name", fullName);
        customer.put("phone", phone);
        customer.put("email", email);
        customer.put("membership", membership);

        // Các trường Loyalty được quản lý ở backend.
        customer.put("points", 0);
        customer.put("rank", "Đồng");
        customer.put("loyalty_paid_amount", 0);
        customer.put(
                "loyalty_processed_invoices",
                new ArrayList<String>()
        );

        String now = OffsetDateTime.now().toString();

        customer.put("created_at", now);
        customer.put("updated_at", now);

        return couchDb.saveDocument(documentId, customer);
    }

    // =========================================
    // CẬP NHẬT KHÁCH HÀNG
    // =========================================

    public Map<String, Object> updateCustomer(
            String customerId,
            Map<String, Object> request) {

        validateCustomerId(customerId);

        if (request == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Dữ liệu cập nhật không hợp lệ."
            );
        }

        Map<String, Object> customer =
                findCustomer(customerId);

        if (customer == null) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Không tìm thấy khách hàng."
            );
        }

        String fullName = text(
                request.containsKey("full_name")
                        ? request.get("full_name")
                        : customer.get("full_name")
        );

        String phone = text(
                request.containsKey("phone")
                        ? request.get("phone")
                        : customer.get("phone")
        );

        String email = text(
                request.containsKey("email")
                        ? request.get("email")
                        : customer.get("email")
        );

        String membership = normalizeMembership(
                request.containsKey("membership")
                        ? request.get("membership")
                        : customer.get("membership")
        );

        validateCustomerData(fullName, phone, email);

        long points = loyaltyPoints(customer.get("points"));

        if (points < LoyaltyMembershipPolicy.minimumPoints(membership)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Khách hàng chưa đủ điểm để đạt hạng " + membership + "."
            );
        }

        // Chỉ cập nhật thông tin khách hàng.
        // Không nhận points, rank hoặc các trường Loyalty
        // từ frontend.

        customer.put("full_name", fullName);
        customer.put("phone", phone);
        customer.put("email", email);
        customer.put("membership", membership);

        customer.put(
                "updated_at",
                OffsetDateTime.now().toString()
        );

        String documentId = text(customer.get("_id"));

        return couchDb.saveDocument(documentId, customer);
    }

    // =========================================
    // XÓA KHÁCH HÀNG
    // =========================================

    public void deleteCustomer(String customerId) {

        validateCustomerId(customerId);

        Map<String, Object> customer =
                findCustomer(customerId);

        if (customer == null) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Không tìm thấy khách hàng."
            );
        }

        // Không xóa khách hàng đã có hóa đơn.
        boolean hasInvoices = couchDb.getAllDocuments()
                .stream()
                .anyMatch(doc ->
                        "invoice".equals(doc.get("type"))
                        && customerId.equals(
                                text(doc.get("customer_id")))
                );

        if (hasInvoices) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Khách hàng đã có hóa đơn, không thể xóa."
            );
        }

        // Không xóa khách hàng đang được lịch hẹn tham chiếu.
        boolean hasAppointments = couchDb.getAllDocuments()
                .stream()
                .anyMatch(doc ->
                        "appointment".equals(doc.get("type"))
                        && customerId.equals(
                                text(doc.get("customer_id")))
                );

        if (hasAppointments) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Khách hàng đang có lịch hẹn, không thể xóa."
            );
        }

        String documentId = text(customer.get("_id"));
        String revision = text(customer.get("_rev"));

        couchDb.deleteDocument(documentId, revision);
    }

    // =========================================
    // SAO LƯU KHÁCH HÀNG
    // =========================================

    public Map<String, Object> backupCustomers() {

        List<Map<String, Object>> customers =
                getCustomerDocuments();

        Map<String, Object> result = new LinkedHashMap<>();

        result.put("success", true);
        result.put("total_customers", customers.size());
        result.put("exported_at", OffsetDateTime.now().toString());
        result.put("customers", customers);

        return result;
    }
}
