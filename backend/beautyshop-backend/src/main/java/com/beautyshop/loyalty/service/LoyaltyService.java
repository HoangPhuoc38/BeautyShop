
package com.beautyshop.loyalty.service;

import com.beautyshop.couchdb.CouchDbClient;
import com.beautyshop.loyalty.dto.LoyaltySummary;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.client.HttpClientErrorException;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.*;

@Service
public class LoyaltyService {

    private static final long MONEY_PER_POINT = 10_000L;

    private final CouchDbClient couchDb;

    public LoyaltyService(CouchDbClient couchDb) {
        this.couchDb = couchDb;
    }

    // ==============================
    // TÍNH ĐIỂM
    // ==============================

    private long calculatePoints(Object total) {

        if (total == null) {
            return 0;
        }

        BigDecimal amount = new BigDecimal(total.toString());

        if (amount.signum() < 0) {
            throw new IllegalArgumentException(
                    "Tổng tiền hóa đơn không được âm");
        }

        return amount.divideToIntegralValue(
                BigDecimal.valueOf(MONEY_PER_POINT)
        ).longValue();
    }

    // ==============================
    // XẾP HẠNG
    // ==============================

    public String calculateRank(long points) {

        if (points >= 5000) {
            return "Kim cương";
        }

        if (points >= 2500) {
            return "Bạch kim";
        }

        if (points >= 1000) {
            return "Vàng";
        }

        if (points >= 500) {
            return "Bạc";
        }

        return "Đồng";
    }

    // ==============================
    // TÌM DOCUMENT THEO TYPE
    // ==============================

    private List<Map<String, Object>> findByType(String type) {

        return couchDb.getAllDocuments()
                .stream()
                .filter(doc -> type.equals(doc.get("type")))
                .toList();
    }

    private Map<String, Object> findInvoice(String invoiceId) {

        return findByType("invoice")
                .stream()
                .filter(doc -> invoiceId.equals(
                        String.valueOf(doc.get("invoice_id"))))
                .findFirst()
                .orElse(null);
    }

    private Map<String, Object> findCustomer(String customerId) {

        return findByType("customer")
                .stream()
                .filter(doc -> customerId.equals(
                        String.valueOf(doc.get("customer_id"))))
                .findFirst()
                .orElse(null);
    }

    // ==============================
    // TẠO LỊCH SỬ TÍCH ĐIỂM
    // ==============================

    private void ensureTransaction(
            Map<String, Object> invoice,
            long points) {

        String invoiceId = String.valueOf(invoice.get("invoice_id"));

        String transactionId = "loyalty_" + invoiceId;

        if (couchDb.documentExists(transactionId)) {
            return;
        }

        Map<String, Object> transaction = new HashMap<>();

        transaction.put("_id", transactionId);
        transaction.put("type", "loyalty_transaction");
        transaction.put("customer_id", invoice.get("customer_id"));
        transaction.put("invoice_id", invoiceId);
        transaction.put("transaction_type", "earn");
        transaction.put("points", points);
        transaction.put("amount_paid", invoice.get("total"));
        transaction.put("description",
                "Tích điểm từ hóa đơn " + invoiceId);
        transaction.put("created_at",
                invoice.getOrDefault(
                        "paid_at",
                        invoice.get("created_at")));

        try {
            couchDb.saveDocument(transactionId, transaction);
        } catch (HttpClientErrorException.Conflict e) {
            // Một request khác đã tạo giao dịch này.
        }
    }

    // ==============================
    // CỘNG ĐIỂM TỰ ĐỘNG
    // ==============================

    public void applyPaidInvoice(String invoiceId) {

        Map<String, Object> invoice = findInvoice(invoiceId);

        if (invoice == null) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Không tìm thấy hóa đơn " + invoiceId);
        }

        if (!"paid".equals(invoice.get("payment_status"))) {
            return;
        }

        String customerId =
                String.valueOf(invoice.get("customer_id"));

        Object pointsBasis = invoice.getOrDefault(
                "subtotal",
                invoice.get("total")
        );

        long earnedPoints = calculatePoints(pointsBasis);

        if (earnedPoints <= 0) {
            return;
        }

        String processedKey = "loyalty_processed_invoices";

        boolean applied = false;

        // Thử lại khi CouchDB phát hiện xung đột _rev.
        for (int attempt = 0; attempt < 5; attempt++) {

            Map<String, Object> customer =
                    findCustomer(customerId);

            if (customer == null) {
                throw new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Không tìm thấy khách hàng " + customerId);
            }

            List<String> processed = new ArrayList<>();

            Object oldProcessed = customer.get(processedKey);

            if (oldProcessed instanceof List<?> list) {
                for (Object value : list) {
                    processed.add(String.valueOf(value));
                }
            }

            // Đã cộng điểm hóa đơn này rồi.
            if (processed.contains(invoiceId)) {
                applied = true;
                break;
            }

            long oldPoints = toLong(customer.get("points"));
long oldPaidAmount = toLong(
        customer.get("loyalty_paid_amount"));

long newPoints = oldPoints + earnedPoints;
long newPaidAmount = oldPaidAmount
        + toLong(invoice.get("total"));

customer.put("loyalty_paid_amount", newPaidAmount);

            processed.add(invoiceId);

            customer.put("points", newPoints);
            customer.put("rank", calculateRank(newPoints));
            customer.put(
                    "membership",
                    LoyaltyMembershipPolicy.forPoints(newPoints)
            );
            customer.put(processedKey, processed);
            customer.put("loyalty_updated_at",
                    OffsetDateTime.now().toString());

            String customerDocId =
                    String.valueOf(customer.get("_id"));

            try {
                couchDb.saveDocument(customerDocId, customer);
                applied = true;
                break;

            } catch (HttpClientErrorException.Conflict e) {
                // Đọc lại _rev mới và thử cập nhật.
            }
        }

        if (!applied) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Không thể cập nhật điểm do xung đột dữ liệu. "
                    + "Hãy thử lại.");
        }

        // Tạo lịch sử sau khi cập nhật khách hàng.
        // Nếu chương trình dừng giữa hai thao tác, gọi lại API
        // sẽ bổ sung lịch sử mà không cộng điểm lần thứ hai.
        ensureTransaction(invoice, earnedPoints);
    }

    private long toLong(Object value) {

        if (value == null) {
            return 0;
        }

        return new BigDecimal(value.toString()).longValue();
    }

    // ==============================
    // TÍNH LẠI ĐIỂM TOÀN BỘ
    // ==============================

    public Map<String, Object> recalculateAll() {

        List<Map<String, Object>> invoices =
                findByType("invoice");

        List<Map<String, Object>> customers =
                findByType("customer");

        Map<String, Long> pointMap = new HashMap<>();
        Map<String, Long> amountMap = new HashMap<>();
        Map<String, List<String>> invoiceMap = new HashMap<>();

        // Gom dữ liệu từ hóa đơn đã thanh toán.
        for (Map<String, Object> invoice : invoices) {

            if (!"paid".equals(invoice.get("payment_status"))) {
                continue;
            }

            String customerId =
                    String.valueOf(invoice.get("customer_id"));

            String invoiceId =
                    String.valueOf(invoice.get("invoice_id"));

            long amount = toLong(invoice.get("total"));
            long points = calculatePoints(invoice.get("total"));

            pointMap.merge(customerId, points, Long::sum);
            amountMap.merge(customerId, amount, Long::sum);

            invoiceMap.computeIfAbsent(
                    customerId, key -> new ArrayList<>()
            ).add(invoiceId);

            ensureTransaction(invoice, points);
        }

        int updatedCount = 0;

        for (Map<String, Object> customer : customers) {

            String customerId =
                    String.valueOf(customer.get("customer_id"));

            long points = pointMap.getOrDefault(customerId, 0L);

            long paidAmount =
                    amountMap.getOrDefault(customerId, 0L);

            List<String> processedInvoices =
                    invoiceMap.getOrDefault(
                            customerId, new ArrayList<>());

            String documentId =
                    String.valueOf(customer.get("_id"));

            boolean saved = false;

            for (int attempt = 0; attempt < 5; attempt++) {

                // Đọc lại document mới nhất để lấy _rev.
                Map<String, Object> latest =
                        couchDb.getDocument(documentId);

                if (latest == null) {
                    break;
                }

                latest.put("points", points);
                latest.put("rank", calculateRank(points));
                latest.put("loyalty_paid_amount", paidAmount);
                latest.put("loyalty_processed_invoices",
                        processedInvoices);
                latest.put("loyalty_updated_at",
                        OffsetDateTime.now().toString());

                try {
                    couchDb.saveDocument(documentId, latest);
                    saved = true;
                    break;

                } catch (HttpClientErrorException.Conflict e) {
                    // Thử lại với _rev mới.
                }
            }

            if (!saved) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "Không thể cập nhật điểm cho khách hàng "
                        + customerId);
            }

            updatedCount++;
        }

        Map<String, Object> result = new HashMap<>();

        result.put("message",
                "Đã tính lại điểm từ lịch sử hóa đơn.");
        result.put("updatedCustomers", updatedCount);
        result.put("paidInvoices",
                invoices.stream()
                        .filter(i -> "paid".equals(
                                i.get("payment_status")))
                        .count());
        result.put("conversionRule", "10.000 VNĐ = 1 điểm");

        return result;
    }

    // ==============================
    // DANH SÁCH KHÁCH HÀNG VÀ ĐIỂM
    // ==============================

    
public List<LoyaltySummary> getAllCustomers() {

    List<LoyaltySummary> result = new ArrayList<>();

    for (Map<String, Object> customer : findByType("customer")) {

        long points = toLong(customer.get("points"));

        result.add(new LoyaltySummary(
                String.valueOf(customer.get("customer_id")),
                String.valueOf(customer.getOrDefault(
                        "full_name", "")),
                points,
                calculateRank(points),
                toLong(customer.get("loyalty_paid_amount"))
        ));
    }

    result.sort(
            Comparator.comparingLong(LoyaltySummary::points)
                    .reversed()
    );

    return result;
}


    // ==============================
    // CHI TIẾT KHÁCH HÀNG
    // ==============================

    public LoyaltySummary getCustomerLoyalty(String customerId) {

        Map<String, Object> customer =
                findCustomer(customerId);

        if (customer == null) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Không tìm thấy khách hàng");
        }

        return new LoyaltySummary(
                customerId,
                String.valueOf(customer.getOrDefault(
                        "full_name", "")),
                toLong(customer.get("points")),
                String.valueOf(customer.getOrDefault(
                        "rank", "Đồng")),
                toLong(customer.get("loyalty_paid_amount"))
        );
    }

    // ==============================
    // LỊCH SỬ TÍCH ĐIỂM
    // ==============================

    public List<Map<String, Object>> getHistory(String customerId) {

        return findByType("loyalty_transaction")
                .stream()
                .filter(doc -> customerId.equals(
                        String.valueOf(doc.get("customer_id"))))
                .sorted(Comparator.comparing(
                        doc -> String.valueOf(
                                doc.getOrDefault("created_at", "")),
                        Comparator.reverseOrder()))
                .toList();
    }
    public Map<String, Object> getStatistics() {

    List<Map<String, Object>> customers =
            findByType("customer");

    Map<String, Long> rankCounts = new LinkedHashMap<>();

    rankCounts.put("Đồng", 0L);
    rankCounts.put("Bạc", 0L);
    rankCounts.put("Vàng", 0L);
    rankCounts.put("Bạch kim", 0L);
    rankCounts.put("Kim cương", 0L);

    long totalPoints = 0;

    for (Map<String, Object> customer : customers) {

        long points = toLong(customer.get("points"));
        String rank = calculateRank(points);

        rankCounts.merge(rank, 1L, Long::sum);
        totalPoints += points;
    }

    Map<String, Object> result = new LinkedHashMap<>();

    result.put("totalCustomers", customers.size());
    result.put("totalPoints", totalPoints);
    result.put("rankStatistics", rankCounts);

    return result;
}
}
