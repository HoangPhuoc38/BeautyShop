# Architecture

## 1. Tổng quan

BeautyShop là ứng dụng web theo mô hình tách lớp:

```text
Browser (HTML / CSS / JavaScript)
          |
          | HTTP + JSON + Session Cookie
          v
Spring Boot REST API (port 8080)
          |
          | CouchDB HTTP API
          v
Apache CouchDB (database: beauty_shop)
```

Frontend chạy bằng Live Server ở `http://127.0.0.1:5500` hoặc `http://localhost:5500`. Backend cấu hình CORS cho hai origin này và cho phép gửi cookie phiên.

## 2. Backend packages

| Package | Trách nhiệm |
|---|---|
| `auth` | Đăng nhập, đổi mật khẩu, quản lý tài khoản |
| `config` | CORS, interceptor, chính sách truy cập và CouchDB config |
| `couchdb` | Client dùng chung để đọc/ghi document |
| `product` | CRUD sản phẩm |
| `customer` | Quản lý khách hàng |
| `employee` | Quản lý nhân viên |
| `service` | Quản lý dịch vụ làm đẹp |
| `appointment` | Quản lý lịch hẹn |
| `invoice` | Tạo và truy vấn hóa đơn |
| `payment` | Xác nhận, hủy và xem lịch sử thanh toán |
| `loyalty` | Điểm thưởng, hạng thành viên và thống kê |

## 3. Luồng xử lý điển hình

1. JavaScript gửi HTTP request đến REST Controller.
2. Controller xác thực session/role theo cấu hình hiện hành và kiểm tra dữ liệu đầu vào.
3. Service thực hiện nghiệp vụ.
4. `CouchDbClient` hoặc RestClient chuyên biệt gọi CouchDB.
5. CouchDB trả JSON document và revision; Backend trả response cho Frontend.

## 4. Authentication

- Đăng nhập tạo HTTP session.
- Cookie session được gửi bằng `credentials: "include"` ở Fetch API.
- Mật khẩu được kiểm tra bằng BCrypt.
- Tài khoản có `must_change_password=true` phải đổi mật khẩu theo luồng xác thực trước khi dùng các API nghiệp vụ.
- `AuthInterceptor`, `AuthWebConfig`, `RoleAccessPolicy` và `RecordAccessPolicy` tham gia kiểm soát truy cập.

## 5. CouchDB

Dữ liệu dùng document JSON và trường `type` để phân loại. `_id` là định danh, `_rev` là revision do CouchDB cấp. Không tự tạo `_rev` và không ghi đè document hiện có khi seed dữ liệu.
