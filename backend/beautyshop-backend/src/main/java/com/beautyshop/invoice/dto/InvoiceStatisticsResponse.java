
package com.beautyshop.invoice.dto;

import java.math.BigDecimal;

public record InvoiceStatisticsResponse(
        long totalInvoices,
        long paidInvoices,
        long unpaidInvoices,
        BigDecimal revenue
) {
}
