# BeautyShop Database

BeautyShop dùng Apache CouchDB 3.x. Dữ liệu được lưu dưới dạng JSON document trong database `beauty_shop`.

## Cấu trúc

```text
database/
├── indexes/       # Định nghĩa Mango index (JSON)
├── seed/          # Dữ liệu mẫu giả lập, không phải dữ liệu cửa hàng thật
├── scripts/       # Tạo index và nhập mẫu vào CouchDB
└── backups/       # Nơi lưu backup cục bộ; không commit file backup
```

## Tạo database

1. Khởi động CouchDB và mở `http://localhost:5984/_utils`.
2. Đăng nhập bằng tài khoản CouchDB của máy.
3. Tạo database tên `beauty_shop` nếu chưa tồn tại.
4. Ở thư mục gốc dự án, tạo `backend/.env` từ `backend/.env.example` và điền thông tin thật.

Các script PowerShell bên dưới tự đọc `backend/.env`; không cần ghi password vào câu lệnh.

## Tạo Mango indexes

```powershell
.\database\scripts\create-indexes.ps1
```

Index giúp các truy vấn Mango theo `type`, `status`, `category`, `membership` và `branch_id` có thể sử dụng index phù hợp. Một số Service hiện tại vẫn duyệt `_all_docs`; việc tạo index không tự động chuyển các truy vấn đó sang Mango.

## Nhập dữ liệu mẫu

```powershell
.\database\scripts\import-samples.ps1 -WhatIf
.\database\scripts\import-samples.ps1
```

Lệnh đầu chỉ xem trước. Lệnh thứ hai nhập các document mẫu có ID bắt đầu bằng `sample_`. Script bỏ qua ID đã tồn tại và không ghi đè document hiện có.

Dữ liệu mẫu gồm sản phẩm, dịch vụ, khách hàng và nhân viên. Không có user mẫu vì tài khoản đăng nhập phải được tạo qua chức năng quản lý tài khoản và phải có BCrypt hash hợp lệ.

## Backup / Restore

- Backup database theo hướng dẫn CouchDB hoặc dùng công cụ sao lưu phù hợp với phiên bản đang chạy.
- Lưu backup trong `database/backups/` trên máy riêng.
- Không commit backup chứa thông tin khách hàng, nhân viên, tài khoản hoặc giao dịch.
- Trước khi restore, backup database hiện tại và kiểm tra đúng tên database đích.

## Quy ước document

- `_id`: ID duy nhất trong database.
- `_rev`: revision do CouchDB cấp; không tự tạo revision.
- `type`: loại document, ví dụ `product`, `service`, `customer`, `employee`, `user`, `appointment`, `invoice`, `payment`.
- Các trường nghiệp vụ phải thống nhất với Service/Controller tương ứng.
