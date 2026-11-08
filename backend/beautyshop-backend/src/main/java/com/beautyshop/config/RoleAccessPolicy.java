package com.beautyshop.config;

import java.util.Locale;

public final class RoleAccessPolicy {

    public boolean isAllowed(
            String roleValue,
            String methodValue,
            String path,
            String paymentMethod) {

        String role = normalize(roleValue).replaceFirst("^role_", "");
            String method = methodValue == null
                ? ""
                : methodValue.trim().toUpperCase(Locale.ROOT);

        if ("admin".equals(role)) {
            return true;
        }

        if (!"manager".equals(role) && !"staff".equals(role)) {
            return false;
        }

        if (path.startsWith("/api/users")) {
            return false;
        }

        if (path.startsWith("/api/employees")) {
            return "GET".equals(method);
        }

        if (path.startsWith("/api/products")
                || path.startsWith("/api/services")) {
            if (isBackupPath(path)) {
                return "manager".equals(role) && "GET".equals(method);
            }

            return "GET".equals(method)
                    || ("manager".equals(role) && isWrite(method));
        }

        if (path.startsWith("/api/customers")) {
            if (isBackupPath(path)) {
                return "manager".equals(role) && "GET".equals(method);
            }

            if ("GET".equals(method)
                    || "POST".equals(method)
                    || "PUT".equals(method)) {
                return true;
            }

            return "manager".equals(role) && "DELETE".equals(method);
        }

        if (path.startsWith("/api/appointments")) {
            if ("GET".equals(method)
                    || "POST".equals(method)
                    || "PUT".equals(method)) {
                return true;
            }

            return "manager".equals(role) && "DELETE".equals(method);
        }

        if (path.startsWith("/api/invoices")) {
            if ("/api/invoices/statistics".equals(path)) {
                return "manager".equals(role) && "GET".equals(method);
            }

            return "GET".equals(method) || "POST".equals(method);
        }

        if (path.startsWith("/api/payments")) {
            if ("/api/payments/statistics".equals(path)) {
                return "manager".equals(role) && "GET".equals(method);
            }

            if (path.matches("/api/payments/invoices/[^/]+/confirm")
                    && "POST".equals(method)) {
                return "manager".equals(role)
                        || ("staff".equals(role)
                        && "cash".equals(normalize(paymentMethod)));
            }

            if (path.matches("/api/payments/invoices/[^/]+/cancel")
                    && "POST".equals(method)) {
                return "manager".equals(role);
            }

            return "GET".equals(method);
        }

        if (path.startsWith("/api/loyalty")) {
            if ("/api/loyalty/recalculate".equals(path)) {
                return false;
            }

            return "manager".equals(role) && "GET".equals(method);
        }

        return path.startsWith("/api/auth/")
                && "POST".equals(method)
                && "/api/auth/change-password".equals(path);
    }

    private boolean isBackupPath(String path) {
        return path.endsWith("/backup");
    }

    private boolean isWrite(String method) {
        return "POST".equals(method)
                || "PUT".equals(method)
                || "DELETE".equals(method)
                || "PATCH".equals(method);
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}