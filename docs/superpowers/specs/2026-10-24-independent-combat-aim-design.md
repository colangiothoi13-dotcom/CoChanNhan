# Ngắm chiêu độc lập với hướng chạy

Người dùng chọn ngắm bằng chuột trên máy tính và kéo hướng chiêu trên điện thoại để vừa chạy vừa bắn khi bị đuổi. Giữ game TypeScript/canvas và bộ nút hiện có.

Hiện tại `Cultivator.update` đặt `facingAngle` theo di chuyển; cả hai đòn trong `main.ts` dùng góc này. Lướt cũng dùng `facingAngle`, vì vậy hướng ngắm mới phải có trạng thái riêng.

## Cách điều khiển

- Máy tính: rê chuột trên sân để ngắm; nhấp trái hoặc J đánh thường; K dùng Nguyệt Quang/Nguyệt Nhận. Các nút hiện tại vẫn dùng được, giữ điểm ngắm cuối trên sân khi chuột đi lên HUD.
- Điện thoại: giữ/kéo từ Công kích hoặc Nguyệt Quang, xem hướng rồi thả để tung chiêu. Một ngón giữ cần chạy, ngón khác ngắm/bắn. Chạm nhanh vẫn dùng hướng đã ngắm gần nhất; nếu chưa từng ngắm thì theo hướng nhân vật.
- Hiện dấu ngắm nhẹ quanh nhân vật và đường kéo khi đang chọn hướng. Đạn giữ đường bay đã chọn lúc tung chiêu.
- Không tự chọn quái, không đổi hướng đi hoặc hướng lướt khi bắn. Không thay chi phí, hồi chiêu, sát thương hoặc bản lưu.

Đã cân nhắc tự ngắm quái gần trong tầm; người dùng chọn ngắm chủ động. Không thêm cần cố định thứ hai vì kéo trực tiếp trên nút giữ bố cục điện thoại hiện tại.

## Vòng đời và giới hạn

Chỉ nhận ngón bắt đầu trên nút tương ứng; ngón cần chạy không đổi hướng ngắm. Có ngưỡng kéo 12 CSS pixel để chạm nhanh không tạo hướng ngẫu nhiên. Hủy khi pointercancel/lost capture, mất focus, ẩn trang, mở modal, chết hoặc dừng game; không phát chiêu khi hủy. Chặn click tương thích sau một lượt thả cảm ứng, giữ click bàn phím và chuột bình thường. Mọi lượt tung chiêu tiếp tục qua cùng kiểm tra sống/modal/hồi chiêu/tài nguyên.
