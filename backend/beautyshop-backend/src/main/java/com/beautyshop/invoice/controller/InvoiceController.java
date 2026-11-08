
package com.beautyshop.invoice.controller;

import com.beautyshop.auth.dto.LoginResponse;
import com.beautyshop.invoice.dto.CreateInvoiceRequest;
import com.beautyshop.invoice.dto.InvoiceDetailResponse;
import com.beautyshop.invoice.dto.InvoiceStatisticsResponse;
import com.beautyshop.invoice.service.InvoiceCreationService;
import com.beautyshop.invoice.service.InvoiceService;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/invoices")
public class InvoiceController {

    private final InvoiceService invoiceService;
    private final InvoiceCreationService invoiceCreationService;

    public InvoiceController(
            InvoiceService invoiceService,
            InvoiceCreationService invoiceCreationService) {

        this.invoiceService = invoiceService;
        this.invoiceCreationService = invoiceCreationService;
    }

    /**
     * Tạo hóa đơn.
     */
    @PostMapping
    public ResponseEntity<Map<String, Object>> createInvoice(
                        @RequestBody CreateInvoiceRequest request,
                        HttpServletRequest httpRequest) {

        Map<String, Object> result =
                                invoiceCreationService.createInvoice(request, currentUser(httpRequest));

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(result);
    }

    /**
     * Danh sách hóa đơn và bộ lọc.
     */
    @GetMapping
    public List<Map<String, Object>> getInvoices(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String paymentStatus,
            @RequestParam(required = false) String paymentMethod,
            @RequestParam(required = false) String fromDate,
            @RequestParam(required = false) String toDate,
            HttpServletRequest httpRequest) {

        return invoiceService.searchInvoices(
                keyword,
                paymentStatus,
                paymentMethod,
                fromDate,
                toDate,
                currentUser(httpRequest)
        );
    }

    /**
     * Thống kê hóa đơn.
     */
    @GetMapping("/statistics")
        public InvoiceStatisticsResponse getStatistics(
                        HttpServletRequest httpRequest) {
                return invoiceService.getStatistics(currentUser(httpRequest));
    }

    /**
     * Chi tiết hóa đơn.
     */
    @GetMapping("/{invoiceId}")
    public InvoiceDetailResponse getInvoiceDetail(
                        @PathVariable String invoiceId,
                        HttpServletRequest httpRequest) {

                return invoiceService.getInvoiceDetail(
                                invoiceId,
                                currentUser(httpRequest)
                );
    }

    /**
     * Xử lý trường hợp không tìm thấy hóa đơn.
     */
    @ExceptionHandler(
            InvoiceService.InvoiceNotFoundException.class
    )
    public ResponseEntity<Map<String, String>> handleNotFound(
            InvoiceService.InvoiceNotFoundException exception) {

        return ResponseEntity
                .status(HttpStatus.NOT_FOUND)
                .body(Map.of(
                        "message",
                        exception.getMessage()
                ));
    }

        private LoginResponse.UserInfo currentUser(HttpServletRequest request) {
                HttpSession session = request.getSession(false);
                Object value = session == null ? null : session.getAttribute("AUTH_USER");

                return value instanceof LoginResponse.UserInfo user ? user : null;
        }
}
