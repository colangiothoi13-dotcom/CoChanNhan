# Đặc tả sản phẩm và kiến trúc game nhập vai 2D online

Ngày lập 23 tháng 10 năm 2026

## 1 Mục tiêu và quyết định đề xuất

Xây dựng một game nhập vai 2D online có thế giới và hình ảnh riêng, tham khảo hướng chơi của Cổ Tiên Lộ. Người chơi khám phá bản đồ, chiến đấu, thu thập linh thú để thay đổi bộ kỹ năng, nhận vật liệu và nâng cấp nhân vật. Sản phẩm đầu tiên là web/PWA hoạt động tốt trên điện thoại và máy tính. Android và iOS là giai đoạn sau khi bản web chứng minh được trải nghiệm.

Đề xuất dành bốn tuần đầu cho một lát cắt chơi hoàn chỉnh, gọi là vertical slice: người chơi vào game, nhận nhiệm vụ, đánh quái, nhận thưởng, đổi kỹ năng, nâng cấp và đăng nhập lại vẫn giữ tiến trình. Nếu vòng chơi này đạt yêu cầu, tiếp tục đến closed beta vào khoảng tuần 16. Mốc thời gian là ước tính theo đội ngũ dưới đây, chưa phải cam kết giao hàng.

| Giả định | Cơ sở lập kế hoạch |
| --- | --- |
| Đội phát triển | 3 lập trình viên, 1 họa sĩ, 0,5 nhân sự thiết kế game, 0,5 QA |
| Thiết bị | Điện thoại chơi ngang và máy tính; kiểm thử cảm ứng từ tuần 1 |
| Ngôn ngữ nội dung | Tiếng Việt; dùng khóa văn bản để có thể dịch sau |
| Trải nghiệm ban đầu | PvE thời gian thực; một chuyến đi khoảng 8 đến 12 phút |
| Quy mô thử nghiệm | Nhóm tối đa 4 người; mục tiêu kiểm thử 20 người mỗi room |
| Nội dung | Tên gọi, nhiệm vụ, mã nguồn, hình ảnh và âm thanh được tạo riêng hoặc cấp phép |
| Kết quả giai đoạn đầu | Bản thử nghiệm có thể đo hành vi và sửa sản phẩm; chưa bao gồm phát hành thương mại đầy đủ |

Đây là đề xuất thiết kế để chủ sản phẩm chỉnh phạm vi và phân bổ nguồn lực. Việc chốt nền tảng, đội ngũ và ngày khởi động sẽ quyết định lịch thực tế.

## 2 Những thông tin đã đối chiếu

Trang giới thiệu công khai của Cổ Tiên Lộ mô tả một game online 2D chơi trên trình duyệt, có nuôi cổ, tu luyện, tổ đội, phó bản và bang hội [1]. Đây là cơ sở tham khảo về thể loại. Những tên tệp, cây thư mục, số lượng 55 khu vực, 377 loại cổ và các số liệu còn lại là thông tin đầu vào do người dùng cung cấp; chưa được dùng làm tiêu chuẩn nghiệm thu cho game mới.

Phaser 4.2.1 là một bản phát hành chính thức của Phaser 4, công bố ngày 9 tháng 7 năm 2026 [2]. Vì vậy cần kiểm tra lại cách gọi “Phaser 3 custom build v4.2.1”. Trang phiên bản chính thức của React hiện ghi 19.3 [3]; điều này xác nhận sự tồn tại của phiên bản, không chứng minh website tham khảo sử dụng nó.

Các dấu vết JavaScript có thể giúp nhận diện thư viện phía trình duyệt. Chúng không xác định đầy đủ cơ sở dữ liệu, mã nguồn backend, quy trình lưu nhân vật, thuật toán chống gian lận hay năng lực chịu tải. Cây thư mục đề xuất trong tài liệu này là thiết kế mới. Mọi lựa chọn phiên bản cần được khóa trong lockfile sau thử nghiệm tích hợp.

## 3 So sánh hướng triển khai

| Hướng | Phù hợp khi | Đánh đổi |
| --- | --- | --- |
| Web/PWA và multiplayer theo khu vực | Muốn trải nghiệm gần hướng tham khảo và đội quen TypeScript | Cần kiểm soát hiệu năng trình duyệt, mạng và trạng thái ứng dụng trên điện thoại |
| App mobile dùng game engine làm trọng tâm | Ưu tiên ứng dụng điện thoại và đội có kinh nghiệm engine | Cần đánh giá lại client, quy trình build, nhân lực và lịch; backend vẫn phải được thiết kế |
| Game tu luyện bất đồng bộ hoặc idle | Đội rất nhỏ, ưu tiên progression và quản lý tài nguyên | Phải thay đổi trải nghiệm cốt lõi; cảm giác chiến đấu online khác đáng kể |

Chọn hướng web/PWA làm cơ sở vì phù hợp với nền tảng người dùng đã phân tích. Phaser có template chính thức kết hợp React, TypeScript và Vite [4]. Capacitor là ứng viên đóng gói về sau vì cung cấp runtime cho iOS và Android [8]; cần một đợt kiểm thử và phát hành riêng cho từng nền tảng.

## 4 Vòng chơi và điểm khác biệt

Một lượt chơi bắt đầu bằng lựa chọn linh thú và mục tiêu săn. Trong khu vực chiến đấu, người chơi đọc dấu hiệu ra đòn của quái, di chuyển, né và phối hợp hai kỹ năng chủ động. Sau khi thu thập đủ vật liệu, họ trở về nâng trang bị hoặc mở linh thú mới. Lượt tiếp theo phải có mục tiêu dễ hiểu, chẳng hạn thử bộ kỹ năng mới hoặc đánh boss từng thất bại.

Điểm thiết kế chính là linh thú thay đổi cách đánh. Nhân vật có hai ô linh thú chủ động và một ô bị động. Bản đầu thiết kế sẵn một số tương tác như làm chậm rồi gây sát thương vùng, hoặc tạo khiên để duy trì kỹ năng cần đứng gần mục tiêu. Chưa xây hệ thống phản ứng tự do giữa mọi cặp kỹ năng.

Điều khiển gồm đánh thường, hai kỹ năng chủ động và né. Khi chết, người chơi hồi sinh ở điểm an toàn; beta đầu không có mất vật phẩm vĩnh viễn. Đồ rơi được cấp riêng theo người chơi đủ điều kiện, tránh tranh chấp nhặt đồ trong tổ đội. Tiền tệ chỉ có một loại trong beta, dùng cho nâng cấp và chế tạo.

| Nội dung | Vertical slice cuối tuần 4 | Trần phạm vi beta |
| --- | --- | --- |
| Khu vực | 1 bản đồ gồm điểm an toàn và khu săn | 4 khu vực gồm 1 làng, 2 khu săn, 1 khu boss |
| Linh thú | 3 loại gồm 2 chủ động và 1 bị động | 8 loại gồm 6 chủ động và 2 bị động |
| Đối thủ | 1 loại quái và 1 tinh anh | 6 loại quái và 2 boss |
| Tiến triển | 1 lần lên cấp và 1 lần nâng cấp | 12 cấp, chia 3 cảnh giới; 3 ô trang bị |
| Nhiệm vụ | Chuỗi hướng dẫn 3 bước | 12 nhiệm vụ; nhiệm vụ lặp là phần có thể cắt |
| Vật phẩm | 6 định nghĩa đủ cho vòng chơi | Khoảng 30 định nghĩa vật phẩm |
| Chế tạo | 1 thao tác nâng cấp xác định kết quả | Tối đa 8 công thức; chưa có ngẫu nhiên phức tạp |
| Online | 2 người thật cùng quan sát trận đánh | Tổ đội 4 người; chat khu vực cơ bản |
| Tu luyện ngoại tuyến | Chưa có | Phần có thể cắt; tối đa 8 giờ tích lũy |

Số lượng trên là trần để kiểm soát khối lượng, không phải lý do bổ sung nội dung khi chất lượng chưa đạt. Bản có ít nội dung hơn vẫn được thử nghiệm nếu thể hiện rõ vòng chơi và đáp ứng tính toàn vẹn dữ liệu.

Hoãn giao dịch giữa người chơi, chợ đấu giá, PvP, chiến tranh bang hội, nhiều nhánh tiến hóa, thế giới liền mạch lớn, thanh toán và ứng dụng trên cửa hàng. Giữ chúng trong backlog sau beta.

## 5 Màn hình và trải nghiệm điện thoại

Luồng chính đi từ chơi ngay hoặc đăng nhập, tạo nhân vật, hướng dẫn trong game, nhận nhiệm vụ, chiến đấu, nhận thưởng đến nâng cấp. Đăng ký đầy đủ không được cản người dùng thử vòng chơi đầu tiên; khách vẫn phải có danh tính do server cấp và có đường liên kết tài khoản để giữ tiến trình.

| Màn hình | Nội dung cần có |
| --- | --- |
| Vào game | Chơi ngay, đăng nhập, thông báo kết nối và phiên bản |
| Tạo nhân vật | Tên, một bộ khung nhân vật với ít lựa chọn ngoại hình |
| HUD chiến đấu | HP, năng lượng, mục tiêu, tiến độ nhiệm vụ, nút kỹ năng |
| Nhân vật và linh thú | Đổi hai kỹ năng chủ động, một bị động, xem thay đổi thuộc tính |
| Túi đồ và nâng cấp | Số lượng, điều kiện sử dụng, phí và kết quả trước khi xác nhận |
| NPC và nhiệm vụ | Hội thoại ngắn, mục tiêu rõ, phần thưởng rõ |
| Kết nối lại | Thông báo đang nối lại; khi hết hạn, nạp lại dữ liệu đã lưu |

Máy tính dùng WASD, chọn mục tiêu và phím kỹ năng. Điện thoại dùng joystick trái, nút chiến đấu phải; mục tiêu ban đầu cho vùng chạm là ít nhất 44 CSS px. Bảng phụ chỉ mở một bảng chính mỗi lần. Chữ tiếng Việt phải đọc được trên thiết bị mục tiêu; không dùng phông pixel nhỏ cho đoạn hội thoại dài.

Phần nhập liệu và giao diện cần xử lý focus đúng: gõ chat không di chuyển nhân vật; nhấn vào túi đồ không gây đánh thường xuyên xuống canvas. Chỉ chặn cử chỉ trình duyệt trên vùng chơi khi cần; màn hình đăng nhập và nội dung dài vẫn giữ khả năng tiếp cận phù hợp.

## 6 Kiến trúc và công nghệ

| Lớp | Lựa chọn đề xuất | Trách nhiệm |
| --- | --- | --- |
| Client | TypeScript và Vite | Build, tách gói, tải theo màn hình và khu vực |
| UI | React 19 và Zustand | Đăng nhập, HUD, túi đồ, hội thoại và trạng thái UI |
| Thế giới 2D | Phaser 4 làm ứng viên | Scene, tilemap, sprite, camera, animation và hiệu ứng |
| Realtime | Colyseus, client và server cùng dòng tương thích | Room, message, đồng bộ state, kết nối lại |
| Backend | Node.js và TypeScript | Auth, nhân vật, chiến đấu, nhiệm vụ, kinh tế, quản trị |
| Lưu trữ | PostgreSQL | Tài khoản, tiến trình, tồn kho, giao dịch và audit |
| Nhiều process | Redis khi cần | Presence và room driver dùng chung; không giữ sổ tài sản duy nhất |
| Nội dung | Tiled hoặc công cụ xuất JSON; schema validation | Map, collision, spawn, nhiệm vụ và balance |
| Triển khai | CDN và máy chủ hỗ trợ WebSocket lâu sống | Asset tĩnh, API, game server, HTTPS/WSS |
| Kiểm thử | Vitest, Playwright, bot Colyseus | Logic nghiệp vụ, hành trình người chơi và tải thực tế |

Phaser 4 được thử trước với tilemap, sprite, camera, cảm ứng và mạng. Chỉ chuyển sang Phaser 3 nếu spike cho thấy một vấn đề cụ thể chưa giải quyết được trong ngân sách thời gian. Chốt phiên bản chính xác, các package Colyseus tương thích, Node LTS được hỗ trợ và công cụ build trong tuần 2. Không sao chép số phiên bản từ dấu vết website làm mặc định triển khai.

### 6.1 Ranh giới giữa React và Phaser

Phaser sở hữu vị trí, sprite, camera, animation và vòng render. React sở hữu bảng giao diện và thông tin trình bày. Một lớp GameBridge có kiểu dữ liệu rõ ràng chuyển lệnh và sự kiện giữa hai phía. Zustand chỉ giữ dữ liệu UI và bản chiếu cần thiết từ server; không lưu toàn bộ tọa độ thế giới ở mỗi frame. Khởi tạo và hủy scene phải dọn listener để tránh nhân đôi canvas hoặc sự kiện.

### 6.2 Backend quyết định kết quả chơi

Colyseus có mô hình server thay đổi state và client gửi yêu cầu; framework hỗ trợ đồng bộ thay đổi theo thuộc tính [5]. Thiết kế game phải bổ sung kiểm tra nghiệp vụ. Client chỉ gửi ý định như hướng di chuyển, muốn dùng kỹ năng nào, mục tiêu nào hoặc yêu cầu nhận thưởng. Server kiểm tra quyền sở hữu, tốc độ, collision, cooldown, tầm đánh, năng lượng, trạng thái sống và điều kiện nhiệm vụ trước khi tính kết quả.

Hiệu ứng ở client có thể chạy sớm để phản hồi nhanh. HP, RNG, vật phẩm, tiền và tiến trình chỉ được xác nhận từ server. Logic AI và bản đồ collision chạy được bằng TypeScript thuần trên server; server không cần khởi tạo Phaser để vẽ thế giới.

### 6.3 Room và đồng bộ

Mỗi bản sao khu vực là một room; một khu vực có thể có nhiều bản sao. Phó bản tổ đội có room riêng. Beta bắt đầu với một region, một codebase backend chia module và số process tối thiểu phù hợp tải. Khi tăng process, cần Presence, room driver và định tuyến đúng room; thêm process không tự chia một room đang quá tải [7].

Thông số thử ban đầu là simulation 20 Hz, state patch 10 Hz, 20 người và tối đa 40 quái đang hoạt động trong một room kiểm thử. Patch 10 Hz là cấu hình đề xuất của dự án; tài liệu Colyseus hiện ghi mặc định 20 Hz [6]. So sánh 10 với 20 Hz trong spike, ghi lại băng thông và cảm giác điều khiển trước khi chốt. Mục tiêu render 60 FPS, với tiêu chí tối thiểu 30 FPS trên thiết bị sàn đã chọn.

Nhân vật khác dùng nội suy; nhân vật điều khiển có thể dùng prediction và reconciliation sau khi logic chuyển động thuần được đồng nhất. Kiểm thử RTT 50, 150 và 300 ms; ngắt mạng 2, 10 và 45 giây. Thời gian giữ chỗ kết nối lại đề xuất 30 giây. Process chết cần nạp lại dữ liệu bền vững; reconnect không thay thế cơ chế phục hồi.

### 6.4 Tài khoản và quyền ghi

accountId và characterId tồn tại lâu dài, tách biệt sessionId của kết nối. Guest cũng nhận identity và token từ server. Client không được tự chọn chủ nhân vật. Tài liệu Colyseus ghi nhận một số mặc định cho phép kết nối không có token, vì vậy phải cấu hình rõ yêu cầu xác thực của game [11].

Một nhân vật chỉ được có một chủ thể đang có quyền ghi. Dùng đặt chỗ nguyên tử và sessionEpoch để từ chối phiên cũ. Plugin ngăn nhiều phiên có thể hỗ trợ trải nghiệm, nhưng tài liệu của plugin nêu race window khi hai lần join gần đồng thời [10]. Giao dịch dữ liệu phải khóa và kiểm tra hàng ownership trong cùng transaction với thay đổi tài sản; thao tác đổi owner dùng chung khóa để không chen giữa kiểm tra và ghi.

Khi chuyển khu vực: server chuẩn bị room đích; nguồn dừng nhận hành động mới và chờ giao dịch đang xử lý; transaction lưu transferId, điểm đến và epoch mới; room đích nhận ticket ngắn hạn dùng một lần. Nếu ngắt mạng hoặc process chết, phục hồi theo trạng thái chuyển khu vực đã lưu. Không truyền tồn kho do client gửi sang room mới.

## 7 Dữ liệu và tính toàn vẹn vật phẩm

Tách ba loại dữ liệu. Nội dung công khai gồm tên, mô tả, hình ảnh, chỉ số hiển thị và bản đồ client. Dữ liệu runtime gồm vị trí, mục tiêu, quái và trạng thái chiến đấu. Dữ liệu bền vững gồm tiến trình, số dư, tồn kho và các lần đã nhận thưởng. Client chỉ nhận dữ liệu riêng của chính mình; state chung không chứa toàn bộ túi đồ của người khác, token hoặc thông tin quản trị.

| Nhóm bảng dự kiến | Nội dung và ràng buộc chính |
| --- | --- |
| accounts và sessions | Danh tính, guest liên kết tài khoản, thời hạn và thu hồi phiên |
| characters | Cấp, cảnh giới, điểm an toàn, phiên bản dữ liệu |
| character_ownership | characterId duy nhất, owner, epoch và trạng thái chuyển khu vực |
| inventory_items | Vật phẩm theo chủ sở hữu; số lượng không âm |
| equipment và spirit_loadouts | Kiểm tra vật phẩm thuộc nhân vật và đúng loại ô |
| quest_progress và reward_claims | Tiến độ; khóa duy nhất cho mỗi lần thưởng hợp lệ |
| economy_operations | operationId, hash yêu cầu, kết quả đã commit và log biến động |
| world_checkpoints | Điểm phục hồi an toàn; không là nguồn tiền hoặc vật phẩm |
| moderation_reports và admin_audit | Báo cáo chat, thao tác hỗ trợ có người thực hiện và lý do |

Transaction PostgreSQL gộp nhiều thay đổi theo nguyên tắc toàn bộ thành công hoặc toàn bộ hủy [12]. Game cần thiết kế đúng ranh giới transaction: kiểm tra phiên, kiểm tra điều kiện, trừ nguyên liệu, cộng kết quả, ghi operationId và nhật ký rồi commit. Chỉ sau commit mới trả kết quả thành công và cập nhật bản chiếu trong room.

Retry cùng operationId và cùng nội dung phải trả lại kết quả đã ghi. Dùng lại operationId với nội dung khác phải bị từ chối. Đồng thời cần khóa nghiệp vụ, chẳng hạn phần thưởng nhiệm vụ chỉ được cấp một lần cho mỗi questInstanceId; đổi operationId không được nhận thêm. Thưởng quái có khóa riêng cho mỗi cặp eventId và characterId; người đủ điều kiện và receipt đã commit được lưu để replay sau restart. XP và level phải được lưu cùng giao dịch thưởng. Khóa hàng hoặc cập nhật có điều kiện ngăn hai giao dịch cùng tiêu một tài nguyên. Request từ client chỉ chứa định danh hành động; giá, thưởng và RNG do server tra cứu.

Vị trí có thể checkpoint định kỳ khoảng 15 giây và khi rời khu vực; tiền, vật phẩm và thưởng quan trọng phải lưu ở thời điểm giao dịch. Nếu DB gặp lỗi, đóng thao tác kinh tế và thông báo thử lại, không báo thành công rồi hy vọng lưu sau. Khi process chết, người chơi có thể quay về checkpoint vị trí nhưng không được mất phần thưởng đã được xác nhận bền vững.

Tu luyện ngoại tuyến, nếu giữ trong phạm vi, dùng thời gian server và giới hạn 8 giờ. Nhận thưởng và cập nhật mốc đã tính phải cùng transaction. Không tính thưởng theo đồng hồ điện thoại hoặc phụ thuộc JavaScript tiếp tục chạy khi ứng dụng đóng. Không cho cùng một nhân vật vừa tích lũy ngoại tuyến vừa nhận lợi ích PvE online trùng thời gian.

## 8 Tổ chức mã nguồn và nội dung

Đề xuất một monorepo. Đây là cấu trúc mới để phân công trách nhiệm, không phải cây thư mục đã khôi phục của website tham khảo.

| Đường dẫn | Trách nhiệm |
| --- | --- |
| apps/client/src/game | Scene, render, input, âm thanh và hiệu ứng |
| apps/client/src/ui | Đăng nhập, HUD, túi đồ, linh thú, nhiệm vụ, chat |
| apps/client/src/bridge | Kết nối có kiểu giữa UI, scene và network |
| apps/client/src/network | Kết nối room, nhận state, phục hồi kết nối |
| apps/server/src/rooms | WorldRoom và room phó bản |
| apps/server/src/modules | Auth, character, combat, quest, economy, moderation |
| apps/server/src/db | Migration, transaction và repository |
| packages/protocol | Schema message, phiên bản giao thức và lỗi nghiệp vụ |
| packages/simulation | Hàm chuyển động và phép tính thuần dùng chung khi cần |
| packages/content | Schema định nghĩa, khóa văn bản, ID và metadata |
| content/source | Dữ liệu gốc do designer và artist chỉnh sửa |
| tools/content | Kiểm tra tham chiếu, xuất map và đóng gói asset |
| tests và infra | Kiểm thử tích hợp, bot tải, cấu hình staging và triển khai |

Client build chỉ lấy phần public của nội dung; server config, mật khẩu và khóa dịch vụ không nằm trong bundle. Map xuất riêng tile hiển thị, collision, vùng an toàn và spawn để client và server cùng dựa vào một nguồn.

Quy trình nội dung là biên soạn, kiểm tra schema và ID, xuất artifact có contentVersion, tải vào staging, chơi thử, rồi phát hành. Nguồn nội dung dùng ID ổn định và có lịch sử thay đổi. Công cụ kiểm tra phải bắt được tham chiếu thiếu, vật phẩm không có icon, công thức đầu vào sai và điểm spawn nằm trong vật cản.

Về mỹ thuật, đề xuất tile 32 px, một bộ khung nhân vật với bốn hướng và ít ngoại trang ban đầu. Linh thú trước hết được thể hiện qua icon, hiệu ứng và trang bị kỹ năng, giảm gánh nặng animation đi theo nhân vật. Chốt quy ước sprite, anchor, tỷ lệ, bảng màu và hiệu ứng trước khi sản xuất hàng loạt. Tài nguyên sử dụng phải có nguồn và điều kiện sử dụng được ghi lại.

Asset tải theo khu vực. App shell và gói cần cho vùng đầu có ngân sách tải nén mục tiêu 8 MB, các vùng khác tải khi cần. PWA hỗ trợ cài đặt và cache phù hợp, nhưng tính cài đặt không tự bảo đảm gameplay offline [9]. Bản đầu hiển thị trạng thái mất mạng, không cho giao dịch ngoại tuyến chưa được xác nhận. Cập nhật service worker phải tránh dùng client cũ với schema server mới giữa trận.

## 9 Lộ trình 16 tuần

| Tuần | Sản phẩm bàn giao | Điều kiện kết thúc |
| --- | --- | --- |
| 1 và 2 | Spike engine, cảm ứng, map, server điều khiển chuyển động; bộ hình thử và format nội dung | Chạy trên điện thoại thật, hai client cùng room; ghi số đo hiệu năng và khóa stack |
| 3 và 4 | Vertical slice một bản đồ với nhiệm vụ, chiến đấu, thưởng, nâng cấp, lưu và kết nối lại | 5 đến 8 người ngoài đội thử; hoàn thành vòng chơi và không nhận thưởng trùng |
| 5 và 6 | Hoàn chỉnh túi đồ, linh thú, tiến triển, nhiệm vụ; dựng ba khu vực đầu | Nạp lại dữ liệu đúng; chuyển khu vực không tạo hai quyền ghi |
| 7 và 8 | Bộ 8 linh thú, tổ đội 4 người, boss đầu và nguyên tắc chia thưởng | Có ít nhất 3 cách phối hợp hữu ích; quyền nhận thưởng nhóm rõ ràng |
| 9 và 10 | Đủ trần nội dung beta, boss thứ hai, chế tạo; tu luyện ngoại tuyến nếu còn ngân sách | Chơi trọn hành trình đầu và kiểm tra mọi nguồn tạo, tiêu tài nguyên |
| 11 và 12 | HUD điện thoại, minimap, hướng dẫn, chat khu vực, chặn và báo cáo; khóa nội dung mới | Người mới chơi được không cần người phát triển hướng dẫn trực tiếp |
| 13 và 14 | Alpha khoảng 20 đến 30 người, bot tải, sửa lỗi, cân bằng, khôi phục thử | Không còn lỗi mất hoặc nhân đôi dữ liệu nghiêm trọng; đạt ngưỡng vận hành |
| 15 và 16 | Closed beta mời 50 đến 100 người, hỗ trợ, đo funnel và quay lại | Có báo cáo hành vi, sự cố, chi phí và quyết định phạm vi tiếp theo |

Số người được mời khác với số đang chơi đồng thời. Mục tiêu kiểm thử ban đầu là 100 CCU phân bố trên ít nhất năm room, tối đa 20 người mỗi room; phải đo bằng bot có hành vi và thử trên thiết bị thật. Đây không phải cam kết sức chứa của một máy chủ hay của framework.

Designer và artist làm việc song song từ tuần 1. Phụ thuộc chính là giao thức và nội dung chuẩn trước khi nhiều module cùng tích hợp; cơ chế lưu giao dịch trước khi mở rộng thưởng, chế tạo và tổ đội. Mỗi hai tuần bàn giao một build chạy được, cùng vấn đề còn lại và số đo.

Nếu cuối tuần 4 trận đánh chưa hấp dẫn, ưu tiên sửa điều khiển, tín hiệu ra đòn và tương tác kỹ năng. Thứ tự cắt khi trễ là tu luyện ngoại tuyến, nhiệm vụ lặp, độ phức tạp chế tạo và nội dung vượt tối thiểu. Giữ vòng chơi, độ ổn định dữ liệu và khả năng chơi trên điện thoại.

## 10 Tiêu chí kiểm thử và điều kiện mở beta

Các ngưỡng sau là mục tiêu nội bộ cần xác nhận bằng thử nghiệm, không phải benchmark ngành hoặc kết quả đã đạt.

| Nhóm | Mục tiêu và cách đo |
| --- | --- |
| Điều khiển | Ít nhất 30 FPS ổn định trên mẫu điện thoại sàn được chọn; hướng đến 60 FPS |
| Server | Với tick 50 ms, thời gian xử lý tick p95 dưới 25 ms trong bài tải mục tiêu; ghi cả p99 |
| Tải | Bot 20 người và 40 quái hoạt động mỗi room; tăng dần tới 100 CCU và chạy bền 60 phút |
| Mạng | Đo RTT 50, 150, 300 ms; thử ngắt 2, 10, 45 giây; ghi lỗi nối lại và lệch vị trí |
| Dữ liệu | Không tạo thêm tài sản khi retry, gửi đồng thời, đổi tab, chuyển khu vực hoặc crash trong các kịch bản bắt buộc |
| Riêng tư | Client A không đọc tồn kho, credential hoặc dữ liệu quản trị của B từ state hay API |
| Tải nội dung | Đo gói nén vùng đầu theo ngân sách 8 MB; xác nhận cache không gây lệch phiên bản |
| Người mới | Mục tiêu 70% hoàn thành lượt đầu; 50% tự bắt đầu lượt thứ hai |
| Giữ chân | Theo dõi D1 và D7; mục tiêu thăm dò lần lượt 30% và 10%, báo cả tử số và mẫu đủ thời gian |

D1 là người chơi mới có phiên chơi vào ngày lịch tiếp theo, D7 là có phiên vào ngày thứ bảy, tính theo múi giờ Asia/Ho_Chi_Minh. Loại tài khoản nội bộ và bot khỏi cohort; dùng accountId để tránh đếm lại sau liên kết guest. Với 50 đến 100 người mời, số liệu chỉ là tín hiệu định hướng và cần đối chiếu phỏng vấn.

Telemetry tối thiểu gồm game_loaded, character_created, tutorial_step, quest_completed, first_reward, loadout_changed, run_started, run_finished, reconnect_result và session_end khi gửi được. Hoàn thành nhiệm vụ và nhận thưởng lấy sự kiện server làm nguồn chính. Dashboard phải xem được tỷ lệ bỏ cuộc theo bước, lỗi mạng và thời gian đến phần thưởng đầu.

Năm câu hỏi thử nghiệm: người chơi đang định làm gì; vì sao chọn bộ linh thú đó; họ hiểu nguyên nhân thua không; đoạn nào gây khó hiểu; lượt tiếp theo họ muốn đạt gì. Quan sát hành động trước khi giải thích cho người thử.

## 11 Hạ tầng và vận hành

Staging và production tách cấu hình, dữ liệu và quyền truy cập. CDN phục vụ asset có hash; máy chủ lâu sống phục vụ API và WebSocket; PostgreSQL giữ dữ liệu bền vững. Một dịch vụ chỉ phục vụ trang tĩnh chưa đáp ứng phần game server. Chọn region dựa trên RTT đo từ người thử ở Việt Nam.

Theo dõi lỗi client, tick p95/p99, event loop lag, độ trễ DB, số room, CCU, reconnect và lưu lượng mạng. Log giao dịch dùng correlationId; không ghi token vào log. Quản trị beta cần tra cứu nhân vật, xem giao dịch, khóa chat và ghi đầy đủ lý do can thiệp; không phát triển CMS lớn ngay từ đầu.

Trước beta phải có backup, một lần phục hồi thử có ghi kết quả, quy trình dừng nhận room mới, kết thúc hoặc drain room hiện tại, checkpoint và rollback bản build. Đặt ngưỡng phục hồi dự kiến RPO 15 phút và RTO 2 giờ chỉ sau khi đối chiếu tính năng backup thực tế. Các ngưỡng này nói về sự cố hệ thống lưu trữ lớn; tính bền vững của giao dịch đã commit khi app process chết được kiểm thử riêng.

## 12 Nhân lực và mô hình ngân sách

| Vai trò | Phân bổ | Trách nhiệm chính |
| --- | --- | --- |
| Lập trình viên client game | 1 người | Phaser, input, camera, animation, netcode client |
| Lập trình viên backend | 1 người | Room, combat, dữ liệu bền vững và kinh tế |
| Lập trình viên UI và tích hợp | 1 người | React, nội dung, telemetry, auth, hỗ trợ công cụ và triển khai |
| Họa sĩ 2D | 1 người | Nhân vật, tile, UI, icon và hiệu ứng |
| Thiết kế game | 0,5 người | Vòng chơi, nhiệm vụ, balance và playtest |
| QA | 0,5 người | Thiết bị, hồi quy, mạng và hỗ trợ tổ chức thử nghiệm |

Tổng là 5 nhân sự quy đổi toàn thời gian, tương đương 80 người tuần trong 16 tuần. Dành khoảng 20% năng lực lịch cho tích hợp, sửa lỗi và phản hồi; phạm vi tính năng phải vừa khoảng 64 người tuần còn lại. Phần dự phòng năng lực này đã nằm trong lịch, không cộng lại thành 20% chi phí nhân công bổ sung.

Công thức ngân sách là 16 nhân với tổng chi phí tuần của 3 lập trình viên, 1 họa sĩ, nửa nhân sự thiết kế và nửa QA; cộng hạ tầng, tài nguyên, công cụ và dự phòng tiền. Dùng chi phí toàn phần thực tế của đội, gồm các khoản người vận hành phải gánh, không chỉ lương nhận về.

Ví dụ để thay số: nếu chi phí toàn phần bình quân là 8 triệu đồng mỗi người tuần, nhân công 80 người tuần là 640 triệu đồng. Nếu tự đặt thêm 40 triệu cho hạ tầng, công cụ và tài nguyên, tổng trước dự phòng là 680 triệu. Dự phòng tiền 15% là 102 triệu, tổng mô hình 782 triệu đồng. Đây là phép tính giả định, không phải báo giá nhân sự hoặc nhà cung cấp. Chưa bao gồm marketing, mua người dùng, vận hành sau beta và đợt phát hành ứng dụng mobile.

Nếu chỉ có một lập trình viên, phải lập lại phạm vi: ưu tiên một bản đồ, ba linh thú và vòng PvE nhỏ trước. Không dùng lịch 16 tuần của đội 5 FTE làm lịch tương đương cho một cá nhân, dù có AI hỗ trợ.

## 13 Rủi ro và thứ tự xử lý

| Rủi ro | Hành động giảm rủi ro | Chủ trì |
| --- | --- | --- |
| Game có nhiều chức năng nhưng vòng chơi yếu | Thử với 5 đến 8 người cuối tuần 4; điều chỉnh trước khi thêm nội dung | Thiết kế game |
| Art và animation vượt năng lực | Một bộ khung, ít ngoại trang; linh thú qua icon và hiệu ứng; chuẩn atlas từ đầu | Họa sĩ và client |
| Nhân đôi hoặc mất tài sản | Transaction, khóa nghiệp vụ, idempotency, thử crash trước và sau commit | Backend |
| Hai room cùng điều khiển nhân vật | Quyền sở hữu nguyên tử, epoch và kiểm thử chuyển khu vực | Backend |
| Room nóng, băng thông tăng | Giới hạn room, dữ liệu quan sát cần thiết, đo bot có hành vi | Backend và client |
| Điện thoại giật hoặc mất phiên khi chuyển app | Thử thiết bị thật từ tuần 1; theo dõi resume, input và bộ nhớ | Client và QA |
| Nội dung thay đổi làm lệch client server | contentVersion, protocolVersion, kiểm tra schema và quy trình cập nhật | Tích hợp |

## 14 Bước tiếp theo sau khi chốt kế hoạch

Chốt ba thông tin trước khi giao lịch thực hiện: nền tảng ưu tiên, số người có thể làm toàn thời gian và mức ngân sách. Sau đó khóa mục tiêu bốn tuần đầu, chọn thiết bị sàn và giao một người chịu trách nhiệm mỗi module. Dùng kế hoạch vertical slice đi kèm để triển khai theo nhiệm vụ nhỏ, kiểm thử hành vi và review tại điểm giao tiếp giữa module.

Bản mobile sau beta cần kiểm chứng trên Android/iOS thật, xử lý xoay màn hình, safe area, bàn phím, âm thanh, lưu phiên và background/resume. Thanh toán và quy trình đưa lên cửa hàng là hạng mục có ngân sách và tiêu chí riêng; việc đóng gói bằng Capacitor không tự hoàn tất chúng.

## 15 Tài liệu tham khảo

Các nguồn được tra cứu ngày 23 tháng 10 năm 2026. Những chỉ tiêu phạm vi, tiến độ, chi phí và tải trong kế hoạch là đề xuất thiết kế của dự án.

1. Cổ Tiên Lộ, mô tả công khai: https://www.cotienlo.com/
2. Phaser 4.2.1, bản phát hành chính thức: https://phaser.io/download/release/v4.2.1
3. React, danh sách phiên bản: https://react.dev/versions
4. Phaser, project templates: https://docs.phaser.io/phaser/getting-started/project-templates
5. Colyseus, state synchronization: https://docs.colyseus.io/state
6. Colyseus, rooms và patchRate: https://docs.colyseus.io/room
7. Colyseus, scalability: https://docs.colyseus.io/scalability
8. Capacitor, giới thiệu: https://capacitorjs.com/docs
9. MDN, điều kiện cài đặt PWA: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
10. Colyseus, UniqueSessionPlugin và race window: https://docs.colyseus.io/room/plugins/unique-session
11. Colyseus, room authentication: https://docs.colyseus.io/auth/room
12. PostgreSQL, transactions: https://www.postgresql.org/docs/current/tutorial-transactions.html
