
package com.beautyshop.invoice.service;

import com.beautyshop.auth.dto.LoginResponse;
import com.beautyshop.config.RecordAccessPolicy;
import com.beautyshop.invoice.dto.InvoiceDetailResponse;
import com.beautyshop.invoice.dto.InvoiceStatisticsResponse;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class InvoiceService {

    private final RestClient couchDbClient;
    private final String database;
        private final RecordAccessPolicy recordAccessPolicy =
            new RecordAccessPolicy();

    private static final Pattern INVOICE_ID_PATTERN =
            Pattern.compile("^(\\D*)(\\d+)$");

    public InvoiceService(
            RestClient couchDbRestClient,
            @Value("${couchdb.database}") String database) {

        this.couchDbClient = couchDbRestClient;
        this.database = database;
    }

    // ============================================
    // 1. LẤY TẤT CẢ DOCUMENT TỪ COUCHDB
    // ============================================

    private List<Map<String, Object>> getDocuments() {

        Map<?, ?> response = couchDbClient.get()
                .uri("/{db}/_all_docs?include_docs=true", database)
                .retrieve()
                .body(Map.class);

        List<Map<String, Object>> documents = new ArrayList<>();

        if (response == null ||
                !(response.get("rows") instanceof List<?> rows)) {
            return documents;
        }

        for (Object rowObject : rows) {

            if (!(rowObject instanceof Map<?, ?> row)) {
                continue;
            }

            Object documentObject = row.get("doc");

            if (documentObject instanceof Map<?, ?> rawDocument) {

                Map<String, Object> document = new LinkedHashMap<>();

                rawDocument.forEach((key, value) ->
                        document.put(String.valueOf(key), value));

                documents.add(document);
            }
        }

        return documents;
    }

    // ============================================
    // 2. LẤY DANH SÁCH HÓA ĐƠN
    // ============================================

    private List<Map<String, Object>> getInvoices() {

        return getDocuments().stream()
                .filter(doc ->
                        "invoice".equalsIgnoreCase(text(doc, "type")))
                .sorted(Comparator.comparing(
                        doc -> text(doc, "invoice_id"),
                        this::compareInvoiceId
                ))
                .toList();
    }

    // ============================================
    // 3. SO SÁNH MÃ HÓA ĐƠN
    // ============================================

    private int compareInvoiceId(String maA, String maB) {

        Matcher matcherA = INVOICE_ID_PATTERN.matcher(maA);
        Matcher matcherB = INVOICE_ID_PATTERN.matcher(maB);

        if (matcherA.matches() && matcherB.matches()) {

            int prefixCompare = matcherA.group(1)
                    .compareToIgnoreCase(matcherB.group(1));

            if (prefixCompare != 0) {
                return prefixCompare;
            }

            return new BigDecimal(matcherA.group(2))
                    .compareTo(new BigDecimal(matcherB.group(2)));
        }

        return maA.compareToIgnoreCase(maB);
    }

    // ============================================
    // 4. LẤY DANH SÁCH CHI TIẾT HÓA ĐƠN
    // ============================================

    private List<Map<String, Object>> getInvoiceItems() {

        return getDocuments().stream()
                .filter(doc ->
                        "invoice_item".equalsIgnoreCase(text(doc, "type")))
                .toList();
    }

    // ============================================
    // 5. HÀM ĐỌC DỮ LIỆU
    // ============================================

    private String text(
            Map<String, Object> document,
            String field) {

        Object value = document.get(field);

        return value == null
                ? ""
                : String.valueOf(value).trim();
    }

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

    private String normalize(String value) {

        return value == null
                ? ""
                : value.trim().toLowerCase(Locale.ROOT);
    }

    // ============================================
    // 6. CHUYỂN ĐỔI NGÀY
    // ============================================

    private LocalDate parseDate(String value) {

        if (value == null || value.isBlank()) {
            return null;
        }

        try {

            String dateValue = value.trim();

            // Hỗ trợ ISO datetime:
            // 2026-10-16T12:15:00+07:00

            if (dateValue.length() >= 10) {
                dateValue = dateValue.substring(0, 10);
            }

            return LocalDate.parse(dateValue);

        } catch (RuntimeException exception) {
            return null;
        }
    }

    // ============================================
    // 7. TÌM KIẾM VÀ LỌC HÓA ĐƠN
    // ============================================

    public List<Map<String, Object>> searchInvoices(
            String keyword,
            String paymentStatus,
            String paymentMethod,
            String fromDate,
            String toDate,
            LoginResponse.UserInfo user) {

        String search = normalize(keyword);
        String status = normalize(paymentStatus);
        String method = normalize(paymentMethod);

        LocalDate from = parseDate(fromDate);
        LocalDate to = parseDate(toDate);

        return getInvoices().stream()

            .filter(invoice -> recordAccessPolicy.canAccess(user, invoice))

                // Tìm kiếm thông tin hóa đơn
                .filter(invoice -> {

                    if (search.isEmpty()) {
                        return true;
                    }

                    return normalize(text(invoice, "invoice_id"))
                            .contains(search)

                            || normalize(text(invoice, "_id"))
                            .contains(search)

                            || normalize(text(invoice, "customer_id"))
                            .contains(search)

                            || normalize(text(invoice, "employee_id"))
                            .contains(search)

                            || normalize(text(invoice, "appointment_id"))
                            .contains(search)

                            || normalize(text(invoice, "branch_id"))
                            .contains(search);
                })

                // Lọc trạng thái thanh toán
                .filter(invoice ->
                        status.isEmpty()
                                || status.equals(normalize(
                                        text(invoice, "payment_status")))
                )

                // Lọc phương thức thanh toán
                .filter(invoice ->
                        method.isEmpty()
                                || method.equals(normalize(
                                        text(invoice, "payment_method")))
                )

                // Lọc theo ngày tạo
                .filter(invoice -> {

                    LocalDate created = parseDate(
                            text(invoice, "created_at"));

                    if (created == null) {
                        return from == null && to == null;
                    }

                    return (from == null || !created.isBefore(from))
                            && (to == null || !created.isAfter(to));
                })

                .toList();
    }

    // ============================================
    // 8. LẤY CHI TIẾT HÓA ĐƠN
    // ============================================

        public InvoiceDetailResponse getInvoiceDetail(
            String invoiceId,
            LoginResponse.UserInfo user) {

        if (invoiceId == null || invoiceId.isBlank()) {
            throw new InvoiceNotFoundException(invoiceId);
        }

        String searchId = invoiceId.trim();

        // Hỗ trợ tìm theo invoice_id hoặc CouchDB _id
        Map<String, Object> invoice = getInvoices().stream()
                .filter(doc ->
                        searchId.equalsIgnoreCase(text(doc, "invoice_id"))
                                || searchId.equalsIgnoreCase(text(doc, "_id"))
                )
                .filter(doc -> recordAccessPolicy.canAccess(user, doc))
                .findFirst()
                .orElseThrow(() ->
                        new InvoiceNotFoundException(searchId));

        String businessInvoiceId = text(invoice, "invoice_id");
        String documentId = text(invoice, "_id");

        // Lấy các dòng chi tiết thuộc hóa đơn
        List<Map<String, Object>> items = getInvoiceItems().stream()
                .filter(item -> {

                    String itemInvoiceId = text(item, "invoice_id");

                    return itemInvoiceId.equalsIgnoreCase(businessInvoiceId)
                            || itemInvoiceId.equalsIgnoreCase(documentId);
                })
                .toList();

        return new InvoiceDetailResponse(invoice, items);
    }

    // ============================================
    // 9. THỐNG KÊ HÓA ĐƠN
    // ============================================

    public InvoiceStatisticsResponse getStatistics(
            LoginResponse.UserInfo user) {

        List<Map<String, Object>> invoices = getInvoices().stream()
                .filter(invoice -> recordAccessPolicy.canAccess(user, invoice))
                .toList();

        long paidCount = invoices.stream()
                .filter(invoice ->
                        "paid".equalsIgnoreCase(
                                text(invoice, "payment_status")))
                .count();

        BigDecimal revenue = invoices.stream()
                .filter(invoice ->
                        "paid".equalsIgnoreCase(
                                text(invoice, "payment_status")))
                .map(invoice ->
                        money(invoice.get("total")))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        long unpaidCount = invoices.size() - paidCount;

        return new InvoiceStatisticsResponse(
                invoices.size(),
                paidCount,
                unpaidCount,
                revenue
        );
    }

    // ============================================
    // 10. NGOẠI LỆ KHÔNG TÌM THẤY HÓA ĐƠN
    // ============================================

    public static class InvoiceNotFoundException
            extends RuntimeException {

        public InvoiceNotFoundException(String invoiceId) {

            super("Không tìm thấy hóa đơn: " + invoiceId);
        }
    }
}
