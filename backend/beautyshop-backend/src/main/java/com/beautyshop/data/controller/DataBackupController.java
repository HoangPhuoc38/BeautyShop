package com.beautyshop.data.controller;

import com.beautyshop.auth.dto.LoginResponse;
import com.beautyshop.data.service.DataBackupService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Map;

@RestController
@RequestMapping("/api/data")
public class DataBackupController {

    private static final DateTimeFormatter FILE_TS =
            DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss")
                    .withZone(ZoneId.systemDefault());

    private final DataBackupService dataBackupService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public DataBackupController(DataBackupService dataBackupService) {
        this.dataBackupService = dataBackupService;
    }

    // =====================================================
    // TỔNG QUAN DỮ LIỆU
    // =====================================================

    @GetMapping("/overview")
    public Map<String, Object> getOverview(HttpServletRequest request) {
        return dataBackupService.getOverview(currentUser(request));
    }

    // =====================================================
    // FULL BACKUP (ADMIN)
    // =====================================================

    @GetMapping("/backup")
    public ResponseEntity<byte[]> downloadFullBackup(
            @RequestParam(defaultValue = "false") boolean includeUsers,
            @RequestParam(defaultValue = "false") boolean saveToServer,
            HttpServletRequest request) {

        Map<String, Object> backup = dataBackupService.createFullBackup(
                includeUsers,
                saveToServer,
                currentUser(request)
        );

        byte[] bytes = dataBackupService.serializeJson(backup);
        String filename = "beautyshop-backup-" + FILE_TS.format(Instant.now()) + ".json";
        return attachmentResponse(bytes, filename, MediaType.APPLICATION_JSON);
    }

    @PostMapping("/backups")
    public ResponseEntity<Map<String, Object>> createServerSnapshot(
            @RequestParam(defaultValue = "false") boolean includeUsers,
            HttpServletRequest request) {

        Map<String, Object> backup = dataBackupService.createFullBackup(
                includeUsers,
                true,
                currentUser(request)
        );

        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of(
                "success", true,
                "filename", backup.get("server_file"),
                "total_documents", backup.get("total_documents"),
                "exported_at", backup.get("exported_at"),
                "include_users", backup.get("include_users"),
                "counts", backup.get("counts"),
                "message", "Đã tạo bản sao lưu trên máy chủ: " + backup.get("server_file")
        ));
    }

    @GetMapping("/backups")
    public Map<String, Object> listServerBackups() {
        var backups = dataBackupService.listServerBackups();
        return Map.of(
                "success", true,
                "total", backups.size(),
                "backups", backups
        );
    }

    @GetMapping("/backups/{filename:.+}")
    public ResponseEntity<byte[]> downloadServerBackup(@PathVariable String filename) {
        byte[] bytes = dataBackupService.readServerBackupBytes(filename);
        return attachmentResponse(bytes, filename, MediaType.APPLICATION_JSON);
    }

    @DeleteMapping("/backups/{filename:.+}")
    public Map<String, Object> deleteServerBackup(@PathVariable String filename) {
        dataBackupService.deleteServerBackup(filename);
        return Map.of(
                "success", true,
                "message", "Đã xóa file sao lưu: " + filename
        );
    }

    // =====================================================
    // FULL RESTORE (ADMIN)
    // =====================================================

    @PostMapping(
            value = "/restore",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE
    )
    public ResponseEntity<Map<String, Object>> restoreFromFile(
            @RequestPart("file") MultipartFile file,
            @RequestParam(defaultValue = "merge") String mode,
            HttpServletRequest request) {

        Map<String, Object> payload = parseMultipartJson(file);
        Map<String, Object> result = dataBackupService.restoreFullBackup(
                payload,
                mode,
                currentUser(request)
        );
        return ResponseEntity.ok(result);
    }

    @PostMapping(
            value = "/restore",
            consumes = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<Map<String, Object>> restoreFromJson(
            @RequestBody Map<String, Object> payload,
            @RequestParam(defaultValue = "merge") String mode,
            HttpServletRequest request) {

        Map<String, Object> result = dataBackupService.restoreFullBackup(
                payload,
                mode,
                currentUser(request)
        );
        return ResponseEntity.ok(result);
    }

    @PostMapping("/backups/{filename:.+}/restore")
    public ResponseEntity<Map<String, Object>> restoreFromServerSnapshot(
            @PathVariable String filename,
            @RequestParam(defaultValue = "merge") String mode,
            HttpServletRequest request) {

        Map<String, Object> result = dataBackupService.restoreFromServerBackup(
                filename,
                mode,
                currentUser(request)
        );
        return ResponseEntity.ok(result);
    }

    // =====================================================
    // ENTITY EXPORT & TEMPLATE
    // =====================================================

    @GetMapping("/export/{entity}")
    public ResponseEntity<byte[]> exportEntity(
            @PathVariable String entity,
            @RequestParam(defaultValue = "csv") String format,
            HttpServletRequest request) {

        byte[] bytes = dataBackupService.exportEntity(
                entity,
                format,
                currentUser(request)
        );

        String ext = "csv".equalsIgnoreCase(format) ? "csv" : "json";
        String filename = "beautyshop-" + entity.toLowerCase()
                + "-" + FILE_TS.format(Instant.now()) + "." + ext;
        MediaType mediaType = "csv".equals(ext)
                ? new MediaType("text", "csv", StandardCharsets.UTF_8)
                : MediaType.APPLICATION_JSON;

        return attachmentResponse(bytes, filename, mediaType);
    }

    @GetMapping("/template/{entity}")
    public ResponseEntity<byte[]> downloadTemplate(
            @PathVariable String entity,
            @RequestParam(defaultValue = "csv") String format) {

        byte[] bytes = dataBackupService.generateTemplate(entity, format);
        String ext = "csv".equalsIgnoreCase(format) ? "csv" : "json";
        String filename = "beautyshop-" + entity.toLowerCase() + "-template." + ext;
        MediaType mediaType = "csv".equals(ext)
                ? new MediaType("text", "csv", StandardCharsets.UTF_8)
                : MediaType.APPLICATION_JSON;

        return attachmentResponse(bytes, filename, mediaType);
    }

    // =====================================================
    // ENTITY IMPORT (JSON / CSV)
    // =====================================================

    @PostMapping(
            value = "/import/{entity}",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE
    )
    public ResponseEntity<Map<String, Object>> importEntityFile(
            @PathVariable String entity,
            @RequestPart("file") MultipartFile file,
            @RequestParam(defaultValue = "upsert") String mode,
            @RequestParam(defaultValue = "false") boolean dryRun,
            HttpServletRequest request) {

        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException ex) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Không thể đọc file tải lên: " + ex.getMessage()
            );
        }

        Map<String, Object> result = dataBackupService.importEntity(
                entity,
                file.getOriginalFilename(),
                bytes,
                mode,
                dryRun,
                currentUser(request)
        );

        if (!dryRun && !Boolean.TRUE.equals(result.get("success"))) {
            return ResponseEntity.badRequest().body(result);
        }
        return ResponseEntity.ok(result);
    }

    @PostMapping(
            value = "/import/{entity}",
            consumes = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<Map<String, Object>> importEntityJson(
            @PathVariable String entity,
            @RequestBody Object body,
            @RequestParam(defaultValue = "upsert") String mode,
            @RequestParam(defaultValue = "false") boolean dryRun,
            HttpServletRequest request) {

        byte[] bytes;
        try {
            bytes = objectMapper.writeValueAsBytes(body);
        } catch (IOException ex) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Dữ liệu JSON không hợp lệ."
            );
        }

        Map<String, Object> result = dataBackupService.importEntity(
                entity,
                entity + ".json",
                bytes,
                mode,
                dryRun,
                currentUser(request)
        );

        if (!dryRun && !Boolean.TRUE.equals(result.get("success"))) {
            return ResponseEntity.badRequest().body(result);
        }
        return ResponseEntity.ok(result);
    }

    // =====================================================
    // HELPERS
    // =====================================================

    private Map<String, Object> parseMultipartJson(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Vui lòng chọn file sao lưu JSON."
            );
        }
        try {
            return objectMapper.readValue(
                    file.getBytes(),
                    new TypeReference<Map<String, Object>>() {}
            );
        } catch (IOException ex) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "File JSON không hợp lệ: " + ex.getMessage()
            );
        }
    }

    private ResponseEntity<byte[]> attachmentResponse(
            byte[] bytes,
            String filename,
            MediaType mediaType) {

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(mediaType);
        headers.setContentDisposition(
                ContentDisposition.attachment().filename(filename).build()
        );
        return new ResponseEntity<>(bytes, headers, HttpStatus.OK);
    }

    private LoginResponse.UserInfo currentUser(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        Object value = session == null ? null : session.getAttribute("AUTH_USER");
        return value instanceof LoginResponse.UserInfo user ? user : null;
    }
}
