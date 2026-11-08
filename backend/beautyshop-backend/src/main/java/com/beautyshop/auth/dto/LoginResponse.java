
package com.beautyshop.auth.dto;

public record LoginResponse(
        boolean success,
        String message,
        UserInfo user
) {

    public record UserInfo(
            String id,
            String employeeId,
            String username,
            String fullName,
            String role,
            String branchId,
            boolean mustChangePassword
    ) {}
}
