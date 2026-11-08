package com.beautyshop.payment.dto;

import java.math.BigDecimal;

public record PaymentResponse(
        String invoiceId,
        String paymentMethod,
        String paymentStatus,
        BigDecimal amount,
        String message,
        String paidAt
) {
}