
package com.beautyshop.product.service;

import com.beautyshop.couchdb.CouchDbClient;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class ProductService {

    private final CouchDbClient couchDbClient;

    private static final List<String> ALLOWED_CATEGORIES = List.of(
        "nail_polish",
        "nail_care",
        "skincare",
        "makeup",
        "lipstick",
        "haircare",
        "hair_care",
        "cosmetics",
        "perfume",
        "tools",
        "accessories",
        "other"
    );

    public ProductService(CouchDbClient couchDbClient) {
        this.couchDbClient = couchDbClient;
    }

    // ==========================================
    // LẤY DANH SÁCH SẢN PHẨM
    // ==========================================

    public List<Map<String, Object>> getAllProducts() {

        List<Map<String, Object>> documents =
            couchDbClient.getAllDocuments();

        List<Map<String, Object>> products =
            new ArrayList<>();

        if (documents == null) {
            return products;
        }

        for (Map<String, Object> document : documents) {

            if (document == null) {
                continue;
            }

            if ("product".equalsIgnoreCase(
                    String.valueOf(document.get("type")))) {

                products.add(document);
            }
        }

        products.sort(
            Comparator.comparing(
                product -> String.valueOf(
                    product.getOrDefault("product_id", "")
                )
            )
        );

        return products;
    }

    // ==========================================
    // TÌM SẢN PHẨM THEO ID
    // ==========================================

    public Map<String, Object> getProductById(String id) {

        if (id == null || id.isBlank()) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Mã sản phẩm không hợp lệ."
            );
        }

        Map<String, Object> product =
            couchDbClient.getDocument(id);

        if (product == null ||
            !"product".equalsIgnoreCase(
                String.valueOf(product.get("type"))
            )) {

            throw new ResponseStatusException(
                HttpStatus.NOT_FOUND,
                "Không tìm thấy sản phẩm."
            );
        }

        return product;
    }

    // ==========================================
    // TẠO MÃ SẢN PHẨM
    // ==========================================

    private String generateProductCode() {

        List<Map<String, Object>> products =
            getAllProducts();

        int maxNumber = 0;

        for (Map<String, Object> product : products) {

            String productId = String.valueOf(
                product.getOrDefault("product_id", "")
            );

            if (productId.matches("PRD\\d+")) {

                try {
                    int number = Integer.parseInt(
                        productId.substring(3)
                    );

                    maxNumber = Math.max(maxNumber, number);

                } catch (NumberFormatException ignored) {
                    // Bỏ qua mã không thể chuyển thành số.
                }
            }
        }

        return String.format("PRD%03d", maxNumber + 1);
    }

    // ==========================================
    // THÊM SẢN PHẨM
    // ==========================================

    public Map<String, Object> createProduct(
            Map<String, Object> request) {

        validateProduct(request);

        String productCode = generateProductCode();
        String documentId = productCode.toLowerCase();

        if (couchDbClient.documentExists(documentId)) {
            throw new ResponseStatusException(
                HttpStatus.CONFLICT,
                "Mã sản phẩm đã tồn tại. Vui lòng thử lại."
            );
        }

        Instant now = Instant.now();

        Map<String, Object> product = new HashMap<>();

        product.put("_id", documentId);
        product.put("type", "product");
        product.put("product_id", productCode);

        product.put(
            "name",
            request.get("name").toString().trim()
        );

        product.put("category", request.get("category"));
        product.put("price", toBigDecimal(request.get("price")));
        product.put("stock", toInteger(request.get("stock")));

        product.put(
            "status",
            request.getOrDefault("status", "active")
        );

        product.put("created_at", now.toString());
        product.put("updated_at", now.toString());

        couchDbClient.saveDocument(documentId, product);

        return product;
    }

    // ==========================================
    // CẬP NHẬT SẢN PHẨM
    // ==========================================

    public Map<String, Object> updateProduct(
            String id,
            Map<String, Object> request) {

        validateProduct(request);

        Map<String, Object> existingProduct =
            getProductById(id);

        String currentRevision = String.valueOf(
            existingProduct.get("_rev")
        );

        Object requestRevision = request.get("_rev");

        if (requestRevision == null ||
            !currentRevision.equals(String.valueOf(requestRevision))) {

            throw new ResponseStatusException(
                HttpStatus.CONFLICT,
                "Dữ liệu sản phẩm đã thay đổi. Vui lòng tải lại trang."
            );
        }

        // Giữ lại _id, _rev và các trường dữ liệu khác.
        existingProduct.put(
            "name",
            request.get("name").toString().trim()
        );

        existingProduct.put("category", request.get("category"));

        existingProduct.put(
            "price",
            toBigDecimal(request.get("price"))
        );

        existingProduct.put(
            "stock",
            toInteger(request.get("stock"))
        );

        existingProduct.put(
            "status",
            request.getOrDefault("status", "active")
        );

        existingProduct.put(
            "updated_at",
            Instant.now().toString()
        );

        couchDbClient.saveDocument(id, existingProduct);

        return existingProduct;
    }

    // ==========================================
    // NGỪNG KINH DOANH SẢN PHẨM
    // ==========================================

    
// ==========================================
// XÓA SẢN PHẨM KHỎI COUCHDB
// ==========================================

public void deleteProduct(String id, String revision) {

    if (id == null || id.isBlank() ||
        revision == null || revision.isBlank()) {

        throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST,
            "Thiếu mã sản phẩm hoặc revision."
        );
    }

    Map<String, Object> product = getProductById(id);

    String currentRevision = String.valueOf(
        product.get("_rev")
    );

    if (!currentRevision.equals(revision)) {
        throw new ResponseStatusException(
            HttpStatus.CONFLICT,
            "Revision đã thay đổi. Vui lòng tải lại sản phẩm."
        );
    }

    // Xóa document bằng _id và _rev.
    couchDbClient.deleteDocument(id, revision);
}


    // ==========================================
    // KIỂM TRA DỮ LIỆU SẢN PHẨM
    // ==========================================

    private void validateProduct(Map<String, Object> request) {

        if (request == null) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Dữ liệu sản phẩm không hợp lệ."
            );
        }

        // Tên sản phẩm.
        String name = String.valueOf(
            request.getOrDefault("name", "")
        ).trim();

        if (name.isBlank()) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Vui lòng nhập tên sản phẩm."
            );
        }

        if (name.length() > 150) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Tên sản phẩm không được vượt quá 150 ký tự."
            );
        }

        // Danh mục.
        String category = String.valueOf(
            request.getOrDefault("category", "")
        );

        if (!ALLOWED_CATEGORIES.contains(category)) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Danh mục sản phẩm không hợp lệ."
            );
        }

        // Giá bán.
        BigDecimal price = toBigDecimal(
            request.get("price")
        );

        if (price == null ||
            price.compareTo(BigDecimal.ZERO) < 0) {

            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Giá sản phẩm không hợp lệ."
            );
        }

        // Số lượng tồn kho.
        Integer stock = toInteger(
            request.get("stock")
        );

        if (stock == null || stock < 0) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Số lượng tồn kho không hợp lệ."
            );
        }

        // Trạng thái.
        String status = String.valueOf(
            request.getOrDefault("status", "active")
        );

        if (!"active".equals(status) &&
            !"inactive".equals(status)) {

            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Trạng thái sản phẩm không hợp lệ."
            );
        }
    }

    // ==========================================
    // CHUYỂN ĐỔI GIÁ
    // ==========================================

    private BigDecimal toBigDecimal(Object value) {

        try {
            if (value == null) {
                return null;
            }

            return new BigDecimal(value.toString());

        } catch (NumberFormatException e) {
            return null;
        }
    }

    // ==========================================
    // CHUYỂN ĐỔI SỐ LƯỢNG
    // ==========================================

    private Integer toInteger(Object value) {

        try {
            if (value == null) {
                return null;
            }

            BigDecimal number =
                new BigDecimal(value.toString());

            return number.intValueExact();

        } catch (ArithmeticException | NumberFormatException e) {
            return null;
        }
    }
}
