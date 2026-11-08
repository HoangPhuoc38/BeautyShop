# REST API Reference

Base URL mặc định: `http://localhost:8080`.

Các endpoint dưới đây được tổng hợp từ Controller trong Backend. Quyền truy cập có thể phụ thuộc session, role, chi nhánh và trạng thái bắt buộc đổi mật khẩu.

## Authentication `/api/auth`

| Method | Endpoint | Mục đích |
|---|---|---|
| POST | `/login` | Đăng nhập |
| GET | `/me` | Lấy thông tin phiên |
| POST | `/change-password` | Đổi mật khẩu |
| POST | `/logout` | Đăng xuất |

## User accounts `/api/users`

| Method | Endpoint | Mục đích |
|---|---|---|
| GET | `/` | Danh sách tài khoản |
| POST | `/` | Tạo tài khoản cho nhân viên |
| PUT | `/{accountId}` | Cập nhật tài khoản |
| POST | `/{accountId}/reset-password` | Đặt lại mật khẩu |

## Products `/api/products`

| Method | Endpoint | Mục đích |
|---|---|---|
| GET | `/` | Danh sách sản phẩm |
| GET | `/{id}` | Chi tiết sản phẩm |
| POST | `/` | Tạo sản phẩm |
| PUT | `/{id}` | Cập nhật sản phẩm |
| DELETE | `/{id}?rev={revision}` | Xóa sản phẩm theo revision |
| GET | `/backup` | Xuất danh sách sản phẩm |

## Customers `/api/customers`

| Method | Endpoint | Mục đích |
|---|---|---|
| GET | `/` | Danh sách khách hàng |
| GET | `/{customerId}` | Chi tiết khách hàng |
| POST | `/` | Tạo khách hàng |
| PUT | `/{customerId}` | Cập nhật khách hàng |
| DELETE | `/{customerId}` | Xóa khách hàng |
| GET | `/backup` | Xuất dữ liệu khách hàng |

## Employees `/api/employees`

| Method | Endpoint | Mục đích |
|---|---|---|
| GET | `/` | Danh sách nhân viên |
| GET | `/{id}` | Chi tiết nhân viên |
| POST | `/` | Tạo nhân viên |
| PUT | `/{id}` | Cập nhật nhân viên |
| DELETE | `/{id}?rev={revision}` | Xóa nhân viên |

## Services `/api/services`

| Method | Endpoint | Mục đích |
|---|---|---|
| GET | `/` | Danh sách dịch vụ |
| GET | `/{id}` | Chi tiết dịch vụ |
| POST | `/` | Tạo dịch vụ |
| PUT | `/{id}` | Cập nhật dịch vụ |
| DELETE | `/{id}?rev={revision}` | Xóa dịch vụ |

## Appointments `/api/appointments`

| Method | Endpoint | Mục đích |
|---|---|---|
| GET | `/` | Danh sách lịch hẹn theo phạm vi truy cập |
| GET | `/{id}` | Chi tiết lịch hẹn |
| POST | `/` | Tạo lịch hẹn |
| PUT | `/{id}` | Cập nhật lịch hẹn |
| DELETE | `/{id}` | Xóa lịch hẹn |

## Invoices `/api/invoices`

| Method | Endpoint | Mục đích |
|---|---|---|
| POST | `/` | Tạo hóa đơn |
| GET | `/` | Danh sách hóa đơn |
| GET | `/statistics` | Thống kê hóa đơn |
| GET | `/{invoiceId}` | Chi tiết hóa đơn |

## Payments `/api/payments`

| Method | Endpoint | Mục đích |
|---|---|---|
| GET | `/` | Danh sách thanh toán |
| GET | `/statistics` | Thống kê thanh toán |
| POST | `/invoices/{invoiceId}/confirm` | Xác nhận thanh toán |
| GET | `/invoices/{invoiceId}/history` | Lịch sử thanh toán hóa đơn |
| POST | `/invoices/{invoiceId}/cancel` | Hủy thanh toán |

## Loyalty `/api/loyalty`

| Method | Endpoint | Mục đích |
|---|---|---|
| GET | `/customers` | Danh sách/tổng quan thành viên |
| GET | `/customers/{customerId}` | Thông tin điểm và hạng khách hàng |
| GET | `/history/{customerId}` | Lịch sử điểm |
| POST | `/recalculate` | Tính toán lại dữ liệu loyalty |
| GET | `/statistics` | Thống kê loyalty |

## Fetch example

```javascript
const response = await fetch("http://127.0.0.1:8080/api/products", {
    method: "GET",
    credentials: "include"
});

if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
}

const products = await response.json();
```

Frontend cần `credentials: "include"` để gửi session cookie. Chi tiết DTO/request body cần xem Controller/Service tương ứng vì một số endpoint nhận payload khác nhau.
