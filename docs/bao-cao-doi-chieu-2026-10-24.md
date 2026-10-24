# Cổ Tiên Lộ báo cáo đối chiếu và bổ sung ngày 24 tháng 10 năm 2026

**Bản cập nhật tiếp theo:** [Ngũ Vực chơi trực tiếp và thanh chiêu tùy chỉnh](ngu-vuc-ban-do-va-phim-2026-10-24.md). Phần mô tả tách bản luyện tập/hành trình và hash trong báo cáo này ghi lại mốc cũ; APK hiện tại dùng thiết kế mới.

Đợt này đối chiếu tệp yêu cầu mới với mã nguồn, sửa đăng nhập và vòng chơi, rồi bổ sung bộ luật có thể thực thi trong **Phòng thử quy luật**. Máy chủ Ngũ Vực và bản luyện tập 2D vẫn giữ hai tiến trình riêng; dữ liệu bài thử không trở thành tài sản hoặc sức mạnh của người chơi.

**Cập nhật sau mốc báo cáo này:** đã bổ sung [ngắm chiêu độc lập với hướng chạy](ngam-chieu-doc-lap-2026-10-24.md). Đường dẫn APK được dùng lại cho bản mới; số kiểm thử và hash dưới đây ghi nhận mốc đối chiếu trước thay đổi điều khiển. Xem báo cáo điều khiển để lấy hash và kết quả của APK hiện tại.

Tài liệu liên quan: [bộ luật và ma trận A–G](doi-chieu-yeu-cau-va-bo-luat.md), [kế hoạch ba chặng](superpowers/plans/2026-10-24-requirements-audit-and-repair.md), [hướng dẫn chạy và SMTP](../cotienlo-game/README.md), [thiết kế Ngũ Vực ban đầu](co-tien-lo-thiet-ke-the-gioi-chung.md). Ma trận A–G giữ mốc kiểm kê trước sửa; báo cáo này phân biệt phần có sẵn và phần bổ sung.

## Phần đã có trước đợt này

| Khu vực | Chức năng có sẵn | Giới hạn tại mốc kiểm kê |
|---|---|---|
| Luyện tập 2D | Di chuyển và né đòn, đánh quái, kỹ năng Cổ, túi đồ, cho một số Cổ ăn, hai công thức hợp luyện, nhiệm vụ và lưu trên thiết bị | Không phải chiến đấu mạng; còn lỗi dùng Cổ/chỉ số/tiến trình nhiệm vụ cần sửa |
| Nhiều cuộc đời trên thiết bị | Lưu tử vong, xuất thân, nhật ký tiền kiếp, bia mộ có thể nhặt, đặt lại đời mới | Luật mẫu riêng; chưa có hồn phách, di sản tiên khiếu hoặc đồ gửi nhiều nơi |
| Hành trình Ngũ Vực | 5 vực với 30 địa điểm nối tuyến, điều tra, làm việc/nghỉ, kỹ nghệ, 12 truyền thừa, 4 bài học, lịch sử chung và nhiều đời | Bản đồ chiến lược; chưa có PvP thời gian thực, chợ hoặc bang hội |
| Tiên Cổ dùng chung | Một Hải Kính sáng tạo với cá thể duy nhất, giữ chỗ độc quyền, chuyển nguyên cá thể sang di vật rồi người nhặt | Chưa có hệ luyện Cổ, cho mượn và kích hoạt Tiên Cổ tổng quát trong Ngũ Vực |
| Wiki | Tra cứu Cổ, phối phương, sát chiêu, thú và nội dung nền | Mô tả tra cứu không chứng minh đã có cá thể, công thức, chiến đấu hay hành vi tương ứng |
| Gmail | Có khung AuthClient/AuthModal, tuyến API và kho lưu tài khoản | Chưa thể coi trả OTP xem trước hoặc bộ gửi mặc định là đã gửi thư thật; cần hoàn thiện phiên và khôi phục tiến trình |

## Chặng 1 tài khoản và tiến trình

Đã bổ sung bộ gửi SMTP qua Nodemailer, cấu hình máy chủ và lỗi gửi rõ ràng. OTP được tạo trên máy chủ, có thời hạn, giới hạn yêu cầu/lần thử và chỉ dùng một lần; API không trả mã xem trước cho người chơi. Tài khoản Gmail được chuẩn hóa, mật khẩu nếu dùng được băm bằng scrypt, token được lưu dạng băm phía máy chủ. Cập nhật kho lưu theo giao dịch nguyên tử và không tự ghi đè dữ liệu hỏng bằng bản rỗng.

Client có endpoint hợp lệ, phiên riêng theo máy chủ, thời hạn yêu cầu, đăng xuất ngay và chặn phản hồi cũ sau đổi máy chủ/đăng xuất. Giao diện xử lý biểu mẫu, trạng thái đang chờ và gửi lại mã; chuỗi nhận từ tài khoản không được chèn trực tiếp thành HTML thực thi. Proxy khi phát triển chuyển cả `/api/auth` và `/api/world` tới dịch vụ.

Lưu và tải luyện tập dùng bản lưu đầy đủ, gồm trạng thái chết, di vật, nhật ký, kho đồ/Cổ và nhiệm vụ. Đăng nhập không tự ghi đè bản đang chơi. Tải là thao tác chủ động, có kiểm tra cấu trúc và bản sao dự phòng theo tài khoản/máy chủ. Phiên bản tiến trình ngăn hai thiết bị âm thầm ghi đè nhau; sao lưu luyện tập không cấp tài sản cho thế giới chung.

Người chơi có thể liên kết nhân vật khách Ngũ Vực với Gmail đã xác minh hoặc mở lại nhân vật Gmail từ thiết bị khác tại cùng máy chủ. Tài sản do máy chủ giữ; không nhận số dư do client tự khai. Nếu Gmail đã có nhân vật khác với phiên khách đang mở, máy chủ trả **409 `WORLD_LINK_CONFLICT`**, giữ nguyên cả hai tiến trình và tài sản, thay vì tự gộp hoặc thay nhân vật. Phiên Gmail hết hạn/đăng xuất ngắt quyền chơi qua phiên đó.

**SMTP chưa được xác nhận bằng một lượt gửi Gmail thật trong đợt này.** Người dùng sẽ tự cấu hình tài khoản gửi thư sau theo `.env.example`. Kiểm thử dùng bộ gửi được tiêm hoặc transport giả; không dùng kết quả đó để khẳng định hộp thư Gmail đã nhận được OTP. OTP xác minh quyền truy cập hộp thư, không bảo đảm tuyệt đối “một người một tài khoản”.

## Chặng 2 sửa vòng chơi và làm sạch mã

| Vấn đề | Hành vi sau sửa |
|---|---|
| Nhận thưởng và đột phá khác nhau giữa banner và hội thoại | Dùng luồng hoàn thành chương chung; kiểm đủ điều kiện rồi quyết toán chi phí, thưởng và cảnh giới |
| Bỏ chương hoặc bỏ qua đột phá | Chỉ nhận chương tiếp sau khi hoàn thành chương trước; chương đột phá nhị chuyển trừ đúng 50 nguyên thạch trước khi nhận thưởng 80 |
| Bản lưu cũ đã trả thưởng nhưng chưa tăng cảnh giới | Đối chiếu tiến trình lịch sử để sửa cảnh giới tương ứng, không trả thưởng lại hay thu phí cũ lần hai |
| Kỹ năng dùng Cổ chưa sở hữu | Kiểm tra quyền sở hữu trước khi dùng; không trừ tài nguyên cho hành động không hợp lệ |
| Công cơ bản và phòng ngự sai sau tải | Khôi phục chỉ số theo nguồn và cảnh giới, tránh cộng lặp hoặc làm mất chỉ số khi tải |
| Nhặt di vật lúc túi lương đầy | Chỉ lấy phần nhận được, giữ lương dư trong di vật; tiền và đúng cá thể Cổ không chuyển lặp |
| Đời mới luôn xuất hiện cùng điểm | Máy chủ chọn ngẫu nhiên từ tập khởi đầu hợp lệ; tái sinh chọn xuất thân rồi rút vị trí trong vùng đó. Kết quả đã lưu không bốc lại khi tải/thử lại |
| Tái cấu trúc luồng có liên quan | Gom quy tắc nhiệm vụ và chỉ số dùng chung; giữ ranh giới lưu trữ, UI và xử lý máy chủ; kiểm thử hồi quy đi cùng thay đổi |

Các khoản hỗ trợ đầu đời tiếp tục được theo dõi riêng để không nhân qua vòng chết/tái sinh/nhặt lại. Dữ liệu lịch sử thiếu nguồn gốc vẫn được giữ nguyên; không đoán rồi xóa tài sản hợp pháp. Thay đổi spawn không dịch chuyển các cuộc đời đang tồn tại.

## Chặng 3 Phòng thử quy luật

Mở bảng **Nhân Vật/Cổ Sư** từ ảnh đại diện, chọn **Thử Quy Luật Tu Luyện**. Mỗi bài học có engine riêng và nút bắt đầu lại. Các nút thực sự chạy bộ luật trong `src/rules`; không chỉ thay nội dung mô tả.

| Bài thử | Bộ luật có thể thao tác |
|---|---|
| Chân nguyên và phẩm chất | 100% không khiếu bằng 10.000 đơn vị; 44% dùng bốn lần giá 10 điểm còn 4 điểm. Phẩm chất có dữ liệu riêng; Tửu Trùng có điều kiện sở hữu/điều khiển và hiệu suất tinh luyện công bố. Tu luyện thành khiếu và đột phá giữ riêng dung lượng, tu vi và tuổi thọ |
| Quyền Cổ và bổn mạng | Chủ sở hữu khác người đang giữ, giao Cổ/cho mượn, thử dùng, thu hồi quyền ngay, hủy bổn mạng có phản phệ. Sở hữu Cổ chưa luyện hóa không tự đủ điều kiện điều khiển |
| Luyện Tiên Cổ | Hai mẻ nhắm cùng loại ở chuyển 6/7 tranh một chỗ giữ; nguyên liệu bị khóa, chi phí cam kết và kết quả ghi một lần. Phân biệt mục tiêu không khả dụng, lỗi thao tác và thất bại tự nhiên; bảo toàn bổn mạng chỉ áp dụng đúng trường hợp công thức |
| Thăng tiên | Toái khiếu → nạp khí → phóng Cổ, có điều kiện thứ tự và nguy cơ quá tải; thành công tạo khiếu, không tự cấp Tiên Cổ, không cộng thọ nguyên và không tặng đầy tiên nguyên |
| Thời gian và sinh thái | Đồng hồ ngoài/nội khiếu, đổi tỷ lệ từ mốc hiện tại, tuổi theo nơi thân thể hiện diện; đặt/thu khiếu và vào/ra; nước, thức ăn, cây, sức chứa và thiệt hại sinh cảnh |
| Tai kiếp | Chu kỳ riêng có thể trùng mốc; lục chuyển ghi đủ 30 địa tai và 3 thiên kiếp ở 300 năm nội. Phòng vệ tiêu tài nguyên, đạo ngân thưởng một lần; thất bại làm tăng thiệt hại sinh cảnh |

Lõi kiểm tra trạng thái rồi công bố đồng bộ trên bản sao; mã thao tác chống lặp và phiên bản chống lệnh cũ. Một năm mô phỏng bằng 1.000 tick; thay đổi tốc độ không nhân lại lịch sử. Khi xử lý một đoạn dài, thiệt hại sinh cảnh xảy ra trước sản lượng các năm tiếp theo; tiên nguyên cá nhân không được ghi thêm sau khi chủ hết thọ giữa đoạn.

Toàn bộ nhân vật, Cổ, phối phương, lượng tiền, thời gian và phần thưởng ở đây là **dữ liệu bài thử độc lập**. Các tỷ lệ ×1/×10/×20/×30, hiệu suất, xác suất, phí và mô hình cân bằng là đề xuất thiết kế. Mô phỏng không đọc/ghi bản lưu thật hoặc thay sức mạnh và tài sản Ngũ Vực. Giải quyết kiếp bằng nguồn lực chưa phải trận chiến tai kiếp nhiều người.

## Phần còn thiếu để trở thành vòng chơi MMO đầy đủ

Lõi bài thử chưa nối thành tu luyện có thẩm quyền cho nhân vật Ngũ Vực. Số chuyển của hành trình chung vẫn theo quy tắc phiêu lưu hiện có; không được âm thầm di chuyển số dư, tư chất hoặc lịch sử sang mô hình mới.

Các phần còn cần triển khai và kiểm thử theo [lộ trình A–G](doi-chieu-yeu-cau-va-bo-luat.md): khai khiếu/tu luyện/Thập Tuyệt thể đầy đủ trong thế giới chung; dưỡng và luyện hóa từng cá thể Cổ có tiến trình; bộ Cổ/sát chiêu và giao chiến mạng; nô đạo/đàn thú; tổ chức, kho chung và giao dịch ký quỹ; hệ kinh tế/tiên khiếu nhiều loài; tai kiếp chiến đấu; tiến trình 7–9; tiên cương, đổi hồn, địa linh, di sản nhiều nơi và thập chuyển mở rộng riêng của game.

Máy chủ hiện là dịch vụ một tiến trình với tệp dữ liệu. Hạ tầng phân tán, vận hành tải lớn và nội dung quy mô 360 tiểu vùng/300 truyền thừa chưa được tuyên bố hoàn tất. Tên trong Wiki hoặc đề mục trong đặc tả không thay thế chức năng vận hành.

Nguồn nguyên tác vẫn cần đối chiếu theo chương trong phạm vi người dùng yêu cầu. Đã truy cập [trang mục lục do người dùng cung cấp](https://truyendich.space/doc-truyen/co-chan-nhan) ngày 24/10/2026; việc mở mục lục chưa xác minh các luật theo chương. Đợt này không khẳng định đã đọc hay xác minh toàn bộ truyện; không dùng đề xuất game làm luật nguyên tác.

## Kiểm tra cuối và gói bàn giao

Kết quả kiểm tra cuối ngày **24/10/2026**, sau khi sửa các phát hiện từ rà soát độc lập. Tổng cộng **286 kiểm thử tự động**: 215 game/client/quy luật, 68 máy chủ và 3 đóng gói tài nguyên.

| Kiểm tra | Kết quả cuối |
|---|---|
| Vitest toàn bộ game, client, bản lưu và phòng thử | **215/215 qua**, 26 tệp; gồm 41 kiểm thử lõi quy luật và 2 hồi quy nút phòng thử |
| Node tests máy chủ, xác thực, transport và Ngũ Vực | **68/68 qua**, gồm mất phiên khi body còn đang truyền và xung đột liên kết Gmail |
| TypeScript và build web | `npm run build:android` qua; TypeScript không lỗi, Vite build thành công |
| Tài nguyên Android và đối chiếu bản đóng gói | **3/3** kiểm thử đồng bộ qua; **7/7 tệp** trong APK trùng SHA-256 với `dist` |
| Chrome thật: xác thực bằng mailer thử, khôi phục và thao tác phòng thử | **26/26 qua**, không lỗi JavaScript chưa bắt; hai origin giả lập hai thiết bị |
| Chrome thật: hồi quy luyện tập và Ngũ Vực | **22/22** bước luyện tập và **16/16** bước Ngũ Vực qua trong chặng 2; sau bổ sung nút phòng thử, **20/20** trường hợp bố cục qua ở 4 kích thước |
| APK debug | Gradle `:app:assembleDebug --offline`: **BUILD SUCCESSFUL**, 88.916.351 byte; chưa kiểm thử cài trên điện thoại Android thật |
| Gửi OTP đến hộp Gmail thật | Chưa thực hiện; người dùng cấu hình SMTP sau |

Rà soát độc lập phát hiện và đã sửa: phiên hết hạn/đăng xuất trong lúc đọc body không còn được liên kết thế giới; Gmail đã có nhân vật khác không làm mất phiên khách hiện tại; nút hấp thu quá mức đi đúng nhánh tử vong; bài tai kiếp dùng ×10 để chủ nhân sống qua 300 năm nội và còn thử được phòng vệ/thất bại. Hai lỗi nút phòng thử được tái hiện bằng kiểm thử thất bại trước khi sửa, sau đó kiểm thử qua và thử lại bằng click thật trong Chrome.

Artifact kiểm tra: [Gmail và phòng thử](../.tmp/requirements-audit/auth-browser/report.json), [luyện tập](../.tmp/requirements-audit/practice-smoke/results.json), [Ngũ Vực](../.tmp/requirements-audit/world-browser/report.json), [20 bố cục](../.tmp/requirements-audit/practice-ui/results.json), [hash APK/tài nguyên](../.tmp/requirements-audit/apk-assets.json), [dịch vụ đang chạy](../.tmp/requirements-audit/running-service.json). Các tệp `.tmp` là kết quả kiểm tra có thể tái tạo; không phải dữ liệu chơi.

APK: [app-debug.apk](../app/build/outputs/apk/debug/app-debug.apk). SHA-256: `58E6D88D5B3D2491A0CBC101E1EFFED0167AB3F07320B3170E582DADE4C787E0`.

Build còn cảnh báo kích thước bundle chính khoảng 597 kB và tính năng Gradle cũ cần chuyển trước Gradle 10; các cảnh báo không làm build thất bại. Phòng thử đã tách thành chunk tải khi mở. Dự án hiện không có Git nên không tạo commit; các bản sao mốc dùng cho đợt sửa nằm trong `.tmp/requirements-audit/baseline`.

Từ `cotienlo-game`, dùng `npm run play:world` để build và mở máy chủ; truy cập `http://127.0.0.1:8787/?world=1`. Khi phát triển, chạy `npm run server` và `npm run dev` ở hai terminal. Bản APK debug sau khi build nằm tại `app/build/outputs/apk/debug/app-debug.apk`. Hướng dẫn SMTP, máy chủ, bản lưu dự phòng và kiểm thử nằm trong [README game](../cotienlo-game/README.md).

Máy chủ bản mới đã được khởi động lại tại cổng 8787. Health, trang game và chunk phòng thử trả 200; yêu cầu OTP khi chưa có `.env` trả 503 `MAIL_NOT_CONFIGURED`, không trả mã và không gửi thư giả. Sau khi người dùng tự điền `.env`, cần khởi động lại dịch vụ. Mặc định vẫn cho khách chơi thử; có thể bật `WORLD_REQUIRE_AUTH=true` khi SMTP đã sẵn sàng.
