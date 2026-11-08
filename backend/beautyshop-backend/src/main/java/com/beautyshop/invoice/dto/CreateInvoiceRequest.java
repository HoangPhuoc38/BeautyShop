
package com.beautyshop.invoice.dto;

import java.math.BigDecimal;
import java.util.List;

public record CreateInvoiceRequest(
        String customerId,
        String appointmentId,
        String employeeId,
        String branchId,
        List<InvoiceItemRequest> items,
        String discountType,
        BigDecimal discountValue,
        String paymentMethod,
        String note
) {

    public record InvoiceItemRequest(
            String itemType,
            String itemId,
            Integer quantity
    ) {
    }
}
