"use strict";

const API_BASE = "http://127.0.0.1:8080/api";
const DATA_API = `${API_BASE}/data`;
const AUTH_API = `${API_BASE}/auth/me`;

const dmState = {
    user: null,
    role: "staff",
    restoreFile: null,
    importFile: null,
    lastDryRunValid: false
};

const $ = (id) => document.getElementById(id);

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[ch]);
}

function showBanner(message, type = "info") {
    const banner = $("dataBanner");
    if (!banner) return;
    banner.textContent = message;
    banner.className = `data-banner ${type}`;
    banner.hidden = false;
}

function formatBytes(bytes) {
    const num = Number(bytes || 0);
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    return `${(num / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("vi-VN");
}

async function apiJson(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        credentials: "include",
        headers: {
            Accept: "application/json",
            ...(options.headers || {})
        }
    });

    if (response.status === 401) {
        window.location.replace("login.html");
        throw new Error("SESSION_EXPIRED");
    }

    const text = await response.text();
    let data = null;
    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            data = { message: text };
        }
    }

    if (!response.ok && data && typeof data === "object" && Array.isArray(data.errors)) {
        return data;
    }

    if (!response.ok) {
        throw new Error(data?.message || `Yêu cầu thất bại (HTTP ${response.status})`);
    }

    return data;
}

async function downloadFileFromEndpoint(url, fallbackName) {
    const response = await fetch(url, {
        method: "GET",
        credentials: "include"
    });

    if (response.status === 401) {
        window.location.replace("login.html");
        return;
    }

    if (!response.ok) {
        const text = await response.text();
        let message = `Tải xuống thất bại (HTTP ${response.status})`;
        try {
            const parsed = JSON.parse(text);
            if (parsed?.message) message = parsed.message;
        } catch {
        }
        throw new Error(message);
    }

    const disposition = response.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="?([^"]+)"?/i);
    const filename = match ? match[1] : fallbackName;

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

async function checkAuth() {
    const data = await apiJson(AUTH_API);
    if (!data?.success || !data.user) {
        window.location.replace("login.html");
        return false;
    }
    if (data.mustChangePassword || data.user.mustChangePassword) {
        window.location.replace("change-password.html");
        return false;
    }

    dmState.user = data.user;
    dmState.role = String(data.user.role || "staff")
        .replace(/^ROLE_/i, "")
        .toLowerCase();

    if (!["admin", "manager"].includes(dmState.role)) {
        showBanner("Chỉ Quản trị viên (Admin) hoặc Quản lý (Manager) mới có quyền truy cập trang Sao lưu & Dữ liệu.", "error");
        return false;
    }

    const isAdmin = dmState.role === "admin";
    $("adminBackupSection").hidden = !isAdmin;
    $("statUsersCard").hidden = !isAdmin;
    const managerNotice = $("managerBackupNotice");
    if (managerNotice) managerNotice.hidden = isAdmin;

    const empOpt = $("importEmployeeOption");
    if (empOpt) empOpt.hidden = !isAdmin;

    return true;
}

async function loadOverview() {
    try {
        const data = await apiJson(`${DATA_API}/overview`);
        const counts = data?.counts || {};

        $("databaseSubtitle").textContent =
            `Database: ${data.database || "beauty_shop"} · Tổng số document truy cập được: ${data.total_documents ?? 0}`;

        $("statProducts").textContent = counts.products ?? 0;
        $("statServices").textContent = counts.services ?? 0;
        $("statCustomers").textContent = counts.customers ?? 0;
        $("statEmployees").textContent = counts.employees ?? 0;
        $("statAppointments").textContent = counts.appointments ?? 0;
        $("statInvoices").textContent = counts.invoices ?? 0;
        $("statPayments").textContent = counts.payments ?? 0;
        if ($("statUsers")) $("statUsers").textContent = counts.users ?? 0;
    } catch (error) {
        if (error.message !== "SESSION_EXPIRED") {
            showBanner("Không tải được thống kê dữ liệu: " + error.message, "error");
        }
    }
}

async function loadSnapshots() {
    if (dmState.role !== "admin") return;

    const tbody = $("snapshotsTableBody");
    try {
        const data = await apiJson(`${DATA_API}/backups`);
        const list = Array.isArray(data?.backups) ? data.backups : [];

        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="dm-empty">Chưa có snapshot nào trong database/backups/.</td></tr>`;
            return;
        }

        tbody.innerHTML = list.map(item => `
            <tr>
                <td><strong>${escapeHTML(item.filename)}</strong></td>
                <td>${escapeHTML(formatDateTime(item.exported_at || item.last_modified))}</td>
                <td>${escapeHTML(item.total_documents ?? "—")}</td>
                <td>${item.include_users ? "Có" : "Không"}</td>
                <td>${escapeHTML(formatBytes(item.size_bytes))}</td>
                <td>
                    <div class="dm-row-actions">
                        <button type="button" class="dm-btn dm-btn-secondary dm-btn-sm"
                                data-snapshot-action="download" data-filename="${escapeHTML(item.filename)}">
                            ⇩ Tải
                        </button>
                        <button type="button" class="dm-btn dm-btn-success dm-btn-sm"
                                data-snapshot-action="restore" data-filename="${escapeHTML(item.filename)}">
                            ↥ Khôi phục
                        </button>
                        <button type="button" class="dm-btn dm-btn-danger dm-btn-sm"
                                data-snapshot-action="delete" data-filename="${escapeHTML(item.filename)}">
                            ✕ Xóa
                        </button>
                    </div>
                </td>
            </tr>
        `).join("");
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="6" class="dm-empty">Lỗi tải snapshot: ${escapeHTML(error.message)}</td></tr>`;
    }
}

async function handleDownloadFullBackup() {
    const includeUsers = $("backupIncludeUsers").checked;
    try {
        showBanner("Đang tạo file Full Backup...", "info");
        await downloadFileFromEndpoint(
            `${DATA_API}/backup?includeUsers=${includeUsers}`,
            `beautyshop-backup.json`
        );
        showBanner("Tải xuống Full Backup thành công.", "success");
    } catch (error) {
        showBanner("Không thể tạo backup: " + error.message, "error");
    }
}

async function handleCreateServerSnapshot() {
    const includeUsers = $("backupIncludeUsers").checked;
    const btn = $("saveServerSnapshotBtn");
    try {
        btn.disabled = true;
        const result = await apiJson(`${DATA_API}/backups?includeUsers=${includeUsers}`, {
            method: "POST"
        });
        showBanner(result.message || "Đã lưu snapshot thành công.", "success");
        await loadSnapshots();
    } catch (error) {
        showBanner("Không thể lưu snapshot: " + error.message, "error");
    } finally {
        btn.disabled = false;
    }
}

function getSelectedRestoreMode() {
    return document.querySelector('input[name="restoreMode"]:checked')?.value || "merge";
}

async function handleExecuteRestore() {
    if (!dmState.restoreFile) return;

    const mode = getSelectedRestoreMode();
    const warning = mode === "replace"
        ? "CẢNH BÁO: Chế độ THAY THẾ TOÀN BỘ sẽ xóa các bản ghi không có trong file backup (hệ thống sẽ tự lưu 1 bản dự phòng trước khi thực hiện).\n\nBạn có chắc chắn tiếp tục?"
        : "Khôi phục theo chế độ GỘP DỮ LIỆU (Merge) sẽ thêm mới và cập nhật các document có trong file backup.\n\nBạn có muốn tiếp tục?";

    if (!window.confirm(warning)) return;

    const btn = $("executeRestoreBtn");
    try {
        btn.disabled = true;
        showBanner("Đang khôi phục dữ liệu vào CouchDB...", "info");

        const formData = new FormData();
        formData.append("file", dmState.restoreFile);

        const result = await apiJson(`${DATA_API}/restore?mode=${encodeURIComponent(mode)}`, {
            method: "POST",
            body: formData
        });

        const extra = result.pre_restore_backup
            ? ` (Bản dự phòng trước khi restore: ${result.pre_restore_backup})`
            : "";
        showBanner((result.message || "Khôi phục thành công.") + extra,
            result.success ? "success" : "error");

        await Promise.all([loadOverview(), loadSnapshots()]);
    } catch (error) {
        showBanner("Khôi phục thất bại: " + error.message, "error");
    } finally {
        btn.disabled = !dmState.restoreFile;
    }
}

async function handleSnapshotAction(event) {
    const button = event.target.closest("button[data-snapshot-action]");
    if (!button) return;

    const action = button.dataset.snapshotAction;
    const filename = button.dataset.filename;
    if (!filename) return;

    if (action === "download") {
        try {
            await downloadFileFromEndpoint(
                `${DATA_API}/backups/${encodeURIComponent(filename)}`,
                filename
            );
        } catch (error) {
            showBanner("Lỗi tải snapshot: " + error.message, "error");
        }
        return;
    }

    if (action === "restore") {
        const mode = getSelectedRestoreMode();
        const confirmed = window.confirm(
            `Khôi phục hệ thống từ snapshot "${filename}" theo chế độ "${mode === "replace" ? "Thay thế toàn bộ" : "Gộp dữ liệu"}"?`
        );
        if (!confirmed) return;

        try {
            showBanner(`Đang khôi phục từ ${filename}...`, "info");
            const result = await apiJson(
                `${DATA_API}/backups/${encodeURIComponent(filename)}/restore?mode=${encodeURIComponent(mode)}`,
                { method: "POST" }
            );
            showBanner(result.message || "Khôi phục hoàn tất.", result.success ? "success" : "error");
            await Promise.all([loadOverview(), loadSnapshots()]);
        } catch (error) {
            showBanner("Lỗi khôi phục snapshot: " + error.message, "error");
        }
        return;
    }

    if (action === "delete") {
        if (!window.confirm(`Bạn có chắc muốn xóa snapshot "${filename}" không?`)) return;
        try {
            const result = await apiJson(`${DATA_API}/backups/${encodeURIComponent(filename)}`, {
                method: "DELETE"
            });
            showBanner(result.message || "Đã xóa snapshot.", "success");
            await loadSnapshots();
        } catch (error) {
            showBanner("Không xóa được snapshot: " + error.message, "error");
        }
    }
}

async function handleExportEntity() {
    const entity = $("exportEntitySelect").value;
    const format = $("exportFormatSelect").value;
    try {
        showBanner(`Đang xuất dữ liệu ${entity} (${format.toUpperCase()})...`, "info");
        await downloadFileFromEndpoint(
            `${DATA_API}/export/${encodeURIComponent(entity)}?format=${encodeURIComponent(format)}`,
            `beautyshop-${entity}.${format}`
        );
        showBanner(`Xuất dữ liệu ${entity} thành công.`, "success");
    } catch (error) {
        showBanner("Xuất dữ liệu thất bại: " + error.message, "error");
    }
}

async function handleDownloadTemplate() {
    const exportEntity = $("exportEntitySelect").value;
    const entity = ["invoices", "payments"].includes(exportEntity)
        ? $("importEntitySelect").value
        : exportEntity;
    const format = $("exportFormatSelect").value;
    try {
        await downloadFileFromEndpoint(
            `${DATA_API}/template/${encodeURIComponent(entity)}?format=${encodeURIComponent(format)}`,
            `beautyshop-${entity}-template.${format}`
        );
        showBanner(`Đã tải file mẫu cho ${entity}.`, "success");
    } catch (error) {
        showBanner("Không tải được file mẫu: " + error.message, "error");
    }
}

async function runImport(dryRun) {
    if (!dmState.importFile) return;

    const entity = $("importEntitySelect").value;
    const mode = $("importModeSelect").value;

    const formData = new FormData();
    formData.append("file", dmState.importFile);

    const dryBtn = $("dryRunImportBtn");
    const commitBtn = $("commitImportBtn");

    try {
        dryBtn.disabled = true;
        commitBtn.disabled = true;
        showBanner(dryRun ? "Đang kiểm tra dữ liệu file nhập..." : "Đang nhập dữ liệu vào CouchDB...", "info");

        const result = await apiJson(
            `${DATA_API}/import/${encodeURIComponent(entity)}?mode=${encodeURIComponent(mode)}&dryRun=${dryRun}`,
            { method: "POST", body: formData }
        );

        renderImportPreview(result);

        if (dryRun) {
            dmState.lastDryRunValid = (result.error_count || 0) === 0;
            showBanner(
                result.message || "Kiểm tra xong.",
                dmState.lastDryRunValid ? "success" : "error"
            );
        } else {
            showBanner(
                result.message || "Import hoàn tất.",
                result.success ? "success" : "error"
            );
            if (result.success) {
                await loadOverview();
            }
        }
    } catch (error) {
        showBanner("Lỗi import dữ liệu: " + error.message, "error");
    } finally {
        dryBtn.disabled = !dmState.importFile;
        commitBtn.disabled = !dmState.importFile;
    }
}

function renderImportPreview(result) {
    const card = $("importPreviewCard");
    card.hidden = false;

    $("importPreviewTitle").textContent = result.dry_run
        ? `Kết quả kiểm tra trước (${result.entity})`
        : `Kết quả Import (${result.entity})`;
    $("importPreviewSubtitle").textContent = result.message || "";

    $("importSummaryPills").innerHTML = `
        <span class="dm-pill">Tổng dòng: ${result.total_rows ?? 0}</span>
        <span class="dm-pill create">Thêm mới: ${result.created ?? 0}</span>
        <span class="dm-pill update">Cập nhật: ${result.updated ?? 0}</span>
        <span class="dm-pill skip">Bỏ qua: ${result.skipped ?? 0}</span>
        <span class="dm-pill error">Lỗi: ${result.error_count ?? 0}</span>
    `;

    const errorsBox = $("importErrorsBox");
    const errors = Array.isArray(result.errors) ? result.errors : [];
    if (errors.length > 0) {
        errorsBox.hidden = false;
        errorsBox.innerHTML = `
            <strong>Chi tiết lỗi (${errors.length}):</strong>
            <ul>
                ${errors.slice(0, 25).map(err => `
                    <li>${err.row ? `Dòng ${err.row}: ` : ""}${escapeHTML(err.message || err.reason || err.error || "Lỗi không xác định")}</li>
                `).join("")}
            </ul>
        `;
    } else {
        errorsBox.hidden = true;
        errorsBox.innerHTML = "";
    }

    const preview = Array.isArray(result.preview) ? result.preview : [];
    const tableWrap = $("importPreviewTableWrap");
    if (preview.length === 0) {
        tableWrap.hidden = true;
        return;
    }

    tableWrap.hidden = false;
    const columns = Object.keys(preview[0]).slice(0, 8);
    $("importPreviewHead").innerHTML = `
        <tr>${columns.map(col => `<th>${escapeHTML(col)}</th>`).join("")}</tr>
    `;
    $("importPreviewBody").innerHTML = preview.map(row => `
        <tr>${columns.map(col => {
            const val = Array.isArray(row[col]) ? row[col].join(", ") : row[col];
            return `<td>${escapeHTML(val ?? "")}</td>`;
        }).join("")}</tr>
    `).join("");
}

function wireDropzone(dropzoneId, inputId, onSelectFile) {
    const zone = $(dropzoneId);
    const input = $(inputId);
    if (!zone || !input) return;

    zone.addEventListener("dragover", event => {
        event.preventDefault();
        zone.classList.add("dragover");
    });

    zone.addEventListener("dragleave", () => {
        zone.classList.remove("dragover");
    });

    zone.addEventListener("drop", event => {
        event.preventDefault();
        zone.classList.remove("dragover");
        const file = event.dataTransfer?.files?.[0];
        if (file) onSelectFile(file);
    });

    input.addEventListener("change", event => {
        const file = event.target.files?.[0];
        if (file) onSelectFile(file);
        event.target.value = "";
    });
}

function registerEvents() {
    $("refreshOverviewButton")?.addEventListener("click", loadOverview);
    $("downloadFullBackupBtn")?.addEventListener("click", handleDownloadFullBackup);
    $("saveServerSnapshotBtn")?.addEventListener("click", handleCreateServerSnapshot);
    $("refreshSnapshotsBtn")?.addEventListener("click", loadSnapshots);
    $("snapshotsTableBody")?.addEventListener("click", handleSnapshotAction);
    $("executeRestoreBtn")?.addEventListener("click", handleExecuteRestore);

    $("chooseRestoreFileBtn")?.addEventListener("click", () => $("restoreFileInput").click());
    wireDropzone("restoreDropzone", "restoreFileInput", file => {
        dmState.restoreFile = file;
        $("restoreFileName").textContent = `Đã chọn: ${file.name} (${formatBytes(file.size)})`;
        $("executeRestoreBtn").disabled = false;
    });

    $("exportEntityBtn")?.addEventListener("click", handleExportEntity);
    $("downloadTemplateBtn")?.addEventListener("click", handleDownloadTemplate);

    $("chooseImportFileBtn")?.addEventListener("click", () => $("importFileInput").click());
    wireDropzone("importDropzone", "importFileInput", file => {
        dmState.importFile = file;
        dmState.lastDryRunValid = false;
        $("importFileName").textContent = `Đã chọn: ${file.name} (${formatBytes(file.size)})`;
        $("dryRunImportBtn").disabled = false;
        $("commitImportBtn").disabled = false;
    });

    $("dryRunImportBtn")?.addEventListener("click", () => runImport(true));
    $("commitImportBtn")?.addEventListener("click", () => {
        const entity = $("importEntitySelect").value;
        if (!window.confirm(`Xác nhận nhập dữ liệu từ "${dmState.importFile?.name}" vào phân hệ ${entity}?`)) {
            return;
        }
        runImport(false);
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    registerEvents();
    const ok = await checkAuth();
    if (!ok) return;
    await Promise.all([loadOverview(), loadSnapshots()]);
});
