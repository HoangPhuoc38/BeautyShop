
package com.beautyshop.service;

import com.fasterxml.jackson.annotation.JsonProperty;

public class BeautyService {

    @JsonProperty("_id")
    private String id;

    @JsonProperty("_rev")
    private String rev;

    private String type = "service";

    @JsonProperty("service_id")
    private String serviceId;

    private String name;

    private String category;

    private double price;

    @JsonProperty("duration_minutes")
    private int durationMinutes;

    private String status = "active";

    public BeautyService() {
    }

    @JsonProperty("_id")
    public String getId() {
        return id;
    }

    @JsonProperty("_id")
    public void setId(String id) {
        this.id = id;
    }

    @JsonProperty("_rev")
    public String getRev() {
        return rev;
    }

    @JsonProperty("_rev")
    public void setRev(String rev) {
        this.rev = rev;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    @JsonProperty("service_id")
    public String getServiceId() {
        return serviceId;
    }

    @JsonProperty("service_id")
    public void setServiceId(String serviceId) {
        this.serviceId = serviceId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public double getPrice() {
        return price;
    }

    public void setPrice(double price) {
        this.price = price;
    }

    @JsonProperty("duration_minutes")
    public int getDurationMinutes() {
        return durationMinutes;
    }

    @JsonProperty("duration_minutes")
    public void setDurationMinutes(int durationMinutes) {
        this.durationMinutes = durationMinutes;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }
}
