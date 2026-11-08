
package com.beautyshop.payment.controller;

import com.beautyshop.auth.dto.LoginResponse;
import com.beautyshop.payment.service.InvoicePaymentService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;

import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/payments")
public class InvoicePaymentController {

    private final InvoicePaymentService paymentService;

    public InvoicePaymentController(
            InvoicePaymentService paymentService) {

        this.paymentService = paymentService;
    }

    /**
     * Lấy danh sách giao dịch thanh toán.
     *
     * Hỗ trợ:
     * - Tìm kiếm theo mã hóa đơn, khách hàng, nội dung chuyển khoản.
     * - Lọc theo trạng thái.
     * - Lọc theo phương thức thanh toán.
     * - Lọc theo ngày.
     */
    @GetMapping
    public List<Map<String, Object>> getPayments(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String paymentMethod,
            @RequestParam(required = false) String fromDate,
            @RequestParam(required = false) String toDate,
            HttpServletRequest httpRequest) {

        return paymentService.getPaymentTransactions(
                keyword,
                status,
                paymentMethod,
                fromDate,
                toDate,
                currentUser(httpRequest)
        );
    }

    /**
     * Thống kê thanh toán.
     */
    @GetMapping("/statistics")
    public Map<String, Object> getStatistics(HttpServletRequest request) {

        return paymentService.getPaymentStatistics(currentUser(request));
    }

    /**
     * Xác nhận thanh toán.
     *
     * paymentMethod:
     * - cash
     * - bank_transfer
     */
    @PostMapping("/invoices/{invoiceId}/confirm")
    public Map<String, Object> confirmPayment(
            @PathVariable String invoiceId,
            @RequestParam(required = false) String paymentMethod,
            HttpServletRequest request) {

        return paymentService.confirmPayment(
                invoiceId,
                paymentMethod,
                currentUser(request)
        );
    }

    /**
     * Lấy lịch sử thanh toán của một hóa đơn.
     */
    @GetMapping("/invoices/{invoiceId}/history")
    public List<Map<String, Object>> getPaymentHistory(
            @PathVariable String invoiceId,
            HttpServletRequest request) {

        return paymentService.getPaymentHistory(
                invoiceId,
                currentUser(request)
        );
    }

    /**
     * Hủy hóa đơn chưa thanh toán.
     */
    @PostMapping("/invoices/{invoiceId}/cancel")
    public Map<String, Object> cancelInvoice(
            @PathVariable String invoiceId,
            HttpServletRequest request) {

        return paymentService.cancelInvoice(invoiceId, currentUser(request));
    }

    private LoginResponse.UserInfo currentUser(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        Object value = session == null ? null : session.getAttribute("AUTH_USER");

        return value instanceof LoginResponse.UserInfo user ? user : null;
    }
}
