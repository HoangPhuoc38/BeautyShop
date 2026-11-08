
package com.beautyshop.invoice.dto;

import java.util.List;
import java.util.Map;

public record InvoiceDetailResponse(
        Map<String, Object> invoice,
        List<Map<String, Object>> items
) {
}
