# Ngũ Vực chơi trực tiếp và thanh chiêu tùy chỉnh

Người dùng muốn một bản đồ 2D rộng liên tục với cả năm vực, tạo tài khoản và tái sinh đều ngẫu nhiên trên Ngũ Vực; không giới hạn ở Thanh Mao Sơn. Máy tính dùng bốn ô chiêu mặc định 1–4, được lắp Cổ và đổi phím trong Cài đặt.

Giữ canvas/TypeScript và máy chủ Node hiện có. Bản đồ 120.000×120.000 đơn vị có năm kiểu địa hình, trạm an toàn, NPC, đường nối và sinh vật được tải theo vùng gần người chơi; không sinh trước toàn bộ thế giới. Đây là địa lý game phỏng theo, không khẳng định là bản đồ nguyên tác đã xác minh.

Giao diện chính chuyển sang nhân vật máy chủ và bản đồ này. Máy chủ giữ vị trí, tài nguyên, hồi chiêu, đánh quái, tử vong và điểm sinh theo lifeId. Di chuyển dùng luồng input riêng, không dùng hàng đợi lệnh kinh tế. Bản luyện tập và bản lưu lịch sử giữ nguyên để phục hồi, không nhập tài sản tự khai vào nhân vật chung. Các thử luyện, nhật ký và Tiên Cổ chung tiếp tục dùng tài khoản/máy chủ cũ; bản đồ hiển thị trực tiếp cùng một cuộc đời.

Khởi tạo/tái sinh bốc đều một trong năm vực rồi một điểm an toàn hợp lệ, lưu kết quả; reload/retry không bốc lại. Xuất thân chỉ ảnh hưởng nền tảng, không chọn hoặc khóa vực. Người chơi có thể đi qua ranh giới địa lý bằng di chuyển bình thường. Quái được máy chủ mô phỏng trong các cuộc chạm trán theo cuộc đời; vị trí người chơi được chia sẻ, chưa bổ sung PvP thời gian thực trong đợt này.

Bốn ô dùng chung hồi chiêu theo Cổ, không phải theo ô; hỗ trợ hoán đổi Cổ và ô trống. Tùy chọn phím/ô lưu theo thiết bị, có kiểm tra trùng phím và reset. Chuột và kéo hướng chiêu trên điện thoại vẫn hoạt động với ô được lắp Cổ tấn công. Không đưa ô địa chỉ máy chủ vào luồng chơi chính; giữ cấu hình kết nối nâng cao và dùng cùng origin qua proxy trên LAN.
