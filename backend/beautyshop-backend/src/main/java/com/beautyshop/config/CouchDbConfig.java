
package com.beautyshop.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

@Configuration
public class CouchDbConfig {

    @Bean
    public RestClient couchDbRestClient(
            @Value("${couchdb.url}") String url,
            @Value("${couchdb.username}") String username,
            @Value("${couchdb.password}") String password) {

        return RestClient.builder()
                .baseUrl(url)
                .defaultHeaders(headers ->
                        headers.setBasicAuth(username, password)
                )
                .build();
    }
}
