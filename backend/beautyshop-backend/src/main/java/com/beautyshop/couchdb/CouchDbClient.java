
package com.beautyshop.couchdb;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Component
public class CouchDbClient {

    private final RestClient client;
    private final String database;

    public CouchDbClient(
            RestClient couchDbRestClient,
            @Value("${couchdb.database}") String database) {

        this.client = couchDbRestClient;
        this.database = database;
    }

    // =========================================
    // LẤY DOCUMENT THEO ID
    // =========================================

    @SuppressWarnings("unchecked")
    public Map<String, Object> getDocument(String id) {

        try {
            return client.get()
                    .uri("/{db}/{id}", database, id)
                    .retrieve()
                    .body(Map.class);

        } catch (HttpClientErrorException.NotFound e) {
            return null;
        }
    }

    // =========================================
    // LẤY TOÀN BỘ DOCUMENT
    // =========================================

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> getAllDocuments() {

        Map<String, Object> response = client.get()
                .uri("/{db}/_all_docs?include_docs=true", database)
                .retrieve()
                .body(Map.class);

        List<Map<String, Object>> result = new ArrayList<>();

        if (response == null) {
            return result;
        }

        List<Map<String, Object>> rows =
                (List<Map<String, Object>>) response.get("rows");

        if (rows == null) {
            return result;
        }

        for (Map<String, Object> row : rows) {

            Map<String, Object> document =
                    (Map<String, Object>) row.get("doc");

            if (document != null
                    && !Boolean.TRUE.equals(document.get("_deleted"))) {

                result.add(document);
            }
        }

        return result;
    }

    // =========================================
    // LƯU DOCUMENT
    // =========================================

    @SuppressWarnings("unchecked")
    public Map<String, Object> saveDocument(
            String id,
            Map<String, Object> document) {

        if (id == null || id.isBlank()) {
            throw new IllegalArgumentException(
                    "Document ID không được để trống."
            );
        }

        if (document == null) {
            throw new IllegalArgumentException(
                    "Document không được null."
            );
        }

        document.put("_id", id);

        Map<String, Object> response = client.put()
                .uri("/{db}/{id}", database, id)
                .body(document)
                .retrieve()
                .body(Map.class);

        if (response != null && response.get("rev") != null) {
            document.put("_rev", response.get("rev"));
        }

        return document;
    }

    // =========================================
    // XÓA DOCUMENT THEO REVISION
    // =========================================

    public void deleteDocument(String id, String revision) {

        if (id == null || id.isBlank()) {
            throw new IllegalArgumentException(
                    "Document ID không được để trống."
            );
        }

        if (revision == null || revision.isBlank()) {
            throw new IllegalArgumentException(
                    "Revision không được để trống."
            );
        }

        client.delete()
                .uri("/{db}/{id}?rev={rev}",
                        database, id, revision)
                .retrieve()
                .toBodilessEntity();
    }

    // =========================================
    // KIỂM TRA DOCUMENT TỒN TẠI
    // =========================================

    public boolean documentExists(String id) {
        return getDocument(id) != null;
    }
}
