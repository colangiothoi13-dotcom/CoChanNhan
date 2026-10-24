# Đối chiếu yêu cầu, hoàn thiện tài khoản và sửa game

Nguồn: tệp yêu cầu ngày 24/10/2026 do người dùng gửi. Giữ lựa chọn thế giới chung nhiều người và dự án Android/web hiện có. Người dùng chọn gửi OTP bằng Gmail SMTP với mật khẩu ứng dụng; thông tin bí mật chỉ đặt trên máy chủ.

## Thiết kế triển khai

Giữ Node HTTP và TypeScript hiện có, bổ sung Nodemailer cho SMTP với TLS. Không dùng OTP trả về API hoặc coi gửi giả là xác minh. OTP xác nhận quyền truy cập hộp thư; hạn chế alias/tần suất làm giảm tài khoản rác, không bảo đảm mỗi người chỉ có một tài khoản. Máy chủ vẫn là nguồn sự thật của Ngũ Vực; bản lưu luyện tập cục bộ không có quyền ghi đè thế giới chung.

Các thay đổi cơ chế chưa có trong nguyên tác được ghi là luật/thông số game. Chuẩn hóa toàn bộ tài liệu theo A–G và ghi rõ chức năng chưa được lập trình; không coi nội dung trong Wiki là cơ chế đã vận hành.

## Chặng 1: tài khoản và tiến trình

- [x] Viết và chạy các hồi quy thất bại: lộ OTP, gửi thư giả, phiên hết hạn vẫn ghi, lỗi đĩa báo thành công, file hỏng bị xóa, Gmail alias, mật khẩu/token lưu không phù hợp.
- [x] SMTP TLS thật qua Nodemailer, cấu hình bằng môi trường, lỗi thiếu cấu hình rõ ràng; tests dùng mailer được tiêm, không gửi mail người thật.
- [x] AuthStore xác thực đầu vào, OTP dùng crypto, giới hạn thử/gửi/đăng nhập, session hết hạn, scrypt và token hash, ghi nguyên tử và chuyển dữ liệu cũ bảo toàn.
- [x] Chạy toàn bộ kiểm thử server trước khi chuyển sang tích hợp client.
- [x] Client có endpoint hợp lệ, token riêng từng máy chủ, timeout, logout ngay, chặn phản hồi cũ và cleanup; sửa XSS/biểu mẫu/busy/cooldown.
- [x] Bản lưu luyện tập dùng cùng schema đầy đủ với lưu cục bộ; tải chủ động, giữ tử vong/di vật/nhật ký/kho Cổ/nhiệm vụ; không tự ghi đè khi đăng nhập.
- [x] Liên kết tài khoản Gmail đã xác minh với thế giới máy chủ, khôi phục được trên thiết bị khác, không nhập số dư do client tự khai.
- [x] Proxy auth khi dev, ví dụ cấu hình SMTP và kiểm tra tích hợp HTTP/client/trình duyệt.

## Chặng 2: lỗi vòng chơi và dọn mã

- [x] Hồi quy nhiệm vụ: không bỏ qua thưởng, không bỏ đột phá, trừ đúng phí, tăng cảnh giới thống nhất ở banner và hội thoại.
- [x] Hồi quy chiến đấu: sở hữu Cổ trước khi dùng, sát thương gốc và phòng ngự sau tải bản lưu đúng.
- [x] Di vật đầy túi: chỉ chuyển lượng nhận được, giữ phần dư; lệnh lặp không nhân tài sản.
- [x] Tách những quy tắc dùng chung và luồng tiến trình thành API rõ, bỏ ép kiểu tùy tiện và mã trùng có bằng chứng.
- [x] Chạy tập kiểm thử liên quan rồi toàn bộ suite trước khi thêm cơ chế.

## Chặng 3: nền tảng còn thiếu và kiểm chứng cuối

- [x] Bổ sung luật tu vi/chân nguyên tách biệt và mô hình thời gian–tai kiếp có kiểm thử các ví dụ bắt buộc; ghi rõ điểm đã nối vào trải nghiệm và điểm còn là nền tảng.
- [x] Hoàn thiện bản kiểm kê và bộ luật A–G, có dữ liệu/điều kiện/chi phí/giới hạn/thất bại cho từng hệ thống.
- [x] Rà soát độc lập, build web/Android, đối chiếu tài nguyên và chạy Chrome thật.
- [x] Báo cáo chính xác phần đã triển khai, phần cần cấu hình SMTP và phần quy mô sản phẩm còn thiếu.

## Ràng buộc kiểm tra

Từng chặng phải có bằng chứng qua kiểm thử trước khi sang chặng tiếp. Có thể kiểm kê/đọc tài liệu song song. Không gửi email thật khi chưa có cấu hình/địa chỉ kiểm tra được người dùng cung cấp. Không ghi đè bản lưu người dùng; tất cả test dùng store memory/tệp tạm. Dự án không có Git, dùng bản sao mốc trong `.tmp/requirements-audit/baseline` khi cần.

Rà soát trọng tâm: phản hồi cũ sau logout/đổi server, lưu không đủ dữ liệu dẫn đến hồi sinh ngoài ý muốn, link Gmail lấy nhầm world của người khác, lỗi ghi đĩa/khởi động lại và tài sản bị nhân hoặc mất.
