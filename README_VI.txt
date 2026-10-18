VNG CHEAT - SERVER KHÓA KEY DÙNG MỘT THIẾT BỊ

GÓI NÀY GỒM:
- public/index.html: giao diện đã nối tới API /api/activate
- server.js: máy chủ Node.js/Express, khóa key bằng transaction PostgreSQL
- keys.json: 72 key và thời hạn lấy từ file HTML hiện tại
- render.yaml: mẫu cấu hình Render Blueprint + PostgreSQL

CÁCH TRIỂN KHAI RENDER (GitHub):
1. Tạo repository GitHub mới và tải TOÀN BỘ nội dung thư mục này lên repo. Đặt index.html vào thư mục public (xem bước 2).
2. Tạo thư mục public và chuyển index.html vào public/index.html. (Gói zip đã được đóng đúng cấu trúc public/index.html.)
3. Mở Render Dashboard > New > Blueprint, chọn repo có render.yaml, rồi tạo dịch vụ và database.
4. Chờ deploy thành công. Mở URL onrender.com; lần đầu có thể mất khoảng một phút nếu dùng web service miễn phí.
5. Test URL /api/health phải trả về {"ok":true}.

LƯU Ý QUAN TRỌNG:
- Render free PostgreSQL có thể hết hạn sau 30 ngày theo chính sách hiện tại; phù hợp thử nghiệm, không nên dùng để bán key lâu dài. Kiểm tra giá/chính sách trước khi dùng thực tế.
- Nếu key đã bị kích hoạt trên thiết bị A, thiết bị B sẽ nhận "Key đã có người sử dụng". Thiết bị A cần giữ dữ liệu localStorage của trình duyệt.
- Device ID phía trình duyệt không phải nhận diện phần cứng tuyệt đối: xóa dữ liệu trình duyệt/đổi trình duyệt có thể tạo ID mới. Muốn khóa chặt hơn cần tài khoản đăng nhập hoặc cơ chế cấp mã thiết bị.
- Các key đã có trong keys.json được seed vào DB khi deploy, nhưng ON CONFLICT DO NOTHING nghĩa là trạng thái đã dùng không bị ghi đè khi redeploy.
- File HTML còn chứa danh sách key phía client để giao diện xác thực sơ bộ; backend mới là bên quyết định có cho kích hoạt không. Đừng chia sẻ keys.json công khai nếu cần giữ bí mật danh sách key.


WEB ADMIN RIENG:
- Sau khi deploy, truy cap https://TEN-WEB.onrender.com/admin
- Trong Render Dashboard > service > Environment, tao ADMIN_PASSWORD (mat khau admin rieng). SESSION_SECRET duoc tao tu dong qua render.yaml.
- Neu deploy Blueprint va duoc hoi gia tri ADMIN_PASSWORD, hay dat mat khau dai, kho doan. Khong ghi mat khau vao GitHub.
- Admin co the tao 1-100 key moi, xem trang thai/thiet bi/han, khoa-mo khoa key; chi xoa duoc key chua dung.
- Endpoint admin duoc bao ve bang session cookie; khong cong khai ADMIN_PASSWORD.
