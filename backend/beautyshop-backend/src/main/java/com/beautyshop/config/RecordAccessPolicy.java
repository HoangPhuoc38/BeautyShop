package com.beautyshop.config;

import com.beautyshop.auth.dto.LoginResponse;

import java.util.Map;

public final class RecordAccessPolicy {

    public boolean canAccess(
            LoginResponse.UserInfo user,
            Map<String, Object> record) {

        if (user == null || record == null) {
            return false;
        }

        if ("admin".equalsIgnoreCase(user.role())) {
            return true;
        }

        String branchId = text(user.branchId());

        if (branchId.isBlank()
                || !branchId.equals(text(record.get("branch_id")))) {
            return false;
        }

        if ("manager".equalsIgnoreCase(user.role())) {
            return true;
        }

        return "staff".equalsIgnoreCase(user.role())
                && !text(user.employeeId()).isBlank()
                && text(user.employeeId()).equals(
                        text(record.get("employee_id")));
    }

    private String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }
}