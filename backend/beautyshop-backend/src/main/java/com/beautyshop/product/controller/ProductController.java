
package com.beautyshop.product.controller;

import com.beautyshop.product.service.ProductService;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/products")
@CrossOrigin(
    origins = {
        "http://localhost:5500",
        "http://127.0.0.1:5500"
    },
    allowCredentials = "true"
)
public class ProductController {

    private final ProductService productService;

    public ProductController(ProductService productService) {
        this.productService = productService;
    }

    // ==========================================
    // LẤY DANH SÁCH SẢN PHẨM
    // GET /api/products
    // ==========================================

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> getAllProducts() {
        return ResponseEntity.ok(
            productService.getAllProducts()
        );
    }

    // ==========================================
    // LẤY SẢN PHẨM THEO ID
    // GET /api/products/{id}
    // ==========================================

    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> getProductById(
            @PathVariable String id) {

        return ResponseEntity.ok(
            productService.getProductById(id)
        );
    }

    // ==========================================
    // THÊM SẢN PHẨM
    // POST /api/products
    // ==========================================

    @PostMapping
    public ResponseEntity<Map<String, Object>> createProduct(
            @RequestBody Map<String, Object> request) {

        Map<String, Object> product =
            productService.createProduct(request);

        return ResponseEntity
            .status(HttpStatus.CREATED)
            .body(product);
    }

    // ==========================================
    // CẬP NHẬT SẢN PHẨM
    // PUT /api/products/{id}
    // ==========================================

    @PutMapping("/{id}")
    public ResponseEntity<Map<String, Object>> updateProduct(
            @PathVariable String id,
            @RequestBody Map<String, Object> request) {

        return ResponseEntity.ok(
            productService.updateProduct(id, request)
        );
    }

    // ==========================================
    // NGỪNG KINH DOANH SẢN PHẨM
    // DELETE /api/products/{id}?rev=...
    // ==========================================

   
@DeleteMapping("/{id}")
public ResponseEntity<Map<String, Object>> deleteProduct(
        @PathVariable String id,
        @RequestParam String rev) {

    productService.deleteProduct(id, rev);

    return ResponseEntity.ok(
        Map.of(
            "success", true,
            "message", "Đã xóa sản phẩm khỏi CouchDB."
        )
    );
}


    // ==========================================
    // SAO LƯU DANH SÁCH SẢN PHẨM
    // GET /api/products/backup
    // ==========================================

    @GetMapping("/backup")
    public ResponseEntity<Map<String, Object>> backupProducts() {

        List<Map<String, Object>> products =
            productService.getAllProducts();

        return ResponseEntity.ok(
            Map.of(
                "success", true,
                "total", products.size(),
                "products", products
            )
        );
    }
}
