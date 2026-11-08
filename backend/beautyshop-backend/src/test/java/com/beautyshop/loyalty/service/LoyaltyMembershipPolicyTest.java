package com.beautyshop.loyalty.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class LoyaltyMembershipPolicyTest {

    @Test
    void assignsMembershipAtPointBoundaries() {
        assertEquals("standard", LoyaltyMembershipPolicy.forPoints(499));
        assertEquals("silver", LoyaltyMembershipPolicy.forPoints(500));
        assertEquals("silver", LoyaltyMembershipPolicy.forPoints(999));
        assertEquals("gold", LoyaltyMembershipPolicy.forPoints(1000));
        assertEquals("gold", LoyaltyMembershipPolicy.forPoints(1999));
        assertEquals("platinum", LoyaltyMembershipPolicy.forPoints(2000));
    }

    @Test
    void exposesMinimumPointsForEachMembership() {
        assertEquals(0, LoyaltyMembershipPolicy.minimumPoints("standard"));
        assertEquals(500, LoyaltyMembershipPolicy.minimumPoints("silver"));
        assertEquals(1000, LoyaltyMembershipPolicy.minimumPoints("gold"));
        assertEquals(2000, LoyaltyMembershipPolicy.minimumPoints("platinum"));
    }
}