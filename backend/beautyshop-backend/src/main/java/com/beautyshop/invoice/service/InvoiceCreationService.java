
package com.beautyshop.invoice.service;

import com.beautyshop.auth.dto.LoginResponse;
import com.beautyshop.couchdb.CouchDbClient;
import com.beautyshop.invoice.dto.CreateInvoiceRequest;
import com.beautyshop.invoice.dto.CreateInvoiceRequest.InvoiceItemRequest;
import com.beautyshop.payment.service.InvoicePaymentService;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
public class InvoiceCreationService {

    private final CouchDbClient couchDb;
    private final InvoicePaymentService paymentService;

    public InvoiceCreationService(
            CouchDbClient couchDb,
            InvoicePaymentService paymentService) {
        this.couchDb = couchDb;
        this.paymentService = paymentService;
    }

    /**
     * Tạo hóa đơn mới.
     *
     * Giá bán được lấy từ CouchDB, không lấy giá do frontend gửi lên.
     * Hóa đơn mới được tạo ở trạng thái pending.
     */
    public Map<String, Object> createInvoice(
            CreateInvoiceRequest request,
            LoginResponse.UserInfo user) {

        if (request == null) {
            throw badRequest("Dữ liệu tạo hóa đơn không hợp lệ.");
        }

        String paymentMethod = normalizePaymentMethod(
                request.paymentMethod()
        );

        String customerId = clean(request.customerId());
        String appointmentId = clean(request.appointmentId());

        // 1. Tìm lịch hẹn nếu người dùng có cung cấp mã lịch hẹn.
        Map<String, Object> appointment = null;

        if (!appointmentId.isBlank()) {

            appointment = findByBusinessId(
                    "appointment",
                    "appointment_id",
                    appointmentId
            );

            if (appointment == null) {
                throw new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Không tìm thấy lịch hẹn " + appointmentId
                );
            }

            String appointmentCustomer = clean(
                    appointment.get("customer_id")
            );

            if (customerId.isBlank()) {
                customerId = appointmentCustomer;
            } else if (!appointmentCustomer.isBlank()
                    && !customerId.equals(appointmentCustomer)) {

                throw badRequest(
                        "Khách hàng không khớp với khách hàng của lịch hẹn."
                );
            }
        }

        // 2. Kiểm tra khách hàng.
        if (customerId.isBlank()) {
            throw badRequest(
                    "Vui lòng chọn khách hàng hoặc lịch hẹn."
            );
        }

        Map<String, Object> customer = findByBusinessId(
                "customer",
                "customer_id",
                customerId
        );

        if (customer == null) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Không tìm thấy khách hàng " + customerId
            );
        }

                String role = clean(user == null ? "" : user.role()).toLowerCase(Locale.ROOT);
                String employeeId = clean(request.employeeId());
                String branchId = clean(request.branchId());

                if ("staff".equals(role) || "manager".equals(role)) {
                        branchId = clean(user.branchId());

                        if (branchId.isBlank()) {
                                throw badRequest("Tài khoản chưa được gán chi nhánh.");
                        }

                        if (appointment != null
                                        && !branchId.equals(clean(appointment.get("branch_id")))) {
                                throw new ResponseStatusException(
                                                HttpStatus.FORBIDDEN,
                                                "Không thể tạo hóa đơn cho lịch hẹn ngoài chi nhánh của bạn."
                                );
                        }

                        if ("staff".equals(role)) {
                                employeeId = clean(user.employeeId());

                                if (appointment != null
                                                && !employeeId.equals(clean(appointment.get("employee_id")))) {
                                        throw new ResponseStatusException(
                                                        HttpStatus.FORBIDDEN,
                                                        "Chỉ có thể tạo hóa đơn cho lịch hẹn được giao cho bạn."
                                        );
                                }
                        } else if (employeeId.isBlank() && appointment != null) {
                                employeeId = clean(appointment.get("employee_id"));
                        }

                        if ("manager".equals(role) && !employeeId.isBlank()) {
                                Map<String, Object> employee = findByBusinessId(
                                                "employee",
                                                "employee_id",
                                                employeeId
                                );

                                if (employee == null
                                                || !branchId.equals(clean(employee.get("branch_id")))) {
                                        throw new ResponseStatusException(
                                                        HttpStatus.FORBIDDEN,
                                                        "Chỉ có thể lập hóa đơn cho nhân viên thuộc chi nhánh của bạn."
                                        );
                                }
                        }
                }

        // 3. Lấy danh sách sản phẩm/dịch vụ từ request.
        List<InvoiceItemRequest> requestedItems = new ArrayList<>();

        if (request.items() != null) {
            requestedItems.addAll(request.items());
        }

        // Nếu không truyền danh sách mặt hàng,
        // lấy dịch vụ từ lịch hẹn.
        if (requestedItems.isEmpty() && appointment != null) {

            Object serviceIds = appointment.get("service_ids");

            if (serviceIds instanceof List<?> ids) {

                for (Object id : ids) {

                    requestedItems.add(
                            new InvoiceItemRequest(
                                    "service",
                                    String.valueOf(id),
                                    1
                            )
                    );
                }
            }
        }

        if (requestedItems.isEmpty()) {
            throw badRequest(
                    "Hóa đơn phải có ít nhất một sản phẩm hoặc dịch vụ."
            );
        }

        // 4. Tính tiền từng dòng hàng.
        List<Map<String, Object>> itemDocuments = new ArrayList<>();

        BigDecimal subtotal = BigDecimal.ZERO;

        for (InvoiceItemRequest itemRequest : requestedItems) {

            if (itemRequest == null
                    || itemRequest.quantity() == null
                    || itemRequest.quantity() <= 0
                    || itemRequest.quantity() > 999) {

                throw badRequest(
                        "Số lượng mỗi dòng phải từ 1 đến 999."
                );
            }

            String itemType = clean(
                    itemRequest.itemType()
            ).toLowerCase(Locale.ROOT);

            if (!List.of("product", "service").contains(itemType)) {
                throw badRequest(
                        "Loại mặt hàng chỉ được là product hoặc service."
                );
            }

            String itemId = clean(itemRequest.itemId());

            if (itemId.isBlank()) {
                throw badRequest("Mã mặt hàng không được để trống.");
            }

            // Tìm sản phẩm/dịch vụ trong CouchDB.
            Map<String, Object> catalogItem = findCatalogItem(
                    itemType,
                    itemId
            );

            if (catalogItem == null) {
                throw new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Không tìm thấy "
                                + (itemType.equals("product")
                                ? "sản phẩm" : "dịch vụ")
                                + " có mã " + itemId
                );
            }

            // Chỉ cho phép mặt hàng đang hoạt động.
            String status = clean(catalogItem.get("status"));

            if (!"active".equalsIgnoreCase(status)) {
                throw badRequest(
                        "Mặt hàng "
                                + clean(catalogItem.get("name"))
                                + " đang ngừng kinh doanh."
                );
            }

            // Lấy giá trực tiếp từ dữ liệu CouchDB.
            BigDecimal unitPrice = decimal(
                    catalogItem.get("price")
            );

            if (unitPrice.signum() < 0) {
                throw badRequest(
                        "Giá mặt hàng không được âm."
                );
            }

            BigDecimal lineTotal = unitPrice
                    .multiply(
                            BigDecimal.valueOf(itemRequest.quantity())
                    )
                    .setScale(0, RoundingMode.HALF_UP);

            subtotal = subtotal.add(lineTotal);

            // Tạo document chi tiết hóa đơn.
            Map<String, Object> line = new LinkedHashMap<>();

            line.put("type", "invoice_item");
            line.put("item_type", itemType);

            String businessIdField = itemType.equals("product")
                    ? "product_id"
                    : "service_id";

            String businessItemId = clean(
                    catalogItem.get(businessIdField)
            );

            if (businessItemId.isBlank()) {
                businessItemId = clean(catalogItem.get("_id"));
            }

            line.put("item_id", businessItemId);
            line.put("item_name", clean(catalogItem.get("name")));
            line.put("quantity", itemRequest.quantity());
            line.put("unit_price", unitPrice);
            line.put("subtotal", lineTotal);

            itemDocuments.add(line);
        }

        // 5. Tính giảm giá.
        BigDecimal discount = calculateDiscount(
                subtotal,
                request.discountType(),
                request.discountValue()
        );

        // 6. Tính tổng tiền phải thanh toán.
        BigDecimal total = subtotal
                .subtract(discount)
                .max(BigDecimal.ZERO)
                .setScale(0, RoundingMode.HALF_UP);

        // 7. Sinh mã hóa đơn.
        String invoiceId = generateInvoiceId();

        String documentId = "invoice_" + invoiceId;

        String now = OffsetDateTime.now().toString();

        // 8. Tạo document hóa đơn.
        Map<String, Object> invoice = new LinkedHashMap<>();

        invoice.put("_id", documentId);
        invoice.put("type", "invoice");

        invoice.put("invoice_id", invoiceId);
        invoice.put("customer_id", customerId);
        invoice.put("appointment_id", appointmentId);

                if (employeeId.isBlank() && appointment != null) {
            employeeId = clean(appointment.get("employee_id"));
        }

        if (branchId.isBlank() && appointment != null) {
            branchId = clean(appointment.get("branch_id"));
        }

        invoice.put("employee_id", employeeId);
        invoice.put("branch_id", branchId);

        invoice.put("subtotal", subtotal);

        String discountType = clean(request.discountType());

        if (discountType.isBlank()) {
            discountType = "amount";
        }

        invoice.put("discount_type", discountType);

        invoice.put(
                "discount_value",
                request.discountValue() == null
                        ? BigDecimal.ZERO
                        : request.discountValue()
        );

        invoice.put("discount", discount);
        invoice.put("total", total);

        invoice.put("payment_method", paymentMethod);
        invoice.put("payment_status", "pending");

        invoice.put("created_at", now);
        invoice.put("note", clean(request.note()));

        // 9. Lưu hóa đơn vào CouchDB.
        couchDb.saveDocument(documentId, invoice);

        // 10. Lưu từng dòng chi tiết hóa đơn.
        for (int i = 0; i < itemDocuments.size(); i++) {

            Map<String, Object> line = itemDocuments.get(i);

            String lineId = "invoice_item_"
                    + invoiceId
                    + "_"
                    + (i + 1);

            line.put("_id", lineId);
            line.put("invoice_id", invoiceId);

            couchDb.saveDocument(lineId, line);
        }

        // 11. Khởi tạo thông tin thanh toán.
        paymentService.initializePayment(
                invoice,
                invoiceId,
                request.note()
        );

        // 12. Trả kết quả về frontend.
        Map<String, Object> result = new LinkedHashMap<>();

        result.put(
                "message",
                "Tạo hóa đơn thành công. Hóa đơn đang chờ thanh toán."
        );

        result.put("invoice", invoice);
        result.put("items", itemDocuments);

        if ("bank_transfer".equals(paymentMethod)) {

            result.put(
                    "paymentInstructions",
                    "Vui lòng chuyển khoản, ghi nội dung "
                            + invoiceId
                            + " và chờ nhân viên xác nhận giao dịch."
            );

            result.put("transferReference", invoiceId);

        } else {

            result.put(
                    "paymentInstructions",
                    "Vui lòng thanh toán tiền mặt và chờ nhân viên xác nhận."
            );
        }

        return result;
    }

    /**
     * Tìm sản phẩm hoặc dịch vụ theo mã nghiệp vụ hoặc CouchDB _id.
     */
    private Map<String, Object> findCatalogItem(
            String type,
            String itemId) {

        if (itemId.isBlank()) {
            return null;
        }

        String idField = type.equals("product")
                ? "product_id"
                : "service_id";

        return couchDb.getAllDocuments()
                .stream()
                .filter(doc -> type.equals(clean(doc.get("type"))))
                .filter(doc ->
                        itemId.equals(clean(doc.get("_id")))
                                || itemId.equals(clean(doc.get(idField)))
                )
                .findFirst()
                .orElse(null);
    }

    /**
     * Tìm document theo type và mã nghiệp vụ.
     */
    private Map<String, Object> findByBusinessId(
            String type,
            String field,
            String id) {

        return couchDb.getAllDocuments()
                .stream()
                .filter(doc -> type.equals(clean(doc.get("type"))))
                .filter(doc ->
                        id.equals(clean(doc.get(field)))
                                || id.equals(clean(doc.get("_id")))
                )
                .findFirst()
                .orElse(null);
    }

    /**
     * Sinh mã hóa đơn theo định dạng HD00001, HD00002...
     */
    private String generateInvoiceId() {

        long max = 0;

        for (Map<String, Object> doc : couchDb.getAllDocuments()) {

            if (!"invoice".equals(clean(doc.get("type")))) {
                continue;
            }

            String code = clean(doc.get("invoice_id"));

            if (code.matches("HD\\d+")) {

                try {
                    long number = Long.parseLong(
                            code.substring(2)
                    );

                    max = Math.max(max, number);

                } catch (NumberFormatException ignored) {
                    // Bỏ qua mã hóa đơn không hợp lệ.
                }
            }
        }

        return String.format(
                Locale.ROOT,
                "HD%05d",
                max + 1
        );
    }

    /**
     * Tính số tiền giảm giá.
     *
     * amount: giảm theo số tiền cố định.
     * percent: giảm theo phần trăm.
     */
    private BigDecimal calculateDiscount(
            BigDecimal subtotal,
            String type,
            BigDecimal value) {

        BigDecimal amount = value == null
                ? BigDecimal.ZERO
                : value;

        String discountType = clean(type).isBlank()
                ? "amount"
                : clean(type).toLowerCase(Locale.ROOT);

        if (amount.signum() < 0) {
            throw badRequest("Giảm giá không được âm.");
        }

        BigDecimal discount;

        if ("percent".equals(discountType)) {

            if (amount.compareTo(BigDecimal.valueOf(100)) > 0) {
                throw badRequest(
                        "Giảm giá phần trăm không được vượt quá 100%."
                );
            }

            discount = subtotal
                    .multiply(amount)
                    .divide(
                            BigDecimal.valueOf(100),
                            0,
                            RoundingMode.HALF_UP
                    );

        } else if ("amount".equals(discountType)) {

            discount = amount.setScale(
                    0,
                    RoundingMode.HALF_UP
            );

        } else {

            throw badRequest(
                    "discountType chỉ nhận amount hoặc percent."
            );
        }

        if (discount.compareTo(subtotal) > 0) {
            throw badRequest(
                    "Số tiền giảm giá không được lớn hơn tạm tính."
            );
        }

        return discount;
    }

    /**
     * Chuyển giá trị dữ liệu sang BigDecimal.
     */
    private BigDecimal decimal(Object value) {

        try {

            return value == null
                    ? BigDecimal.ZERO
                    : new BigDecimal(value.toString());

        } catch (NumberFormatException ex) {

            throw badRequest(
                    "Giá mặt hàng trong dữ liệu không hợp lệ."
            );
        }
    }

    /**
     * Kiểm tra phương thức thanh toán.
     */
    private String normalizePaymentMethod(String method) {

        String value = clean(method).toLowerCase(Locale.ROOT);

        if (!List.of("cash", "bank_transfer").contains(value)) {

            throw badRequest(
                    "Phương thức thanh toán chỉ nhận cash hoặc bank_transfer."
            );
        }

        return value;
    }

    private String clean(Object value) {
        return value == null
                ? ""
                : String.valueOf(value).trim();
    }

    private ResponseStatusException badRequest(String message) {

        return new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                message
        );
    }
}
