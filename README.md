<<<<<<< HEAD
# BeautyShop - Nail & Spa Management System

BeautyShop là ứng dụng web hỗ trợ quản lý hoạt động của cửa hàng Nail & Spa. Dự án tách Frontend và Backend, sử dụng CouchDB làm cơ sở dữ liệu NoSQL dạng document.

## Công nghệ

| Thành phần | Công nghệ |
|---|---|
| Backend | Java 21, Spring Boot 3.3.5, Spring Web, Maven Wrapper |
| Database | Apache CouchDB 3.x, JSON documents, Mango indexes |
| Frontend | HTML5, CSS3, JavaScript |
| Công cụ | VS Code, Git, GitHub |

## Chức năng hiện có trong mã nguồn

- Đăng nhập, đăng xuất, thông tin phiên và đổi mật khẩu.
- Quản lý tài khoản, nhân viên và khách hàng.
- Quản lý sản phẩm và dịch vụ.
- Quản lý lịch hẹn.
- Quản lý hóa đơn, thanh toán và lịch sử thanh toán.
- Quản lý điểm và hạng thành viên khách hàng.
- Trang tổng quan và các chức năng giao diện liên quan.

Phạm vi quyền truy cập được kiểm tra ở Backend. Một số chức năng có thể yêu cầu tài khoản/phiên đăng nhập hợp lệ.

## Cấu trúc repository

```text
BeautyShop/
├── .github/                 # GitHub Actions, issue và PR templates
├── .vscode/                 # Cấu hình VS Code
├── backend/
│   ├── .env.example         # Mẫu biến môi trường; không chứa mật khẩu thật
│   └── beautyshop-backend/  # Spring Boot project (pom.xml ở đây)
├── database/
│   ├── indexes/             # Mango index definitions
│   ├── seed/                # Dữ liệu mẫu không chứa dữ liệu thật
│   ├── scripts/             # Tạo index và import mẫu
│   └── backups/             # Backup cục bộ, không commit
├── docs/                    # Tài liệu kỹ thuật
├── frontend/                # HTML, CSS, JavaScript, assets
├── scripts/                 # Script chạy Backend và nạp .env
├── .gitignore
└── README.md
```

## Yêu cầu cài đặt

- JDK 21.
- Apache CouchDB 3.x đang chạy tại máy local hoặc máy chủ riêng.
- Git.
- VS Code (khuyến nghị cài Java Extension Pack và Live Server).

## Cài đặt lần đầu

### 1. Clone repository

```powershell
git clone <GITHUB_REPOSITORY_URL>
cd BeautyShop
```

### 2. Cấu hình CouchDB

Tạo database tên `beauty_shop` trong Fauxton (`http://localhost:5984/_utils`). Sau đó sao chép file mẫu:

```powershell
Copy-Item backend\.env.example backend\.env
```

Mở `backend/.env`, điền username và password CouchDB đang dùng trên máy. Không commit file `backend/.env`.

### 3. Chạy Backend

Tại thư mục gốc repository:

```powershell
.\scripts\run-backend.ps1
```

Script đọc `backend/.env`, đưa các giá trị vào biến môi trường của tiến trình hiện tại rồi chạy Maven Wrapper. Spring Boot mặc định chạy tại `http://localhost:8080`.

Cách chạy thủ công nếu đã khai báo biến môi trường trong PowerShell:

```powershell
cd backend\beautyshop-backend
.\mvnw.cmd spring-boot:run
```

### 4. Chạy Frontend

Mở thư mục `frontend` bằng VS Code, cài Live Server và mở `login.html` bằng Live Server. Frontend hiện được cấu hình CORS cho `http://localhost:5500` và `http://127.0.0.1:5500`; hãy dùng một trong hai địa chỉ này.

## Database

Xem [database/README.md](database/README.md) để tạo Mango indexes và nhập dữ liệu mẫu. Dữ liệu mẫu dùng tiền tố `sample_`, script sẽ bỏ qua document đã tồn tại và không ghi đè dữ liệu.

## Tài liệu

- [Kiến trúc](docs/ARCHITECTURE.md)
- [REST API](docs/API.md)
- [Thiết kế CouchDB](docs/DATABASE.md)
- [Cài đặt chi tiết](docs/INSTALLATION.md)
- [Hướng dẫn sử dụng demo](docs/USER_GUIDE.md)

## Bảo mật và dữ liệu

- Không commit `.env`, mật khẩu, token, file log hoặc database backup thật.
- Ảnh QR ngân hàng cá nhân nằm trong `frontend/assets/bank-qr.jpg` được Git ignore; mỗi người triển khai tự thêm ảnh của mình vào máy local.
- Tài khoản mẫu không được tạo sẵn trong seed. Hãy tạo tài khoản qua luồng quản lý tài khoản của Backend và sử dụng mật khẩu tạm theo chính sách hiện tại.
- Không dùng dữ liệu khách hàng thật trong seed/demo công khai.

## Kiểm tra Backend

```powershell
cd backend\beautyshop-backend
.\mvnw.cmd clean verify
```

GitHub Actions cũng chạy `clean verify` khi push hoặc mở Pull Request vào các nhánh `main` và `develop`.
=======
# BeautyShop
Dự án BeautyShop là hệ thống quản lý bán hàng, đặt lịch và tính tiền chuyên biệt cho các cơ sở làm đẹp (Nail &amp; Spa). Hệ thống lấy trọng tâm là thiết kế Cơ sở dữ liệu NoSQL dạng Tài liệu (Document Database) sử dụng CouchDB và PouchDB, tập trung giải quyết bài toán vận hành liên tục tại cửa hàng thông qua kiến trúc Offline-First.
>>>>>>> 5e19fc541b51c71c97e7b3f49dec0ab3dc60f588
