package com.beautyshop.loyalty.service;

public final class LoyaltyMembershipPolicy {

    private LoyaltyMembershipPolicy() {
    }

    public static String forPoints(long points) {
        if (points >= 2000) {
            return "platinum";
        }

        if (points >= 1000) {
            return "gold";
        }

        if (points >= 500) {
            return "silver";
        }

        return "standard";
    }

    public static long minimumPoints(String membership) {
        return switch (membership) {
            case "silver" -> 500;
            case "gold" -> 1000;
            case "platinum" -> 2000;
            default -> 0;
        };
    }
}