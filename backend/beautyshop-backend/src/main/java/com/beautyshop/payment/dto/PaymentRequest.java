package com.beautyshop.payment.dto;

public record PaymentRequest(
        String paymentMethod,
        String transactionReference,
        String note
) {
}