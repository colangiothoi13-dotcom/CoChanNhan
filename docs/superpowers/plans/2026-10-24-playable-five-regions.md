# Triển khai bản đồ Ngũ Vực và thiết lập chiêu

Thiết kế: [Ngũ Vực chơi trực tiếp](../specs/2026-10-24-playable-five-regions-design.md).

- [x] Địa lý dùng chung client/server, năm vực, trạm an toàn/đường nối, chunk cache và render có giới hạn; kiểm thử toàn bộ điểm sinh/ranh giới.
- [x] Model bốn ô chiêu, bindings, lưu cài đặt an toàn và modal lắp chiêu/đổi phím; hồi quy trùng phím/skill không sở hữu/cooldown chung.
- [x] Trạng thái không gian và combat do máy chủ giữ, motion seq/giới hạn tốc độ, checkpoint và sinh/tái sinh ngẫu nhiên toàn Ngũ Vực; không tin HP/tiền do client gửi.
- [x] Client field stream độc lập lệnh kinh tế, cảnh 2D dùng dữ liệu máy chủ; cùng WorldClient cho canvas, bản đồ, nhật ký và Gmail.
- [x] Giao diện bản đồ tổng quan và vào đời/tái sinh, tên vùng/NPC, chuyển tiếp an toàn từ dữ liệu cũ; bảo toàn bản luyện tập lịch sử.
- [x] Test từng phần rồi toàn bộ; Chrome hai client/LAN, cài đặt và cảm ứng; rà soát, build web/APK, đối chiếu tài nguyên và báo cáo giới hạn thực tế.

Phân công tách tệp: địa lý/renderer; settings/model/modal; backend field/routes; root điều phối client/main/atlas/tests. Dự án không có Git, dùng bản sao mốc trong `.tmp/five-regions/baseline`. Không sửa `.env` hoặc xóa dữ liệu thế giới để xử lý mất kết nối.
