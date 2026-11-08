# CouchDB Data Model

## Database

- Default database: `beauty_shop`
- Default CouchDB URL: `http://localhost:5984`
- Database type: non-relational document database.

## Document types hiện diện trong Backend

| `type` | Trường/ý nghĩa tiêu biểu |
|---|---|
| `product` | `product_id`, `name`, `category`, `price`, `stock`, `status` |
| `service` | `service_id`, `name`, `category`, `price`, `duration_minutes`, `status` |
| `customer` | `customer_id`, `full_name`, `phone`, `email`, `membership`, `points`, `rank` |
| `employee` | `employee_id`, `full_name`, `username`, `role`, `phone`, `email`, `status`, `branch_id` |
| `user` | `user_id`, `username`, `employee_id`, `role`, `branch_id`, `password_hash`, `must_change_password`, `status` |
| `appointment` | Lịch hẹn; xem payload trong AppointmentController và dữ liệu hiện có |
| `invoice` | Hóa đơn; xem DTO và InvoiceService |
| `payment` | Giao dịch thanh toán; xem Payment Service |

Các document có thể chứa thêm trường theo nghiệp vụ. Bảng này không phải schema bắt buộc đầy đủ cho mọi phiên bản.

## Revision

- CouchDB tạo `_rev` sau khi document được lưu.
- Khi cập nhật document, phải gửi `_rev` mới nhất.
- Nếu revision cũ, CouchDB có thể trả HTTP 409 Conflict.
- Xóa document cần revision và tạo tombstone; không đồng nghĩa file vật lý bị xóa ngay lập tức.

## Mango indexes

Các định nghĩa JSON nằm trong `database/indexes/`. Tạo bằng:

```powershell
.\database\scripts\create-indexes.ps1
```

Các index hiện là cơ sở để truy vấn Mango trong tương lai. Các Service đang dùng `_all_docs?include_docs=true` chưa tự động sử dụng các index này.

## Sample data

Các file `database/seed/*.sample.json` chỉ chứa dữ liệu giả lập. Import script chỉ tạo document thiếu và không cập nhật document đã tồn tại. Không import `user-document.schema.example.json`; đây là mẫu cấu trúc cần BCrypt hash hợp lệ và liên kết employee thực tế.
