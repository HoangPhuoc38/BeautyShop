package com.beautyshop.data.service;

import com.beautyshop.auth.dto.LoginResponse;
import com.beautyshop.couchdb.CouchDbClient;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.*;

class DataBackupServiceTest {

    @TempDir
    Path tempBackupDir;

    private CouchDbClient couchDb;
    private DataBackupService service;
    private LoginResponse.UserInfo adminUser;
    private LoginResponse.UserInfo managerBranch1;

    @BeforeEach
    void setUp() {
        couchDb = mock(CouchDbClient.class);
        service = new DataBackupService(
                couchDb,
                "beauty_shop",
                tempBackupDir.toString()
        );
        adminUser = new LoginResponse.UserInfo(
                "usr001", "EMP001", "admin", "Admin", "admin", "BR001", false
        );
        managerBranch1 = new LoginResponse.UserInfo(
                "usr002", "EMP002", "manager1", "Manager", "manager", "BR001", false
        );
    }

    @Test
    void fullBackupExcludesDesignDocsAndUsersByDefaultAndSavesSnapshot() {
        when(couchDb.getAllDocuments()).thenReturn(List.of(
                doc("_design/idx", null, Map.of()),
                doc("prd001", "product", Map.of("_rev", "1-a", "product_id", "PRD001", "name", "Son")),
                doc("usr001", "user", Map.of("_rev", "1-b", "username", "admin", "password_hash", "hash"))
        ));

        Map<String, Object> backup = service.createFullBackup(false, true, adminUser);

        assertEquals(DataBackupService.FULL_BACKUP_FORMAT, backup.get("format"));
        assertEquals(1, backup.get("total_documents"));
        assertNotNull(backup.get("server_file"));
        assertTrue(Files.exists(tempBackupDir.resolve(String.valueOf(backup.get("server_file")))));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> docs = (List<Map<String, Object>>) backup.get("documents");
        assertEquals("prd001", docs.get(0).get("_id"));
        assertFalse(docs.get(0).containsKey("_rev"));
        assertEquals(1, service.listServerBackups().size());
    }

    @Test
    void restoreReplaceCreatesSafetyBackupPreservesUsersAndActorAndDeletesObsoleteDocs() {
        when(couchDb.getAllDocuments()).thenReturn(List.of(
                doc("prd_old", "product", Map.of("_rev", "2-old", "product_id", "PRD999")),
                doc("prd001", "product", Map.of("_rev", "3-cur", "product_id", "PRD001")),
                doc("usr001", "user", Map.of("_rev", "1-u", "username", "admin", "role", "admin", "status", "active", "password_hash", "h"))
        ));
        when(couchDb.bulkDocuments(anyList())).thenReturn(List.of(
                Map.of("id", "prd001", "ok", true, "rev", "4-new"),
                Map.of("id", "prd_new", "ok", true, "rev", "1-new"),
                Map.of("id", "prd_old", "ok", true, "rev", "3-del")
        ));

        Map<String, Object> payload = Map.of(
                "format", DataBackupService.FULL_BACKUP_FORMAT,
                "version", 1,
                "documents", List.of(
                        Map.of("_id", "prd001", "type", "product", "product_id", "PRD001", "name", "Updated"),
                        Map.of("_id", "prd_new", "type", "product", "product_id", "PRD002", "name", "New")
                )
        );

        Map<String, Object> result = service.restoreFullBackup(payload, "replace", adminUser);

        assertEquals(true, result.get("success"));
        assertEquals(1, result.get("created"));
        assertEquals(1, result.get("updated"));
        assertEquals(1, result.get("deleted"));
        assertNotNull(result.get("pre_restore_backup"));

        verify(couchDb).bulkDocuments(argThat(batch -> {
            boolean updatesPrd001WithLiveRev = batch.stream().anyMatch(d ->
                    "prd001".equals(d.get("_id")) && "3-cur".equals(d.get("_rev")));
            boolean deletesPrdOld = batch.stream().anyMatch(d ->
                    "prd_old".equals(d.get("_id")) && Boolean.TRUE.equals(d.get("_deleted")));
            boolean keepsUserUntouched = batch.stream().noneMatch(d ->
                    "usr001".equals(d.get("_id")) && Boolean.TRUE.equals(d.get("_deleted")));
            return updatesPrd001WithLiveRev && deletesPrdOld && keepsUserUntouched;
        }));
    }

    @Test
    void importProductsSupportsDryRunAndCsvRoundTrip() {
        when(couchDb.getAllDocuments()).thenReturn(List.of(
                doc("prd001", "product", Map.of(
                        "_rev", "1-a",
                        "product_id", "PRD001",
                        "name", "Son cũ",
                        "category", "lipstick",
                        "price", 100000,
                        "stock", 5,
                        "status", "active"
                ))
        ));

        String csv = "product_id,name,category,price,stock,status\n"
                + "PRD001,Son mới cập nhật,lipstick,120000,10,active\n"
                + ",Kem dưỡng da,skincare,250000,15,active\n";

        Map<String, Object> dryRun = service.importEntity(
                "products",
                "products.csv",
                csv.getBytes(StandardCharsets.UTF_8),
                "upsert",
                true,
                managerBranch1
        );

        assertEquals(true, dryRun.get("success"));
        assertEquals(1, dryRun.get("created"));
        assertEquals(1, dryRun.get("updated"));
        assertEquals(0, dryRun.get("error_count"));
        verify(couchDb, never()).bulkDocuments(anyList());

        when(couchDb.bulkDocuments(anyList())).thenReturn(List.of(
                Map.of("id", "prd001", "ok", true),
                Map.of("id", "prd002", "ok", true)
        ));

        Map<String, Object> committed = service.importEntity(
                "products",
                "products.csv",
                csv.getBytes(StandardCharsets.UTF_8),
                "upsert",
                false,
                managerBranch1
        );

        assertEquals(true, committed.get("success"));
        assertEquals(1, committed.get("created"));
        assertEquals(1, committed.get("updated"));
        verify(couchDb).bulkDocuments(argThat(batch ->
                batch.size() == 2
                        && batch.stream().anyMatch(d -> "prd002".equals(d.get("_id"))
                                && "PRD002".equals(d.get("product_id")))
        ));
    }

    @Test
    void importRejectsInvalidRowsWithoutWritingToDatabase() {
        when(couchDb.getAllDocuments()).thenReturn(List.of());

        String csv = "product_id,name,category,price,stock,status\n"
                + "PRD001,,invalid_cat,-10,2,active\n";

        Map<String, Object> result = service.importEntity(
                "products",
                "bad.csv",
                csv.getBytes(StandardCharsets.UTF_8),
                "upsert",
                false,
                adminUser
        );

        assertEquals(false, result.get("success"));
        assertEquals(1, result.get("error_count"));
        verify(couchDb, never()).bulkDocuments(anyList());
    }

    @Test
    void exportInvoicesScopesManagerToBranchAndStripsRev() {
        when(couchDb.getAllDocuments()).thenReturn(List.of(
                doc("hd001", "invoice", Map.of("_rev", "1-x", "invoice_id", "HD001", "branch_id", "BR001", "total", 100000)),
                doc("hd002", "invoice", Map.of("_rev", "1-y", "invoice_id", "HD002", "branch_id", "BR002", "total", 200000))
        ));

        byte[] csvBytes = service.exportEntity("invoices", "csv", managerBranch1);
        String csv = new String(csvBytes, StandardCharsets.UTF_8);

        assertTrue(csv.contains("HD001"));
        assertFalse(csv.contains("HD002"));
        assertFalse(csv.contains("1-x"));
    }

    private Map<String, Object> doc(String id, String type, Map<String, Object> extra) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("_id", id);
        if (type != null) {
            map.put("type", type);
        }
        map.putAll(extra);
        return map;
    }
}
