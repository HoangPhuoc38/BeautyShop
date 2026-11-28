package com.beautyshop.data.service;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CsvCodecTest {

    @Test
    void encodesAndParsesUtf8VietnameseWithCommasQuotesAndLists() {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("appointment_id", "APT001");
        row.put("service_ids", List.of("SRV001", "SRV002"));
        row.put("note", "Khách hẹn \"gấp\", chăm sóc da");

        byte[] bytes = CsvCodec.encode(
                List.of("appointment_id", "service_ids", "note"),
                List.of(row)
        );

        String text = new String(bytes, StandardCharsets.UTF_8);
        assertTrue(text.startsWith("\uFEFF"));

        List<Map<String, String>> parsed = CsvCodec.parse(text);
        assertEquals(1, parsed.size());
        assertEquals("APT001", parsed.get(0).get("appointment_id"));
        assertEquals("SRV001;SRV002", parsed.get(0).get("service_ids"));
        assertEquals("Khách hẹn \"gấp\", chăm sóc da", parsed.get(0).get("note"));
    }

    @Test
    void throwsOnUnclosedQuote() {
        assertThrows(
                IllegalArgumentException.class,
                () -> CsvCodec.parse("name,price\n\"Son dưỡng,120000")
        );
    }
}
