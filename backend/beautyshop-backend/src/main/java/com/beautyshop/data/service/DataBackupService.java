package com.beautyshop.data.service;

import com.beautyshop.auth.dto.LoginResponse;
import com.beautyshop.config.RecordAccessPolicy;
import com.beautyshop.couchdb.CouchDbClient;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.regex.Pattern;

@Service
public class DataBackupService {

    public static final String FULL_BACKUP_FORMAT = "beautyshop_full_backup";
    public static final String ENTITY_EXPORT_FORMAT = "beautyshop_entity_export";
    public static final int FORMAT_VERSION = 1;

    private static final DateTimeFormatter FILE_TS_FORMATTER =
            DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss")
                    .withZone(ZoneId.systemDefault());

    private static final Pattern SAFE_FILENAME =
            Pattern.compile("^[a-zA-Z0-9._-]+\\.json$");

    private static final Pattern EMAIL_REGEX =
            Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

    private static final Pattern PHONE_REGEX =
            Pattern.compile("^(?:0\\d{9}|\\+84\\d{9}|0000000000)$");

    private static final Set<String> BUSINESS_TYPES = Set.of(
            "product",
            "service",
            "customer",
            "employee",
            "appointment",
            "invoice",
            "invoice_item",
            "payment_transaction",
            "loyalty_transaction"
    );

    private static final Set<String> ALL_RESTORABLE_TYPES = Set.of(
            "product",
            "service",
            "customer",
            "employee",
            "appointment",
            "invoice",
            "invoice_item",
            "payment_transaction",
            "loyalty_transaction",
            "user"
    );

    private static final Set<String> PRODUCT_CATEGORIES = Set.of(
            "nail_polish", "nail_care", "skincare", "makeup",
            "lipstick", "haircare", "cosmetics", "perfume",
            "tools", "accessories", "other"
    );

    private static final Set<String> ALLOWED_STATUSES = Set.of("active", "inactive");
    private static final Set<String> ALLOWED_ROLES = Set.of("admin", "manager", "staff");
    private static final Set<String> ALLOWED_MEMBERSHIPS =
            Set.of("standard", "silver", "gold", "platinum");
    private static final Set<String> ALLOWED_APPOINTMENT_STATUSES =
            Set.of("booked", "confirmed", "completed", "cancelled");

    private static final Map<String, String> ENTITY_TO_DOC_TYPE = Map.of(
            "products", "product",
            "services", "service",
            "customers", "customer",
            "employees", "employee",
            "appointments", "appointment",
            "invoices", "invoice",
            "payments", "payment_transaction"
    );

    private static final Map<String, List<String>> ENTITY_CSV_HEADERS = Map.of(
            "products", List.of(
                    "_id", "product_id", "name", "category", "price", "stock",
                    "status", "created_at", "updated_at"),
            "services", List.of(
                    "_id", "service_id", "name", "category", "price",
                    "duration_minutes", "status"),
            "customers", List.of(
                    "_id", "customer_id", "full_name", "phone", "email",
                    "membership", "points", "rank", "created_at", "updated_at"),
            "employees", List.of(
                    "_id", "employee_id", "full_name", "username", "role",
                    "phone", "email", "status", "branch_id"),
            "appointments", List.of(
                    "_id", "appointment_id", "customer_id", "employee_id",
                    "service_ids", "branch_id", "appointment_date",
                    "start_time", "status", "note"),
            "invoices", List.of(
                    "_id", "invoice_id", "customer_id", "employee_id",
                    "appointment_id", "branch_id", "subtotal", "discount_type",
                    "discount_value", "discount_amount", "total",
                    "payment_method", "payment_status", "note",
                    "created_at", "paid_at", "cancelled_at"),
            "payments", List.of(
                    "_id", "invoice_id", "customer_id", "appointment_id",
                    "payment_method", "amount", "status",
                    "transfer_reference", "note", "created_at", "confirmed_at")
    );

    private final CouchDbClient couchDb;
    private final String database;
    private final Path backupDirectory;
    private final ObjectMapper objectMapper;
    private final RecordAccessPolicy recordAccessPolicy = new RecordAccessPolicy();

    public DataBackupService(
            CouchDbClient couchDb,
            @Value("${couchdb.database:beauty_shop}") String database,
            @Value("${beautyshop.backup.dir:../../database/backups}") String configuredBackupDir) {

        this.couchDb = couchDb;
        this.database = database;
        this.backupDirectory = resolveBackupDirectory(configuredBackupDir);
        this.objectMapper = new ObjectMapper()
                .enable(SerializationFeature.INDENT_OUTPUT);
    }

    // =====================================================
    // 1. OVERVIEW
    // =====================================================

    public Map<String, Object> getOverview(LoginResponse.UserInfo user) {
        List<Map<String, Object>> docs = getNonDesignDocuments();
        boolean isAdmin = isAdmin(user);

        Map<String, Long> counts = new LinkedHashMap<>();
        counts.put("products", countByType(docs, "product"));
        counts.put("services", countByType(docs, "service"));
        counts.put("customers", countByType(docs, "customer"));
        counts.put("employees", countByType(docs, "employee"));
        counts.put("appointments",
                filterByAccess(docs, "appointment", user).size() * 1L);

        List<Map<String, Object>> accessibleInvoices =
                filterByAccess(docs, "invoice", user);
        counts.put("invoices", (long) accessibleInvoices.size());
        counts.put("payments",
                (long) filterAccessiblePayments(docs, accessibleInvoices, user).size());

        if (isAdmin) {
            counts.put("invoice_items", countByType(docs, "invoice_item"));
            counts.put("loyalty_transactions", countByType(docs, "loyalty_transaction"));
            counts.put("users", countByType(docs, "user"));
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("database", database);
        result.put("role", normalizeRole(user));
        result.put("counts", counts);
        result.put("total_documents", isAdmin
                ? docs.size()
                : counts.values().stream().mapToLong(Long::longValue).sum());
        return result;
    }

    // =====================================================
    // 2. FULL SYSTEM BACKUP (ADMIN)
    // =====================================================

    public Map<String, Object> createFullBackup(
            boolean includeUsers,
            boolean saveToServer,
            LoginResponse.UserInfo actor) {

        List<Map<String, Object>> allDocs = getNonDesignDocuments();
        List<Map<String, Object>> backupDocs = new ArrayList<>();
        Map<String, Long> counts = new LinkedHashMap<>();

        for (Map<String, Object> doc : allDocs) {
            String type = text(doc.get("type"));
            if (type.isEmpty()) {
                continue;
            }
            if ("user".equals(type) && !includeUsers) {
                continue;
            }
            if (!ALL_RESTORABLE_TYPES.contains(type)) {
                continue;
            }

            Map<String, Object> cleanDoc = new LinkedHashMap<>(doc);
            cleanDoc.remove("_rev");
            backupDocs.add(cleanDoc);
            counts.merge(type, 1L, Long::sum);
        }

        String exportedAt = OffsetDateTime.now().toString();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("format", FULL_BACKUP_FORMAT);
        payload.put("version", FORMAT_VERSION);
        payload.put("database", database);
        payload.put("exported_at", exportedAt);
        payload.put("exported_by", actor == null ? "system" : text(actor.username()));
        payload.put("include_users", includeUsers);
        payload.put("total_documents", backupDocs.size());
        payload.put("counts", counts);
        payload.put("documents", backupDocs);

        if (saveToServer) {
            String filename = writeSnapshotFile(payload, "beautyshop-backup");
            payload.put("server_file", filename);
        }

        return payload;
    }

    public byte[] serializeJson(Map<String, Object> payload) {
        try {
            return objectMapper.writeValueAsBytes(payload);
        } catch (IOException ex) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Không thể tạo file JSON sao lưu: " + ex.getMessage()
            );
        }
    }

    // =====================================================
    // 3. SERVER SNAPSHOTS (database/backups/)
    // =====================================================

    public List<Map<String, Object>> listServerBackups() {
        ensureBackupDirExists();
        List<Map<String, Object>> items = new ArrayList<>();

        try (var stream = Files.list(backupDirectory)) {
            List<Path> files = stream
                    .filter(Files::isRegularFile)
                    .filter(path -> SAFE_FILENAME.matcher(
                            path.getFileName().toString()).matches())
                    .sorted(Comparator.comparingLong(this::lastModifiedMillis)
                            .reversed())
                    .toList();

            for (Path file : files) {
                items.add(readBackupMetadata(file));
            }
        } catch (IOException ex) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Không thể đọc thư mục sao lưu: " + ex.getMessage()
            );
        }

        return items;
    }

    public byte[] readServerBackupBytes(String filename) {
        Path file = resolveSafeBackupFile(filename);
        if (!Files.exists(file)) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Không tìm thấy file sao lưu: " + filename
            );
        }

        try {
            return Files.readAllBytes(file);
        } catch (IOException ex) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Không thể đọc file sao lưu: " + ex.getMessage()
            );
        }
    }

    public void deleteServerBackup(String filename) {
        Path file = resolveSafeBackupFile(filename);
        if (!Files.exists(file)) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Không tìm thấy file sao lưu: " + filename
            );
        }

        try {
            Files.delete(file);
        } catch (IOException ex) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Không thể xóa file sao lưu: " + ex.getMessage()
            );
        }
    }

    public Map<String, Object> restoreFromServerBackup(
            String filename,
            String mode,
            LoginResponse.UserInfo actor) {

        byte[] bytes = readServerBackupBytes(filename);
        Map<String, Object> payload = parseJsonObject(bytes);
        Map<String, Object> result = restoreFullBackup(payload, mode, actor);
        result.put("source_file", filename);
        return result;
    }

    // =====================================================
    // 4. FULL SYSTEM RESTORE (ADMIN)
    // =====================================================

    @SuppressWarnings("unchecked")
    public Map<String, Object> restoreFullBackup(
            Map<String, Object> payload,
            String modeParam,
            LoginResponse.UserInfo actor) {

        if (payload == null) {
            throw badRequest("Dữ liệu khôi phục không hợp lệ.");
        }

        String format = text(payload.get("format"));
        int version = intValue(payload.get("version"), -1);
        Object docsObj = payload.get("documents");

        if (!FULL_BACKUP_FORMAT.equals(format)
                || version != FORMAT_VERSION
                || !(docsObj instanceof List<?> rawDocs)) {
            throw badRequest(
                    "File không đúng định dạng Full Backup BeautyShop (version 1)."
            );
        }

        if (rawDocs.isEmpty()) {
            throw badRequest("File sao lưu không có document nào.");
        }

        String mode = normalizeRestoreMode(modeParam);
        List<Map<String, Object>> validatedDocs = new ArrayList<>();
        Set<String> incomingIds = new HashSet<>();
        boolean backupContainsUsers = false;

        for (int i = 0; i < rawDocs.size(); i++) {
            Object item = rawDocs.get(i);
            if (!(item instanceof Map<?, ?> rawMap)) {
                throw badRequest("Document thứ " + (i + 1) + " không hợp lệ.");
            }

            Map<String, Object> doc = copyStringKeyMap(rawMap);
            String id = text(doc.get("_id"));
            String type = text(doc.get("type"));

            if (id.isEmpty() || id.startsWith("_design/")) {
                throw badRequest(
                        "Document thứ " + (i + 1) + " có _id không hợp lệ."
                );
            }
            if (!ALL_RESTORABLE_TYPES.contains(type)) {
                throw badRequest(
                        "Document " + id + " có type không được hỗ trợ: " + type
                );
            }
            if (!incomingIds.add(id)) {
                throw badRequest(
                        "File sao lưu chứa _id bị trùng lặp: " + id
                );
            }

            if ("user".equals(type)) {
                backupContainsUsers = true;
                validateRestoredUser(doc);
                if (actor != null && id.equals(actor.id())) {
                    // Never lock out the admin currently executing restore.
                    doc.put("role", "admin");
                    doc.put("status", "active");
                }
            }

            doc.remove("_rev");
            validatedDocs.add(doc);
        }

        List<Map<String, Object>> existingDocs = getNonDesignDocuments();
        Map<String, Map<String, Object>> existingById = new LinkedHashMap<>();
        for (Map<String, Object> existing : existingDocs) {
            existingById.put(text(existing.get("_id")), existing);
        }

        String preRestoreBackupFile = null;
        if ("replace".equals(mode) && !existingDocs.isEmpty()) {
            Map<String, Object> safetySnapshot =
                    createFullBackup(true, false, actor);
            preRestoreBackupFile =
                    writeSnapshotFile(safetySnapshot, "pre-restore-safety");
        }

        List<Map<String, Object>> bulkBatch = new ArrayList<>();
        int expectedCreated = 0;
        int expectedUpdated = 0;
        int expectedDeleted = 0;

        for (Map<String, Object> doc : validatedDocs) {
            String id = text(doc.get("_id"));
            Map<String, Object> existing = existingById.get(id);
            if (existing != null) {
                doc.put("_rev", text(existing.get("_rev")));
                expectedUpdated++;
            } else {
                expectedCreated++;
            }
            bulkBatch.add(doc);
        }

        if ("replace".equals(mode)) {
            for (Map<String, Object> existing : existingDocs) {
                String id = text(existing.get("_id"));
                String type = text(existing.get("type"));

                if (incomingIds.contains(id)) {
                    continue;
                }
                if ("user".equals(type) && !backupContainsUsers) {
                    continue;
                }
                if ("user".equals(type) && actor != null && id.equals(actor.id())) {
                    continue;
                }

                Map<String, Object> tombstone = new LinkedHashMap<>();
                tombstone.put("_id", id);
                tombstone.put("_rev", text(existing.get("_rev")));
                tombstone.put("_deleted", true);
                bulkBatch.add(tombstone);
                expectedDeleted++;
            }
        }

        List<Map<String, Object>> bulkResults = couchDb.bulkDocuments(bulkBatch);
        List<Map<String, Object>> errors = collectBulkErrors(bulkResults);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("success", errors.isEmpty());
        response.put("mode", mode);
        response.put("total_in_backup", validatedDocs.size());
        response.put("created", expectedCreated);
        response.put("updated", expectedUpdated);
        response.put("deleted", expectedDeleted);
        response.put("error_count", errors.size());
        response.put("errors", errors);
        if (preRestoreBackupFile != null) {
            response.put("pre_restore_backup", preRestoreBackupFile);
        }
        response.put("message", errors.isEmpty()
                ? String.format(
                        "Khôi phục thành công (%s): tạo mới %d, cập nhật %d, xóa %d document.",
                        mode, expectedCreated, expectedUpdated, expectedDeleted)
                : "Khôi phục hoàn tất với " + errors.size() + " lỗi.");
        return response;
    }

    // =====================================================
    // 5. ENTITY EXPORT (JSON / CSV)
    // =====================================================

    public byte[] exportEntity(
            String entity,
            String formatParam,
            LoginResponse.UserInfo user) {

        String normalizedEntity = normalizeExportEntity(entity);
        String format = normalizeFormat(formatParam);
        String docType = ENTITY_TO_DOC_TYPE.get(normalizedEntity);

        List<Map<String, Object>> docs = getNonDesignDocuments();
        List<Map<String, Object>> records;

        if ("appointments".equals(normalizedEntity)
                || "invoices".equals(normalizedEntity)) {
            records = filterByAccess(docs, docType, user);
        } else if ("payments".equals(normalizedEntity)) {
            List<Map<String, Object>> accessibleInvoices =
                    filterByAccess(docs, "invoice", user);
            records = filterAccessiblePayments(docs, accessibleInvoices, user);
        } else {
            records = docs.stream()
                    .filter(doc -> docType.equals(text(doc.get("type"))))
                    .toList();
        }

        List<Map<String, Object>> sanitized = new ArrayList<>(records.size());
        for (Map<String, Object> record : records) {
            Map<String, Object> copy = new LinkedHashMap<>(record);
            copy.remove("_rev");
            if ("employee".equals(docType)) {
                copy.remove("password");
                copy.remove("password_hash");
                copy.remove("token");
            }
            sanitized.add(copy);
        }

        sortRecords(normalizedEntity, sanitized);

        if ("csv".equals(format)) {
            List<String> headers = ENTITY_CSV_HEADERS.get(normalizedEntity);
            return CsvCodec.encode(headers, sanitized);
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("format", ENTITY_EXPORT_FORMAT);
        payload.put("entity", normalizedEntity);
        payload.put("version", FORMAT_VERSION);
        payload.put("exported_at", OffsetDateTime.now().toString());
        payload.put("total", sanitized.size());
        payload.put("records", sanitized);
        return serializeJson(payload);
    }

    public byte[] generateTemplate(String entity, String formatParam) {
        String normalizedEntity = normalizeImportEntity(entity);
        String format = normalizeFormat(formatParam);
        List<Map<String, Object>> sampleRows = sampleRowsForEntity(normalizedEntity);

        if ("csv".equals(format)) {
            return CsvCodec.encode(
                    ENTITY_CSV_HEADERS.get(normalizedEntity),
                    sampleRows
            );
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("format", ENTITY_EXPORT_FORMAT);
        payload.put("entity", normalizedEntity);
        payload.put("version", FORMAT_VERSION);
        payload.put("total", sampleRows.size());
        payload.put("records", sampleRows);
        return serializeJson(payload);
    }

    // =====================================================
    // 6. ENTITY IMPORT (JSON / CSV, DRY-RUN + COMMIT)
    // =====================================================

    public Map<String, Object> importEntity(
            String entity,
            String filename,
            byte[] fileBytes,
            String modeParam,
            boolean dryRun,
            LoginResponse.UserInfo actor) {

        String normalizedEntity = normalizeImportEntity(entity);
        String mode = normalizeImportMode(modeParam);

        if (fileBytes == null || fileBytes.length == 0) {
            throw badRequest("File tải lên trống.");
        }

        List<Map<String, Object>> rawRecords = parseUploadedRecords(
                normalizedEntity,
                filename,
                fileBytes
        );

        if (rawRecords.isEmpty()) {
            throw badRequest("File không chứa bản ghi nào để nhập.");
        }

        List<Map<String, Object>> allDocs = getNonDesignDocuments();
        String docType = ENTITY_TO_DOC_TYPE.get(normalizedEntity);
        List<Map<String, Object>> existingTypedDocs = allDocs.stream()
                .filter(doc -> docType.equals(text(doc.get("type"))))
                .toList();

        ImportContext context = buildImportContext(
                normalizedEntity,
                existingTypedDocs,
                allDocs
        );

        List<Map<String, Object>> toSave = new ArrayList<>();
        List<Map<String, Object>> preview = new ArrayList<>();
        List<Map<String, Object>> errors = new ArrayList<>();

        int created = 0;
        int updated = 0;
        int skipped = 0;

        for (int index = 0; index < rawRecords.size(); index++) {
            int rowNumber = index + 1;
            Map<String, Object> raw = rawRecords.get(index);

            try {
                ImportDecision decision = normalizeAndPrepareRecord(
                        normalizedEntity,
                        raw,
                        mode,
                        context,
                        actor
                );

                if (decision.action() == ImportAction.SKIP) {
                    skipped++;
                    continue;
                }

                if (decision.action() == ImportAction.CREATE) {
                    created++;
                } else {
                    updated++;
                }

                toSave.add(decision.document());
                if (preview.size() < 10) {
                    Map<String, Object> previewItem = new LinkedHashMap<>(decision.document());
                    previewItem.remove("_rev");
                    previewItem.put("_import_action",
                            decision.action().name().toLowerCase(Locale.ROOT));
                    preview.add(previewItem);
                }
            } catch (IllegalArgumentException ex) {
                Map<String, Object> err = new LinkedHashMap<>();
                err.put("row", rowNumber);
                err.put("message", ex.getMessage());
                errors.add(err);
            }
        }

        if (!dryRun && !errors.isEmpty()) {
            Map<String, Object> failure = new LinkedHashMap<>();
            failure.put("success", false);
            failure.put("dry_run", false);
            failure.put("entity", normalizedEntity);
            failure.put("error_count", errors.size());
            failure.put("errors", errors);
            failure.put("message",
                    "Import bị hủy vì có " + errors.size()
                            + " dòng dữ liệu không hợp lệ.");
            return failure;
        }

        List<Map<String, Object>> bulkErrors = List.of();
        if (!dryRun && !toSave.isEmpty()) {
            List<Map<String, Object>> bulkResults = couchDb.bulkDocuments(toSave);
            bulkErrors = collectBulkErrors(bulkResults);
        }

        List<Map<String, Object>> combinedErrors = new ArrayList<>(errors);
        combinedErrors.addAll(bulkErrors);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("success", combinedErrors.isEmpty());
        response.put("dry_run", dryRun);
        response.put("entity", normalizedEntity);
        response.put("mode", mode);
        response.put("total_rows", rawRecords.size());
        response.put("valid_rows", created + updated + skipped);
        response.put("created", created);
        response.put("updated", updated);
        response.put("skipped", skipped);
        response.put("error_count", combinedErrors.size());
        response.put("errors", combinedErrors);
        response.put("preview", preview);
        response.put("message", buildImportMessage(
                dryRun, created, updated, skipped, combinedErrors.size()));
        return response;
    }

    // =====================================================
    // IMPORT RECORD PARSING & VALIDATION
    // =====================================================

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> parseUploadedRecords(
            String entity,
            String filename,
            byte[] bytes) {

        String lowerName = filename == null
                ? ""
                : filename.trim().toLowerCase(Locale.ROOT);
        String content = new String(bytes, StandardCharsets.UTF_8);

        boolean looksLikeJson = lowerName.endsWith(".json")
                || content.trim().startsWith("{")
                || content.trim().startsWith("[");

        if (looksLikeJson && !lowerName.endsWith(".csv")) {
            return extractRecordsFromJson(entity, content);
        }

        List<Map<String, String>> csvRows = CsvCodec.parse(content);
        List<Map<String, Object>> records = new ArrayList<>(csvRows.size());
        for (Map<String, String> row : csvRows) {
            records.add(new LinkedHashMap<>(row));
        }
        return records;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> extractRecordsFromJson(
            String entity,
            String content) {
        try {
            Object parsed = objectMapper.readValue(content, Object.class);
            if (parsed instanceof List<?> list) {
                return toRecordList(list);
            }

            if (parsed instanceof Map<?, ?> map) {
                // Support standard BeautyShop export AND legacy page backups
                for (String key : List.of("records", entity, "data", "documents")) {
                    Object candidate = map.get(key);
                    if (candidate instanceof List<?> list) {
                        return toRecordList(list);
                    }
                }
                throw badRequest(
                        "File JSON không chứa danh sách bản ghi hợp lệ cho " + entity + "."
                );
            }

            throw badRequest("Cấu trúc file JSON không hợp lệ.");
        } catch (IOException ex) {
            throw badRequest("Không thể đọc file JSON: " + ex.getMessage());
        }
    }

    private List<Map<String, Object>> toRecordList(List<?> rawList) {
        List<Map<String, Object>> list = new ArrayList<>(rawList.size());
        for (int i = 0; i < rawList.size(); i++) {
            Object item = rawList.get(i);
            if (!(item instanceof Map<?, ?> map)) {
                throw badRequest("Bản ghi thứ " + (i + 1) + " không phải JSON object.");
            }
            list.add(copyStringKeyMap(map));
        }
        return list;
    }

    private ImportContext buildImportContext(
            String entity,
            List<Map<String, Object>> existingDocs,
            List<Map<String, Object>> allDocs) {

        Map<String, Map<String, Object>> byDocId = new LinkedHashMap<>();
        Map<String, Map<String, Object>> byBusinessId = new LinkedHashMap<>();
        Map<String, String> existingUsernames = new HashMap<>();
        Map<String, String> existingEmails = new HashMap<>();

        String codeField = businessCodeField(entity);
        String prefix = businessCodePrefix(entity);
        int maxCodeNumber = 0;

        for (Map<String, Object> doc : existingDocs) {
            String docId = text(doc.get("_id"));
            String code = text(doc.get(codeField));
            if (!docId.isEmpty()) {
                byDocId.put(docId, doc);
            }
            if (!code.isEmpty()) {
                byBusinessId.put(code.toLowerCase(Locale.ROOT), doc);
                if (code.toUpperCase(Locale.ROOT).startsWith(prefix)) {
                    String suffix = code.substring(prefix.length());
                    if (suffix.matches("\\d+")) {
                        try {
                            maxCodeNumber = Math.max(
                                    maxCodeNumber,
                                    Integer.parseInt(suffix));
                        } catch (NumberFormatException ignored) {
                        }
                    }
                }
            }

            if ("employees".equals(entity)) {
                String username = text(doc.get("username")).toLowerCase(Locale.ROOT);
                String email = text(doc.get("email")).toLowerCase(Locale.ROOT);
                if (!username.isEmpty()) {
                    existingUsernames.put(username, docId);
                }
                if (!email.isEmpty()) {
                    existingEmails.put(email, docId);
                }
            }
        }

        Set<String> validCustomers = new HashSet<>();
        Set<String> validEmployees = new HashSet<>();
        if ("appointments".equals(entity)) {
            for (Map<String, Object> doc : allDocs) {
                if ("customer".equals(doc.get("type"))) {
                    validCustomers.add(text(doc.get("customer_id")));
                    validCustomers.add(text(doc.get("_id")));
                }
                if ("employee".equals(doc.get("type"))) {
                    validEmployees.add(text(doc.get("employee_id")));
                    validEmployees.add(text(doc.get("_id")));
                }
            }
        }

        return new ImportContext(
                byDocId,
                byBusinessId,
                existingUsernames,
                existingEmails,
                validCustomers,
                validEmployees,
                maxCodeNumber
        );
    }

    private ImportDecision normalizeAndPrepareRecord(
            String entity,
            Map<String, Object> raw,
            String mode,
            ImportContext ctx,
            LoginResponse.UserInfo actor) {

        String incomingDocId = text(raw.get("_id"));
        String codeField = businessCodeField(entity);
        String incomingCode = text(raw.get(codeField));

        if (incomingDocId.startsWith("_design/")) {
            throw new IllegalArgumentException("_id không được bắt đầu bằng _design/.");
        }

        Map<String, Object> existing = null;
        if (!incomingDocId.isEmpty()) {
            existing = ctx.byDocId.get(incomingDocId);
        }
        if (existing == null && !incomingCode.isEmpty()) {
            existing = ctx.byBusinessId.get(incomingCode.toLowerCase(Locale.ROOT));
        }

        if (existing != null && "skip_existing".equals(mode)) {
            return new ImportDecision(ImportAction.SKIP, null);
        }
        if (existing == null && "update_only".equals(mode)) {
            return new ImportDecision(ImportAction.SKIP, null);
        }

        String resolvedCode = !incomingCode.isEmpty()
                ? incomingCode
                : existing != null && !text(existing.get(codeField)).isEmpty()
                ? text(existing.get(codeField))
                : ctx.nextCode(businessCodePrefix(entity));

        String resolvedDocId = existing != null
                ? text(existing.get("_id"))
                : !incomingDocId.isEmpty()
                ? incomingDocId
                : resolvedCode.toLowerCase(Locale.ROOT);

        if (!ctx.seenDocIds.add(resolvedDocId)) {
            throw new IllegalArgumentException(
                    "Bản ghi bị trùng _id trong file: " + resolvedDocId);
        }
        if (!ctx.seenCodes.add(resolvedCode.toLowerCase(Locale.ROOT))) {
            throw new IllegalArgumentException(
                    "Bản ghi bị trùng " + codeField + " trong file: " + resolvedCode);
        }

        Map<String, Object> prepared = switch (entity) {
            case "products" -> prepareProduct(resolvedDocId, resolvedCode, raw, existing);
            case "services" -> prepareService(resolvedDocId, resolvedCode, raw, existing);
            case "customers" -> prepareCustomer(resolvedDocId, resolvedCode, raw, existing);
            case "employees" -> prepareEmployee(resolvedDocId, resolvedCode, raw, existing, ctx);
            case "appointments" -> prepareAppointment(
                    resolvedDocId, resolvedCode, raw, existing, ctx, actor);
            default -> throw new IllegalArgumentException("Phân hệ không hỗ trợ import: " + entity);
        };

        if (existing != null) {
            prepared.put("_rev", text(existing.get("_rev")));
            return new ImportDecision(ImportAction.UPDATE, prepared);
        }

        return new ImportDecision(ImportAction.CREATE, prepared);
    }

    private Map<String, Object> prepareProduct(
            String docId,
            String code,
            Map<String, Object> raw,
            Map<String, Object> existing) {

        String name = text(raw.get("name"));
        if (name.isEmpty() || name.length() > 150) {
            throw new IllegalArgumentException("Tên sản phẩm phải từ 1 đến 150 ký tự.");
        }

        String category = text(raw.get("category")).toLowerCase(Locale.ROOT);
        if ("hair_care".equals(category)) {
            category = "haircare";
        }
        if (!PRODUCT_CATEGORIES.contains(category)) {
            throw new IllegalArgumentException("Danh mục sản phẩm không hợp lệ: " + category);
        }

        BigDecimal price = parseNonNegativeDecimal(raw.get("price"), "Giá sản phẩm");
        int stock = parseNonNegativeInt(raw.get("stock"), "Tồn kho");
        String status = normalizeStatus(raw.get("status"));

        String now = OffsetDateTime.now().toString();
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("_id", docId);
        doc.put("type", "product");
        doc.put("product_id", code);
        doc.put("name", name);
        doc.put("category", category);
        doc.put("price", price);
        doc.put("stock", stock);
        doc.put("status", status);
        doc.put("created_at", existing != null && !text(existing.get("created_at")).isEmpty()
                ? text(existing.get("created_at"))
                : defaultText(raw.get("created_at"), now));
        doc.put("updated_at", now);
        return doc;
    }

    private Map<String, Object> prepareService(
            String docId,
            String code,
            Map<String, Object> raw,
            Map<String, Object> existing) {

        String name = text(raw.get("name"));
        String category = text(raw.get("category"));
        if (name.isEmpty()) {
            throw new IllegalArgumentException("Tên dịch vụ không được để trống.");
        }
        if (category.isEmpty()) {
            throw new IllegalArgumentException("Danh mục dịch vụ không được để trống.");
        }

        BigDecimal price = parseNonNegativeDecimal(raw.get("price"), "Giá dịch vụ");
        int duration = parsePositiveInt(raw.get("duration_minutes"), "Thời lượng (phút)");
        String status = normalizeStatus(raw.get("status"));

        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("_id", docId);
        doc.put("type", "service");
        doc.put("service_id", code);
        doc.put("name", name);
        doc.put("category", category);
        doc.put("price", price);
        doc.put("duration_minutes", duration);
        doc.put("status", status);
        return doc;
    }

    private Map<String, Object> prepareCustomer(
            String docId,
            String code,
            Map<String, Object> raw,
            Map<String, Object> existing) {

        String fullName = text(raw.get("full_name"));
        String phone = text(raw.get("phone"));
        String email = text(raw.get("email"));

        if (fullName.isEmpty()) {
            throw new IllegalArgumentException("Họ tên khách hàng không được để trống.");
        }
        String normalizedPhone = phone.replaceAll("[\\s().-]", "");
        if (!PHONE_REGEX.matcher(normalizedPhone).matches()) {
            throw new IllegalArgumentException("Số điện thoại không hợp lệ: " + phone);
        }
        if (!email.isEmpty() && !EMAIL_REGEX.matcher(email).matches()) {
            throw new IllegalArgumentException("Email khách hàng không hợp lệ: " + email);
        }

        String membership = text(raw.get("membership")).toLowerCase(Locale.ROOT);
        if (membership.isEmpty()) {
            membership = existing != null
                    ? defaultText(existing.get("membership"), "standard")
                    : "standard";
        }
        if (!ALLOWED_MEMBERSHIPS.contains(membership)) {
            throw new IllegalArgumentException("Hạng thành viên không hợp lệ: " + membership);
        }

        String now = OffsetDateTime.now().toString();
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("_id", docId);
        doc.put("type", "customer");
        doc.put("customer_id", code);
        doc.put("full_name", fullName);
        doc.put("phone", phone);
        doc.put("email", email);
        doc.put("membership", membership);

        if (existing != null) {
            doc.put("points", existing.getOrDefault("points", 0));
            doc.put("rank", existing.getOrDefault("rank", "Đồng"));
            doc.put("loyalty_paid_amount", existing.getOrDefault("loyalty_paid_amount", 0));
            doc.put("loyalty_processed_invoices",
                    existing.getOrDefault("loyalty_processed_invoices", List.of()));
            doc.put("created_at", defaultText(existing.get("created_at"), now));
        } else {
            long points = raw.get("points") == null || text(raw.get("points")).isEmpty()
                    ? 0L
                    : parseNonNegativeInt(raw.get("points"), "Điểm tích lũy");
            doc.put("points", points);
            doc.put("rank", defaultText(raw.get("rank"), "Đồng"));
            doc.put("loyalty_paid_amount", 0);
            doc.put("loyalty_processed_invoices", List.of());
            doc.put("created_at", defaultText(raw.get("created_at"), now));
        }
        doc.put("updated_at", now);
        return doc;
    }

    private Map<String, Object> prepareEmployee(
            String docId,
            String code,
            Map<String, Object> raw,
            Map<String, Object> existing,
            ImportContext ctx) {

        String fullName = text(raw.get("full_name"));
        String username = text(raw.get("username"));
        String phone = text(raw.get("phone"));
        String email = text(raw.get("email"));
        String role = text(raw.get("role")).toLowerCase(Locale.ROOT);
        String status = normalizeStatus(raw.get("status"));
        String branchId = text(raw.get("branch_id"));

        if (fullName.isEmpty() || username.isEmpty() || phone.isEmpty()
                || email.isEmpty() || branchId.isEmpty()) {
            throw new IllegalArgumentException(
                    "Nhân viên thiếu trường bắt buộc (full_name, username, phone, email, branch_id).");
        }
        if (!ALLOWED_ROLES.contains(role)) {
            throw new IllegalArgumentException("Vai trò nhân viên không hợp lệ: " + role);
        }
        if (!EMAIL_REGEX.matcher(email).matches()) {
            throw new IllegalArgumentException("Email nhân viên không hợp lệ: " + email);
        }

        String normUser = username.toLowerCase(Locale.ROOT);
        String normEmail = email.toLowerCase(Locale.ROOT);
        if (!ctx.seenUsernames.add(normUser)) {
            throw new IllegalArgumentException("Tên đăng nhập bị trùng trong file: " + username);
        }
        if (!ctx.seenEmails.add(normEmail)) {
            throw new IllegalArgumentException("Email bị trùng trong file: " + email);
        }

        String ownerByUser = ctx.existingUsernames.get(normUser);
        if (ownerByUser != null && !ownerByUser.equals(docId)) {
            throw new IllegalArgumentException(
                    "Tên đăng nhập đã thuộc nhân viên khác: " + username);
        }
        String ownerByEmail = ctx.existingEmails.get(normEmail);
        if (ownerByEmail != null && !ownerByEmail.equals(docId)) {
            throw new IllegalArgumentException(
                    "Email đã thuộc nhân viên khác: " + email);
        }

        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("_id", docId);
        doc.put("type", "employee");
        doc.put("employee_id", code);
        doc.put("full_name", fullName);
        doc.put("username", username);
        doc.put("role", role);
        doc.put("phone", phone);
        doc.put("email", email);
        doc.put("status", status);
        doc.put("branch_id", branchId);
        return doc;
    }

    private Map<String, Object> prepareAppointment(
            String docId,
            String code,
            Map<String, Object> raw,
            Map<String, Object> existing,
            ImportContext ctx,
            LoginResponse.UserInfo actor) {

        String customerId = text(raw.get("customer_id"));
        String employeeId = text(raw.get("employee_id"));
        String branchId = text(raw.get("branch_id"));
        String date = text(raw.get("appointment_date"));
        String startTime = text(raw.get("start_time"));
        String status = text(raw.get("status")).toLowerCase(Locale.ROOT);
        if (status.isEmpty()) {
            status = "booked";
        }
        String note = text(raw.get("note"));

        if (!isAdmin(actor)) {
            String actorBranch = actor == null ? "" : text(actor.branchId());
            if (actorBranch.isEmpty()) {
                throw new IllegalArgumentException("Tài khoản chưa được gán chi nhánh.");
            }
            if (!branchId.isEmpty() && !actorBranch.equals(branchId)) {
                throw new IllegalArgumentException(
                        "Quản lý chỉ được nhập lịch hẹn thuộc chi nhánh " + actorBranch);
            }
            branchId = actorBranch;
        }

        if (customerId.isEmpty() || employeeId.isEmpty() || branchId.isEmpty()
                || date.isEmpty() || startTime.isEmpty()) {
            throw new IllegalArgumentException(
                    "Lịch hẹn thiếu trường bắt buộc (customer_id, employee_id, branch_id, appointment_date, start_time).");
        }

        if (!ALLOWED_APPOINTMENT_STATUSES.contains(status)) {
            throw new IllegalArgumentException("Trạng thái lịch hẹn không hợp lệ: " + status);
        }

        List<String> serviceIds = parseServiceIds(raw.get("service_ids"));
        if (serviceIds.isEmpty()) {
            throw new IllegalArgumentException("Lịch hẹn phải có ít nhất một dịch vụ (service_ids).");
        }

        if (!ctx.validCustomers.isEmpty() && !ctx.validCustomers.contains(customerId)) {
            throw new IllegalArgumentException("Không tìm thấy khách hàng: " + customerId);
        }
        if (!ctx.validEmployees.isEmpty() && !ctx.validEmployees.contains(employeeId)) {
            throw new IllegalArgumentException("Không tìm thấy nhân viên: " + employeeId);
        }

        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("_id", docId);
        doc.put("type", "appointment");
        doc.put("appointment_id", code);
        doc.put("customer_id", customerId);
        doc.put("employee_id", employeeId);
        doc.put("service_ids", serviceIds);
        doc.put("branch_id", branchId);
        doc.put("appointment_date", date);
        doc.put("start_time", startTime);
        doc.put("status", status);
        doc.put("note", note);
        return doc;
    }

    // =====================================================
    // HELPERS
    // =====================================================

    private List<Map<String, Object>> getNonDesignDocuments() {
        List<Map<String, Object>> all = couchDb.getAllDocuments();
        if (all == null) {
            return List.of();
        }
        List<Map<String, Object>> filtered = new ArrayList<>();
        for (Map<String, Object> doc : all) {
            if (doc == null) {
                continue;
            }
            String id = text(doc.get("_id"));
            if (!id.isEmpty() && !id.startsWith("_design/")) {
                filtered.add(doc);
            }
        }
        return filtered;
    }

    private long countByType(List<Map<String, Object>> docs, String type) {
        return docs.stream().filter(doc -> type.equals(text(doc.get("type")))).count();
    }

    private List<Map<String, Object>> filterByAccess(
            List<Map<String, Object>> docs,
            String type,
            LoginResponse.UserInfo user) {

        return docs.stream()
                .filter(doc -> type.equals(text(doc.get("type"))))
                .filter(doc -> recordAccessPolicy.canAccess(user, doc))
                .toList();
    }

    private List<Map<String, Object>> filterAccessiblePayments(
            List<Map<String, Object>> docs,
            List<Map<String, Object>> accessibleInvoices,
            LoginResponse.UserInfo user) {

        if (isAdmin(user)) {
            return docs.stream()
                    .filter(doc -> "payment_transaction".equals(text(doc.get("type"))))
                    .toList();
        }

        Set<String> allowedInvoiceIds = new HashSet<>();
        for (Map<String, Object> inv : accessibleInvoices) {
            allowedInvoiceIds.add(text(inv.get("invoice_id")));
        }

        return docs.stream()
                .filter(doc -> "payment_transaction".equals(text(doc.get("type"))))
                .filter(doc -> allowedInvoiceIds.contains(text(doc.get("invoice_id"))))
                .toList();
    }

    private void sortRecords(String entity, List<Map<String, Object>> records) {
        String field = switch (entity) {
            case "products" -> "product_id";
            case "services" -> "service_id";
            case "customers" -> "customer_id";
            case "employees" -> "employee_id";
            case "appointments" -> "appointment_id";
            case "invoices" -> "invoice_id";
            case "payments" -> "invoice_id";
            default -> "_id";
        };

        records.sort(Comparator.comparing(doc -> text(doc.get(field))));
    }

    private List<Map<String, Object>> sampleRowsForEntity(String entity) {
        return switch (entity) {
            case "products" -> List.of(Map.of(
                    "product_id", "PRD901",
                    "name", "Son dưỡng môi mẫu",
                    "category", "lipstick",
                    "price", 150000,
                    "stock", 20,
                    "status", "active"
            ));
            case "services" -> List.of(Map.of(
                    "service_id", "SRV901",
                    "name", "Chăm sóc da mặt cơ bản",
                    "category", "skincare",
                    "price", 250000,
                    "duration_minutes", 60,
                    "status", "active"
            ));
            case "customers" -> List.of(Map.of(
                    "customer_id", "CUS901",
                    "full_name", "Nguyễn Thị Minh",
                    "phone", "0912345678",
                    "email", "minh.nguyen@example.com",
                    "membership", "standard"
            ));
            case "employees" -> List.of(Map.of(
                    "employee_id", "EMP901",
                    "full_name", "Trần Lan Anh",
                    "username", "lananh.staff",
                    "role", "staff",
                    "phone", "0987654321",
                    "email", "lananh@beautyshop.vn",
                    "status", "active",
                    "branch_id", "BR001"
            ));
            case "appointments" -> List.of(Map.of(
                    "appointment_id", "APT901",
                    "customer_id", "CUS001",
                    "employee_id", "EMP001",
                    "service_ids", List.of("SRV001"),
                    "branch_id", "BR001",
                    "appointment_date", "2026-12-01",
                    "start_time", "10:00",
                    "status", "booked",
                    "note", "Lịch hẹn mẫu"
            ));
            default -> List.of();
        };
    }

    private Path resolveBackupDirectory(String configuredDir) {
        Path direct = Paths.get(configuredDir).toAbsolutePath().normalize();
        if (Files.exists(direct)) {
            return direct;
        }
        Path rootCandidate = Paths.get("database", "backups").toAbsolutePath().normalize();
        if (Files.exists(rootCandidate)) {
            return rootCandidate;
        }
        return direct;
    }

    private void ensureBackupDirExists() {
        try {
            Files.createDirectories(backupDirectory);
        } catch (IOException ex) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Không thể tạo thư mục sao lưu: " + ex.getMessage()
            );
        }
    }

    private Path resolveSafeBackupFile(String filename) {
        if (filename == null || !SAFE_FILENAME.matcher(filename.trim()).matches()) {
            throw badRequest("Tên file sao lưu không hợp lệ.");
        }
        ensureBackupDirExists();
        Path resolved = backupDirectory.resolve(filename.trim()).normalize();
        if (!resolved.startsWith(backupDirectory)) {
            throw badRequest("Đường dẫn file sao lưu không hợp lệ.");
        }
        return resolved;
    }

    private String writeSnapshotFile(Map<String, Object> payload, String prefix) {
        ensureBackupDirExists();
        String baseName = prefix + "-" + FILE_TS_FORMATTER.format(Instant.now());
        Path target = backupDirectory.resolve(baseName + ".json");
        int counter = 1;
        while (Files.exists(target)) {
            target = backupDirectory.resolve(baseName + "-" + counter + ".json");
            counter++;
        }

        try {
            Files.write(target, serializeJson(payload));
            return target.getFileName().toString();
        } catch (IOException ex) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Không thể lưu file sao lưu trên máy chủ: " + ex.getMessage()
            );
        }
    }

    private Map<String, Object> readBackupMetadata(Path file) {
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("filename", file.getFileName().toString());
        try {
            meta.put("size_bytes", Files.size(file));
            meta.put("last_modified",
                    Files.getLastModifiedTime(file).toInstant().toString());
            Map<String, Object> parsed = objectMapper.readValue(
                    file.toFile(),
                    new TypeReference<Map<String, Object>>() {}
            );
            meta.put("format", text(parsed.get("format")));
            meta.put("exported_at", text(parsed.get("exported_at")));
            meta.put("exported_by", text(parsed.get("exported_by")));
            meta.put("include_users", Boolean.TRUE.equals(parsed.get("include_users")));
            meta.put("total_documents", intValue(parsed.get("total_documents"), 0));
            if (parsed.get("counts") instanceof Map<?, ?> counts) {
                meta.put("counts", counts);
            }
        } catch (IOException ex) {
            meta.put("format", "unknown");
            meta.put("error", "Không đọc được metadata JSON");
        }
        return meta;
    }

    private long lastModifiedMillis(Path path) {
        try {
            return Files.getLastModifiedTime(path).toMillis();
        } catch (IOException ex) {
            return 0L;
        }
    }

    private Map<String, Object> parseJsonObject(byte[] bytes) {
        try {
            return objectMapper.readValue(
                    bytes,
                    new TypeReference<Map<String, Object>>() {}
            );
        } catch (IOException ex) {
            throw badRequest("File JSON không hợp lệ: " + ex.getMessage());
        }
    }

    private void validateRestoredUser(Map<String, Object> doc) {
        String username = text(doc.get("username"));
        String role = text(doc.get("role")).toLowerCase(Locale.ROOT);
        String status = text(doc.get("status")).toLowerCase(Locale.ROOT);
        String hash = text(doc.get("password_hash"));

        if (username.isEmpty() || hash.isEmpty()
                || !ALLOWED_ROLES.contains(role)
                || !ALLOWED_STATUSES.contains(status)) {
            throw badRequest(
                    "Tài khoản user trong backup thiếu trường hợp lệ: " + text(doc.get("_id"))
            );
        }
    }

    private List<Map<String, Object>> collectBulkErrors(
            List<Map<String, Object>> bulkResults) {
        List<Map<String, Object>> errors = new ArrayList<>();
        if (bulkResults == null) {
            return errors;
        }
        for (Map<String, Object> item : bulkResults) {
            if (item == null || Boolean.TRUE.equals(item.get("ok"))) {
                continue;
            }
            if (item.containsKey("error")) {
                Map<String, Object> err = new LinkedHashMap<>();
                err.put("id", text(item.get("id")));
                err.put("error", text(item.get("error")));
                err.put("reason", text(item.get("reason")));
                errors.add(err);
            }
        }
        return errors;
    }

    private List<String> parseServiceIds(Object value) {
        if (value instanceof List<?> list) {
            return list.stream()
                    .map(this::text)
                    .filter(s -> !s.isEmpty())
                    .toList();
        }
        String raw = text(value);
        if (raw.isEmpty()) {
            return List.of();
        }
        if (raw.startsWith("[")) {
            try {
                List<String> parsed = objectMapper.readValue(
                        raw,
                        new TypeReference<List<String>>() {}
                );
                return parsed.stream()
                        .map(this::text)
                        .filter(s -> !s.isEmpty())
                        .toList();
            } catch (IOException ignored) {
            }
        }
        String[] parts = raw.split("[;,]");
        List<String> result = new ArrayList<>();
        for (String part : parts) {
            String trimmed = part.trim();
            if (!trimmed.isEmpty()) {
                result.add(trimmed);
            }
        }
        return result;
    }

    private BigDecimal parseNonNegativeDecimal(Object value, String label) {
        String str = text(value);
        if (str.isEmpty()) {
            throw new IllegalArgumentException(label + " không được để trống.");
        }
        try {
            BigDecimal number = new BigDecimal(str);
            if (number.signum() < 0) {
                throw new IllegalArgumentException(label + " không được âm.");
            }
            return number;
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException(label + " không phải số hợp lệ: " + str);
        }
    }

    private int parseNonNegativeInt(Object value, String label) {
        String str = text(value);
        if (str.isEmpty()) {
            throw new IllegalArgumentException(label + " không được để trống.");
        }
        try {
            int number = new BigDecimal(str).intValueExact();
            if (number < 0) {
                throw new IllegalArgumentException(label + " không được âm.");
            }
            return number;
        } catch (ArithmeticException | NumberFormatException ex) {
            throw new IllegalArgumentException(label + " phải là số nguyên không âm: " + str);
        }
    }

    private int parsePositiveInt(Object value, String label) {
        int number = parseNonNegativeInt(value, label);
        if (number <= 0) {
            throw new IllegalArgumentException(label + " phải lớn hơn 0.");
        }
        return number;
    }

    private String normalizeStatus(Object value) {
        String status = text(value).toLowerCase(Locale.ROOT);
        if (status.isEmpty()) {
            return "active";
        }
        if (!ALLOWED_STATUSES.contains(status)) {
            throw new IllegalArgumentException("Trạng thái không hợp lệ: " + status);
        }
        return status;
    }

    private String normalizeExportEntity(String entity) {
        String normalized = text(entity).toLowerCase(Locale.ROOT);
        if (!ENTITY_TO_DOC_TYPE.containsKey(normalized)) {
            throw badRequest("Phân hệ export không được hỗ trợ: " + entity);
        }
        return normalized;
    }

    private String normalizeImportEntity(String entity) {
        String normalized = text(entity).toLowerCase(Locale.ROOT);
        if (!Set.of("products", "services", "customers", "employees", "appointments")
                .contains(normalized)) {
            throw badRequest("Phân hệ import không được hỗ trợ: " + entity);
        }
        return normalized;
    }

    private String normalizeFormat(String format) {
        String normalized = text(format).toLowerCase(Locale.ROOT);
        if (normalized.isEmpty() || "json".equals(normalized)) {
            return "json";
        }
        if ("csv".equals(normalized)) {
            return "csv";
        }
        throw badRequest("Định dạng không hỗ trợ (chỉ hỗ trợ json hoặc csv).");
    }

    private String normalizeRestoreMode(String mode) {
        String normalized = text(mode).toLowerCase(Locale.ROOT);
        if (normalized.isEmpty() || "merge".equals(normalized)) {
            return "merge";
        }
        if ("replace".equals(normalized)) {
            return "replace";
        }
        throw badRequest("Chế độ khôi phục không hợp lệ (merge hoặc replace).");
    }

    private String normalizeImportMode(String mode) {
        String normalized = text(mode).toLowerCase(Locale.ROOT);
        if (normalized.isEmpty() || "upsert".equals(normalized)) {
            return "upsert";
        }
        if ("skip_existing".equals(normalized) || "update_only".equals(normalized)) {
            return normalized;
        }
        throw badRequest("Chế độ import không hợp lệ (upsert, skip_existing hoặc update_only).");
    }

    private String businessCodeField(String entity) {
        return switch (entity) {
            case "products" -> "product_id";
            case "services" -> "service_id";
            case "customers" -> "customer_id";
            case "employees" -> "employee_id";
            case "appointments" -> "appointment_id";
            default -> "_id";
        };
    }

    private String businessCodePrefix(String entity) {
        return switch (entity) {
            case "products" -> "PRD";
            case "services" -> "SRV";
            case "customers" -> "CUS";
            case "employees" -> "EMP";
            case "appointments" -> "APT";
            default -> "DOC";
        };
    }

    private String buildImportMessage(
            boolean dryRun,
            int created,
            int updated,
            int skipped,
            int errorCount) {
        if (dryRun) {
            return String.format(
                    "Kiểm tra trước: thêm mới %d, cập nhật %d, bỏ qua %d, lỗi %d.",
                    created, updated, skipped, errorCount);
        }
        return String.format(
                "Import thành công: thêm mới %d, cập nhật %d, bỏ qua %d.",
                created, updated, skipped);
    }

    private boolean isAdmin(LoginResponse.UserInfo user) {
        return "admin".equals(normalizeRole(user));
    }

    private String normalizeRole(LoginResponse.UserInfo user) {
        if (user == null || user.role() == null) {
            return "";
        }
        return user.role().trim().toLowerCase(Locale.ROOT).replaceFirst("^role_", "");
    }

    private Map<String, Object> copyStringKeyMap(Map<?, ?> source) {
        Map<String, Object> result = new LinkedHashMap<>();
        source.forEach((k, v) -> result.put(String.valueOf(k), v));
        return result;
    }

    private int intValue(Object value, int fallback) {
        if (value instanceof Number num) {
            return num.intValue();
        }
        try {
            return value == null ? fallback : Integer.parseInt(text(value));
        } catch (NumberFormatException ex) {
            return fallback;
        }
    }

    private String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private String defaultText(Object value, String fallback) {
        String s = text(value);
        return s.isEmpty() ? fallback : s;
    }

    private ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private enum ImportAction {
        CREATE, UPDATE, SKIP
    }

    private record ImportDecision(ImportAction action, Map<String, Object> document) {
    }

    private static final class ImportContext {
        final Map<String, Map<String, Object>> byDocId;
        final Map<String, Map<String, Object>> byBusinessId;
        final Map<String, String> existingUsernames;
        final Map<String, String> existingEmails;
        final Set<String> validCustomers;
        final Set<String> validEmployees;
        final Set<String> seenDocIds = new HashSet<>();
        final Set<String> seenCodes = new HashSet<>();
        final Set<String> seenUsernames = new HashSet<>();
        final Set<String> seenEmails = new HashSet<>();
        int maxCodeNumber;

        ImportContext(
                Map<String, Map<String, Object>> byDocId,
                Map<String, Map<String, Object>> byBusinessId,
                Map<String, String> existingUsernames,
                Map<String, String> existingEmails,
                Set<String> validCustomers,
                Set<String> validEmployees,
                int maxCodeNumber) {
            this.byDocId = byDocId;
            this.byBusinessId = byBusinessId;
            this.existingUsernames = existingUsernames;
            this.existingEmails = existingEmails;
            this.validCustomers = validCustomers;
            this.validEmployees = validEmployees;
            this.maxCodeNumber = maxCodeNumber;
        }

        String nextCode(String prefix) {
            maxCodeNumber++;
            return String.format(Locale.ROOT, "%s%03d", prefix, maxCodeNumber);
        }
    }
}
