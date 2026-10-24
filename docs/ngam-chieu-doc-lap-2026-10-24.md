# Ngắm chiêu độc lập với hướng chạy — 24/10/2026

**Mốc lịch sử:** bản Ngũ Vực chơi trực tiếp đã đổi mặc định chiêu sang 1–4 và bổ sung lắp chiêu/đổi phím. Xem [báo cáo mới](ngu-vuc-ban-do-va-phim-2026-10-24.md) để lấy điều khiển, kiểm thử và APK hiện tại; hash bên dưới thuộc bản đóng gói trước đó.

Đã tách hướng bắn khỏi `Cultivator.facingAngle`. Công kích, Nguyệt Quang và Nguyệt Nhận lấy góc từ `CombatAimInput`; di chuyển và lướt vẫn dùng hướng di chuyển. Không đổi sát thương, chân nguyên, hồi chiêu hay cấu trúc bản lưu.

- **Máy tính:** chạy bằng WASD/mũi tên, rê chuột trên sân để ngắm; nhấp trái hoặc J đánh thường, K dùng Cổ tấn công. Di chuyển chuột lên HUD giữ điểm ngắm cuối trên sân. J/K tiếp tục hoạt động khi nút HUD còn focus; nhập chữ và Space/Enter trên nút vẫn giữ hành vi biểu mẫu/bàn phím.
- **Điện thoại:** một ngón giữ cần chạy, ngón khác kéo từ Công kích/Nguyệt Quang rồi thả để bắn. Kéo từ vị trí đặt ngón, ngưỡng 12 CSS pixel. Chạm nhanh dùng hướng ngắm gần nhất, chưa ngắm thì theo hướng nhân vật.
- Có dấu chỉ hướng quanh nhân vật và vòng kéo khi chọn chiêu. Đạn bay theo góc tại lúc tung ra, không tự bám mục tiêu.
- Cancel, mất capture, mất focus, ẩn/tạm dừng game, mở bảng, tử vong và tải cuộc đời khác hủy lượt kéo. Pointer riêng cho chiêu không chiếm ngón cần chạy; click tương thích không tạo đòn thứ hai.

## Kết quả kiểm tra

| Kiểm tra | Kết quả |
|---|---|
| Toàn bộ Vitest game/client/lưu trữ/quy luật | **238/238 qua**, 28 tệp |
| Kiểm thử mới cho input và tích hợp chiến đấu | **23/23 qua**: 17 input, 6 runtime |
| Chrome: chuột và hai ngón cảm ứng | **13/13 qua**, không exception chưa bắt; DPR 2, desktop 1440×900 và mobile 375×812 |
| Chrome: hồi quy gameplay/lưu bản | **22/22 qua**, không thiếu tài nguyên |
| Chrome: các bảng và bố cục 4 kích thước | **20/20 qua** |
| Đồng bộ tài nguyên | **3/3 qua** |
| TypeScript, Vite và Gradle APK debug offline | Thành công |
| Đối chiếu APK với `dist` | **7/7 tệp trùng SHA-256** |

Các hồi quy đã tái hiện trước khi sửa: chạy phải/ngắm trái vẫn bắn phải ở cả 3 đòn; J/K không hoạt động khi nút HUD giữ focus. Đã xác nhận sau sửa bằng thực thể/đạn thật trong runtime và sự kiện chuột/cảm ứng thật của Chrome. Rà soát độc lập hoàn tất sau sửa guard phím tắt.

Kiểm tra cảm ứng dùng Chrome DevTools với hai ngón độc lập; chưa cài kiểm thử trên điện thoại Android thật. Fixture chỉ quan sát tham số hiển thị, không sửa trạng thái game; các hook quan sát không đi vào `dist` hoặc APK.

Artifact: [chuột/hai ngón](../.tmp/combat-aim/browser/report.json), [gameplay](../.tmp/combat-aim/practice-smoke/results.json), [bố cục](../.tmp/combat-aim/layout/results.json), [APK/hash tài nguyên](../.tmp/combat-aim/apk-assets.json). Chạy lại khi Vite đang mở bằng `node tools/check-combat-aim.mjs`.

APK hiện tại: [app-debug.apk](../app/build/outputs/apk/debug/app-debug.apk), **88.918.254 byte**. SHA-256: `0126A077357A9259E15C5E691A45357A4BCADE2258D0C53E1E08E23DF4F30332`.

Dịch vụ tại `http://127.0.0.1:8787/` đã được xác nhận trả đúng HTML bản build mới. Tải lại trang để dùng điều khiển mới. Bộ mã gốc trước sửa được giữ trong `.tmp/combat-aim/baseline`; dự án không có Git nên không tạo commit.
