"use strict";

(function initializeEntityTransfer() {
    const DATA_API = "http://127.0.0.1:8080/api/data";

    async function downloadCsv(entity, button) {
        const originalText = button.innerHTML;
        try {
            button.disabled = true;
            button.textContent = "Đang xuất...";

            const response = await fetch(
                `${DATA_API}/export/${encodeURIComponent(entity)}?format=csv`,
                { method: "GET", credentials: "include" }
            );

            if (response.status === 401) {
                window.location.replace("login.html");
                return;
            }
            if (!response.ok) {
                const err = await response.json().catch(() => null);
                throw new Error(err?.message || `HTTP ${response.status}`);
            }

            const disposition = response.headers.get("Content-Disposition") || "";
            const match = disposition.match(/filename="?([^"]+)"?/i);
            const filename = match ? match[1] : `beautyshop-${entity}.csv`;

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) {
            window.alert("Không thể xuất CSV: " + error.message);
        } finally {
            button.disabled = false;
            button.innerHTML = originalText;
        }
    }

    async function runEntityImport(entity, file, onSuccess) {
        if (!file) return;

        const formData = new FormData();
        formData.append("file", file);

        const dryResp = await fetch(
            `${DATA_API}/import/${encodeURIComponent(entity)}?mode=upsert&dryRun=true`,
            { method: "POST", credentials: "include", body: formData }
        );
        if (dryResp.status === 401) {
            window.location.replace("login.html");
            return;
        }
        const dryResult = await dryResp.json();
        if (!dryResp.ok) {
            throw new Error(dryResult?.message || `Kiểm tra file thất bại (HTTP ${dryResp.status})`);
        }

        if ((dryResult.error_count || 0) > 0) {
            const firstErrors = (dryResult.errors || [])
                .slice(0, 5)
                .map(e => `• Dòng ${e.row || "?"}: ${e.message}`)
                .join("\n");
            throw new Error(`${dryResult.message}\n\n${firstErrors}`);
        }

        const confirmed = window.confirm(
            `Kiểm tra file "${file.name}" hợp lệ:\n` +
            `• Tổng dòng: ${dryResult.total_rows}\n` +
            `• Thêm mới: ${dryResult.created}\n` +
            `• Cập nhật: ${dryResult.updated}\n` +
            `• Bỏ qua: ${dryResult.skipped}\n\n` +
            "Bạn có muốn xác nhận nhập dữ liệu vào hệ thống không?"
        );
        if (!confirmed) return;

        const commitForm = new FormData();
        commitForm.append("file", file);
        const commitResp = await fetch(
            `${DATA_API}/import/${encodeURIComponent(entity)}?mode=upsert&dryRun=false`,
            { method: "POST", credentials: "include", body: commitForm }
        );
        const commitResult = await commitResp.json();
        if (!commitResp.ok || !commitResult.success) {
            throw new Error(commitResult?.message || `Import thất bại (HTTP ${commitResp.status})`);
        }

        window.alert(commitResult.message || "Nhập dữ liệu thành công.");
        if (typeof onSuccess === "function") {
            await onSuccess(commitResult);
        } else {
            window.location.reload();
        }
    }

    window.BeautyShopTransfer = {
        runEntityImport,
        downloadCsv
    };

    document.addEventListener("DOMContentLoaded", () => {
        document.querySelectorAll("[data-export-csv]").forEach(button => {
            button.addEventListener("click", () => {
                downloadCsv(button.dataset.exportCsv, button);
            });
        });

        document.querySelectorAll("[data-import-entity]").forEach(button => {
            const entity = button.dataset.importEntity;
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".csv,.json,text/csv,application/json";
            input.hidden = true;
            button.after(input);

            button.addEventListener("click", () => input.click());
            input.addEventListener("change", async event => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                const original = button.innerHTML;
                try {
                    button.disabled = true;
                    button.textContent = "Đang xử lý...";
                    await runEntityImport(entity, file);
                } catch (error) {
                    window.alert("Lỗi nhập dữ liệu: " + error.message);
                } finally {
                    button.disabled = false;
                    button.innerHTML = original;
                }
            });
        });
    });
})();
