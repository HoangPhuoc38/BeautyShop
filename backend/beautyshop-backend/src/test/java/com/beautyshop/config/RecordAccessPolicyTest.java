package com.beautyshop.config;

import com.beautyshop.auth.dto.LoginResponse;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RecordAccessPolicyTest {

    private final RecordAccessPolicy policy = new RecordAccessPolicy();

    @Test
    void managerCanOnlyAccessRecordsFromTheirBranch() {
        LoginResponse.UserInfo manager = user("manager", "EMP10", "BR01");

        assertTrue(policy.canAccess(manager, record("EMP20", "BR01")));
        assertFalse(policy.canAccess(manager, record("EMP20", "BR02")));
    }

    @Test
    void staffCanOnlyAccessTheirOwnAssignedRecords() {
        LoginResponse.UserInfo staff = user("staff", "EMP10", "BR01");

        assertTrue(policy.canAccess(staff, record("EMP10", "BR01")));
        assertFalse(policy.canAccess(staff, record("EMP20", "BR01")));
        assertFalse(policy.canAccess(staff, record("EMP10", "BR02")));
    }

    @Test
    void adminCanAccessAnyBranch() {
        LoginResponse.UserInfo admin = user("admin", "EMP10", "BR01");

        assertTrue(policy.canAccess(admin, record("EMP20", "BR02")));
    }

    private LoginResponse.UserInfo user(
            String role,
            String employeeId,
            String branchId) {
        return new LoginResponse.UserInfo(
                "user:1",
                employeeId,
                "staff",
                "Test User",
                role,
                branchId,
                false
        );
    }

    private Map<String, Object> record(String employeeId, String branchId) {
        return Map.of(
                "employee_id", employeeId,
                "branch_id", branchId
        );
    }
}