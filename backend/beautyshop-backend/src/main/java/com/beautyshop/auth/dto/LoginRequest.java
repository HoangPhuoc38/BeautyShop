package com.beautyshop.auth.dto;

public record LoginRequest(
        String username,
        String password
) {
}