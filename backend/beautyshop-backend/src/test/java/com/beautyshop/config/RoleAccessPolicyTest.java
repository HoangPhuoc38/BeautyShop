package com.beautyshop.config;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RoleAccessPolicyTest {

    private final RoleAccessPolicy policy = new RoleAccessPolicy();

    @Test
    void staffCanCreateOrdersAndConfirmCashButNotBankTransfers() {
        assertTrue(policy.isAllowed(
                "staff", "POST", "/api/invoices", null));
        assertTrue(policy.isAllowed(
                "staff", "POST", "/api/payments/invoices/HD001/confirm", "cash"));
        assertFalse(policy.isAllowed(
                "staff", "POST", "/api/payments/invoices/HD001/confirm", "bank_transfer"));
    }

    @Test
    void managersCanManageCatalogButCannotManageAccountsOrEmployees() {
        assertTrue(policy.isAllowed(
                "manager", "PUT", "/api/products/prd001", null));
        assertFalse(policy.isAllowed(
                "manager", "POST", "/api/users", null));
        assertFalse(policy.isAllowed(
                "manager", "PUT", "/api/employees/employee:1", null));
    }

    @Test
    void onlyAdminCanRecalculateLoyalty() {
        assertFalse(policy.isAllowed(
                "manager", "POST", "/api/loyalty/recalculate", null));
        assertTrue(policy.isAllowed(
                "admin", "POST", "/api/loyalty/recalculate", null));
        assertFalse(policy.isAllowed(
                "staff", "GET", "/api/loyalty/customers", null));
        assertTrue(policy.isAllowed(
                "manager", "GET", "/api/loyalty/customers", null));
    }

    @Test
    void staffCanManageCustomersAndAppointmentsButCannotDeleteThem() {
        assertTrue(policy.isAllowed(
                "staff", "POST", "/api/customers", null));
        assertTrue(policy.isAllowed(
                "staff", "PUT", "/api/customers/cus001", null));
        assertFalse(policy.isAllowed(
                "staff", "DELETE", "/api/customers/cus001", null));
        assertTrue(policy.isAllowed(
                "staff", "POST", "/api/appointments", null));
        assertTrue(policy.isAllowed(
                "staff", "PUT", "/api/appointments/apt001", null));
        assertFalse(policy.isAllowed(
                "staff", "DELETE", "/api/appointments/apt001", null));
    }

    @Test
    void managersCanCancelPendingInvoicesAndManageCustomersButNotEmployees() {
        assertTrue(policy.isAllowed(
                "manager", "POST", "/api/payments/invoices/HD001/cancel", null));
        assertTrue(policy.isAllowed(
                "manager", "DELETE", "/api/customers/cus001", null));
        assertFalse(policy.isAllowed(
                "manager", "DELETE", "/api/employees/employee:1", null));
    }

    @Test
    void dataBackupAndImportPermissionsEnforceRoleBoundaries() {
        assertTrue(policy.isAllowed("admin", "GET", "/api/data/backup", null));
        assertTrue(policy.isAllowed("admin", "POST", "/api/data/restore", null));
        assertTrue(policy.isAllowed("admin", "POST", "/api/data/import/employees", null));

        assertFalse(policy.isAllowed("manager", "GET", "/api/data/backup", null));
        assertFalse(policy.isAllowed("manager", "POST", "/api/data/restore", null));
        assertFalse(policy.isAllowed("manager", "GET", "/api/data/backups", null));
        assertFalse(policy.isAllowed("manager", "POST", "/api/data/import/employees", null));
        assertTrue(policy.isAllowed("manager", "GET", "/api/data/overview", null));
        assertTrue(policy.isAllowed("manager", "GET", "/api/data/export/products", null));
        assertTrue(policy.isAllowed("manager", "GET", "/api/data/export/invoices", null));
        assertTrue(policy.isAllowed("manager", "POST", "/api/data/import/products", null));
        assertTrue(policy.isAllowed("manager", "POST", "/api/data/import/customers", null));

        assertFalse(policy.isAllowed("staff", "GET", "/api/data/overview", null));
        assertFalse(policy.isAllowed("staff", "GET", "/api/data/export/products", null));
        assertFalse(policy.isAllowed("staff", "POST", "/api/data/import/products", null));
    }
}