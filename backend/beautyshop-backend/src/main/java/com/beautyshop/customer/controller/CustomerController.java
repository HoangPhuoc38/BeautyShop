
package com.beautyshop.customer.controller;

import com.beautyshop.customer.service.CustomerService;

import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/customers")
public class CustomerController {

    private final CustomerService customerService;

    public CustomerController(CustomerService customerService) {
        this.customerService = customerService;
    }

    // =========================================
    // DANH SÁCH KHÁCH HÀNG
    // =========================================

    @GetMapping
    public List<Map<String, Object>> getAllCustomers() {

        return customerService.getAllCustomers();
    }

    // =========================================
    // CHI TIẾT KHÁCH HÀNG
    // =========================================

    @GetMapping("/{customerId}")
    public Map<String, Object> getCustomer(
            @PathVariable String customerId) {

        return customerService.getCustomer(customerId);
    }

    // =========================================
    // THÊM KHÁCH HÀNG
    // =========================================

    @PostMapping
    public Map<String, Object> createCustomer(
            @RequestBody Map<String, Object> request) {

        return customerService.createCustomer(request);
    }

    // =========================================
    // CẬP NHẬT KHÁCH HÀNG
    // =========================================

    @PutMapping("/{customerId}")
    public Map<String, Object> updateCustomer(
            @PathVariable String customerId,
            @RequestBody Map<String, Object> request) {

        return customerService.updateCustomer(
                customerId,
                request
        );
    }

    // =========================================
    // XÓA KHÁCH HÀNG
    // =========================================

    @DeleteMapping("/{customerId}")
    public Map<String, Object> deleteCustomer(
            @PathVariable String customerId) {

        customerService.deleteCustomer(customerId);

        return Map.of(
                "success", true,
                "message", "Xóa khách hàng thành công."
        );
    }

    // =========================================
    // SAO LƯU KHÁCH HÀNG
    // =========================================

    @GetMapping("/backup")
    public Map<String, Object> backupCustomers() {

        return customerService.backupCustomers();
    }
}
