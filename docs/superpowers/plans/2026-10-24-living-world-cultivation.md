# Thế giới chạy liên tục và khởi đầu tu luyện — 24/10/2026

Yêu cầu đã được người dùng cho phép triển khai: thế giới chung tiếp tục hoạt động khi có người chơi, giảm lag bản đồ, mỗi đời mới không có Cổ, khu an toàn lớn có nhà và NPC, hệ thống sức mạnh 1–9 chuyển, tài liệu Markdown cho các phiên sau.

## Thiết kế

- Máy chủ sở hữu đồng hồ mô phỏng; input chỉ gửi ý định. Mô phỏng chi tiết quanh người chơi đang hoạt động, phần xa xử lý theo thời gian và nhu cầu, không quét toàn bản đồ mỗi khung hình.
- Quái và đạn gần nhau dùng cùng thực thể máy chủ. Phần thưởng, tử vong và học đường phải được lưu nguyên tử; checkpoint chuyển động định kỳ.
- Mỗi đời mới là người học đã khai khiếu, không sở hữu Cổ. Nhận Cổ đầu đời chưa luyện hóa, luyện hóa trên máy chủ rồi mới dùng. Không tặng Cổ theo chuyển.
- Mỗi khu dân cư an toàn có bán kính khoảng 2.200 đơn vị, đường đi và sáu cơ sở: học đường, kho Cổ, luyện hóa, tu luyện, y quán, khách điếm. Sinh gần học đường và tiếp tục tự do đi Ngũ Vực.
- Tách tu vi, chuyển Cổ, quyền điều khiển, độ thành thạo và nền tảng. Nhất–ngũ chuyển có bốn tiểu cảnh giới; lục–cửu chuyển dùng tiên nguyên và quy tắc tiên khiếu riêng.
- HUD cập nhật theo thay đổi/snapshot, canvas chỉ vẽ phần nhìn thấy; không dựng lại modal ẩn. Giao diện học đường chỉ gửi lệnh có kiểm tra khoảng cách và vai trò cơ sở.
- Tài liệu chuẩn: `docs/THIET_LAP_TU_VI_1_DEN_9.md`, phân biệt nội dung người dùng cung cấp, thiết kế game, phần đã triển khai và điều chưa xác minh.

## Công việc và kiểm chứng

1. Core tu luyện thuần và kiểm thử cấp bậc, nguồn lực, luyện hóa, đột phá và chiến đấu có điều kiện.
2. Nhịp thế giới tự động, quái dùng chung, lưu/checkpoint; kiểm thử đồng hồ cố định, đồng thời và HTTP không cần input.
3. Khu dân cư lớn, truy vấn cơ sở và vẽ có culling; kiểm thử sinh an toàn và hình học.
4. Giao diện học đường/NPC, Cổ chưa điều khiển, hiển thị tài nguyên đúng loại; giảm cập nhật DOM thừa.
5. Build, kiểm thử toàn bộ, chạy trình duyệt bằng máy chủ thử cô lập, kiểm tra màn hình nhỏ và luồng mới/tái sinh. Đồng bộ Android, build APK và đối chiếu tài nguyên nếu môi trường hỗ trợ.

Không thay đổi bí mật SMTP hoặc dữ liệu tài khoản để kiểm thử. Các cuộc đời đang tồn tại được di trú giữ tài sản hợp lệ; quy tắc túi Cổ trống áp dụng cho cuộc đời mới.

## Kết quả cuối phiên

Đã thực hiện cả năm bước. 302 test giao diện, 98 test máy chủ, 25 test core tu luyện, 3 test assets đều đạt; Chrome học đường 20/20, điều khiển/AI/tái sinh 27/27 và thông báo góc 26/26. APK build offline đạt. Đã thử migration trên bản sao trước khi cập nhật máy chủ; địa chỉ LAN hoạt động. Xem tài liệu chuẩn phần G để biết bằng chứng, APK và giới hạn nội dung chuyển cao.
