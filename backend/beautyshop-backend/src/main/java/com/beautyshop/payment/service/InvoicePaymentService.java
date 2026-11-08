package com.beautyshop.payment.service;

import com.beautyshop.auth.dto.LoginResponse;
import com.beautyshop.config.RecordAccessPolicy;
import com.beautyshop.couchdb.CouchDbClient;
import com.beautyshop.loyalty.service.LoyaltyService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;

@Service
public class InvoicePaymentService {

    private final CouchDbClient couchDb;
    private final LoyaltyService loyaltyService;
    private final RecordAccessPolicy recordAccessPolicy =
            new RecordAccessPolicy();

    public InvoicePaymentService(
            CouchDbClient couchDb,
            LoyaltyService loyaltyService) {

        this.couchDb = couchDb;
        this.loyaltyService = loyaltyService;
    }

    /**
     * Tạo bản ghi giao dịch ở trạng thái pending
     * khi khởi tạo hóa đơn.
     */
    public Map<String, Object> initializePayment(
            Map<String, Object> invoice,
            String reference,
            String note) {

        String invoiceId = text(invoice.get("invoice_id"));
        String transactionId = paymentDocumentId(invoiceId);

        Map<String, Object> transaction = new LinkedHashMap<>();

        transaction.put("_id", transactionId);
        transaction.put("type", "payment_transaction");
        transaction.put("invoice_id", invoiceId);
        transaction.put("customer_id", invoice.get("customer_id"));
        transaction.put("appointment_id", invoice.get("appointment_id"));
        transaction.put("payment_method", text(invoice.get("payment_method")));
        transaction.put("amount", invoice.get("total"));
        transaction.put("status", "pending");

        transaction.put(
                "transfer_reference",
                "bank_transfer".equalsIgnoreCase(
                        text(invoice.get("payment_method"))
                ) ? text(reference) : ""
        );

        transaction.put("note", text(note));
        transaction.put("created_at", OffsetDateTime.now().toString());

        return couchDb.saveDocument(transactionId, transaction);
    }

    /**
     * Xác nhận thanh toán thủ công.
     * Nhân viên chỉ xác nhận sau khi nhận tiền mặt
     * hoặc kiểm tra chuyển khoản thực tế.
     */
    public Map<String, Object> confirmPayment(
            String invoiceId,
            String requestedMethod,
            LoginResponse.UserInfo user) {

        Map<String, Object> invoice = findInvoice(invoiceId);

        if (invoice == null) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Không tìm thấy hóa đơn " + invoiceId
            );
        }

                ensureInvoiceAccess(invoice, user);

        String status = text(invoice.get("payment_status"));
        String method = text(invoice.get("payment_method"));

        if (requestedMethod != null
                && !requestedMethod.isBlank()
                && !method.equalsIgnoreCase(requestedMethod.trim())) {

            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Phương thức xác nhận không khớp với hóa đơn."
            );
        }

        if (!List.of("cash", "bank_transfer").contains(method)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Hóa đơn chưa có phương thức thanh toán hợp lệ."
            );
        }

        if ("cancelled".equalsIgnoreCase(status)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Không thể thanh toán hóa đơn đã hủy."
            );
        }

        String now = OffsetDateTime.now().toString();

        // Cập nhật trạng thái hóa đơn.
        if (!"paid".equalsIgnoreCase(status)) {
            invoice.put("payment_status", "paid");
            invoice.put("paid_at", now);
            invoice.put("payment_method", method);

            couchDb.saveDocument(
                    text(invoice.get("_id")),
                    invoice
            );
        }

        /*
         * Đồng bộ giao dịch.
         * Nếu lần gọi trước đã lưu hóa đơn nhưng bị gián đoạn
         * trước khi lưu giao dịch, hệ thống sẽ tạo lại giao dịch.
         */
        Map<String, Object> transaction = findPayment(invoiceId);

        if (transaction == null) {
            transaction = new LinkedHashMap<>();

            transaction.put("_id", paymentDocumentId(invoiceId));
            transaction.put("type", "payment_transaction");
            transaction.put("invoice_id", invoiceId);
            transaction.put("payment_method", method);
            transaction.put("customer_id", invoice.get("customer_id"));
            transaction.put("appointment_id", invoice.get("appointment_id"));

            transaction.put(
                    "transfer_reference",
                    "bank_transfer".equalsIgnoreCase(method)
                            ? invoiceId : ""
            );

            transaction.put("amount", invoice.get("total"));
            transaction.put("created_at", text(invoice.get("created_at")));
        }

        transaction.put("status", "paid");
        transaction.putIfAbsent("confirmed_at", now);
        transaction.put(
                "note",
                "Đã xác nhận nhận tiền/đối soát thanh toán."
        );

        couchDb.saveDocument(
                text(transaction.get("_id")),
                transaction
        );

        // Gọi xử lý tích điểm Loyalty.
        // LoyaltyService có cơ chế kiểm tra hóa đơn đã xử lý.
        loyaltyService.applyPaidInvoice(invoiceId);

        Map<String, Object> result = new LinkedHashMap<>();

        result.put("message", "Xác nhận thanh toán thành công.");
        result.put("invoiceId", invoiceId);
        result.put("paymentMethod", method);
        result.put("paymentStatus", "paid");
        result.put("amount", invoice.get("total"));

        return result;
    }

    /**
     * Hủy hóa đơn chưa thanh toán.
     */
    public Map<String, Object> cancelInvoice(
            String invoiceId,
            LoginResponse.UserInfo user) {

        Map<String, Object> invoice = findInvoice(invoiceId);

        if (invoice == null) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Không tìm thấy hóa đơn " + invoiceId
            );
        }

                ensureInvoiceAccess(invoice, user);

        String status = text(invoice.get("payment_status"));

        if ("paid".equalsIgnoreCase(status)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Không thể hủy hóa đơn đã thanh toán."
            );
        }

        if ("cancelled".equalsIgnoreCase(status)) {
            return Map.of(
                    "message", "Hóa đơn đã được hủy trước đó.",
                    "invoiceId", invoiceId,
                    "paymentStatus", "cancelled"
            );
        }

        String now = OffsetDateTime.now().toString();

        invoice.put("payment_status", "cancelled");
        invoice.put("cancelled_at", now);

        couchDb.saveDocument(
                text(invoice.get("_id")),
                invoice
        );

        Map<String, Object> transaction = findPayment(invoiceId);

        if (transaction != null) {
            transaction.put("status", "cancelled");
            transaction.put("updated_at", now);

            couchDb.saveDocument(
                    text(transaction.get("_id")),
                    transaction
            );
        }

        return Map.of(
                "message", "Hủy hóa đơn thành công.",
                "invoiceId", invoiceId,
                "paymentStatus", "cancelled"
        );
    }

    /**
     * Lấy danh sách giao dịch thanh toán.
     *
     * Hỗ trợ:
     * - Tìm theo mã hóa đơn.
     * - Tìm theo mã khách hàng.
     * - Tìm theo nội dung chuyển khoản.
     * - Lọc trạng thái.
     * - Lọc phương thức.
     * - Lọc thời gian.
     *
     * Hóa đơn cũ chưa có payment_transaction
     * sẽ được tạo dòng hiển thị tạm thời.
     */
    public List<Map<String, Object>> getPaymentTransactions(
            String keyword,
            String requestedStatus,
            String requestedMethod,
            String fromDate,
            String toDate,
            LoginResponse.UserInfo user) {

        List<Map<String, Object>> documents =
                couchDb.getAllDocuments();

        Map<String, Map<String, Object>> invoices =
                new HashMap<>();

        // Lập danh sách hóa đơn theo mã hóa đơn.
        for (Map<String, Object> document : documents) {

            if ("invoice".equals(document.get("type"))) {
                invoices.put(
                        text(document.get("invoice_id")),
                        document
                );
            }
        }

        String search = clean(keyword).toLowerCase(Locale.ROOT);
        String status = clean(requestedStatus).toLowerCase(Locale.ROOT);
        String method = clean(requestedMethod).toLowerCase(Locale.ROOT);

        LocalDate from = parseDate(fromDate);
        LocalDate to = parseDate(toDate);

        List<Map<String, Object>> result = new ArrayList<>();

        Set<String> transactionsFound = new HashSet<>();

        // Lấy các document payment_transaction đã tồn tại.
        for (Map<String, Object> document : documents) {

            if (!"payment_transaction".equals(document.get("type"))) {
                continue;
            }

            String invoiceId = text(document.get("invoice_id"));

            transactionsFound.add(invoiceId);

            Map<String, Object> invoice =
                    invoices.getOrDefault(invoiceId, Map.of());

                        if (!recordAccessPolicy.canAccess(user, invoice)) {
                                continue;
                        }

            Map<String, Object> row =
                    new LinkedHashMap<>(document);

            row.put("payment_id", text(document.get("_id")));

            row.put(
                    "customer_id",
                    text(
                            invoice.containsKey("customer_id")
                                    ? invoice.get("customer_id")
                                    : document.get("customer_id")
                    )
            );

            row.put(
                    "appointment_id",
                    text(invoice.get("appointment_id"))
            );

            row.put(
                    "invoice_created_at",
                    text(invoice.get("created_at"))
            );

            row.put(
                    "paid_at",
                    text(invoice.get("paid_at"))
            );

            row.put(
                    "invoice_payment_status",
                    text(invoice.get("payment_status"))
            );

            String rowStatus = text(document.get("status"))
                    .toLowerCase(Locale.ROOT);

            String rowMethod = text(document.get("payment_method"))
                    .toLowerCase(Locale.ROOT);

            String rowDateText = paymentDate(row);
            LocalDate rowDate = parseDate(rowDateText);

            boolean matchesSearch =
                    search.isEmpty()
                    || invoiceId.toLowerCase(Locale.ROOT).contains(search)
                    || text(invoice.get("customer_id"))
                            .toLowerCase(Locale.ROOT)
                            .contains(search)
                    || text(document.get("transfer_reference"))
                            .toLowerCase(Locale.ROOT)
                            .contains(search);

            boolean matchesDate =
                    (from == null
                            || (rowDate != null && !rowDate.isBefore(from)))
                    &&
                    (to == null
                            || (rowDate != null && !rowDate.isAfter(to)));

            if (matchesSearch
                    && (status.isEmpty() || status.equals(rowStatus))
                    && (method.isEmpty() || method.equals(rowMethod))
                    && matchesDate) {

                result.add(row);
            }
        }

        /*
         * Xử lý hóa đơn cũ chưa có payment_transaction.
         * Chỉ tạo dữ liệu hiển thị, không ghi thêm document vào CouchDB.
         */
        for (Map<String, Object> invoice : invoices.values()) {

                        if (!recordAccessPolicy.canAccess(user, invoice)) {
                                continue;
                        }

            String invoiceId = text(invoice.get("invoice_id"));

            if (invoiceId.isBlank()
                    || transactionsFound.contains(invoiceId)) {
                continue;
            }

            String invoiceStatus = text(invoice.get("payment_status"))
                    .toLowerCase(Locale.ROOT);

            String rowStatus =
                    invoiceStatus.isBlank() || "unpaid".equals(invoiceStatus)
                            ? "pending"
                            : invoiceStatus;

            String rowMethod = text(invoice.get("payment_method"))
                    .toLowerCase(Locale.ROOT);

            Map<String, Object> row = new LinkedHashMap<>();

            row.put("_id", paymentDocumentId(invoiceId));
            row.put("payment_id", paymentDocumentId(invoiceId));
            row.put("type", "payment_transaction");
            row.put("invoice_id", invoiceId);

            row.put(
                    "customer_id",
                    text(invoice.get("customer_id"))
            );

            row.put(
                    "appointment_id",
                    text(invoice.get("appointment_id"))
            );

            row.put("payment_method", rowMethod);
            row.put("amount", invoice.get("total"));
            row.put("status", rowStatus);

            row.put(
                    "transfer_reference",
                    "bank_transfer".equals(rowMethod) ? invoiceId : ""
            );

            row.put("note", text(invoice.get("note")));
            row.put("created_at", text(invoice.get("created_at")));
            row.put("confirmed_at", text(invoice.get("paid_at")));
            row.put("paid_at", text(invoice.get("paid_at")));

            row.put(
                    "invoice_created_at",
                    text(invoice.get("created_at"))
            );

            row.put("invoice_payment_status", invoiceStatus);
            row.put("legacy_invoice", true);

            String rowDateText = paymentDate(row);
            LocalDate rowDate = parseDate(rowDateText);

            String customerId = text(invoice.get("customer_id"))
                    .toLowerCase(Locale.ROOT);

            boolean matchesSearch =
                    search.isEmpty()
                    || invoiceId.toLowerCase(Locale.ROOT).contains(search)
                    || customerId.contains(search)
                    || text(row.get("transfer_reference"))
                            .toLowerCase(Locale.ROOT)
                            .contains(search);

            boolean matchesDate =
                    (from == null
                            || (rowDate != null && !rowDate.isBefore(from)))
                    &&
                    (to == null
                            || (rowDate != null && !rowDate.isAfter(to)));

            if (matchesSearch
                    && (status.isEmpty() || status.equals(rowStatus))
                    && (method.isEmpty() || method.equals(rowMethod))
                    && matchesDate) {

                result.add(row);
            }
        }

        // Sắp xếp giao dịch mới nhất lên trước.
        result.sort(
                Comparator.comparing(
                        (Map<String, Object> row) -> paymentDate(row),
                        Comparator.nullsLast(String::compareTo)
                ).reversed()
        );

        return result;
    }

    /**
     * Thống kê giao dịch.
     *
     * Doanh thu chỉ tính giao dịch đã thanh toán.
     */
    public Map<String, Object> getPaymentStatistics(
            LoginResponse.UserInfo user) {

        List<Map<String, Object>> transactions =
                getPaymentTransactions(
                        null,
                        null,
                        null,
                        null,
                        null,
                        user
                );

        long paidCount = 0;
        long pendingCount = 0;
        long cancelledCount = 0;
        long pendingBankTransfers = 0;

        BigDecimal totalRevenue = BigDecimal.ZERO;
        BigDecimal todayRevenue = BigDecimal.ZERO;
        BigDecimal cashRevenue = BigDecimal.ZERO;
        BigDecimal bankTransferRevenue = BigDecimal.ZERO;

        LocalDate today = LocalDate.now(
                ZoneId.of("Asia/Ho_Chi_Minh")
        );

        for (Map<String, Object> transaction : transactions) {

            String status = text(transaction.get("status"))
                    .toLowerCase(Locale.ROOT);

            String method = text(transaction.get("payment_method"))
                    .toLowerCase(Locale.ROOT);

            if ("paid".equals(status)) {

                paidCount++;

                BigDecimal amount = money(
                        transaction.get("amount")
                );

                totalRevenue = totalRevenue.add(amount);

                if ("cash".equals(method)) {
                    cashRevenue = cashRevenue.add(amount);
                } else if ("bank_transfer".equals(method)) {
                    bankTransferRevenue =
                            bankTransferRevenue.add(amount);
                }

                String confirmedAt =
                        text(transaction.get("confirmed_at"));

                if (confirmedAt.isBlank()) {
                    confirmedAt = text(transaction.get("paid_at"));
                }

                LocalDate paidDate = parseDate(confirmedAt);

                if (today.equals(paidDate)) {
                    todayRevenue = todayRevenue.add(amount);
                }

            } else if ("pending".equals(status)) {

                pendingCount++;

                if ("bank_transfer".equals(method)) {
                    pendingBankTransfers++;
                }

            } else if ("cancelled".equals(status)) {

                cancelledCount++;
            }
        }

        Map<String, Object> statistics = new LinkedHashMap<>();

        statistics.put("totalTransactions", transactions.size());
        statistics.put("paidTransactions", paidCount);
        statistics.put("pendingTransactions", pendingCount);
        statistics.put("cancelledTransactions", cancelledCount);
        statistics.put("pendingBankTransfers", pendingBankTransfers);

        statistics.put("totalRevenue", totalRevenue);
        statistics.put("todayRevenue", todayRevenue);
        statistics.put("cashRevenue", cashRevenue);
        statistics.put("bankTransferRevenue", bankTransferRevenue);

        statistics.put("statisticDate", today.toString());

        return statistics;
    }

    /**
     * Lấy ngày dùng để lọc giao dịch.
     */
    private String paymentDate(Map<String, Object> transaction) {

        String confirmedAt = text(
                transaction.get("confirmed_at")
        );

        if (!confirmedAt.isBlank()) {
            return confirmedAt;
        }

        String paidAt = text(transaction.get("paid_at"));

        if (!paidAt.isBlank()) {
            return paidAt;
        }

        return text(transaction.get("created_at"));
    }

    /**
     * Chuyển chuỗi ngày thành LocalDate.
     */
    private LocalDate parseDate(String value) {

        String cleaned = clean(value);

        if (cleaned.isBlank()) {
            return null;
        }

        try {
            return LocalDate.parse(
                    cleaned.length() >= 10
                            ? cleaned.substring(0, 10)
                            : cleaned
            );

        } catch (RuntimeException exception) {
            return null;
        }
    }

    /**
     * Chuyển dữ liệu tiền về BigDecimal.
     */
    private BigDecimal money(Object value) {

        if (value == null) {
            return BigDecimal.ZERO;
        }

        try {
            return new BigDecimal(String.valueOf(value));

        } catch (NumberFormatException exception) {
            return BigDecimal.ZERO;
        }
    }

    /**
     * Chuẩn hóa chuỗi.
     */
    private String clean(String value) {
        return value == null ? "" : value.trim();
    }

    /**
     * Chuyển Object thành String.
     */
    private String text(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    /**
     * Lấy lịch sử thanh toán của hóa đơn.
     */
    public List<Map<String, Object>> getPaymentHistory(
                        String invoiceId,
                        LoginResponse.UserInfo user) {

                Map<String, Object> invoice = findInvoice(invoiceId);

                if (invoice == null) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Không tìm thấy hóa đơn " + invoiceId
            );
        }

                ensureInvoiceAccess(invoice, user);

        List<Map<String, Object>> history =
                couchDb.getAllDocuments()
                        .stream()
                        .filter(doc ->
                                "payment_transaction".equals(
                                        doc.get("type")
                                )
                        )
                        .filter(doc ->
                                invoiceId.equals(
                                        text(doc.get("invoice_id"))
                                )
                        )
                        .sorted(
                                Comparator.comparing(
                                        doc -> text(doc.get("created_at"))
                                )
                        )
                        .toList();

        if (!history.isEmpty()) {
            return history;
        }

        // Hỗ trợ hóa đơn cũ chưa có document giao dịch.
        Map<String, Object> legacy = new LinkedHashMap<>();

        legacy.put("_id", paymentDocumentId(invoiceId));
        legacy.put("payment_id", paymentDocumentId(invoiceId));
        legacy.put("invoice_id", invoiceId);

        legacy.put(
                "payment_method",
                text(invoice.get("payment_method"))
        );

        legacy.put("amount", invoice.get("total"));

        String oldStatus = text(invoice.get("payment_status"));

        legacy.put(
                "status",
                oldStatus.isBlank() || "unpaid".equalsIgnoreCase(oldStatus)
                        ? "pending"
                        : oldStatus
        );

        legacy.put(
                "created_at",
                text(invoice.get("created_at"))
        );

        legacy.put(
                "confirmed_at",
                text(invoice.get("paid_at"))
        );

        legacy.put(
                "transfer_reference",
                "bank_transfer".equalsIgnoreCase(
                        text(invoice.get("payment_method"))
                ) ? invoiceId : ""
        );

        legacy.put("legacy_invoice", true);

        return List.of(legacy);
    }

    /**
     * Tìm hóa đơn theo invoice_id.
     */
    private Map<String, Object> findInvoice(String invoiceId) {

        return couchDb.getAllDocuments()
                .stream()
                .filter(doc ->
                        "invoice".equals(doc.get("type"))
                )
                .filter(doc ->
                        invoiceId.equals(text(doc.get("invoice_id")))
                )
                .findFirst()
                .orElse(null);
    }

    /**
     * Tìm giao dịch thanh toán theo mã hóa đơn.
     */
    private Map<String, Object> findPayment(String invoiceId) {

        return couchDb.getDocument(
                paymentDocumentId(invoiceId)
        );
    }

    /**
     * Tạo ID document giao dịch.
     */
    private String paymentDocumentId(String invoiceId) {
        return "payment_" + invoiceId;
    }

        private void ensureInvoiceAccess(
                        Map<String, Object> invoice,
                        LoginResponse.UserInfo user) {
                if (!recordAccessPolicy.canAccess(user, invoice)) {
                        throw new ResponseStatusException(
                                        HttpStatus.NOT_FOUND,
                                        "Không tìm thấy hóa đơn."
                        );
                }
        }
}