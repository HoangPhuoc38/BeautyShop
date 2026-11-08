
"use strict";

// =====================================================
// 1. CẤU HÌNH API BEAUTYSHOP
// =====================================================

const API = {
    products: "http://127.0.0.1:8080/api/products",
    customers: "http://127.0.0.1:8080/api/customers",
    services: "http://127.0.0.1:8080/api/services",
    appointments: "http://127.0.0.1:8080/api/appointments",
    payments: "http://127.0.0.1:8080/api/payments"
};

// =====================================================
// 2. LƯU TRỮ DỮ LIỆU DASHBOARD
// =====================================================

const dashboardData = {
    products: [],
    customers: [],
    services: [],
    appointments: [],
    customerMap: new Map(),
    serviceMap: new Map()
};

let dashboardRole = "staff";

async function loadDashboardRole() {
    try {
        const response = await fetch("http://127.0.0.1:8080/api/auth/me", {
            credentials: "include",
            headers: { Accept: "application/json" }
        });

        if (!response.ok) return dashboardRole;

        const result = await response.json();
        dashboardRole = String(result?.user?.role || "staff")
            .replace(/^ROLE_/i, "")
            .toLowerCase();
    } catch (error) {
        console.error("[Dashboard] Không tải được quyền:", error);
    }

    return dashboardRole;
}

// =====================================================
// 3. KHỞI TẠO DASHBOARD
// =====================================================

async function initializeDashboard() {
    console.log("[Dashboard] Đang khởi tạo...");

    displayCurrentDate();
    displayCurrentYear();

    await loadDashboardRole();

    const canViewFinancialReports = ["admin", "manager"].includes(
        dashboardRole
    );

    document.querySelectorAll(".payment-dashboard-section").forEach(section => {
        section.hidden = !canViewFinancialReports;
    });

    const revenueCard = document.getElementById("dashboardRevenueCard");
    if (revenueCard) revenueCard.hidden = !canViewFinancialReports;

    // Tải các dữ liệu độc lập song song.
    await Promise.allSettled([
        loadProducts(),
        loadCustomers(),
        loadServices(),
        canViewFinancialReports ? loadRevenue() : Promise.resolve()
    ]);

    // Tải lịch hẹn sau khi đã có dữ liệu khách hàng và dịch vụ.
    await loadAppointments();

    console.log("[Dashboard] Khởi tạo hoàn tất.");
}

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeDashboard,
        { once: true }
    );
} else {
    initializeDashboard();
}

// =====================================================
// 4. NGÀY HIỆN TẠI
// =====================================================

function displayCurrentDate() {
    const element = document.getElementById("currentDate");

    if (!element) return;

    element.textContent = new Date().toLocaleDateString("vi-VN", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });
}

function displayCurrentYear() {
    const element = document.getElementById("currentYear");

    if (element) {
        element.textContent = new Date().getFullYear();
    }
}

// =====================================================
// 5. HÀM GỌI API CHUNG
// =====================================================

async function fetchList(url) {
    const response = await fetch(url, {
        method: "GET",

        // Quan trọng: gửi cookie phiên đăng nhập đến Backend.
        credentials: "include",

        headers: {
            Accept: "application/json"
        },

        signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
        const errorText = await response.text();

        throw new Error(
            `HTTP ${response.status}: ${url}\n${errorText}`
        );
    }

    const data = await response.json();

    // API trả về mảng trực tiếp.
    if (Array.isArray(data)) {
        return data;
    }

    // API trả về object chứa danh sách.
    const possibleLists = [
        data.content,
        data.data,
        data.items,
        data.results,
        data.customers,
        data.services,
        data.products,
        data.appointments
    ];

    for (const list of possibleLists) {
        if (Array.isArray(list)) {
            return list;
        }
    }

    // API lồng danh sách trong data.
    if (data.data && typeof data.data === "object") {
        const nestedLists = [
            data.data.content,
            data.data.items,
            data.data.results,
            data.data.customers,
            data.data.services,
            data.data.appointments
        ];

        for (const list of nestedLists) {
            if (Array.isArray(list)) {
                return list;
            }
        }
    }

    throw new Error(
        `API không trả về danh sách hợp lệ: ${url}`
    );
}

// =====================================================
// 6. HÀM TIỆN ÍCH
// =====================================================

function setText(id, value) {
    const element = document.getElementById(id);

    if (element) {
        element.textContent = value;
    }
}

function formatNumber(value) {
    return new Intl.NumberFormat("vi-VN").format(
        Number(value) || 0
    );
}

function formatCurrency(value) {
    const amount = Number(value ?? 0);

    if (!Number.isFinite(amount)) {
        return "—";
    }

    return new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
        maximumFractionDigits: 0
    }).format(amount);
}

function getId(item) {
    return item.customer_id ||
        item.product_id ||
        item.service_id ||
        item.appointment_id ||
        item.payment_id ||
        item._id ||
        item.id ||
        "";
}

function normalizeCode(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase();
}

function getFirstText(object, fields) {
    if (!object || typeof object !== "object") {
        return "";
    }

    for (const field of fields) {
        const value = object[field];

        if (
            value !== undefined &&
            value !== null &&
            typeof value !== "object" &&
            String(value).trim() !== ""
        ) {
            return String(value).trim();
        }
    }

    return "";
}

// =====================================================
// 7. CHUẨN HÓA NGÀY THÁNG
// =====================================================

function getLocalDateString(date) {
    const year = date.getFullYear();

    const month = String(date.getMonth() + 1)
        .padStart(2, "0");

    const day = String(date.getDate())
        .padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function getAppointmentDate(appointment) {
    const value =
        appointment.appointment_date ||
        appointment.appointmentDate ||
        appointment.date ||
        "";

    if (!value) return "";

    const text = String(value).trim();

    // YYYY-MM-DD hoặc YYYY-MM-DDTHH:mm:ss.
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
        return text.slice(0, 10);
    }

    // DD/MM/YYYY.
    const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

    if (match) {
        return `${match[3]}-${match[2]}-${match[1]}`;
    }

    return text.slice(0, 10);
}

function formatDate(value) {
    if (!value) {
        return "Chưa có ngày";
    }

    const text = String(value).trim();

    const isoDate = text.match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (isoDate) {
        return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`;
    }

    return text;
}

function getAppointmentSortValue(appointment) {
    const date = getAppointmentDate(appointment);

    const time =
        appointment.start_time ||
        appointment.startTime ||
        "00:00";

    return `${date} ${time}`;
}

// =====================================================
// 8. TỔNG SỐ SẢN PHẨM
// =====================================================

async function loadProducts() {
    const container = document.getElementById("featuredProducts");

    try {
        const products = await fetchList(API.products);

        dashboardData.products = products;

        setText("totalProducts", formatNumber(products.length));

        const activeProducts = products.filter(product => {
            const status = String(product.status ?? "").toLowerCase();

            return !status || status === "active";
        });

        if (!container) return;

        container.replaceChildren();

        if (activeProducts.length === 0) {
            showMessage(container, "Chưa có sản phẩm.");
            return;
        }

        activeProducts.slice(0, 3).forEach(product => {
            container.appendChild(createProductCard(product));
        });

    } catch (error) {
        console.error("[Dashboard] Không tải được sản phẩm:", error);

        setText("totalProducts", "Không tải được");

        if (container) {
            showMessage(
                container,
                "Không thể tải sản phẩm từ máy chủ."
            );
        }
    }
}

// =====================================================
// 9. TẠO THẺ SẢN PHẨM
// =====================================================

function createProductCard(product) {
    const item = document.createElement("div");
    item.className = "product-item";

    const image = document.createElement("div");
    image.className = "product-image skincare";
    image.setAttribute("aria-hidden", "true");
    image.textContent = "♡";

    const info = document.createElement("div");
    info.className = "product-info";

    const name = document.createElement("h4");
    name.textContent = product.name || "Sản phẩm chưa có tên";

    const category = document.createElement("p");
    category.textContent =
        "Danh mục: " + formatCategory(product.category);

    const code = document.createElement("p");
    code.className = "product-code";
    code.textContent = "Mã: " + (getId(product) || "N/A");

    const priceContainer = document.createElement("div");
    priceContainer.className = "product-price";

    const price = document.createElement("strong");
    const priceValue = Number(product.price);

    price.textContent =
        product.price !== null &&
        product.price !== undefined &&
        product.price !== "" &&
        Number.isFinite(priceValue)
            ? formatCurrency(priceValue)
            : "Chưa có giá";

    const stock = document.createElement("span");
    stock.textContent = `Tồn kho: ${product.stock ?? 0}`;

    info.append(name, category, code);
    priceContainer.append(price, stock);
    item.append(image, info, priceContainer);

    return item;
}

// =====================================================
// 10. CHUYỂN MÃ DANH MỤC SANG TÊN
// =====================================================

function formatCategory(category) {
    const categories = {
        nail_polish: "Sơn móng",
        skincare: "Chăm sóc da",
        makeup: "Trang điểm",
        lipstick: "Son môi",
        shampoo: "Dầu gội",
        haircare: "Chăm sóc tóc",
        cleanser: "Sữa rửa mặt",
        moisturizer: "Kem dưỡng ẩm",
        sunscreen: "Kem chống nắng",
        perfume: "Nước hoa"
    };

    if (!category) {
        return "Chưa phân loại";
    }

    return categories[category] ||
        String(category).replace(/_/g, " ");
}

// =====================================================
// 11. LẤY TÊN KHÁCH HÀNG
// =====================================================

function extractCustomerName(customer) {
    if (!customer || typeof customer !== "object") {
        return "";
    }

    const directName = getFirstText(customer, [
        "full_name",
        "fullName",
        "customer_name",
        "customerName",
        "display_name",
        "displayName",
        "name",
        "ten_khach_hang",
        "tenKhachHang",
        "ho_ten",
        "hoTen",
        "hoten",
        "ten"
    ]);

    if (directName) {
        return directName;
    }

    const firstName = getFirstText(customer, [
        "first_name",
        "firstName",
        "given_name",
        "givenName"
    ]);

    const lastName = getFirstText(customer, [
        "last_name",
        "lastName",
        "family_name",
        "familyName"
    ]);

    if (firstName || lastName) {
        return `${lastName} ${firstName}`.trim();
    }

    const ho = getFirstText(customer, ["ho", "surname"]);

    const tenDem = getFirstText(customer, [
        "ten_dem",
        "tenDem",
        "middle_name",
        "middleName"
    ]);

    const ten = getFirstText(customer, [
        "ten",
        "given_name",
        "givenName"
    ]);

    if (ho || tenDem || ten) {
        return [ho, tenDem, ten].filter(Boolean).join(" ");
    }

    if (customer.customer && typeof customer.customer === "object") {
        return extractCustomerName(customer.customer);
    }

    if (customer.profile && typeof customer.profile === "object") {
        return extractCustomerName(customer.profile);
    }

    return "";
}

// =====================================================
// 12. MÃ TRA CỨU KHÁCH HÀNG
// =====================================================

function getCustomerAliases(customer) {
    const values = [
        customer.customer_id,
        customer.customerId,
        customer._id,
        customer.id
    ];

    const aliases = new Set();

    values.forEach(value => {
        if (!value) return;

        const code = normalizeCode(value);

        aliases.add(code);
        aliases.add(code.replace(/^customer[_-]/, ""));
    });

    return [...aliases].filter(Boolean);
}

// =====================================================
// 13. TẢI KHÁCH HÀNG
// =====================================================

async function loadCustomers() {
    try {
        const customers = await fetchList(API.customers);

        dashboardData.customers = customers;
        dashboardData.customerMap.clear();

        customers.forEach(customer => {
            const customerName = extractCustomerName(customer);

            const normalizedCustomer = {
                ...customer,
                _dashboardName: customerName
            };

            getCustomerAliases(customer).forEach(alias => {
                dashboardData.customerMap.set(
                    alias,
                    normalizedCustomer
                );
            });
        });

        setText("totalCustomers", formatNumber(customers.length));

        console.log(
            `[Dashboard] Đã tải ${customers.length} khách hàng.`
        );

        return customers;

    } catch (error) {
        console.error("[Dashboard] Không tải được khách hàng:", error);

        dashboardData.customers = [];
        dashboardData.customerMap.clear();

        setText("totalCustomers", "Không tải được");

        return [];
    }
}

// =====================================================
// 14. MÃ TRA CỨU DỊCH VỤ
// =====================================================

function getServiceAliases(service) {
    const values = [
        service.service_id,
        service.serviceId,
        service._id,
        service.id
    ];

    const aliases = new Set();

    values.forEach(value => {
        if (!value) return;

        const code = normalizeCode(value);

        aliases.add(code);
        aliases.add(code.replace(/^service[_-]/, ""));
    });

    return [...aliases].filter(Boolean);
}

// =====================================================
// 15. TẢI DỊCH VỤ
// =====================================================

async function loadServices() {
    try {
        const services = await fetchList(API.services);

        dashboardData.services = services;
        dashboardData.serviceMap.clear();

        services.forEach(service => {
            getServiceAliases(service).forEach(alias => {
                dashboardData.serviceMap.set(alias, service);
            });
        });

        console.log(
            `[Dashboard] Đã tải ${services.length} dịch vụ.`
        );

        return services;

    } catch (error) {
        console.error("[Dashboard] Không tải được dịch vụ:", error);

        dashboardData.services = [];
        dashboardData.serviceMap.clear();

        return [];
    }
}

// =====================================================
// 16. TRA CỨU KHÁCH HÀNG TRONG LỊCH HẸN
// =====================================================

function getCustomerInformation(appointment) {
    const customerId =
        appointment.customer_id ||
        appointment.customerId ||
        "";

    const embeddedCustomer =
        appointment.customer &&
        typeof appointment.customer === "object"
            ? appointment.customer
            : null;

    const customer = dashboardData.customerMap.get(
        normalizeCode(customerId)
    );

    const embeddedName = embeddedCustomer
        ? extractCustomerName(embeddedCustomer)
        : "";

    const customerName =
        appointment.customer_name ||
        appointment.customerName ||
        embeddedName ||
        customer?._dashboardName ||
        extractCustomerName(customer) ||
        "";

    return {
        customerId: customerId || "N/A",
        customerName: customerName || "Chưa có tên khách hàng",
        customer
    };
}

// =====================================================
// 17. TRA CỨU DỊCH VỤ TRONG LỊCH HẸN
// =====================================================

function getServiceInformation(appointment) {
    let serviceIds =
        appointment.service_ids ||
        appointment.serviceIds ||
        [];

    if (typeof serviceIds === "string") {
        serviceIds = serviceIds
            .split(",")
            .map(id => id.trim())
            .filter(Boolean);
    }

    if (!Array.isArray(serviceIds)) {
        serviceIds = [];
    }

    const services = serviceIds.map(item => {
        let serviceId = "";
        let embeddedService = null;

        if (typeof item === "object" && item !== null) {
            serviceId =
                item.service_id ||
                item.serviceId ||
                item._id ||
                item.id ||
                "";

            embeddedService = item;
        } else {
            serviceId = String(item);
        }

        const service = embeddedService ||
            dashboardData.serviceMap.get(
                normalizeCode(serviceId)
            );

        const serviceName = getFirstText(service, [
            "name",
            "service_name",
            "serviceName",
            "ten_dich_vu",
            "tenDichVu"
        ]);

        return {
            serviceId,
            serviceName: serviceName || "Chưa có tên dịch vụ",
            service
        };
    });

    if (services.length === 0) {
        const serviceName =
            appointment.service_name ||
            appointment.serviceName ||
            "";

        if (serviceName) {
            services.push({
                serviceId: "",
                serviceName
            });
        }
    }

    return services;
}

// =====================================================
// 18. CHUẨN HÓA TRẠNG THÁI LỊCH HẸN
// =====================================================

function getAppointmentStatus(appointment) {
    const status = String(
        appointment.status || ""
    ).toLowerCase();

    const statusLabels = {
        booked: "Đã đặt",
        confirmed: "Đã xác nhận",
        completed: "Đã hoàn thành",
        cancelled: "Đã hủy",
        pending: "Chờ xác nhận",
        checked_in: "Đã đến",
        in_progress: "Đang thực hiện",
        no_show: "Không đến"
    };

    return {
        status,
        label: statusLabels[status] || status || "Chưa rõ"
    };
}

// =====================================================
// 19. DỮ LIỆU TÌM KIẾM LỊCH HẸN
// =====================================================

function buildAppointmentSearchText(appointment) {
    const customer = getCustomerInformation(appointment);
    const services = getServiceInformation(appointment);
    const status = getAppointmentStatus(appointment);

    const appointmentId =
        appointment.appointment_id ||
        appointment.appointmentId ||
        appointment._id ||
        "";

    const date = getAppointmentDate(appointment);

    const displayDate = formatDate(date);

    const startTime =
        appointment.start_time ||
        appointment.startTime ||
        "";

    return [
        customer.customerName,
        customer.customerId,
        ...services.map(service => service.serviceName),
        ...services.map(service => service.serviceId),
        appointmentId,
        date,
        displayDate,
        startTime,
        status.status,
        status.label,
        appointment.note,
        appointment.description
    ]
        .filter(Boolean)
        .join(" ");
}

// =====================================================
// 20. TẠO DÒNG LỊCH HẸN
// =====================================================

function createAppointmentRow(appointment) {
    const row = document.createElement("tr");

    const customer = getCustomerInformation(appointment);
    const services = getServiceInformation(appointment);
    const status = getAppointmentStatus(appointment);

    const appointmentId =
        appointment.appointment_id ||
        appointment.appointmentId ||
        appointment._id ||
        "";

    // CỘT KHÁCH HÀNG
    const customerCell = document.createElement("td");

    const customerContainer = document.createElement("div");
    customerContainer.className = "customer-cell";

    const avatar = document.createElement("div");
    avatar.className = "mini-avatar pink";

    const words = customer.customerName
        .split(/\s+/)
        .filter(Boolean);

    const initials = words
        .slice(-2)
        .map(word => word.charAt(0))
        .join("")
        .toUpperCase();

    avatar.textContent = initials || "KH";

    const customerText = document.createElement("div");
    customerText.className = "dashboard-cell-text";

    const customerName = document.createElement("strong");
    customerName.className = "dashboard-primary-text";
    customerName.textContent = customer.customerName;

    const customerCode = document.createElement("small");
    customerCode.className = "dashboard-secondary-text";
    customerCode.textContent =
        `Mã khách hàng: ${customer.customerId}`;

    customerText.append(customerName, customerCode);
    customerContainer.append(avatar, customerText);
    customerCell.appendChild(customerContainer);

    // CỘT DỊCH VỤ
    const serviceCell = document.createElement("td");

    const serviceContainer = document.createElement("div");
    serviceContainer.className = "dashboard-cell-text";

    if (services.length > 0) {
        services.forEach(service => {
            const serviceName = document.createElement("span");
            serviceName.className = "dashboard-service-name";
            serviceName.textContent = service.serviceName;

            serviceContainer.appendChild(serviceName);

            if (service.serviceId) {
                const serviceCode = document.createElement("small");
                serviceCode.className = "dashboard-secondary-text";
                serviceCode.textContent =
                    `Mã dịch vụ: ${service.serviceId}`;

                serviceContainer.appendChild(serviceCode);
            }
        });
    } else {
        const emptyService = document.createElement("span");
        emptyService.textContent = "Chưa có thông tin dịch vụ";

        serviceContainer.appendChild(emptyService);
    }

    serviceCell.appendChild(serviceContainer);

    // CỘT THỜI GIAN
    const timeCell = document.createElement("td");

    const dateText = document.createElement("span");
    dateText.className = "dashboard-appointment-date";
    dateText.textContent =
        formatDate(getAppointmentDate(appointment));

    const startTime = document.createElement("small");
    startTime.className = "dashboard-secondary-text";
    startTime.textContent =
        appointment.start_time ||
        appointment.startTime ||
        "Chưa có giờ";

    timeCell.append(
        dateText,
        document.createElement("br"),
        startTime
    );

    if (appointmentId) {
        const appointmentCode = document.createElement("small");

        appointmentCode.className = "dashboard-secondary-text";
        appointmentCode.style.display = "block";
        appointmentCode.textContent =
            `Mã lịch hẹn: ${appointmentId}`;

        timeCell.appendChild(appointmentCode);
    }

    // CỘT TRẠNG THÁI
    const statusCell = document.createElement("td");

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = status.label;

    if (
        status.status === "confirmed" ||
        status.status === "completed" ||
        status.status === "checked_in"
    ) {
        badge.classList.add("confirmed");
    } else if (status.status === "cancelled") {
        badge.classList.add("cancelled");
    } else {
        badge.classList.add("pending");
    }

    statusCell.appendChild(badge);

    // DỮ LIỆU TÌM KIẾM
    row.dataset.searchText =
        buildAppointmentSearchText(appointment);

    row.dataset.appointmentId = appointmentId;

    // GHÉP CÁC CỘT
    row.append(
        customerCell,
        serviceCell,
        timeCell,
        statusCell
    );

    return row;
}

// =====================================================
// 21. TẢI TOÀN BỘ LỊCH HẸN
// =====================================================

async function loadAppointments() {
    const table = document.getElementById("appointmentTable");

    try {
        const appointments = await fetchList(API.appointments);

        dashboardData.appointments = appointments;

        console.log(
            `[Dashboard] Đã tải ${appointments.length} lịch hẹn.`
        );

        // Tính lịch hẹn hôm nay.
        const today = getLocalDateString(new Date());

        const todayAppointments = appointments.filter(
            appointment =>
                getAppointmentDate(appointment) === today
        );

        setText(
            "totalAppointments",
            formatNumber(todayAppointments.length)
        );

        if (!table) return;

        table.replaceChildren();

        // Hiển thị 5 lịch hẹn gần nhất.
        const recentAppointments = [...appointments]
            .sort((a, b) => {
                const dateA = getAppointmentSortValue(a);
                const dateB = getAppointmentSortValue(b);

                return dateB.localeCompare(dateA);
            })
            .slice(0, 5);

        if (recentAppointments.length === 0) {
            showTableMessage(table, "Chưa có lịch hẹn.");
        } else {
            recentAppointments.forEach(appointment => {
                table.appendChild(
                    createAppointmentRow(appointment)
                );
            });
        }

        // Thông báo cho module tìm kiếm.
        document.dispatchEvent(
            new CustomEvent("dashboard:appointments-loaded")
        );

    } catch (error) {
        console.error(
            "[Dashboard] Không tải được lịch hẹn:",
            error
        );

        setText("totalAppointments", "Không tải được");

        if (table) {
            showTableMessage(
                table,
                "Không thể tải lịch hẹn từ máy chủ."
            );
        }
    }
}

// =====================================================
// 22. DOANH THU HÔM NAY
// =====================================================

async function loadRevenue() {
    try {
        const response = await fetch(
            `${API.payments}/statistics`,
            {
                method: "GET",

                // Gửi cookie phiên đăng nhập.
                credentials: "include",

                headers: {
                    Accept: "application/json"
                },

                signal: AbortSignal.timeout(10000)
            }
        );

        if (!response.ok) {
            const errorText = await response.text();

            throw new Error(
                `HTTP ${response.status}: ${errorText}`
            );
        }

        const statistics = await response.json();

        if (statistics.todayRevenue !== undefined) {
            setText(
                "totalRevenue",
                formatCurrency(statistics.todayRevenue)
            );

            return;
        }

        throw new Error("API chưa trả về todayRevenue.");

    } catch (error) {
        console.error(
            "[Dashboard] Không tải được doanh thu:",
            error
        );

        setText("totalRevenue", "Chưa có dữ liệu");
    }
}

// =====================================================
// 23. HIỂN THỊ THÔNG BÁO
// =====================================================

function showMessage(container, message) {
    container.replaceChildren();

    const paragraph = document.createElement("p");
    paragraph.className = "product-message";
    paragraph.textContent = message;

    container.appendChild(paragraph);
}

function showTableMessage(table, message) {
    table.replaceChildren();

    const row = document.createElement("tr");

    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = message;

    row.appendChild(cell);
    table.appendChild(row);
}
