package com.beautyshop.auth.service;

import com.beautyshop.couchdb.CouchDbClient;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UserAccountServiceTest {

    private CouchDbClient couchDb;
    private UserAccountService accountService;

    @BeforeEach
    void setUp() {
        couchDb = mock(CouchDbClient.class);
        accountService = new UserAccountService(couchDb);
    }

    @Test
    void createsHashedAccountAndRequiresPasswordChange() {
        Map<String, Object> employee = employee();
        when(couchDb.getAllDocuments()).thenReturn(List.of(employee));
        when(couchDb.saveDocument(anyString(), anyMap()))
                .thenAnswer(invocation -> invocation.getArgument(1));

        Map<String, Object> result = accountService.createAccount(Map.of(
                "employee_id", "EMP001",
                "temporary_password", "TempPass123!"
        ));

        assertEquals("usr001", result.get("_id"));
        assertEquals("USR001", result.get("user_id"));
        assertEquals("phuong", result.get("username"));
        assertEquals("admin", result.get("role"));
        assertEquals(true, result.get("must_change_password"));
        assertFalse(result.containsKey("password_hash"));

        verify(couchDb).saveDocument(anyString(), org.mockito.ArgumentMatchers.argThat(
                document -> new BCryptPasswordEncoder().matches(
                        "TempPass123!",
                        String.valueOf(document.get("password_hash"))
                )
        ));
    }

    @Test
    void accountListNeverReturnsPasswordHash() {
        Map<String, Object> employee = employee();
        Map<String, Object> account = new HashMap<>();
        account.put("_id", "user:1");
        account.put("type", "user");
        account.put("username", "phuong");
        account.put("employee_id", "EMP001");
        account.put("role", "admin");
        account.put("status", "active");
        account.put("password_hash", "hash-secret");

        when(couchDb.getAllDocuments()).thenReturn(List.of(employee, account));

        List<Map<String, Object>> accounts = accountService.getAccounts();

        assertEquals(1, accounts.size());
        assertEquals("Phuong Nguyen", accounts.get(0).get("employee_name"));
        assertFalse(accounts.get(0).containsKey("password_hash"));
    }

    @Test
    void cannotDeactivateTheLastActiveAdministrator() {
        Map<String, Object> account = new HashMap<>();
        account.put("_id", "user:1");
        account.put("type", "user");
        account.put("username", "admin");
        account.put("role", "admin");
        account.put("status", "active");
        when(couchDb.getDocument("user:1")).thenReturn(account);
        when(couchDb.getAllDocuments()).thenReturn(List.of(account));

        assertThrows(
                ResponseStatusException.class,
                () -> accountService.updateAccount(
                        "user:1",
                        Map.of("status", "inactive"),
                        "another-admin"
                )
        );
    }

    private Map<String, Object> employee() {
        Map<String, Object> employee = new HashMap<>();
        employee.put("_id", "employee:1");
        employee.put("type", "employee");
        employee.put("employee_id", "EMP001");
        employee.put("full_name", "Phuong Nguyen");
        employee.put("username", "phuong");
        employee.put("role", "admin");
        employee.put("branch_id", "BR001");
        employee.put("status", "active");
        return employee;
    }
}