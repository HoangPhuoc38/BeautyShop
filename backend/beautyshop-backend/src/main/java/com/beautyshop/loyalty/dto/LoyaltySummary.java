package com.beautyshop.loyalty.dto;

public record LoyaltySummary(
        String customerId,
        String customerName,
        long points,
        String rank,
        long paidAmount
) {
}