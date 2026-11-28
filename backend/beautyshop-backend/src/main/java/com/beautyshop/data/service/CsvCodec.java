package com.beautyshop.data.service;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * RFC-4180 CSV encoder and parser with UTF-8 BOM support for Excel compatibility.
 */
public final class CsvCodec {

    private static final String UTF8_BOM = "\uFEFF";

    private CsvCodec() {
    }

    public static byte[] encode(
            List<String> headers,
            List<Map<String, Object>> rows) {

        StringBuilder sb = new StringBuilder();
        sb.append(UTF8_BOM);
        appendRow(sb, headers);

        for (Map<String, Object> row : rows) {
            List<String> cells = new ArrayList<>(headers.size());
            for (String header : headers) {
                cells.add(stringifyCell(row.get(header)));
            }
            appendRow(sb, cells);
        }

        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }

    public static List<Map<String, String>> parse(String rawContent) {
        if (rawContent == null) {
            throw new IllegalArgumentException("Nội dung CSV trống.");
        }

        String content = rawContent.startsWith(UTF8_BOM)
                ? rawContent.substring(1)
                : rawContent;

        List<List<String>> parsedRows = parseRawRows(content);
        if (parsedRows.isEmpty()) {
            throw new IllegalArgumentException("File CSV không có dữ liệu.");
        }

        List<String> rawHeaders = parsedRows.get(0);
        List<String> headers = new ArrayList<>(rawHeaders.size());
        for (String header : rawHeaders) {
            String trimmed = header == null ? "" : header.trim();
            if (trimmed.isEmpty()) {
                throw new IllegalArgumentException(
                        "Header CSV không được chứa cột trống."
                );
            }
            if (headers.contains(trimmed)) {
                throw new IllegalArgumentException(
                        "Header CSV bị trùng cột: " + trimmed
                );
            }
            headers.add(trimmed);
        }

        List<Map<String, String>> result = new ArrayList<>();
        for (int i = 1; i < parsedRows.size(); i++) {
            List<String> cells = parsedRows.get(i);
            boolean allBlank = cells.stream()
                    .allMatch(cell -> cell == null || cell.trim().isEmpty());
            if (allBlank) {
                continue;
            }

            Map<String, String> rowMap = new LinkedHashMap<>();
            for (int col = 0; col < headers.size(); col++) {
                String value = col < cells.size() ? cells.get(col) : "";
                rowMap.put(headers.get(col), value == null ? "" : value.trim());
            }
            result.add(rowMap);
        }

        return result;
    }

    private static List<List<String>> parseRawRows(String content) {
        List<List<String>> rows = new ArrayList<>();
        List<String> currentRow = new ArrayList<>();
        StringBuilder currentCell = new StringBuilder();
        boolean inQuotes = false;

        int length = content.length();
        for (int i = 0; i < length; i++) {
            char ch = content.charAt(i);

            if (inQuotes) {
                if (ch == '"') {
                    if (i + 1 < length && content.charAt(i + 1) == '"') {
                        currentCell.append('"');
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    currentCell.append(ch);
                }
                continue;
            }

            if (ch == '"') {
                if (currentCell.length() == 0) {
                    inQuotes = true;
                } else {
                    currentCell.append(ch);
                }
            } else if (ch == ',') {
                currentRow.add(currentCell.toString());
                currentCell.setLength(0);
            } else if (ch == '\r') {
                if (i + 1 < length && content.charAt(i + 1) == '\n') {
                    i++;
                }
                currentRow.add(currentCell.toString());
                currentCell.setLength(0);
                rows.add(currentRow);
                currentRow = new ArrayList<>();
            } else if (ch == '\n') {
                currentRow.add(currentCell.toString());
                currentCell.setLength(0);
                rows.add(currentRow);
                currentRow = new ArrayList<>();
            } else {
                currentCell.append(ch);
            }
        }

        if (inQuotes) {
            throw new IllegalArgumentException(
                    "File CSV có dấu ngoặc kép chưa được đóng."
            );
        }

        if (currentCell.length() > 0 || !currentRow.isEmpty()) {
            currentRow.add(currentCell.toString());
            rows.add(currentRow);
        }

        return rows;
    }

    private static void appendRow(StringBuilder sb, List<String> cells) {
        for (int i = 0; i < cells.size(); i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append(escapeCell(cells.get(i)));
        }
        sb.append("\r\n");
    }

    private static String escapeCell(String value) {
        String text = value == null ? "" : value;
        boolean mustQuote = text.contains(",")
                || text.contains("\"")
                || text.contains("\n")
                || text.contains("\r")
                || (!text.isEmpty() && (text.charAt(0) == ' '
                || text.charAt(text.length() - 1) == ' '));

        if (!mustQuote) {
            return text;
        }

        return '"' + text.replace("\"", "\"\"") + '"';
    }

    private static String stringifyCell(Object value) {
        if (value == null) {
            return "";
        }
        if (value instanceof Collection<?> collection) {
            return collection.stream()
                    .map(item -> item == null ? "" : String.valueOf(item).trim())
                    .filter(s -> !s.isEmpty())
                    .collect(Collectors.joining(";"));
        }
        return String.valueOf(value);
    }
}
