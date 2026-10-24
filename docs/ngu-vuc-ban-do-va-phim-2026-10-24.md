# Bản đồ Ngũ Vực và cài đặt chiêu — 24/10/2026

**Bản ghi lịch sử trước đợt thế giới tự chạy và tu luyện.** Số kiểm thử, hash APK và mô tả quái theo cuộc đời dưới đây thuộc mốc cũ. Bản hiện tại có quái chung, đời mới Cổ trống và khu dân cư lớn; dùng [tài liệu chuẩn mới](THIET_LAP_TU_VI_1_DEN_9.md) để xem trạng thái và APK đã xác minh cuối phiên.

Màn chơi chính hiện là bản đồ 2D liên tục **120.000 × 120.000 đơn vị**, không còn cảnh Thanh Mao Sơn cố định bên cạnh một nhân vật chiến lược khác. Canvas, bản đồ tổng quan, nhật ký và truyền thừa dùng cùng tài khoản và cuộc đời trên máy chủ.

## Đi lại, sinh và tái sinh

- Có năm sinh cảnh cho Nam Cương, Bắc Nguyên, Tây Mạc, Đông Hải, Trung Châu; 15 trạm an toàn và đường nối đi xuyên ranh giới bằng điều khiển nhân vật.
- Tạo nhân vật và tái sinh đều bốc ngẫu nhiên một trong cả năm vực, rồi một trạm/điểm sinh hợp lệ. Xuất thân không chọn hoặc khóa vùng. Mỗi lifeId chỉ bốc một lần; tải lại không bốc lại.
- Nhân vật cũ chưa có tọa độ được đặt gần địa danh đã biết, giữ nguyên tiền, lịch sử, truyền thừa và cá thể Tiên Cổ đã thuộc tài khoản. Bản luyện tập trên thiết bị được giữ nguyên, không tự nhập tài sản vào thế giới chung.
- 30 địa danh cũ có tọa độ thật, đứng gần mới làm việc, điều tra, luyện kỹ nghệ hoặc nhận thử luyện. Chọn vùng trong Atlas chỉ xem thông tin; nhật ký không còn nút dịch chuyển thay cho đi bộ.

Đây là địa lý game phỏng theo Ngũ Vực, không khẳng định tái hiện chính xác mọi địa danh của nguyên tác. Terrain và quái tải theo vùng gần người chơi; cache địa hình tối đa 96 chunk, không sinh trước toàn bộ diện tích.

## Thanh chiêu và phím

Mặc định dùng **1–2–3–4** cho Nguyệt Quang, Đồng Giáp, Bạch Trư, Thảo Hoàn. Nhấp trái/J đánh thường, Space lướt, WASD/mũi tên di chuyển, F tương tác; **O** hoặc nút **Cài đặt** mở thiết lập.

Trong tab Kỹ năng, chọn Cổ chủ động đã sở hữu vào từng ô hoặc để trống. Có thể lắp cùng Cổ nhiều ô nhưng tất cả vẫn dùng cùng hồi chiêu. Nguyệt Quang tự dùng Nguyệt Nhận khi đã có bản nâng cấp; Cổ thụ động không đưa vào ô tung chiêu. Preset giữ qua các cuộc đời nhưng ô sẽ khóa khi đời hiện tại chưa sở hữu Cổ đó.

Tab Phím bấm cho đổi phím từng ô, đánh thường, lướt, di chuyển và các bảng giao diện. Phím trùng bị từ chối; Escape hủy bắt phím; có nút khôi phục mặc định. Tùy chọn lưu theo thiết bị, độc lập dữ liệu nhân vật. Phím trên từng ô cập nhật theo thiết lập.

Chuột vẫn chọn hướng trên sân; điện thoại giữ cần chạy bằng một ngón và kéo từ ô chiêu bằng ngón khác rồi thả. Chiêu giữ góc lúc nhấn/thả, dù đổi chuột trước gói mạng kế tiếp; lướt giữ hướng chạy.

Thông báo đã được chuyển sang góc phải dưới HUD, thu gọn trên điện thoại. Thông báo trùng được gom vào một hộp và tối đa hai hộp khác nhau; màn ngang thấp chỉ hiển thị hộp mới nhất. Thông báo không chặn click.

## Máy chủ giữ những gì

Máy chủ giữ vị trí, trình tự input, HP/MP/thể lực, hồi chiêu, đánh quái, phần thưởng, hợp luyện, tử vong và tái sinh. Client không gửi số dư hoặc HP để ghi đè. Luồng di chuyển tách hàng đợi kinh tế; vị trí checkpoint, phần thưởng và tử vong ghi nguyên tử trước khi xác nhận. Thử lại cùng seq không phát chiêu hoặc trả thưởng hai lần.

Người chơi thấy vị trí người chơi lân cận. Các cuộc chạm trán quái hiện được mô phỏng theo cuộc đời; tranh đoạt truyền thừa, cá thể Tiên Cổ và di vật dùng kho chung đã có. Đợt này chưa thêm PvP trực tiếp, chợ hoặc bang hội, và máy chủ vẫn là một tiến trình/tệp dữ liệu để chơi thử.

Thông thường không cần nhập “máy chủ thế giới”: dùng cùng địa chỉ với game. Cấu hình chuyển dịch vụ nằm trong **Kết nối nâng cao**. Máy chủ bản mới ở 8787; Vite tại 5173 chuyển API qua proxy nên địa chỉ LAN đang dùng vẫn hoạt động. SMTP chưa được điền, đúng lựa chọn người dùng tự cấu hình sau; kiểm thử không gửi email thật.

## Xác minh

| Kiểm tra | Kết quả |
|---|---|
| Game/client/settings/map/view/toast | **301/301 Vitest qua**, 36 tệp |
| Máy chủ/auth/world/field | **83/83 qua**, gồm 15 bài field |
| Đồng bộ tài nguyên | **3/3 qua** |
| TypeScript, Vite và đồng bộ Android | Qua |
| Chrome thật: hai tài khoản, bốn ô chiêu, đổi/lưu phím, Atlas, cảm ứng | **27/27 qua**, không lỗi JavaScript chưa bắt; [report](../.tmp/five-regions/browser/report.json) |
| Chết do AI và bấm tái sinh qua UI bình thường | Đã qua; không sửa HP/trạng thái để tạo tình huống |
| Atlas/Settings màn ngang 812×375 và 568×320 sau thu gọn | **3/3 qua**, đủ bản đồ 150px và các nút 44px dùng được; [report](../.tmp/five-regions/browser/layout-report.json) |
| Góc thông báo, gom trùng, desktop/phone/landscape/chữ lớn | **26/26 kiểm tra Chrome qua**; [report](../.tmp/toast-corner/browser/report.json) |
| APK và hash tài nguyên | Gradle offline **BUILD SUCCESSFUL**, **7/7 tệp** trong APK trùng SHA-256 với `dist` |

Tổng **387 kiểm thử tự động** qua. Các lỗi được tái hiện và sửa trong đợt ghép: HUD ghi đè ô đã lắp ở frame tiếp theo; góc chiêu đổi theo chuột khi chờ gói mạng; phím cài đặt bị khóa khi nút HUD còn focus; hướng dẫn mở lại sau xác nhận sớm; màn ngang nhỏ ẩn nút Ngũ Vực; thông báo trùng xếp nhiều hộp ở giữa màn hình.

Artifact: [Chrome và ảnh](../.tmp/five-regions/browser/report.json), [bản thiết kế](superpowers/specs/2026-10-24-playable-five-regions-design.md), [kế hoạch](superpowers/plans/2026-10-24-playable-five-regions.md). Tool `tools/check-five-regions.mjs` tạo dịch vụ bộ nhớ và profile riêng; không dùng dữ liệu người chơi, không thêm hook kiểm thử vào APK.

APK cập nhật tại [app-debug.apk](../app/build/outputs/apk/debug/app-debug.apk), **88.941.510 byte**. SHA-256: `5D9DDCED78B7D086F042055E2FA9DDC4E7D6F3E5C304C4A1FB34AC335B93CC13`. [Đối chiếu tài nguyên](../.tmp/five-regions/apk-assets.json). Chưa xác nhận cài trên điện thoại Android thật; thao tác cảm ứng được thử bằng Chrome với nhiều ngón độc lập.

Đã mở lại dịch vụ web sau gián đoạn phiên: `http://192.168.0.104:5173/` và `http://127.0.0.1:8787/` đều trả giao diện Ngũ Vực mới, health 200 và field yêu cầu đúng phiên xác thực (401 khi chưa có token, không bị chặn CORS). [Kiểm tra dịch vụ](../.tmp/five-regions/running-services.json). Không xóa dữ liệu hoặc tạo tài khoản kiểm thử trong kho người chơi để xử lý kết nối.

Đã tái hiện lỗi proxy LAN: cấu hình shorthand của Vite đổi Host thành localhost, trong khi Origin vẫn là địa chỉ LAN, khiến API trả 403. Proxy nay giữ Host bằng `changeOrigin:false`; GET/POST game/auth từ chính địa chỉ game qua đúng cửa kiểm tra, origin bên ngoài vẫn bị chặn. Chạy lại phép kiểm tra chỉ đọc bằng `node tools/check-game-service.mjs --base-url=http://192.168.0.104:5173`.
