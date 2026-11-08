# Demo User Guide

## 1. Khởi động

1. Khởi động CouchDB.
2. Chạy Backend bằng `scripts/run-backend.ps1`.
3. Chạy Frontend qua Live Server.
4. Đăng nhập bằng tài khoản đã được tạo trong database.

## 2. Luồng tài khoản

- Nhân viên được tạo trong module Employees.
- Tài khoản đăng nhập được tạo qua module quản lý tài khoản.
- Backend lưu `password_hash` bằng BCrypt và đánh dấu `must_change_password` theo logic hiện tại.
- Người dùng đổi mật khẩu khi hệ thống yêu cầu.

Không tạo document user bằng mật khẩu dạng plaintext. Không sử dụng tài khoản hoặc dữ liệu cá nhân thật trong bản demo công khai.

## 3. Demo dữ liệu NoSQL

1. Tạo database `beauty_shop`.
2. Chạy script tạo Mango indexes.
3. Chạy `import-samples.ps1 -WhatIf` để xem trước.
4. Chạy script import để thêm sản phẩm, dịch vụ, khách hàng và nhân viên mẫu.
5. Mở Fauxton để quan sát JSON documents, `_id`, `_rev` và trường `type`.

## 4. Kiểm thử CRUD

- Products: tạo, xem, sửa và xóa sản phẩm.
- Customers: tạo, xem, cập nhật và xóa khách hàng.
- Employees: tạo, xem, cập nhật và xóa nhân viên.
- Services: tạo, xem, cập nhật và xóa dịch vụ.

Sau thao tác cập nhật, kiểm tra `_rev` thay đổi trong CouchDB. Khi xóa, kiểm tra document tombstone theo công cụ CouchDB.
