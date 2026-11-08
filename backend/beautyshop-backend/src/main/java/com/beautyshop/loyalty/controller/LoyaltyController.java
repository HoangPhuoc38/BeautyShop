
package com.beautyshop.loyalty.controller;

import com.beautyshop.loyalty.dto.LoyaltySummary;
import com.beautyshop.loyalty.service.LoyaltyService;

import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/loyalty")
public class LoyaltyController {

    private final LoyaltyService loyaltyService;

    public LoyaltyController(LoyaltyService loyaltyService) {
        this.loyaltyService = loyaltyService;
    }

    // =========================================
    // DANH SÁCH KHÁCH HÀNG VÀ ĐIỂM
    // =========================================

    @GetMapping("/customers")
    public List<LoyaltySummary> getCustomers() {

        return loyaltyService.getAllCustomers();
    }

    // =========================================
    // CHI TIẾT ĐIỂM KHÁCH HÀNG
    // =========================================

    @GetMapping("/customers/{customerId}")
    public LoyaltySummary getCustomer(
            @PathVariable String customerId) {

        return loyaltyService.getCustomerLoyalty(customerId);
    }

    // =========================================
    // LỊCH SỬ TÍCH ĐIỂM
    // =========================================

    @GetMapping("/history/{customerId}")
    public List<Map<String, Object>> getHistory(
            @PathVariable String customerId) {

        return loyaltyService.getHistory(customerId);
    }

    // =========================================
    // TÍNH LẠI ĐIỂM
    // =========================================

    @PostMapping("/recalculate")
    public Map<String, Object> recalculate() {

        return loyaltyService.recalculateAll();
    }

    // =========================================
    // THỐNG KÊ LOYALTY
    // =========================================

    @GetMapping("/statistics")
    public Map<String, Object> getStatistics() {

        return loyaltyService.getStatistics();
    }
}
