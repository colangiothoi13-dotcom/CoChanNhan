# Cổ Tiên Lộ — bản tích hợp và kiểm thử

Ngày kiểm tra: 24/10/2026. Nguồn thiết kế: [thiết kế thế giới chung](co-tien-lo-thiet-ke-the-gioi-chung.md).

## Phần đã chơi được

- Ngũ Vực có 30 địa điểm nối bằng đường đi, điều tra mở bí mật, làm việc, nghỉ ngơi và học kỹ năng theo địa phương.
- 12 truyền thừa có mô tả tám phần, khảo nghiệm nhiều bước, nguy hiểm tích lũy, giới hạn thời gian và thất bại kết thúc mạng sống. Kỹ năng đã học mở lựa chọn ít tiêu hao hơn.
- Bốn màn diễn giải Nhân Tổ; nhật ký tài khoản tồn tại qua các cuộc đời. Tái sinh chọn một trong năm xuất thân, đặt lại sức mạnh và tài sản.
- Các tài khoản cùng chia sẻ sự kiện, truyền thừa được khai phá trước và đúng một cá thể Hải Kính Tiên Cổ sáng tạo. Máy chủ quản lý giữ chỗ, chủ sở hữu và chuyển qua di vật.
- Bản luyện tập 2D vẫn chơi được. Đã tích hợp và kiểm tra các thay đổi hồi sinh từ phiên làm việc song song: lưu tử vong ngay, không tự sống lại khi tải trang, di vật không nhặt lặp, xuất thân không cộng dồn và chỉ số xuất thân vẫn đúng khi tăng cảnh giới.

Tiền hỗ trợ đầu đời mới không trở thành di vật; tài sản kiếm được và Cổ vẫn chuyển giao bình thường. Việc nâng cấp bản lưu cũ giữ nguyên tài sản lịch sử, rồi theo dõi khoản hỗ trợ từ đời mới tiếp theo.

## Bằng chứng kiểm thử

| Kiểm tra | Kết quả |
|---|---|
| `npm test` | 118 kiểm thử qua, 17 tệp; gồm game cũ, hồi sinh, nội dung và client thế giới |
| `npm run test:world` | 29 kiểm thử qua; gồm toàn bộ 12 truyền thừa qua hành động công khai, quyền giữ Tiên Cổ, ghi lặp, lưu/khởi động lại, giới hạn thời gian và nguồn tài sản |
| `npm run test:assets` | 3 kiểm thử qua |
| Chrome, hành trình chung trên bản build tại cổng 8787 | 16 kiểm tra qua, hai tài khoản, không có ngoại lệ JavaScript |
| Chrome, luyện tập 2D | 22 kiểm tra qua: di chuyển, kỹ năng, nuôi/luyện Cổ, Wiki, modal và khôi phục bản lưu |
| Bố cục luyện tập | 9 trường hợp qua: 375×812, 812×375 và 1440×900, mỗi kích thước ở ba trạng thái |
| `:app:assembleDebug --offline` | `BUILD SUCCESSFUL`; TypeScript, Vite và đồng bộ tài nguyên Android thành công |
| Đối chiếu tài nguyên trong APK | Cả 5 tệp trùng SHA-256 với bản `dist` hiện tại |
| Định tuyến tài nguyên Android và chuyển bản lưu cũ | 17 tuyến tài nguyên và 5 kiểm tra chuyển bản lưu qua |

Báo cáo Chrome và ảnh chụp nằm tại `.tmp/shared-world/browser-qa-release`, `.tmp/shared-world/practice-smoke-complete` và `.tmp/shared-world/practice-ui`. Các kiểm tra dùng hồ sơ trình duyệt và tệp thế giới riêng, không sửa bản lưu của người chơi. Mã đã được rà soát độc lập và các lỗi đáng kể đã có kiểm thử hồi quy.

Vite có cảnh báo bundle lớn hơn 500 kB; Gradle có cảnh báo cấu hình sắp bị bỏ. Cả hai không làm thất bại bản build. Chưa kiểm tra chạy APK trên thiết bị Android thật.

## Mở bản chơi

Từ `cotienlo-game`, chạy `npm run play:world`, rồi mở <http://127.0.0.1:8787/?world=1>. Hướng dẫn chơi qua mạng nội bộ và cấu hình endpoint Android nằm trong [README game](../cotienlo-game/README.md).

APK debug: `app/build/outputs/apk/debug/app-debug.apk`. APK chứa bản luyện tập và giao diện Ngũ Vực; chơi thế giới chung từ APK cần máy chủ có endpoint HTTPS truy cập được.

Đây là bản đầu chơi được bằng hành trình trên bản đồ chiến lược, chạy một máy chủ Node và một tệp dữ liệu. Chiến đấu mạng thời gian thực, chợ, bang hội, đăng nhập đồng bộ nhiều thiết bị, triển khai máy chủ công khai và quy mô 360 địa điểm/300 truyền thừa vẫn thuộc các bước sản xuất tiếp theo.
