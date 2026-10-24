# Cổ Tiên Lộ: bản chơi thử

Màn chơi chính là bản đồ Ngũ Vực 2D liên tục **120.000 × 120.000 đơn vị**. Người chơi điều khiển cùng nhân vật được máy chủ lưu, gặp người chơi khác và tới địa danh bằng di chuyển thực tế. **Phòng thử quy luật** vẫn là mô phỏng riêng. Wiki là nội dung tra cứu, không mặc nhiên là cơ chế đã chơi được. Xem [bản đồ và cài đặt mới](../docs/ngu-vuc-ban-do-va-phim-2026-10-24.md).

Xem [đối chiếu yêu cầu và bộ luật A–G](../docs/doi-chieu-yeu-cau-va-bo-luat.md), [kế hoạch triển khai ngày 24/10/2026](../docs/superpowers/plans/2026-10-24-requirements-audit-and-repair.md) và [báo cáo đợt bổ sung cùng kết quả kiểm thử cuối](../docs/bao-cao-doi-chieu-2026-10-24.md).

## Tài khoản Gmail và cấu hình OTP

Máy chủ có bộ gửi OTP bằng Gmail SMTP, chỉ gửi được sau khi bạn cấu hình tài khoản gửi thư. Từ thư mục `cotienlo-game`, sao chép `.env.example` thành `.env`, rồi đặt `SMTP_USER` là địa chỉ gửi thư và `SMTP_PASS` là mật khẩu ứng dụng. Gmail cần bật xác minh hai bước trước khi tạo mật khẩu ứng dụng; xem [hướng dẫn chính thức của Google](https://support.google.com/accounts/answer/185833?hl=vi). Không dùng mật khẩu đăng nhập Gmail, không gửi mật khẩu trong chat và không đặt khóa SMTP trong biến `VITE_*` hay tài nguyên Android.

Mặc định dùng `smtp.gmail.com:465` với TLS. Khi dùng cổng 587, đặt `SMTP_SECURE=false`; transport vẫn bắt buộc nâng cấp STARTTLS và xác minh chứng chỉ. Tham khảo [tài liệu SMTP của Nodemailer](https://nodemailer.com/smtp). `npm run server` tự đọc `.env` nếu tệp tồn tại. Khởi động lại máy chủ sau khi đổi cấu hình.

Khi chưa cấu hình hoặc gửi thư thất bại, API báo lỗi; không trả mã OTP hay nội dung thư cho trình duyệt. Kiểm thử dùng mailer được tiêm để thu thư trong bộ nhớ, không gửi thư đến hộp thư thật. OTP xác minh quyền truy cập Gmail, không bảo đảm mỗi người chỉ có một tài khoản.

Đợt sửa này chưa thực hiện lượt gửi OTP đến Gmail thật. Bạn sẽ cấu hình SMTP sau; kiểm thử bằng bộ gửi giả không được xem là bằng chứng thư đã đến Gmail.

Đặt `WORLD_REQUIRE_AUTH=true` sau khi cấu hình SMTP để máy chủ chỉ cho tài khoản Gmail đã xác minh chơi Ngũ Vực. Tài khoản khách từ bản cũ có thể liên kết bằng phiên khách đang giữ; máy chủ bảo toàn đúng mạng sống và tài sản. Khi chưa bật cờ này, chế độ khách vẫn dùng được để chơi thử cục bộ.

Nếu Gmail đã gắn một nhân vật Ngũ Vực khác với phiên khách đang mở, máy chủ trả **HTTP 409 `WORLD_LINK_CONFLICT`** và giữ nguyên cả hai tiến trình cùng tài sản. Không tự gộp số dư hoặc thay nhân vật đang chơi. Để vào nhân vật Gmail, dùng cửa sổ/profile riêng không mang phiên khách đó rồi đăng nhập cùng máy chủ.

## Phòng thử quy luật

Mở bảng **Nhân Vật/Cổ Sư** từ ảnh đại diện, rồi chọn **Thử Quy Luật Tu Luyện**. Mỗi bài có dữ liệu khởi tạo riêng và nút **Bắt đầu lại bài thử**:

- Chân nguyên 44% dùng chi phí tuyệt đối 10 điểm phần trăm, phẩm chất tách tu vi, Tửu Trùng và tu luyện thành khiếu.
- Cho mượn Cổ, dùng thử, thu hồi quyền, chủ sở hữu khác người đang giữ và phản phệ khi hủy bổn mạng.
- Hai người thử luyện cùng một loại Tiên Cổ ở chuyển khác nhau; giữ chỗ xuyên chuyển, lỗi tự nhiên khác lỗi thao tác và điều kiện bảo toàn bổn mạng.
- Ba bước thăng tiên, cân bằng tam khí, nguy cơ hấp thu quá mức; thành công không tự cấp Tiên Cổ hoặc tăng thọ nguyên.
- Thời gian ngoài/nội khiếu, tuổi theo nơi hiện diện, môi trường, nước và thức ăn; tỷ lệ ×1/×10/×20/×30 là thông số đề xuất.
- Lịch lục chuyển có 30 địa tai và 3 thiên kiếp trong 300 năm nội; mốc trùng được ghi đủ hai loại, xử lý phòng vệ/thiệt hại trong mô phỏng tài nguyên.

Các nút chạy bộ luật trong `src/rules`, không phải minh họa chỉ đổi chữ. Phòng thử **không đọc/ghi bản lưu 2D, không tạo tài sản Ngũ Vực và không đổi số chuyển đang chơi**. Một năm mô phỏng bằng 1.000 tick, không phải một năm hay một giờ thực. Phí, hiệu suất, công thức cân bằng và phối phương trong bài thử là đề xuất thiết kế; chưa coi là thông số nguyên tác đã xác minh.

Lõi này chưa nối thành hệ tu luyện/tiên khiếu/tai kiếp có thẩm quyền trên máy chủ chung. Phòng thử cũng chưa phải chiến đấu tai kiếp nhiều người, giao dịch, bang hội hoặc vòng chơi đầy đủ từ nhất tới cửu chuyển.

## Chơi trong thế giới chung

Bản đồ chơi trực tiếp gồm Nam Cương, Bắc Nguyên, Tây Mạc, Đông Hải và Trung Châu với 5 sinh cảnh, 15 trạm an toàn, mạng đường đi xuyên vùng và 30 địa danh. Các địa danh nối cùng 12 truyền thừa, 4 bài học và nhật ký của tài khoản; không tạo nhân vật riêng để mở bản đồ. Máy chủ giữ chuyển động, HP/MP, hồi chiêu, đánh quái, phần thưởng và tử vong. Có hiển thị người chơi lân cận; các cuộc chạm trán quái hiện được mô phỏng theo cuộc đời. PvP thời gian thực, chợ và bang hội chưa bổ sung trong đợt này.

Cần Node.js 24 trở lên. Từ `cotienlo-game`:

```powershell
npm ci
npm run play:world
```

Mở `http://127.0.0.1:8787/?world=1`, nhập đạo hiệu để tạo tài khoản khách nếu máy chủ cho phép chơi thử. Từ bảng nhân vật, mở **Đăng nhập Gmail**, xác minh OTP rồi chọn **Liên kết Ngũ Vực với Gmail** để gắn nhân vật hiện tại với tài khoản. Trên thiết bị khác, đăng nhập cùng Gmail tại cùng máy chủ rồi chọn nút liên kết để mở lại đúng cuộc đời. Đăng xuất hoặc hết hạn phiên sẽ ngắt quyền chơi của phiên đó; tài sản vẫn được máy chủ giữ.

Tạo nhân vật và tái sinh đều bốc ngẫu nhiên một trong **cả năm vực**, rồi chọn trạm/điểm an toàn hợp lệ. Xuất thân không khóa vùng. Điểm sinh chỉ bốc một lần cho một lifeId; tải lại hoặc lặp cùng thao tác không bốc lại. Cuộc đời cũ chưa có tọa độ được đặt ở trạm tương ứng địa danh đã biết, giữ nguyên tài sản/lịch sử; sau đó có thể đi tự do qua cả năm vực.

Màn Ngũ Vực tự lưu trên máy chủ; bảng Gmail của màn này không còn nút tải/lưu bản luyện tập. Bản luyện tập lịch sử và các backup `cotienlo_cloud_backup_v1:` vẫn được giữ nguyên, không nhập tiền/HP/đồ tự khai vào nhân vật chung. Các API và schema phục hồi bản cũ được giữ để tương thích; dữ liệu tài khoản ở `.world-data/users.json`, nhân vật chung ở `.world-data/world.json`. Gmail chỉ xác minh danh tính, không phải nơi chứa tệp game.

Trong lúc phát triển, chạy `npm run server` ở một terminal và `npm run dev` ở terminal khác. Vite chuyển cả `/api/world` và `/api/auth` tới dịch vụ ở cổng 8787. Nút **Ngũ Vực** mở bản đồ tổng quan của cùng nhân vật; chọn vùng chỉ xem thông tin, không dịch chuyển. Nhật ký và truyền thừa mở từ bản đồ/NPC; hoạt động tại địa danh cần đứng gần địa danh đó.

Trong một cuộc đời, hãy điều tra nơi đang ở để thấy truyền thừa; làm việc kiếm tiếp tế, nghỉ ngơi, học kỹ năng địa phương rồi chuẩn bị khảo nghiệm. Trước khi vào phải chấp nhận luật chết vĩnh viễn. Một sai sót có thể tăng nguy hiểm; chạm ngưỡng cuối hoặc hết thời hạn sẽ kết thúc đời. Tải lại hay đóng màn hình không hủy cam kết. Kỹ năng chuyên môn cấp 2 mở cách vận dụng sở trường ít tiêu hao hơn. Khi đã hết cách tiếp tục, lựa chọn **Chấp nhận thất bại cuối cùng** kết thúc đời ngay, không phải rút lui an toàn.

Mỗi đời mới được cấp 20 nguyên thạch và 8 lương thực. Phần hỗ trợ chưa tiêu hết sẽ biến mất khi chết; chi phí sử dụng phần hỗ trợ trước. Chỉ tài sản kiếm được và Cổ còn giữ mới trở thành di vật, nên hồi sinh rồi nhặt lại di vật không nhân quà khởi đầu. Khi nâng cấp bản lưu cũ chưa theo dõi nguồn tài sản, máy chủ giữ nguyên toàn bộ số dư, di vật và quyền giữ Cổ hiện có; quy tắc hỗ trợ được theo dõi từ lần sinh mới tiếp theo.

Khi túi lương thực đầy hoặc chỉ còn ít chỗ, nhặt di vật chỉ chuyển phần mang được; lượng dư còn ở di vật. Tiền và cá thể Cổ không được chuyển lại lần hai khi thử lại cùng thao tác.

Máy chủ lưu dữ liệu tại `.world-data/world.json`; không đưa thư mục này vào Git hoặc gói Android. Chỉ chạy một tiến trình cho một tệp thế giới. Sao lưu tệp khi dịch vụ đã dừng trước khi chuyển máy. Dữ liệu bị hỏng khiến dịch vụ báo lỗi; không tự tạo thế giới rỗng đè lên lịch sử. Có thể đặt `WORLD_DATA_FILE` để dùng tệp thế giới khác, chẳng hạn cho kiểm thử; đặt `PORT` nếu cần đổi cổng. Đây là dịch vụ một tiến trình để chơi thử, chưa phải hạ tầng MMO phân tán.

Để điện thoại trong cùng mạng truy cập bản web:

```powershell
$env:HOST = '0.0.0.0'
npm run play:world
```

Mở `http://<IP-máy-chạy-server>:8787/?world=1` trên điện thoại. Khi cả giao diện và API ở địa chỉ này, giữ ô máy chủ mặc định. Nếu giao diện chạy ở một địa chỉ khác, cấu hình `WORLD_ALLOWED_ORIGINS` trên máy chủ bằng danh sách origin được phép, phân cách bằng dấu phẩy. Android WebView đã được cho phép origin `https://appassets.androidplatform.net`; kết nối từ APK cần endpoint HTTPS hợp lệ. Bản APK ở chế độ Ngũ Vực cần một dịch vụ có thể truy cập được; cấu hình trong Kết nối nâng cao nếu chưa có endpoint cùng địa chỉ. Bản lưu luyện tập cũ vẫn được giữ, không bị ghi đè.

Kiểm thử phần mới từ `cotienlo-game`:

```powershell
npm test
npm run test:world
npm run build:android
npm run test:assets
```

Kiểm tra bằng Chrome thật từ thư mục gốc khi Vite và dịch vụ đang chạy:

```powershell
node tools/check-five-regions.mjs
```

Công cụ tạo tài khoản khách thử nghiệm qua giao diện thông thường. Để tách khỏi lịch sử đang chơi, dùng một dịch vụ riêng với `WORLD_DATA_FILE` trỏ vào `.tmp` và cho Vite kết nối tới dịch vụ đó. Báo cáo và ảnh nằm trong `.tmp/shared-world/browser-qa`. Quy tắc thế giới được kiểm tra thêm bằng hai tài khoản, ghi lặp, khởi động lại, mất kết nối, di vật, toàn bộ 12 truyền thừa và quyền giữ Tiên Cổ.

## Luyện tập trên thiết bị và đóng gói Android

Trong bản luyện tập, hướng ngắm và hướng chạy hoạt động độc lập:

- **Máy tính:** WASD/phím mũi tên để chạy; rê chuột để ngắm. Nhấp trái/J đánh thường; **1–2–3–4** dùng bốn ô chiêu. Mở **Cài đặt** hoặc **O** để lắp Cổ và đổi phím. Bấm HUD vẫn giữ điểm ngắm cuối trên sân.
- **Điện thoại:** giữ cần chạy bằng một ngón; ngón khác kéo từ nút **Công kích** hoặc **Nguyệt Quang** rồi thả để tung chiêu. Chạm nhanh dùng hướng ngắm gần nhất; nếu chưa ngắm thì theo hướng nhân vật.
- **Space/Lướt** giữ hướng di chuyển. Dấu ngắm thể hiện hướng chiêu; đạn không tự đổi hướng sau khi bắn. Các thao tác bị hủy/mất focus/mở bảng không phát chiêu muộn.

Xem [kết quả kiểm tra điều khiển](../docs/ngam-chieu-doc-lap-2026-10-24.md). Công cụ kiểm tra chuột và hai ngón thật qua Chrome, khi Vite đang chạy: `node tools/check-combat-aim.mjs`; chỉ dùng fixture theo dõi hiển thị trong `.tmp`, không thêm hook kiểm thử vào bản game phát hành.

Mã TypeScript trong `src` là nguồn cho cả bản web và game được đóng gói trong Android. Chạy từ thư mục `cotienlo-game` với Node.js và npm:

```powershell
npm ci
npm run dev
```

Kiểm tra và đóng gói:

```powershell
npm test
npm run test:assets
npm run build:android
```

`build:android` kiểm tra TypeScript, tạo bản web trong `dist`, xác nhận các tài nguyên được tham chiếu trong HTML tồn tại, rồi đồng bộ vào `../app/src/main/assets/cotienlo`. Chỉ các tệp cũ trong thư mục game này được loại bỏ. Không sửa trực tiếp các tệp đã đóng gói.

Gradle tự chạy bước này trước `preBuild` khi nguồn game thay đổi. Cần chạy `npm ci` một lần trước khi build Android; Gradle không tự tải gói npm. Từ thư mục gốc dự án:

```powershell
.\gradlew.bat :app:assembleDebug
```

WebView gửi `cotienlo:pause` và `cotienlo:resume` theo vòng đời màn hình, để game lưu tiến trình, ngừng nhận điều khiển và tạm dừng âm thanh khi rời màn hình.

Android phục vụ game từ địa chỉ HTTPS nội bộ `appassets.androidplatform.net`; các tệp vẫn được đọc từ APK, không cần máy chủ web. Khi khởi tạo WebView, ứng dụng đọc bản lưu cũ ở địa chỉ `file://` rồi chuyển tiến trình sang địa chỉ mới nếu chưa có bản lưu ở đó.

Kiểm tra định tuyến, MIME và mã chuyển bản lưu bằng Kotlin đã có trong bộ nhớ đệm Gradle, từ thư mục gốc:

```powershell
.\tools\check-game-asset-routes.ps1 -GradleUserHome "$env:USERPROFILE\.gradle"
```

Bài kiểm tra này không cần JUnit hoặc tải gói mới; kết quả biên dịch nằm trong `.tmp`.

Giao diện dùng tông ngọc bích–đồng vàng, icon SVG, atlas pixel art và font hệ thống để hoạt động offline.
Các bảng hỗ trợ Tab, Escape và trả focus về nút mở. Khi chữ được phóng lớn trên
màn hình ngang thấp, HUD chuyển sang bố cục cuộn dọc để đọc và dùng đủ điều khiển.

Để kiểm tra giao diện, giữ `npm run dev` đang chạy, rồi từ thư mục gốc:

```powershell
node tools/check-game-ui.mjs
node tools/check-game-ui.mjs --text-scale=2 --out=.tmp/ui-qa-text-200
node tools/check-game-ui.mjs --reduced-motion --out=.tmp/ui-qa-reduced-motion
node tools/check-game-smoke.mjs
```

Công cụ dùng Chrome headless qua DevTools Protocol, không thêm package. Mặc định
dùng Chrome trên Windows; có thể truyền `--chrome=<đường-dẫn>` và
`--base-url=http://127.0.0.1:5173`. Ảnh và kết quả đo nằm trong `.tmp` ở gốc dự án.

`check-game-ui` kiểm tra cả Wiki, bố cục, focus và lỗi JavaScript/tải tài nguyên.
`check-game-smoke` dùng click/phím thật qua Chrome để thử kỹ năng, cho ăn, hợp
luyện, tìm kiếm Wiki và phục hồi bản lưu. Mỗi lượt dùng profile riêng nên không
đụng bản lưu của người chơi; profile được dọn sau khi Chrome đóng.
