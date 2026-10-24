# Cổ Tiên Lộ đối chiếu yêu cầu và bộ luật phát triển

Ngày lập mốc kiểm kê: 24/10/2026. Tài liệu đối chiếu yêu cầu mới với mã nguồn, chuẩn hóa luật và đặt tiêu chí nghiệm thu cho các phần bổ sung. Mô hình **nhiều người chơi trong cùng thế giới máy chủ** đã được người dùng lựa chọn. Bản luyện tập 2D và hành trình Ngũ Vực hiện có hai tiến trình riêng; đăng nhập không tự biến dữ liệu luyện tập thành tài sản hợp lệ của thế giới chung.

Trạng thái trong phần A là **mốc trước đợt sửa và bổ sung hiện tại**, không phải tuyên bố mọi chức năng đã hoàn thiện sau đợt này. Từng phần triển khai phải được kiểm thử rồi cập nhật bằng chứng ở phần G. Thiết kế được ghi bên dưới không đồng nghĩa đã có trong sản phẩm.

## A Tổng quan thiết kế và hiện trạng

### A1 Nhãn nguồn và phạm vi

| Nhãn | Ý nghĩa |
|---|---|
| **[TL] Theo tài liệu** | Luật được người dùng cung cấp trong tệp yêu cầu; dùng làm đầu vào thiết kế, chưa mặc nhiên là trích dẫn nguyên tác đã xác minh |
| **[GAME] Người dùng yêu cầu** | Quy tắc riêng của game: xuất hiện và tái sinh ngẫu nhiên, chết mất đồ, hướng đến thập chuyển, các hệ số thời gian ×30/×20/×10/×1 |
| **[ĐX] Đề xuất** | Cách mô phỏng, công thức, dữ liệu và cân bằng được đề xuất để có thể triển khai; chỉ trở thành luật đang chạy khi đã thực hiện và nghiệm thu |
| **[CK] Cần kiểm chứng** | Chi tiết cần tra chương, xác nhận ngữ cảnh hoặc giải quyết mâu thuẫn trước khi dùng làm luật nền |
| **Đang chạy** | Có luồng thực thi trong mã nguồn hiện tại; phạm vi và giới hạn được nêu trong ma trận |

Phạm vi nội dung theo yêu cầu: từ đầu truyện đến hết đại chiến núi Nghĩa Thiên lần thứ nhất, gồm sự xuất hiện và sử dụng Chí Tôn Tiên Thai. Các năng lực được giải thích ở giai đoạn truyện sau không tự trở thành luật ở mốc này. Tài liệu này không khẳng định đã đọc hay xác minh toàn bộ phạm vi truyện đó. Trang [Cổ Chân Nhân do người dùng cung cấp](https://truyendich.space/doc-truyen/co-chan-nhan) là đầu mối cần đối chiếu khi bổ sung tư liệu; chưa dùng tên chương chưa kiểm tra làm bằng chứng.

Các nội dung của dự án cũ được lưu ở [thiết kế thế giới chung](co-tien-lo-thiet-ke-the-gioi-chung.md) và [báo cáo kiểm thử trước đợt này](shared-world-test-report.md). Những kết quả cũ là bằng chứng lịch sử, không thay cho kiểm thử lại phần vừa thay đổi.

### A2 Trải nghiệm và vòng lặp

[ĐX] Người chơi thu thập thông tin, xây dựng nguồn sống cho bộ Cổ, chuẩn bị năng lượng và chọn mục tiêu phù hợp. Chiến thắng có thể là vượt truyền thừa, đoạt vật phẩm, bảo vệ nghi thức, giành quyền điều khiển hoặc rút lui an toàn. Tu vi tạo nền tảng; quyền điều khiển Cổ, khả năng phối hợp, khắc chế, địa hình, thương tích và thông tin quyết định việc phát huy nền tảng đó.

Vòng lặp hướng tới sản phẩm đầy đủ:

1. Xác thực Gmail, vào đúng tài khoản và nhận hoặc tiếp tục một cuộc đời.
2. Khai khiếu, xây dựng bộ Cổ, tìm việc và nguồn thức ăn; học ở tổ chức hoặc tự tìm đường.
3. Khảo sát tuyến đường, giao dịch, luyện Cổ, luyện tập và thử nghiệm kỹ năng.
4. Cam kết mục tiêu có rủi ro: chiến đấu, truyền thừa, thăng tiên hoặc tai kiếp.
5. Chuyển kết quả thành tài sản, hiểu biết, quyền tiếp cận và biến đổi của thế giới.
6. Khi chết, kết thúc cuộc đời và chuyển quyền tài sản theo luật; tài khoản giữ lịch sử và tri thức hợp lệ. Cuộc đời mới không kế thừa tự động sức mạnh của thân thể cũ.

### A3 Phân biệt ba lớp hiện có

| Lớp | Có thể thực hiện | Không được suy ra từ lớp này |
|---|---|---|
| Luyện tập 2D trên thiết bị | Di chuyển, né đòn, đánh quái, dùng vài Cổ, thu nhặt, nhiệm vụ, hợp luyện, lưu cục bộ và nhiều đời | Không phải chiến đấu mạng; chỉ số và đồ cục bộ không có thẩm quyền tạo tài sản máy chủ |
| Hành trình Ngũ Vực trên máy chủ | Bản đồ chiến lược nối tuyến, sinh kế, kỹ nghệ, 12 truyền thừa, 4 bài học, chết và tái sinh, di vật, một Tiên Cổ duy nhất | Chưa phải toàn bộ 30 bản đồ di chuyển tự do; chưa có đầy đủ tu luyện, tiên khiếu, chợ, bang hội hay PvP thời gian thực |
| Wiki trong ứng dụng | Tra cứu nhiều loại Cổ, phối phương, sát chiêu, thú và thông tin | Có tên hoặc mô tả không đồng nghĩa đối tượng có cá thể, công thức, AI hay hành vi đang chạy |

### A4 Ma trận đối chiếu tại mốc ban đầu

Trong cột trạng thái, “một phần” luôn chỉ rõ phần nào thực thi. Đường dẫn là bằng chứng mã nguồn, không phải xác nhận tính chính xác nguyên tác của nội dung.

| Nhóm yêu cầu | Luyện tập 2D | Thế giới chung | Kết luận và bằng chứng |
|---|---|---|---|
| Đăng ký Gmail, OTP thật, đăng nhập, lưu tiến trình | Có `AuthClient`, `AuthModal` và điểm gọi từ đối thoại; cần hoàn thiện luồng khôi phục và gửi thư | Có khung `auth-store`/HTTP, chưa coi Gmail đã xác minh chỉ vì API trả OTP xem trước | **Một phần, ưu tiên đầu tiên.** [AuthClient](../cotienlo-game/src/systems/AuthClient.ts), [AuthModal](../cotienlo-game/src/ui/AuthModal.ts), [auth-store](../cotienlo-game/server/auth-store.mjs), [http-server](../cotienlo-game/server/http-server.mjs). Bộ gửi mặc định ở mốc kiểm kê chưa chứng minh thư đã đến hộp Gmail |
| Tài khoản, cuộc đời, thế giới độc lập | Có bản lưu cuộc đời và sổ tiền kiếp | Có tài khoản, đời sống, sự kiện, trạng thái truyền thừa và phiên máy chủ | **Đã có nền.** [StorageSystem](../cotienlo-game/src/systems/StorageSystem.ts), [SoulChronicle](../cotienlo-game/src/systems/SoulChronicle.ts), [world-store](../cotienlo-game/server/world-store.mjs). Cần liên kết định danh Gmail với đúng tiến trình; không nhập thẳng chỉ số tự khai vào thế giới chung |
| Tu vi và tiểu cảnh giới | Có bốn tiểu cảnh giới nhất chuyển, tới nhị chuyển sơ giai theo nhiệm vụ | Có số chuyển 1–6; cứ hai truyền thừa tăng một chuyển | **Một phần.** [Cultivator](../cotienlo-game/src/entities/Cultivator.ts), [DialogueModal](../cotienlo-game/src/ui/DialogueModal.ts), [WorldPanel](../cotienlo-game/src/world/WorldPanel.ts). Chưa đủ tiến trình 1–9 và thập chuyển mở rộng |
| Tư chất, khai khiếu và thành khiếu | Chưa có mô hình độc lập | Chưa có | **Thiếu.** Hợp đồng [WorldLife](../cotienlo-game/src/world/types.ts) không lưu tư chất, dung lượng nguyên hải hoặc thành khiếu |
| Lượng, phẩm chất và hồi phục chân nguyên | Có MP và `primevalLevel`; MP tự hồi, trần MP tăng theo cảnh giới | `energy` là thể lực 100, nghỉ hồi đầy | **Một phần khác mô hình yêu cầu.** Chưa mô phỏng đúng 44% không khiếu, Tửu Trùng và phẩm chất tách tu vi |
| Thập Tuyệt thể | Chủ yếu là nội dung tra cứu nếu có | Chưa có trạng thái/rủi ro | **Thiếu hành vi.** Không có tiến trình áp lực và biện pháp áp chế |
| Dùng Cổ và bộ Cổ | Có đao quang, giáp, tăng sức, hồi phục và vài Cổ nâng cấp | Nhận Hải Kính nhưng chưa có hành động kích hoạt công dụng | **Một phần.** [GuSystem](../cotienlo-game/src/systems/GuSystem.ts), [main](../cotienlo-game/src/main.ts), [Cultivator](../cotienlo-game/src/entities/Cultivator.ts). Chưa có kiểm tra quyền điều khiển từng cá thể |
| Dưỡng Cổ | Có đói và cho một số Cổ ăn bằng vật phẩm | Chưa có | **Một phần.** `GuDefinition` hiện gộp định nghĩa loài với mức đói; không phải đàn cá thể có chu kỳ riêng. Thức ăn Nguyệt Quang ở mã cũ khác đầu vào Nguyệt Lan trong yêu cầu mới |
| Luyện hóa và ý chí đối kháng | Có lời thoại/định danh Cổ sở hữu | Chưa có | **Thiếu quy trình riêng.** Nhặt Cổ chưa được tách khỏi kiểm soát Cổ |
| Hợp luyện và ba nhóm thất bại | Có hai công thức, tiền và xác suất | Chưa có lệnh luyện Cổ dùng chung | **Một phần.** [RefinementSystem](../cotienlo-game/src/systems/RefinementSystem.ts). Ở mốc kiểm kê chỉ trừ tiền, chưa có mô hình đầy đủ nguyên liệu/thao tác/nguồn thất bại; bảo toàn Cổ đầu vào chưa chứng minh đó là luật bổn mạng |
| Bổn mạng Cổ và Đệ Nhị Không Khiếu | Có dữ liệu Wiki | Chưa có thực thể vận hành | **Wiki khác tính năng.** [wikiData](../cotienlo-game/src/data/wikiData.ts), [WikiModal](../cotienlo-game/src/ui/WikiModal.ts) |
| Tiên Cổ duy nhất trong thế giới | Cờ `hasImmortalGu` và hiệu ứng không phải sổ cái mạng | Có đúng một Hải Kính [sáng tạo], giữ chỗ độc quyền, chuyển qua di vật | **Đã có lõi duy nhất cho một loại.** [world-store](../cotienlo-game/server/world-store.mjs), [world-store.test](../cotienlo-game/server/world-store.test.mjs). Chưa có luyện lại, đổi chủ trực tiếp, cho mượn hay hủy bằng hành động |
| Quyền sở hữu và quyền sử dụng Cổ | Chưa tách theo cá thể | Sổ cái có chủ giữ nhưng chưa có cấp quyền/thu hồi | **Thiếu.** Kiểu [immortals](../cotienlo-game/src/world/types.ts) chưa có danh sách người được phép dùng |
| Chiến đấu và khắc chế | Có va chạm, đòn đánh, quái và đòn báo trước, phòng thủ, né, hồi phục | Chưa có chiến đấu mạng | **Một phần.** [Monster](../cotienlo-game/src/entities/Monster.ts), [Projectile](../cotienlo-game/src/entities/Projectile.ts), [Map](../cotienlo-game/src/engine/Map.ts). Chưa có bộ máy sát chiêu và địa hình/đạo ngân đầy đủ |
| Sát chiêu, đạo phái, kiêm tu | Có mô tả Wiki; vài hiệu ứng chỉ số/đồ họa | Có sáu kỹ nghệ 0–5 hỗ trợ lựa chọn truyền thừa | **Chưa tương đương cảnh giới đạo phái hoặc đạo ngân.** Chưa có hạch tâm/phụ thuộc, trình tự và phản phệ |
| Nô đạo và đàn thú | Có vài loài quái độc lập | Chưa có đàn và chỉ huy | **Thiếu.** Quái có tên cấp cao không chứng minh mô phỏng hồn lực, thủ lĩnh hoặc thú ký sinh |
| Thăng tiên, tam khí, thất bại đồng hóa | Chưa có | Đạt 6 chuyển qua tổng truyền thừa | **Thiếu quy trình.** Số chuyển hiện tại không phải bằng chứng đã triển khai thăng tiên |
| Tiên khiếu, phúc địa, động thiên | Có tên/nội dung tra cứu | Một số địa danh/truyền thừa nhắc phúc địa | **Thiếu không gian và kinh tế vận hành.** Chưa có môi trường, chủ quyền, đặt khiếu hoặc địa linh |
| Hai hệ thời gian, sinh thái và tuổi | Thời gian sống dùng thống kê cuộc đời | Một ngày thế giới bằng sáu giờ thực; có hạn thử luyện | **Thiếu thời gian nội khiếu.** Đồng hồ thử luyện không phải lịch tai kiếp |
| Tai kiếp và tiến trình 6–9 chuyển | Có hiệu ứng/cách gọi trong mã cũ nếu xuất hiện | Chưa có lịch tai kiếp | **Thiếu mô phỏng theo yêu cầu.** Không có sổ 30 địa tai + 3 thiên kiếp/300 năm |
| Ngũ Vực và giới bích | Có một bản đồ luyện tập | Có 5 vực, 30 địa điểm, tuyến đường; vượt vực thêm phí | **Địa lý đã có, giới bích mới một phần.** Chưa có rung chuyển tiên khiếu và thiệt hại sản nghiệp |
| Gia tộc, môn phái, thành viên và nghĩa vụ | NPC/nhiệm vụ gia tộc theo kịch bản | Chưa có thực thể tổ chức | **Thiếu hệ thống.** Tên gia tộc trong đối thoại không tạo quyền tài nguyên hoặc danh sách thành viên |
| Nguyên thạch, tiên nguyên thạch, chân nguyên, tiên nguyên riêng | Có tiền và MP | Có tiền, lương thực và thể lực | **Một phần.** Chưa có bốn tài khoản tài nguyên độc lập và chuyển hóa có điều kiện |
| Giao dịch và Bảo Hoàng Thiên | Tra cứu/nội dung nền | Chưa có chợ hoặc trao đổi giữa người chơi | **Thiếu.** Không có niêm yết, ký quỹ, quyết toán và chuyển quyền nguyên tử |
| Chết, mất đồ, nhiều đời | Có tử vong lưu ngay, sổ tiền kiếp, xuất thân mới; bia mộ giữ 60% thạch theo luật mẫu cũ | Đồ kiếm được và Tiên Cổ sang di vật; trợ cấp đầu đời không rơi; sức mạnh đặt lại | **Đã có nền nhưng hai luật khác nhau.** [Remains](../cotienlo-game/src/entities/Remains.ts), [RebirthModal](../cotienlo-game/src/ui/RebirthModal.ts), [world-store](../cotienlo-game/server/world-store.mjs). Cần chuẩn hóa luật mục tiêu và giữ bản lưu lịch sử |
| Thân thể, hồn phách, ký ức, đồ gửi ngoài và khiếu sau chết | Có thống kê/lịch sử | Có lịch sử tài khoản và đời hiện tại | **Thiếu phân rã đầy đủ.** Chưa có tài sản gửi, linh hồn độc lập, di sản tiên khiếu hoặc tài sản chung |
| Sinh và tái sinh ngẫu nhiên | Vị trí/xuất thân được định sẵn hoặc chọn | Đời đầu luôn điểm đầu; tái sinh chọn một trong năm xuất thân cố định | **Chưa đạt yêu cầu ngẫu nhiên mới** |
| Tiên cương, đổi hồn, Xuân Thu Thiền | Có thể có mô tả Wiki | Chưa có luồng riêng | **Thiếu; không dùng để giải thích mặc định tái sinh game** |
| Chiến trường nhiều mục tiêu theo Nghĩa Thiên | Nhiệm vụ săn/thu thập/hợp luyện | Khảo nghiệm có lựa chọn, thời hạn và tử vong | **Một phần nền nhiệm vụ, thiếu chiến trường tương tác và quyền điều khiển trận/Ốc** |

### A5 Kiểm tra và lỗi cụ thể ở mốc kiểm kê

Đã chạy lại riêng `node --test server/world-store.test.mjs`: **23 kiểm thử qua**. Kết quả này xác nhận bộ kiểm thử đang có, không xác nhận các hệ thống đang thiếu. Các bộ kiểm thử 2D, xác thực, trình duyệt và Android cần được chạy ở bước tích hợp của đợt này.

Một lỗi đã tái hiện bằng hành động công khai trong máy chủ chỉ dùng bộ nhớ: người A để lại 12 lương thực kiếm được; người B đang mang đủ 20 lương thực nhặt di vật. B vẫn có 20 nhưng di vật bị xóa, làm tổng 32 giảm còn 20. Nguyên nhân ở nhánh `loot` trong `server/world-store.mjs`: chặn trần mang theo rồi xóa toàn bộ di vật. **Tiêu chí sửa:** chỉ chuyển phần có thể nhận; lương dư còn ở di vật, tiền/Cổ chỉ chuyển một lần, thử lại cùng lệnh không chuyển lặp. Trạng thái này là mốc trước sửa; chỉ đổi thành “đã sửa” sau khi có bằng chứng mới.

## B Bộ luật vận hành được chuẩn hóa

Các mục dưới đây là đặc tả mục tiêu. Luật [TL]/[GAME] phải giữ; phương thức thực hiện và thông số [ĐX] cần được triển khai theo từng phần. Không gán các mục chưa làm thành tính năng đang chạy.

### B1 Xác thực Gmail và khôi phục tiến trình

[GAME] Đăng ký bằng Gmail, gửi OTP để chứng minh người đăng ký đang kiểm soát hộp thư. Xác thực hộp thư làm giảm đăng ký tùy tiện, không bảo đảm một người chỉ có một tài khoản hoặc ngăn mọi tài khoản rác.

[ĐX] Đầu vào gồm địa chỉ Gmail chuẩn hóa, đạo hiệu, mục đích đăng ký/đăng nhập, mã yêu cầu và OTP. Máy chủ kiểm tra địa chỉ, giới hạn số yêu cầu theo địa chỉ/IP, sinh mã khó đoán, chỉ lưu mã đã băm cùng hạn và số lần thử, rồi chuyển qua bộ gửi thư thật. Mã một lần gắn đúng mục đích, chỉ dùng được một lần và vô hiệu sau khi xác thực. Gửi lại thay mã cũ theo cùng giao dịch; lỗi gửi thư không được báo thành “đã gửi thành công”.

[ĐX] Các giới hạn OTP, thời hạn phiên và thời gian chờ là cấu hình cân bằng vận hành, không là luật truyện. Môi trường chạy thật không trả mã trong JSON, giao diện, log hoặc thông báo lỗi. Bộ gửi giả chỉ dành cho kiểm thử được bật tường minh. Không có cấu hình gửi thật thì giao diện nói rõ chưa thể gửi; không tự tạo tài khoản “đã xác minh”. Nếu dùng mật khẩu, chỉ lưu hàm băm có salt; đổi mật khẩu phải chứng minh lại quyền hộp thư.

[ĐX] Mỗi Gmail liên kết một `AccountId`. Danh sách đời sống và quyền chơi do máy chủ quản lý. Đăng nhập thiết bị khác khôi phục đúng đời đang hoạt động, kể cả đời đã chết hoặc khảo nghiệm chưa hết hạn. Tải bản lưu cục bộ lên tài khoản chỉ tạo bản sao lưu luyện tập có phiên bản; không trao tiền, Cổ hoặc tu vi cho thế giới chung. Xung đột bản lưu phải giữ bản cũ và báo lựa chọn khôi phục, không âm thầm ghi đè tiến trình mới hơn.

### B2 Nhân vật và nguồn gốc sức mạnh

[TL] Lưu độc lập tu vi, tư chất, Cổ, cảnh giới từng đạo phái, thân thể, hồn phách, kinh nghiệm và trạng thái. Chiến lực là kết quả khi các thành phần phối hợp trong hoàn cảnh cụ thể. Cùng một chuyển không bảo đảm cùng sức chiến đấu.

[ĐX] Chỉ số tổng hợp nếu có chỉ giúp tham khảo. Mọi hành động kiểm tra điều kiện thực: nguồn năng lượng, quyền điều khiển, phạm vi, trạng thái hạch tâm, thương tích, thời gian chuẩn bị và địa hình. Không dùng một điểm chiến lực để tự động giải quyết mọi cuộc giao tranh, trinh sát hoặc đào thoát.

### B3 Khai khiếu và tư chất

[TL] Khai khiếu hình thành không khiếu và nguyên hải. Hi Vọng Cổ gắn với đại điển Cổ Nguyệt trong tài liệu. [CK] Các phương pháp khác cần có nguồn trước khi đưa thành luật nền của tổ chức khác.

[ĐX] Điều kiện của đại điển gồm thân thể còn sống, chưa có khiếu tương ứng, đủ điều kiện tuyển nhận của nơi tổ chức và có phương tiện khai khiếu. Tuổi tham dự, lệ phí, vật tư và tiêu chuẩn nhận người là cấu hình của từng đại điển, chưa chốt một độ tuổi dùng chung cho cả thế giới. Xuất thân ảnh hưởng cơ hội tiếp cận và học bổng; không thay thế kiểm tra tư chất.

[TL] Dung lượng nguyên hải tối đa lấy toàn không khiếu bằng 100%:

| Tư chất | Dung lượng |
|---|---|
| Đinh | 20% đến dưới 40% |
| Bính | 40% đến dưới 60% |
| Ất | 60% đến dưới 80% |
| Giáp | 80% đến dưới 100% |
| Thập Tuyệt | 100%, kèm tiến trình đặc biệt |

[ĐX] Kết quả khai khiếu tạo `ApertureId`, lưu dung lượng chính xác và kết quả tư chất được máy chủ quyết định. Phân phối xác suất, trường hợp dưới 20% và phương pháp cải thiện tư chất phải được thiết kế riêng; không tự gán xác suất bằng nhau hay biến tư chất thấp thành khóa cấp vĩnh viễn. Khai khiếu thất bại không bị coi là tử vong trừ khi nghi thức đó đã khai báo rủi ro tương ứng.

### B4 Tu vi và năng lượng

[TL] Nhất, nhị, tam, tứ, ngũ chuyển lần lượt dùng chân nguyên thanh đồng, xích thiết, bạch ngân, hoàng kim, tử tinh. Lục, thất, bát, cửu chuyển lần lượt dùng tiên nguyên thanh đề, hồng táo, bạch lệ, hoàng hạnh. Bốn tiểu cảnh giới sơ/trung/cao/đỉnh phong áp dụng cho phàm nhân 1–5; không tự sao chép cho Cổ Tiên.

[ĐX] Một lần tu luyện kiểm tra nhân vật còn sống, địa điểm cho phép, khiếu không ở trạng thái khóa, thời gian rảnh, năng lượng/vật tư và phương pháp. Tu luyện tiêu hao tài nguyên theo phương pháp và tích lũy tiến độ hoặc cải thiện thành khiếu. Đột phá kiểm tra riêng các điều kiện đã công bố; thiếu điều kiện thì không trừ vật tư. Xác suất, tổn thương khi thất bại và khả năng rút lui phải nằm trong định nghĩa từng nghi thức, không lấy cùng một tỷ lệ cho mọi chuyển.

[TL] Lượng chân nguyên và phẩm chất phải tách khỏi tu vi. [ĐX] Dùng số nguyên theo đơn vị 1/100 điểm phần trăm không khiếu. 100% là 10.000 đơn vị; 44% là 4.400. Chi phí 10 điểm phần trăm là 1.000, không phải 10% của 4.400. Khi nghỉ, lượng tăng tới dung lượng tối đa theo tốc độ đã lưu và điều kiện môi trường; tăng trần tu vi không tự tạo chân nguyên miễn phí.

[TL] Tửu Trùng có thể nâng phẩm chất chân nguyên hơn một tiểu cảnh giới mà không đổi tu vi. [ĐX] Thao tác này chuyển một lượng chân nguyên đầu vào thành lượng đã tinh luyện, tiêu hao theo đúng phương pháp và không làm tăng dung lượng khiếu. Xá Lợi Cổ tăng tiến độ/tiểu cảnh giới trong giới hạn loại Cổ; không tự vượt kiểm tra đại cảnh giới.

### B5 Thập Tuyệt thể

[TL] Có nguyên hải 100%, tiềm năng và hồi phục lớn, đi kèm áp lực khiếu, chết yểu/tự bạo và nhu cầu áp chế. [ĐX] Lưu trạng thái ổn định, áp lực hiện tại, tốc độ tích lũy, ngưỡng cảnh báo/nguy hiểm và biện pháp đang áp dụng. Mọi ngưỡng số là tham số thiết kế chưa chốt.

[ĐX] Áp lực tích lũy theo thời gian và hoạt động; khiếu càng tổn thương thì biên an toàn càng nhỏ. Phương pháp áp chế trừ đúng tài nguyên, có hạn và tác dụng phụ; không cho nút “ngủ” chung vô hiệu hóa nguy cơ vĩnh viễn. Giao diện báo tình trạng, thời gian ước lượng và hậu quả trước quyết định. Chạm ngưỡng tử vong tạo sự kiện chết một lần theo B17.

### B6 Bốn hoạt động với Cổ

| Hoạt động | Điều kiện và đầu vào | Chi phí, kết quả, thất bại |
|---|---|---|
| Luyện hóa [TL] | Có cá thể Cổ, quyền tiếp cận và phương pháp; xét ý chí chống đối | [ĐX] Tiêu hao thời gian/năng lượng, tiến độ kiểm soát. Thành công tạo quyền điều khiển, không tự đổi chủ sở hữu nếu là đồ mượn. Có thể thất bại/gián đoạn theo phương pháp |
| Luyện chế/hợp luyện/thăng luyện [TL] | Cổ phương, cá thể đầu vào, vật liệu, kỹ thuật, nơi luyện và điều kiện cần | [ĐX] Khóa đúng đầu vào, thực hiện các bước; tiêu hao và bảo toàn ghi theo công thức. Kết quả tạo/cập nhật cá thể; phân loại thất bại theo B8 |
| Dưỡng Cổ [TL] | Cổ còn sống, thức ăn đúng, lượng và môi trường phù hợp | [ĐX] Trừ thức ăn, dời mốc thiếu đói theo loài. Thiếu kéo dài làm suy yếu, thương tổn hoặc chết; chỉ loài có phương pháp mới được ngủ/tự phong |
| Dụng Cổ [TL] | Có quyền dùng, kiểm soát, đúng năng lượng, trạng thái và điều kiện kích hoạt | [ĐX] Kiểm tra toàn bộ rồi mới trừ chi phí. Áp dụng hiệu ứng, hồi chiêu và hao mòn; Cổ dùng một lần chuyển đúng trạng thái đã khai báo |

[TL] Mỗi loài có thức ăn riêng, trong đầu vào mới Nguyệt Quang Cổ ăn cánh Nguyệt Lan. [ĐX] Khi sửa bản luyện tập, phải đổi đồng bộ mô tả, vật phẩm thu thập, UI cho ăn và kiểm thử; tránh đổi một nhãn nhưng vẫn tiêu hao vật liệu cũ. Dữ liệu loài không lưu mức đói cá thể. Cổ hai người hoặc hai con cùng loài có tiến trình đói riêng.

[ĐX] Tính dưỡng Cổ theo thời gian ở vị trí thực tế: Cổ trong tiên khiếu chịu thời gian và sinh thái nội khiếu; Cổ mang ngoài chịu thời gian ngoài. Kho chứa không tự dừng đói. Thức ăn không đủ có thể khiến bộ Cổ mạnh trở thành gánh nặng kinh tế.

### B7 Bổn mạng Cổ và quyền điều khiển

[TL] Bổn mạng Cổ gắn với một không khiếu cụ thể, có liên kết đặc biệt với chủ; bị hủy có thể gây phản phệ. Trường hợp hợp luyện thất bại được bảo toàn phải nêu rõ trong phương pháp; không suy rộng thành miễn hủy diệt. Đệ Nhị Không Khiếu có liên kết bổn mạng riêng.

[ĐX] Đổi bổn mạng yêu cầu nghi thức, tài nguyên, thời gian và xử lý phản phệ; không cho đổi tự do trong lúc bị đánh hoặc đang luyện. Cổ bị tiêu hủy, bị cướp hay rời vị trí không phải cùng một sự kiện: chỉ hiệu ứng đúng loại mới kích hoạt phản phệ tương ứng.

[TL] Chủ sở hữu, người được phép sử dụng, người đã luyện hóa và người đang cầm là bốn quan hệ khác nhau. [ĐX] Khoản cho mượn chỉ cấp những hành vi được ghi trong thỏa thuận, có hạn và khả năng thu hồi. Thu hồi hiệu lực máy chủ trước lần kích hoạt tiếp theo; sát chiêu đang chuẩn bị được kiểm tra lại khi hoàn tất. Người mượn không được bán, phá hủy, cho người khác mượn hoặc dùng làm đầu vào luyện nếu chưa được cấp quyền rõ ràng. Việc thu hồi quyền không tự dịch chuyển Cổ về túi chủ.

[TL] Dùng Cổ vượt chuyển phải xét năng lượng, quyền điều khiển và mức phát huy. [ĐX] Không mặc định “thấp hơn chuyển Cổ thì cấm trang bị”; nếu một chế độ cần khóa cấp, phải khai báo đó là luật chế độ.

### B8 Luyện Cổ và Tiên Cổ duy nhất

[TL] Phàm Cổ có nhiều cá thể; mỗi **loại** Tiên Cổ chỉ có một cá thể đang tồn tại trong một thế giới tại một thời điểm, xuyên suốt mọi chuyển. Đổi chuyển không đổi khóa loại. Mất chủ, cho mượn, để trong chợ hay nằm trong di vật không giải phóng tính duy nhất.

[ĐX] Tạo, thăng luyện, giao dịch và tử vong cùng cập nhật một sổ cái có khóa `(WorldId, GuTypeId)`. Tiên Cổ đang luyện có chỗ giữ độc quyền; chỉ một giao dịch thắng. Các loại đã tồn tại không được tạo lại cho đến khi sự kiện hủy hợp lệ xác nhận chúng thực sự không còn. Luyện lại tạo `InstanceId` mới, giữ lịch sử cá thể cũ và tốn lại điều kiện/cost; không hồi sinh cá thể đã hủy bằng thao tác tải trang.

| Nhóm thất bại | Kiểm tra | Cách xử lý mục tiêu [ĐX] |
|---|---|---|
| Mục tiêu Tiên Cổ đã tồn tại [TL] | Sổ duy nhất và chỗ giữ trước mẻ luyện; kiểm tra lại ở thời điểm quyết toán | Từ chối trước khi trừ nếu đã biết xung đột; nếu phát sinh tranh chấp trong mẻ, áp dụng chi phí cam kết đã công bố; không cấp bản sao |
| Kỹ thuật/điều kiện [TL] | Thứ tự thao tác, loại nguyên liệu, chất lượng, năng lượng, môi trường, quấy nhiễu | Tác động lên phần tiến trình, vật tư và cá thể được công thức chỉ rõ; có nguyên nhân đọc được |
| Tự nhiên [TL] | Đã đạt điều kiện và kỹ thuật nhưng vẫn còn rủi ro công thức | Bốc thăm một lần trên máy chủ; lưu kết quả để thử lại lệnh không bốc lại. Hỗ trợ giảm đúng phần rủi ro tự nhiên |

[TL] Thành công đạo ngân hoặc trợ lực không tự sửa mọi lỗi và không phá tính duy nhất. [ĐX] Mỗi công thức khai báo rõ vật tư tiêu trước/tiêu sau, Cổ bị hủy/chuyển trạng thái, bổn mạng được bảo toàn trong trường hợp nào và chi phí khi bị gián đoạn. Không dùng một thông báo chung “bảo toàn bổn mạng” khi hệ thống chưa biết con nào là bổn mạng.

### B9 Bộ Cổ, sát chiêu và giao chiến

[TL] Một bộ Cổ cần các vai trò tấn công, phòng thủ, di chuyển, trinh sát, chữa trị, duy trì năng lượng và hỗ trợ. Bộ có hạch tâm phải lưu các hiệu ứng phụ thuộc vào hạch tâm đó. Mất hạch tâm vô hiệu đúng các nhánh phụ thuộc; Cổ độc lập vẫn vận hành nếu đủ điều kiện.

[ĐX] Mỗi sát chiêu là một quy trình có phiên bản: danh sách hạch tâm/phụ, trình tự kích hoạt, thời gian chuẩn bị, mục tiêu/phạm vi, tổng chi phí theo từng mốc, tải điều khiển, điều kiện thành công, cách gián đoạn, phản phệ và biện pháp khắc chế. Khi bắt đầu kiểm tra quyền và giữ tài nguyên cần thiết; khi đến mỗi mốc kiểm tra lại tình trạng Cổ, người thi triển và mục tiêu. Ngắt trước/sau mốc cam kết có cách hoàn trả khác nhau đã hiển thị từ trước.

[ĐX] Giao tranh sử dụng vị trí, tầm nhìn, chướng ngại, thời tiết, hướng và tốc độ, cảnh báo đòn, thương tích, trạng thái và lựa chọn phối hợp. Đòn trúng chỉ xảy ra khi hình học/phạm vi và điều kiện đều đúng. Không cho chỉ số tổng hợp ghi đè việc mục tiêu ở sau vật cản, người đánh đang choáng hoặc Cổ hạch tâm đã bị hủy. Các hệ số sát thương, giáp và khắc chế đều là cân bằng game, không tuyên bố là công thức truyện.

### B10 Đạo phái, đạo ngân và nô đạo

[TL] Cảnh giới đạo phái phản ánh hiểu biết/vận dụng/sáng tạo, tách khỏi số đạo ngân. Đạo ngân cùng đạo thường hỗ trợ; khác đạo có thể xung đột. Các đạo trong phạm vi đầu vào gồm lực, nô, luyện, hồn, trí, huyết, vận, trụ, vũ và loại khác có nguồn phù hợp.

[ĐX] Mỗi hiệu ứng ghi đạo liên quan, lượng cộng hưởng và yêu cầu tương thích; xung đột tính theo cặp đạo/cơ chế cụ thể. Phương pháp kiêm tu khai báo chi phí duy trì và giới hạn; không dùng một hệ số phạt cố định cho mọi cặp đạo. Giai đoạn đầu ưu tiên mở một bộ hoàn chỉnh có công thức, thức ăn, phản chế và cách kiếm được; đề xuất lực đạo và một nhánh dụng Cổ chiến đấu đã có nền, không nhận là đã có toàn bộ các đạo chỉ vì Wiki có tên.

[TL] Bách thú vương, thiên thú vương và vạn thú vương là các tầng thủ lĩnh phàm nhân; hoang thú, thượng cổ hoang thú và thái cổ hoang thú được đối chiếu tương quan lục/thất/bát chuyển, không là bảo đảm thắng thua. [ĐX] Đàn thú lưu thủ lĩnh, thành viên, thức ăn, sinh sản, Cổ ký sinh và các lệnh đang thực hiện. Điều khiển thủ lĩnh có thể gián tiếp điều khiển đàn nếu loài/tình trạng cho phép; tải hồn lực tăng với số mục tiêu, độ phức tạp và khoảng cách. Quá tải gây trễ lệnh/mất kiểm soát theo mức đã công bố, không tạo vô hạn thú miễn phí.

### B11 Thăng tiên

[TL] Quy trình thông thường là **toái khiếu → nạp khí → phóng Cổ**. Nhân khí gắn với tích lũy thân thể, hồn phách, hiểu biết và kinh nghiệm; thiên khí/địa khí phải cân bằng với khả năng đó. Quá tải có thể thiên địa đồng hóa và chết.

[ĐX] Điều kiện bắt đầu gồm ngũ chuyển đỉnh phong, khiếu có thể thực hiện nghi thức, phương pháp hợp lệ, địa điểm, tài nguyên dự trữ, kế hoạch bảo vệ và xác nhận nguy cơ. Đây là cách khóa tiến trình game được đề xuất; yêu cầu chính xác từng phương pháp phải đối chiếu thêm trước khi hoàn thiện nội dung. Giao diện cho xem nguồn khí, điều kiện môi trường, tài nguyên cần và các mốc không thể quay lại.

[ĐX] Giai đoạn toái khiếu giải phóng cấu trúc cũ; nạp khí tạo bài toán tiếp nhận/điều chỉnh theo giới hạn nhân khí; phóng Cổ dùng cá thể/phương pháp đã cam kết để hình thành khiếu. Không quy ba loại khí thành một thanh kinh nghiệm. Bị quấy nhiễu hoặc sai cân bằng có thể gây tổn thương, mất mẻ hoặc tử vong tùy giai đoạn, có nhật ký nguyên nhân.

[TL] Thành công tạo tu vi lục chuyển và tiên khiếu tương ứng, **không bảo đảm được Tiên Cổ và không tự tăng thọ nguyên**. [ĐX] Sự kiện lên tiên không gọi hàm cấp Tiên Cổ mặc định, không cộng tuổi thọ mặc định; nếu nghi thức có cơ hội luyện Cổ thì chạy giao dịch duy nhất riêng. Thọ Cổ/phương pháp kéo dài tuổi thọ là hành động độc lập.

### B12 Tiên khiếu và sinh thái

[TL] Lục/thất chuyển thường có phúc địa, bát/cửu có động thiên. Nhận chủ một phúc địa thừa kế không tự biến phàm nhân thành Cổ Tiên. Phẩm cấp ban đầu hạ/trung/thượng/đặc đẳng phải tách khỏi quy mô hiện tại, thời gian, đạo ngân và sản lượng. Đặc đẳng gắn với trường hợp Thập Tuyệt thăng tiên thành công theo đầu vào.

[ĐX] Tiên khiếu là không gian có chủ, cổng, trạng thái đặt/thu, môi trường, sinh vật, tài nguyên và sức chịu tải. Mỗi cơ sở sản xuất đòi hỏi điều kiện đất/nước/khí hậu/thức ăn/nhân lực, tiêu hao vật liệu và bị hạn chế bởi sinh thái. Thời gian nhanh tăng cả sản lượng lẫn tiêu hao; thiếu nước không thể chỉ nhân thời gian để sinh ra sản lượng đầy đủ. Sản nghiệp bị tai kiếp phá hủy phải giảm năng suất và có chi phí sửa.

[TL] Không mặc định lục chuyển có địa linh trợ lý. Địa linh gắn với tàn ý/hồn và chấp niệm sau chết kết hợp sức mạnh phúc địa. [ĐX] Khi có đủ điều kiện mới tạo địa linh, ghi yêu cầu nhận chủ, quyền hạn và giới hạn; không cấp quyền vô hạn cho bất cứ ai bấm “nhận”. Tự vào khiếu thông thường phải đặt khiếu; nhân vật bên trong không mang cổng di động tùy ý trừ phương pháp đặc thù được định nghĩa.

### B13 Hai hệ thời gian và tuổi

[TL] Mỗi tiên khiếu có thời gian nội bộ riêng; hệ ngoài là mốc chung. Khi tỷ lệ không đổi, nội thời gian tăng bằng ngoại thời gian nhân tỷ lệ. Khi tỷ lệ đổi, tích lũy theo từng đoạn, không nhân lại toàn bộ lịch sử bằng tỷ lệ mới.

[ĐX] Bộ bốn hệ số ×1/×10/×20/×30 được gán thử cho hạ/trung/thượng/đặc đẳng để tạo đường thử nghiệm cân bằng. Đây là **phương án**, chưa là quyết định người dùng đã chọn và không là bảng nguyên tác. Nhân vật có phương pháp đổi tốc độ phải trả tài nguyên, vượt thời gian chờ và chịu giới hạn theo phương pháp. Trước đổi phải quyết toán đoạn cũ; sau đổi mới bắt đầu đoạn mới. Không reset các mốc tai kiếp đã tích lũy.

[TL] Các ví dụ ×16, ×33 và ×12 trong đầu vào là những trường hợp riêng theo ngữ cảnh, không đủ chứng minh một ánh xạ cứng theo phẩm cấp. [CK] Cần đối chiếu chương và điều kiện hoạt động trước khi dùng những giá trị đó cho địa danh/nhân vật nguyên tác cụ thể.

[ĐX] Tuổi thân thể tăng theo thời gian tại nơi thân thể đang hiện diện. Đứng ngoài thì theo đồng hồ ngoài; vào khiếu thì theo đồng hồ khiếu cho đúng đoạn ở trong đó. Khiếu thuộc người khác vẫn ảnh hưởng tuổi nếu thân thể đang ở trong; sở hữu một khiếu chạy nhanh không tự làm người đứng ngoài già nhanh. Khi thay tốc độ, vào/ra hoặc chết đều chốt đoạn trước đó. Thọ nguyên là hạn riêng, không phải số tài nguyên khiếu.

[ĐX] Chậm/dừng thời gian làm chậm/dừng đồng thời sinh trưởng, tiêu hao và sản xuất gắn nội thời gian, trong giới hạn phương pháp. Nếu phải trả phí theo thời gian ngoài thì phí vẫn chạy khi nội thời gian dừng. Chốt rõ cách tính khi máy chủ tắt; đề xuất mô phỏng các đoạn thời gian máy chủ có lịch sử đáng tin cậy, có giới hạn xử lý bù và nhật ký quản trị, không để chỉnh đồng hồ thiết bị trốn kiếp hoặc nhân sản lượng.

### B14 Tai kiếp và đột phá Cổ Tiên

[TL] Lịch tính bằng năm **nội khiếu**, theo bảng đầu vào:

| Chuyển | Các chu kỳ cùng tồn tại |
|---|---|
| 6 | Địa tai mỗi 10 năm; thiên kiếp mỗi 100 năm |
| 7 | Địa tai mỗi 10 năm; thiên kiếp mỗi 50 năm; hạo kiếp mỗi 100 năm |
| 8 | Thiên kiếp mỗi 10 năm; hạo kiếp mỗi 50 năm; vạn kiếp mỗi 100 năm |

[ĐX] Mỗi lần tới hạn tạo **từng sự kiện theo chu kỳ riêng**, có khóa chống lặp. Năm 100 của lục chuyển có một địa tai và một thiên kiếp trong cùng đợt; năm 200 và 300 cũng vậy. Gộp thành một màn chiến đấu chỉ là cách trình bày, sổ lịch vẫn đếm cả hai. Tới năm 300 có 30 địa tai và 3 thiên kiếp. Đây là phương án tổ chức sự kiện trùng mốc để giữ nhất quán đầu vào; [CK] cần đối chiếu cách mô tả nguyên tác trước khi dùng cho nội dung mô phỏng chính xác.

[ĐX] Mỗi kiếp khai báo mục tiêu, các khu vực bị ảnh hưởng, các làn sự kiện, điều kiện kết thúc, thiệt hại người/tài sản, phần đạo ngân và giới hạn can thiệp. Khi sắp tới mốc có thời gian chuẩn bị đã công bố. Mất kết nối không thắng tự động; sự kiện chạy theo luật máy chủ và chính sách chế độ. Phương pháp trì hoãn sửa mốc tương lai hoặc trạng thái lịch có nguyên nhân, không xóa lịch đã vượt hay sinh lợi ích lặp.

[ĐX] Thăng chuyển kiểm tra lịch đã vượt, tích lũy đạo ngân, năng lượng, ổn định khiếu, tài nguyên và nghi thức tương ứng. Thất lên bát cần chuẩn bị khó hơn lục lên thất bằng yêu cầu định nghĩa riêng; chưa có đủ số liệu để chốt hệ số “khó gấp N lần”. Cửu chuyển vẫn có trạng thái, nguồn năng lượng và điều kiện kích hoạt. [CK] Ba vạn kiếp không được coi là toàn bộ điều kiện thành Tôn. Thập chuyển là nội dung game riêng, tách khỏi nhãn nguyên tác.

### B15 Địa lý và tổ chức

[TL] Năm vực là Nam Cương, Bắc Nguyên, Đông Hải, Tây Mạc, Trung Châu. Giới bích là trở ngại; Cổ Tiên vượt có thể khiến tiên khiếu chấn động và tổn thất bên trong. [ĐX] Tuyến vượt vực khai báo chi phí vận chuyển, thời gian, nguy cơ, phương pháp giảm thiệt hại và tài nguyên có thể mang. Khảo sát/phương tiện làm giảm một phần rủi ro, không miễn mọi tác động.

[TL] Gia tộc thiên về huyết thống; môn phái thiên về tuyển nhận, sư đồ. [ĐX] Thành viên lưu quan hệ, địa vị, quyền tiếp cận, trợ cấp, đóng góp, nghĩa vụ, địa bàn và hình thức kỷ luật. Gia nhập kiểm tra điều kiện tuyển nhận, nguyện vọng và lịch sử; quyền nhận vật tư gắn đúng ngân quỹ và hạn, không có trợ cấp vô hạn khi gia nhập/rời lặp. Thân mới sau tái sinh không tự có huyết thống/vị trí cũ; danh tiếng tài khoản không thay thế chứng minh thân phận trong thế giới.

[ĐX] Tổ chức có thể mở đào tạo và truyền thừa, cử người bảo vệ, giao nhiệm vụ hoặc yêu cầu tài nguyên. Rời tổ chức thu hồi quyền tương lai nhưng không âm thầm xóa đồ đã được tặng hợp pháp; vật cho mượn xử lý đúng quyền sở hữu. Tài sản chung không trở thành đồ của người giữ chức khi người đó chết.

### B16 Kinh tế và giao dịch

[TL] Tách nguyên thạch, tiên nguyên thạch, chân nguyên và tiên nguyên cá nhân. [ĐX] Mỗi chuyển hóa là một công thức có đầu vào, đầu ra, tổn hao, thời gian và điều kiện; không dùng một tỷ lệ chung. Tiên nguyên mang dấu chủ thể; giao dịch tiền tệ không tự cấp quyền dùng tiên nguyên người khác. Ngoại lệ Cổ Ốc phải có cơ chế chuyển/góp năng lượng cụ thể.

[ĐX] Chợ giao dịch cá thể Cổ, vật liệu, quyền truy cập cổ phương hoặc tài nguyên đã được phép. Niêm yết khóa đúng tài sản tại nơi ký quỹ, chỉ chủ/quyền hợp lệ mới được rao. Mua kiểm tra số dư, hàng còn, quyền chuyển nhượng, vị trí và phí; quyết toán tiền, hàng, quyền và trạng thái duy nhất trong một giao dịch. Hủy/đã bán/đã chết phải có kết quả duy nhất khi đua lệnh. Không chấp nhận cùng một Cổ vừa ở túi, vừa bán, vừa làm đầu vào luyện.

[TL] Giá trị phụ thuộc thông tin, bí phương, cung cầu, sản xuất và dưỡng Cổ. Bảo quang chỉ hỗ trợ đánh giá; không bảo đảm hàng hoàn toàn an toàn. [ĐX] Mỗi món hiển thị thông tin đã xác minh, thuộc tính người bán công bố và điều kiện kiểm định. Giấu thông tin trong lối chơi phải có luật xử lý tranh chấp đã công bố; không dùng lỗi API hoặc mất tiền/hàng để giả lập “rủi ro thị trường”.

### B17 Sinh tử và tái sinh

[GAME] Chết kết thúc đời hiện tại và mất toàn bộ **đồ thuộc đời đó theo bảng dưới**; nhân vật mới xuất hiện ngẫu nhiên. Đây là cơ chế game, không mặc định dùng Xuân Thu Thiền.

[ĐX] Tái sinh tạo `LifeId`, thân thể, tư chất, tuổi, tu vi và quan hệ xuất thân mới từ tập hợp hợp lệ. Địa điểm ngẫu nhiên phải có lối rời, sinh kế và cơ hội tiếp cận tu luyện; không sinh trong khảo nghiệm đang khóa, chướng ngại hoặc khu chắc chắn chết không có lựa chọn. Rút thăm trên máy chủ một lần và lưu cùng lệnh; tải lại/nhấn hai lần không đổi kết quả. Có thể giữ lựa chọn phong cách xuất thân nhưng vị trí vẫn phải rút từ tập điểm hợp lệ của xuất thân ấy; đây là phương án dung hòa cần ghi rõ khi triển khai.

| Thành phần | Xử lý mục tiêu khi chết [ĐX] |
|---|---|
| Thân thể, tuổi, tu vi, nguyên hải, năng lượng, thương tích | Đóng hồ sơ thân cũ; không chuyển chỉ số sang thân mới |
| Hồn phách | Có hồ sơ/trạng thái riêng; nếu chưa có phương pháp bảo tồn thì không cho phép hành động như người sống. Tái sinh game không ngụ ý đoạt xá |
| Ký ức và nhật ký tài khoản | Giữ kiến thức mở khóa hợp lệ và lịch sử; không giữ lượng chân nguyên, kỹ năng thân thể hoặc tu vi dưới tên “ký ức” |
| Đồ và Cổ đang mang, thuộc sở hữu đời cũ | Mất quyền sở hữu đời cũ; chuyển một lần sang di vật/địa điểm hợp lệ hoặc bị hủy do chính nguyên nhân tử vong. Mỗi trường hợp phải có sự kiện và trạng thái chính xác |
| Cổ mượn đang mang | Thu hồi quyền dùng của người chết; chủ pháp lý còn nguyên. Vị trí có thể thành di vật bị tranh đoạt; chủ không tự nhận Cổ về túi |
| Đồ riêng trong tiên khiếu hoặc gửi kho | Đời mới không tự rút được. Khóa thành di sản/di vật theo địa điểm và luật chiếm hữu; bản thân vật không tự biến mất chỉ vì mất quyền sở hữu |
| Tiên khiếu và sản nghiệp | Có thể tiếp tục tồn tại dưới dạng di sản; xét cổng, sinh thái, tai kiếp và điều kiện địa linh/nhận chủ. Không xóa để giải phóng Tiên Cổ đang ở trong |
| Hàng đang ký quỹ/chợ | Giữ tài sản trong giao dịch, khóa quyết toán theo trạng thái; tiền thu được sau chết thuộc di sản, không tự gửi cho đời mới |
| Tài sản chung của tổ chức | Giữ sở hữu tổ chức; chấm dứt quyền theo chức vụ của đời đã chết |
| Trợ cấp đầu đời chưa kiếm được | Không sinh lợi có thể nhặt qua vòng chết/tái sinh; theo dõi nguồn riêng. Giữ nguyên giá trị lịch sử khi nâng cấp bản lưu cũ, chỉ áp dụng truy vết mới từ mốc có dữ liệu |

[ĐX] “Mất sạch đồ” là mất tài sản của đời cũ, không đồng nghĩa hủy mọi vật khỏi thế giới và không thu tài sản thuộc người khác. Mọi khả năng lấy lại di sản bằng nhân vật mới phải diễn ra qua đúng luật tìm kiếm/tranh đoạt, không qua nối `AccountId` để cấp lại miễn phí. Bia mộ giữ 60% tiền ở bản luyện tập cũ là luật mẫu cần ghi riêng; không suy ra đó là nguyên tắc tử vong của máy chủ.

[TL] Xuân Thu Thiền không bảo đảm trùng sinh thành công. Đổi hồn/đoạt xá không tự chuyển tu vi, Cổ và tài sản. Tiên cương có lợi thế và đánh đổi ở thân thể, hồn phách, tử khiếu, tạo tiên nguyên và nguồn lực phục sinh. [ĐX] Chỉ mở các hệ này khi có mô hình riêng và dữ liệu được xác minh; chúng không là nút hoàn tác tử vong chung.

### B18 Truyền thừa và chiến trường nhiều mục tiêu

[ĐX] Giữ cấu trúc truyền thừa đang có: nguồn gốc, manh mối, yêu cầu, mốc cam kết, thành công, thất bại, phần thưởng và hệ quả. Lựa chọn có rủi ro chí mạng phải nói rõ trước cam kết, có dữ liệu nguyên nhân và không được tải lại để bốc lại kết quả. Kiến thức có thể giữ qua đời nhưng đồ/cá thể nhận được vẫn theo luật sở hữu.

[TL] Các lớp mục tiêu được yêu cầu từ Nghĩa Thiên gồm chiến cuộc phàm nhân có thế lực sau lưng, chiến ý/quyền điều khiển Kinh Hồng Loạn Đấu Đài, ảnh hưởng trận/Cổ Ốc, đại cục luyện Cổ và tranh đoạt thành quả bằng thông tin/thời cơ. [ĐX] Tạo nhiệm vụ dạng đồ thị mục tiêu, điều kiện chiến trường và quyền điều khiển thay đổi được. Các kết quả riêng gồm đoạt mục tiêu, giữ nghi thức đủ lâu, phá nút trận, thu tin hoặc thoát khỏi khu vực. Trận khóa dịch chuyển phải thực sự chặn hành động dịch chuyển theo thuộc tính, không chỉ có lời thoại.

[ĐX] Đoạt đồ rồi rút lui thành công ghi chiến thắng mục tiêu; không tự tăng một chỉ số để khẳng định thắng đối thủ trong giao chiến trực diện. NPC và sự kiện đặc biệt dùng Chí Tôn Tiên Thai chỉ triển khai theo dữ kiện thuộc phạm vi đã xác minh; không mở các thuộc tính về sau bằng suy diễn.

## C Quy tắc game và giả định cần quản lý

### C1 Điều đã được người dùng xác định

- [GAME] Thế giới chung nhiều người trên cùng máy chủ; không hỏi lại mô hình đơn/nhiều người.
- [GAME] Đăng ký Gmail có OTP, lưu và khôi phục tiến trình; làm từng phần, kiểm thử xong mới chuyển phần tiếp.
- [GAME] Sinh/tái sinh ngẫu nhiên, mất đồ khi chết, giữ ranh giới đồ và quyền sở hữu, hướng tới thập chuyển như nội dung mở rộng.
- [GAME] Lục chuyển trở lên có thế giới riêng với điều kiện hình thành, tài nguyên và tai kiếp; các hệ số ×30/×20/×10/×1 dùng để thiết kế, chưa có ánh xạ phẩm cấp được người dùng chốt.
- [TL] Giữ toàn bộ phân biệt về chuyển/năng lượng/tư chất/đạo phái, bốn hoạt động Cổ, tam khí, hai đồng hồ, chu kỳ tai kiếp và phạm vi truyện đã nêu.

### C2 Phương án được đề xuất trong đặc tả

| Phương án [ĐX] | Lý do và giới hạn |
|---|---|
| Số nguyên 10.000 đơn vị cho 100% không khiếu | Tránh nhầm mẫu số và sai số làm tròn; số lượng tiên nguyên là đơn vị riêng |
| Mỗi đời có `LifeId`, mỗi vật có `InstanceId`, quyền tách khỏi nơi giữ | Không nhầm tài khoản với thân thể, loài với cá thể, đồ mượn với đồ sở hữu |
| Thử ánh xạ hạ/trung/thượng/đặc đẳng lần lượt ×1/×10/×20/×30 | Phương án thử nghiệm, không ghi thành quyết định người dùng hoặc quy luật nguyên tác |
| Mốc tai kiếp trùng có nhiều bản ghi trong một đợt | Bảo toàn tổng 30 địa tai + 3 thiên kiếp/300 năm; cần đối chiếu cách kể cụ thể |
| Tập sinh ngẫu nhiên có đường thoát và nguồn sống tối thiểu | Giữ ngẫu nhiên mà không sinh vào trạng thái không thể chơi |
| Đồ riêng gửi ngoài thành di sản, đồ chung giữ chủ chung | Làm rõ “mất sạch đồ” của một đời mà không hủy tài sản ngoài quyền sở hữu |
| Rút thăm có kết quả ghi máy chủ và lệnh chống lặp | Thử lại mạng không bốc lại OTP/kết quả luyện/spawn/phần thưởng |

Mọi xác suất luyện, phân phối tư chất, tốc độ dưỡng, sát thương, phí giao dịch, lợi tức sinh thái, tuổi khởi đầu, thời hạn OTP và mốc cảnh báo chưa nêu số đều chưa được chốt cân bằng. Khi thêm số phải đưa vào cấu hình có phiên bản và ghi bài kiểm tra, không giấu số ở nhiều màn hình.

### C3 Các điểm cần kiểm chứng trước khi làm nội dung nguyên tác

| Nội dung [CK] | Cách xử lý trước khi đủ bằng chứng |
|---|---|
| Chương và ngữ cảnh của ví dụ ×16/×33/×12, cách đặt khiếu và phương pháp đổi thời gian | Giữ là đầu vào có chú thích; không nhân rộng thành quy tắc cho mọi khiếu |
| Mốc tuổi đại điển, phương pháp khai khiếu ngoài Cổ Nguyệt, trường hợp tư chất dưới 20% | Dùng cấu hình game được ghi rõ; không gán cùng chuẩn cho mọi gia tộc |
| Các đơn vị diện tích/quy mô cụ thể của phẩm cấp khiếu | Dùng ô sinh thái hoặc đơn vị thiết kế, không tự nhận số km² là nguyên tác |
| Ngoại lệ bảo toàn bổn mạng, ngủ/tự phong, dùng tiên nguyên người khác và các Cổ Ốc | Chỉ cho phương pháp cụ thể đã có dữ kiện, không tạo ngoại lệ chung |
| Điều kiện đầy đủ thăng 7–8–9, thành Tôn và ba vạn kiếp | Giữ phần chưa rõ là cổng nội dung, không tuyên bố đủ đặc tả |
| Khả năng Chí Tôn Tiên Thai được giải thích sau mốc truyện | Không bật trong luật nền tới khi phân loại lại phạm vi |
| Chương cụ thể cho cảnh Nghĩa Thiên, đổi hồn, địa linh và tiên cương | Lập mục nguồn khi thực sự đối chiếu; không mượn mô tả Wiki làm trích dẫn chương |

## D Mô hình dữ liệu và các ràng buộc

### D1 Các thực thể mục tiêu

Các bảng dưới là mô hình phát triển, không mô tả toàn bộ lược đồ đã tồn tại.

| Thực thể | Trường chính và quan hệ |
|---|---|
| Tài khoản | `AccountId`, email đã xác minh, phiên, nhật ký, kiến thức mở, lịch sử đời, `activeLifeId`; không chứa tu vi thay cho thân thể |
| Thử thách OTP | `ChallengeId`, email chuẩn hóa, mục đích, băm mã, mốc hết hạn, số lần thử, trạng thái gửi/đã dùng; tách khỏi dữ liệu công khai |
| Nhân vật cuộc đời | `LifeId`, tài khoản, tên, xuất thân, `bodyId`, `soulId`, tuổi/thọ nguyên, chuyển, tiểu cảnh giới nếu là phàm nhân, tư chất, đạo phái, thương tích, vị trí, sống/chết |
| Thân thể | Loại thân, HP, thể lực, cấu trúc/tổn thương, tuổi tại mốc, vị trí hiện diện; thân mới không dùng nguyên đối tượng đã chết |
| Hồn phách | Chủ thể, cường độ/tổn thương, khả năng tải điều khiển, nơi trú, ký ức có thể truy cập; tách khỏi sổ kiến thức tài khoản |
| Không khiếu | `ApertureId`, chủ thể thân, vị trí trong thân, dung lượng `capacityBps`, các phần chân nguyên theo phẩm chất, tốc độ hồi phục, trạng thái thành, `vitalGuInstanceId` |
| Kho tiên nguyên | Chủ thể, loại theo chuyển, số lượng, điều kiện tạo/dùng; đơn vị khác chân nguyên và tiền tệ |
| Định nghĩa loài Cổ | `GuTypeId`, phàm/tiên, chuyển khả dụng, đạo, thức ăn/chu kỳ, điều kiện ngủ/tự phong, hiệu ứng, năng lượng/cost, tiêu hao một lần hay tái dùng |
| Cá thể Cổ | `GuInstanceId`, loại/chuyển, `ownerRef`, `locationRef`, người luyện hóa/mức kiểm soát, ý chí đối kháng, đói, sức khỏe, trạng thái, bổn mạng liên quan |
| Cấp quyền dùng | Cổ, người nhận, quyền được cấp, người cấp, thời hạn, đã thu hồi, phiên bản; không thay `ownerRef` |
| Cổ phương | Loài/cá thể đầu vào, vật liệu, các bước, kỹ thuật, môi trường, năng lượng, chi phí từng mốc, quy tắc bảo toàn, lỗi tự nhiên/kỹ thuật/duy nhất |
| Mẻ luyện | `RefinementId`, người làm, công thức và phiên bản, vật tư bị khóa, bước, kết quả ngẫu nhiên đã ghi, chỗ giữ Tiên Cổ, chi phí đã quyết toán |
| Bộ Cổ và sát chiêu | Danh sách cá thể vai trò, đồ thị hạch tâm/phụ, bước kích hoạt, chi phí, tải, điều kiện, mục tiêu, thời gian chuẩn bị, phản phệ/khắc chế |
| Đạo phái và đạo ngân | Mỗi đạo có cảnh giới hiểu biết, kinh nghiệm, số đạo ngân và phương pháp tương thích; không gộp thành một số |
| Tiên khiếu | Chủ quyền, nguồn hình thành/thừa kế, phẩm cấp ban đầu, quy mô hiện tại, môi trường, tỷ lệ và mốc thời gian, đạo ngân, cổng, đặt/thu, tổn thương, sản nghiệp |
| Sự kiện tai kiếp | Khiếu, thời đại tiến trình, loại, mốc nội thời gian, trạng thái chuẩn bị/đang diễn ra/đã vượt/thất bại, thiệt hại, phần thưởng, khóa chống lặp |
| Nguồn tài nguyên | Địa điểm/khiếu, loại, trữ lượng, điều kiện sinh thái, đầu vào, sản lượng, thời gian và sức chịu tải |
| Thú và đàn | Loài, cấp tương quan, HP/trạng thái, Cổ ký sinh, thủ lĩnh/thành viên, thức ăn, sinh sản, người điều khiển và tải hồn |
| Tổ chức và thành viên | Loại gia tộc/môn phái, quan hệ huyết thống/sư đồ, địa bàn, ngân quỹ, kho, quyền lợi/nghĩa vụ; tư cách thành viên gắn đời |
| Tiền và giao dịch | Ví nguyên thạch/tiên nguyên thạch tách riêng; niêm yết, ký quỹ, người mua/bán, tài sản, phí, trạng thái, giao dịch quyết toán |
| Di vật và di sản | Đời chết, nơi, tài sản/tiên khiếu liên quan, chủ/quyền truy cập hiện tại, nguồn gốc từng khoản, tình trạng đã chuyển/hủy |
| Thế giới | `WorldId`, địa điểm/tuyến/giới bích, tài nguyên, biến cố, trạng thái truyền thừa, sổ Tiên Cổ duy nhất, đồng hồ chung và phiên bản luật |
| Lệnh và sự kiện | `OperationId`, tài khoản/đời, hành động và dữ liệu băm, trạng thái/kết quả, mốc máy chủ, sự kiện phát sinh; phục vụ thử lại và truy nguyên |

### D2 Các ràng buộc phải bảo toàn

1. Một tài khoản tối đa một đời đang hoạt động trong cùng thế giới. Lệnh của đời cũ không tác động đời mới.
2. Mỗi vật chỉ có một vị trí hiện tại và một chủ pháp lý. Chủ/vị trí có thể tham chiếu người, tổ chức, ký quỹ, di vật hoặc di sản theo luật; quyền dùng là quan hệ riêng.
3. Không có hai cá thể Tiên Cổ đang tồn tại cùng `(WorldId, GuTypeId)`, kể cả chuyển khác nhau. Hủy phải là trạng thái được chứng minh bằng sự kiện; đổi người cầm không phải hủy.
4. Mỗi cá thể xuất hiện đúng một lần trong các tập chứa; không chấp nhận lặp ngay trong một túi hoặc một di vật. Sổ chủ, vị trí và danh sách chứa phải khớp nhau.
5. Chân nguyên không âm, tổng các phần phẩm chất không vượt dung lượng; tiền, vật tư và tiên nguyên không âm. Mỗi khoản có đúng đơn vị, không cộng tiền vào năng lượng mà bỏ qua chuyển hóa.
6. Phẩm chất chân nguyên thay đổi không tự đổi tu vi, tiểu cảnh giới, tư chất hoặc tuổi thọ. Thăng tiên không tự thêm Tiên Cổ/thọ nguyên.
7. Tiên khiếu có mốc tích lũy nội thời gian riêng; đổi tỷ lệ không hồi tố và không làm mất sự kiện đã tới hạn. Mỗi chu kỳ tai kiếp có khóa duy nhất.
8. Kiến thức tài khoản không cấp lại đồ hoặc quyền thân thể đã mất. Vật mượn và tài sản chung không bị đổi chủ chỉ vì người giữ chết.
9. Tái sinh, luyện, giao dịch, nhận thưởng và tử vong quyết toán một lần. Gửi lại cùng mã lệnh trả kết quả đã cam kết; đổi dữ liệu nhưng giữ mã bị từ chối.
10. Thiếu điều kiện bị từ chối trước khi chi. Lỗi lưu dữ liệu không công bố trạng thái thành công một phần; không ghi đè bản lưu cũ bằng bản rỗng khi đọc lỗi.

### D3 Ranh giới thẩm quyền và chuyển bản lưu

[ĐX] Máy chủ là nơi quyết định danh tính, thời gian, tài sản, tu vi và các kết quả có ảnh hưởng thế giới chung. Client gửi ý định, không gửi “tôi có thêm 100 thạch”. Lưu 2D gắn nhãn chế độ luyện tập, có phiên bản riêng và không được nhập sang sổ cái dùng chung.

[ĐX] Mỗi thay đổi lược đồ có hàm chuyển phiên bản, sao lưu và kiểm tra ràng buộc trước công bố. Không xóa bản lưu cũ để có bộ kiểm thử xanh. Khi thiếu dữ liệu nguồn gốc trợ cấp lịch sử, giữ nguyên tài sản lịch sử và bắt đầu truy vết từ đời mới, thay vì đoán rồi trừ đồ hợp pháp. Đổi luật tu vi từ “hai truyền thừa tăng một chuyển” sang mô hình mới cần ánh xạ có công bố và giữ nhật ký, không âm thầm hạ/cấp tu vi.

## E Công thức và mã giả cho các cơ chế trọng tâm

Mã dưới đây là mã giả [ĐX], chưa phải API đang chạy. Các đầu vào 44%, 10 điểm phần trăm và chu kỳ tai kiếp giữ theo [TL]. Hệ số hay thông số mới được ghi riêng là minh họa hoặc đề xuất, phải được cấu hình và kiểm thử khi triển khai.

### E1 Chi chân nguyên và hồi phục

```text
FULL_APERTURE = 10_000                         // 100% toàn không khiếu
capacityBps = 4_400                            // nguyên hải tối đa 44%
costBps = 1_000                                // 10 điểm phần trăm toàn khiếu

effectiveCost = ceil(costBps * qualityCostFactor(method, quality))
require(sum(essenceBuckets.amountBps) >= effectiveCost)
consumeFromEligibleQualityBuckets(effectiveCost, method)

recovered = rateBpsPerSecond * elapsedSeconds * environmentFactor
currentBps = min(capacityBps, currentBps + recovered)
```

Trong ví dụ bỏ qua hồi phục và hệ số phẩm chất bằng 1: `4.400 → 3.400 → 2.400 → 1.400 → 400`; dùng được bốn lần, còn 4 điểm phần trăm. Lần thứ năm bị từ chối, không âm và không trừ một phần. Lấy `4.400 × 10% = 440` làm chi phí sẽ là sai mẫu số.

[TL] Phẩm chất cao hơn có thể giảm thể tích cần. [ĐX] `qualityCostFactor` là bảng phương pháp có phiên bản, chưa chốt tỷ lệ. Ví dụ minh họa hệ số 0,8 cho một tác dụng sẽ làm chi phí 1.000 thành 800; đây không là thông số nguyên tác hoặc giá trị đã được chọn cho Tửu Trùng. Nâng phẩm chất chỉ đổi các phần chân nguyên đủ điều kiện; không gọi `advanceRealm()`.

### E2 Kiểm tra quyền dùng Cổ

```text
useGu(actor, instance, action, operationId):
  beginAtomic()
  return recordedResultIfSameOperation(operationId)
  require(actor.life.alive && instance.alive)
  require(instance.location permits actor to access it)
  require(actor owns instance OR activeGrantAllows(actor, instance, action))
  require(controlSatisfies(actor, instance.will, action))
  require(instance not reservedInTradeOrRefinement)
  require(energyTypeAndOwnerValid(actor, instance, action))
  require(activationConditions && cooldownReady && enoughEnergy)
  spendExactEnergy()
  applyEffectAndOneUseState()
  recordOperationAndCommit()
```

[ĐX] Kiểm tra lại quyền tại mốc thi triển thực sự của sát chiêu. Thu hồi tăng phiên bản quyền để lệnh đã chuẩn bị không dùng bản cấp quyền cũ. Nếu Cổ đã hủy, ở trong ký quỹ hoặc không thể tiếp cận, quyền sở hữu một mình chưa đủ để dùng.

### E3 Luyện Tiên Cổ đồng thời

```text
startRefinement(actor, recipe, operationId):
  beginAtomic()
  requireRecipeAndAllInputs()
  if recipe.outputIsImmortal:
    lock(WorldId, GuTypeId)                    // khóa loại, không khóa theo chuyển
    require(noExistingNonDestroyedInstance && noOtherActiveReservation)
    createReservationForThisRefinement()
  reserveInputsAndPublishCommittedCosts()
  recordOperationAndCommit()

finishRefinement(refinement):
  beginAtomic()
  verifyReservationAndRecheckTechniqueEnvironment()
  if technicalFailure: applyRecipeTechnicalFailure()
  else if recordedNaturalRollFails: applyRecipeNaturalFailure()
  else:
    verifyNoOtherNonDestroyedInstance()
    transformInputsAndCreateExactlyOneOutput()
  settleOnlyDeclaredInputsAndCosts()
  releaseOrTransferReservation()
  recordResultAndCommit()
```

Hai người bắt đầu gần như cùng lúc: giao dịch giữ chỗ đầu tiên thắng; người còn lại nhận trạng thái mục tiêu không khả dụng. Không để hai client bốc thăm rồi mới phát hiện có hai Tiên Cổ. Thăng luyện cá thể đang tồn tại giữ cùng tính duy nhất và ghi lịch sử chuyển; không tạo một loại giả mới chỉ để né khóa.

### E4 Thời gian nội khiếu và tuổi

```text
settleAperture(aperture, worldNow):
  safeNow = max(worldNow, aperture.lastWorldTime) // không lùi mốc khi đồng hồ lùi
  dt = safeNow - aperture.lastWorldTime
  internalDelta = multiplyWithRationalRemainder(dt, aperture.currentRatio)
  aperture.internalTime += internalDelta
  settleProductionConsumptionAndTribulationsInChronologicalOrder()
  aperture.lastWorldTime = safeNow

changeRatio(aperture, worldNow, newRatio):
  settleAperture(aperture, worldNow)            // chốt bằng tỷ lệ cũ
  checkAndSpendMethodCost()
  aperture.currentRatio = newRatio

settleBodyAge(body, until):
  for each presenceInterval since body.ageCheckpoint:
    body.age += elapsedTimeInThatLocation(interval)
```

Ví dụ dùng năm ngoài làm đơn vị: khiếu chạy ×10 trong 2 năm ngoài và ×20 trong 1 năm tiếp theo thì tăng `2×10 + 1×20 = 40` năm nội. Không lấy tổng 3 năm nhân tỷ lệ mới để ra 60. Chủ nhân đứng ngoài đủ 3 năm chỉ già thêm 3 năm; người ở trong khiếu suốt các đoạn ấy già thêm 40 năm theo phương án mô phỏng này.

[ĐX] Nếu một mốc tai kiếp nằm giữa đoạn dài, xử lý tới mốc đó trước, ghi tác động rồi mới tiếp tục sản xuất sau mốc. Không tính trọn sản lượng đoạn rồi mới phá tài sản, vì như vậy thu lợi từ cơ sở đã bị hủy giữa đoạn. Dùng số nguyên/phân số giữ phần dư để tránh drift sau nhiều lần cập nhật nhỏ.

### E5 Lịch tai kiếp trùng mốc

```text
cycles[6] = { earth:10, heaven:100 }
cycles[7] = { earth:10, heaven:50, grand:100 }
cycles[8] = { heaven:10, grand:50, myriad:100 }

for each (kind, periodYears) in cycles[rank]:
  first = floor(oldInternalAgeYears / periodYears) + 1
  last  = floor(newInternalAgeYears / periodYears)
  for ordinal from first through last:
    dueYear = ordinal * periodYears
    insertIfAbsent(apertureId, progressionEpoch, kind, ordinal, dueYear)
sortAllDueByTimeThenDeclaredEncounterOrder()
```

Với lục chuyển từ năm 0 đến 300: địa tai có `floor(300/10)=30`, thiên kiếp có `floor(300/100)=3`. Ba mốc 100/200/300 ghi cả hai, không dùng `if thiên kiếp else địa tai`. Thứ tự thể hiện các lớp trong một đợt là cấu hình [ĐX]; không thay đổi số lượng.

[ĐX] `progressionEpoch` lưu mốc chuyển hệ lịch khi tăng chuyển, kèm quy tắc nối lịch được công bố. Không reset tùy tiện tuổi nội khiếu để trốn kiếp. Trước mở 7–8 chuyển cần chốt rõ chu kỳ tính từ mốc nào, cách chuyển nghĩa vụ cũ và xử lý mốc đang diễn ra; các dữ kiện này chưa đủ để suy ra từ bảng chu kỳ.

### E6 Tử vong và tài sản nhiều nơi

```text
die(life, cause, operationId):
  beginAtomic()
  if life already dead: return recordedDeath
  settleAgesClocksAndPendingActionsToDeathTime()
  cancelOrSettleTrialsRefinementsAndEscrowByTheirCommitmentRules()
  for asset linked to life:
    if ownedByOtherPersonOrOrganization: revokeDeadLifeAccessOnly()
    else if asset carried: moveToRemainsOrDestroyByCauseExactlyOnce()
    else: moveOwnershipToEstateKeepPhysicalLocation()
  revokeAllGrantsWhoseGranteeIs(life)
  releaseOnlyUnfulfilledSingletonReservations()
  preserveExistingImmortalInstancesAndTheirExactCustody()
  archiveBodySoulAndLifeHistory()
  markLifeDeadAndCommit()

rebirth(account, operationId):
  require(previousLife.dead && noOtherActiveLife)
  chooseValidSpawnOnceOnServer()
  createNewBodyLifeAndAptitude()
  keepOnlyDeclaredAccountKnowledge()
  initializeNonTransferableStarterSupport()
  recordResultAndCommit()
```

Nhặt di vật phải bảo toàn phần chưa lấy: `receivedSupplies = min(remains.supplies, carryLimit - carried)`; tăng người nhận và giảm di vật cùng lượng. Chỉ xóa di vật khi không còn tiền, lương hay Cổ. Ví dụ mang 18/20 và di vật có 12 thì nhận 2, còn 10; nhặt khi 20/20 không làm mất 10 ấy. Không tự tái tạo đồ đã bị hủy khi người chơi quay lại nơi chết.

## F Tình huống kiểm tra tính nhất quán

Các tình huống dưới là tiêu chí mục tiêu, chưa phải tuyên bố đã có bài kiểm thử thực thi cho mọi mục.

| Số | Chuẩn bị và hành động | Kết quả bắt buộc |
|---|---|---|
| 1 | Nguyên hải đầy 44% toàn khiếu; dùng Cổ giá 10 điểm phần trăm/lần, không hồi phục | Dùng bốn lần còn 4%; lần năm thất bại không trừ. Không quy chi phí thành 4,4% |
| 2 | Tu vi sơ giai; Tửu Trùng tinh luyện một phần chân nguyên lên phẩm chất cao hơn | Tu vi và dung lượng giữ nguyên; các phần năng lượng đổi phẩm chất theo phương pháp, thể tích/cost được quyết toán; không tự tăng tiểu cảnh giới |
| 3 | Hai tài khoản ở cùng thế giới cùng luyện một loại Tiên Cổ, kể cả chọn hai chuyển khác nhau | Tối đa một chỗ giữ/cá thể tồn tại; bên còn lại nhận kết quả xung đột đúng giai đoạn. Thử lại không tạo cá thể hoặc bốc kết quả mới |
| 4 | A sở hữu, B đang mượn Cổ; A thu hồi lúc B chuẩn bị kích hoạt/sát chiêu | B không được kích hoạt sau thời điểm thu hồi. Chủ vẫn là A; nơi giữ chưa tự đổi. Hoàn trả/phản phệ của sát chiêu theo mốc đã cam kết |
| 5 | Ngũ chuyển đủ điều kiện thăng tiên, hoàn tất cân bằng khí nhưng không có Tiên Cổ thưởng | Thành lục chuyển với tiên khiếu, không tự cấp Tiên Cổ; thọ nguyên giữ nguyên. Thất bại cân bằng có hậu quả theo nghi thức |
| 6 | A sở hữu khiếu ×30 nhưng thân ở ngoài một năm ngoài; B ở trong cùng đoạn | Khiếu tăng 30 năm nội; A già một năm, B già 30 theo phương án tuổi. Sản xuất và đói đều dùng 30 năm với điều kiện sinh thái |
| 7 | Khiếu tăng từ năm nội 90, chạy ×10 nửa năm ngoài rồi ×20 nửa năm | Nội thời gian đến 105, vượt mốc 100 đúng một lần; ghi cả địa tai và thiên kiếp lục chuyển. Đổi tỷ lệ không đặt lịch lại hoặc bỏ mốc |
| 8 | Chết với Cổ riêng mang theo, Cổ mượn, đồ trong khiếu, đồ gửi, hàng niêm yết và đồ chung tổ chức | Chuyển từng quyền/vị trí đúng B17; không có bản sao Tiên Cổ; đời mới không tự sở hữu di sản. Chạy lại tử vong không chuyển đồ lần hai |
| 9 | Bộ Cổ mất hạch tâm hoặc sát chiêu bị ngắt trước/sau mốc cam kết | Các nhánh phụ thuộc mất công dụng; Cổ độc lập còn dùng được. Chi phí, phần hoàn trả và phản phệ đúng định nghĩa, không chỉ tắt hoạt ảnh |
| 10 | Người yếu hơn trực diện đoạt được mục tiêu rồi rút; trận chặn dịch chuyển đang hoạt động | Ghi thắng mục tiêu nếu thoát hợp lệ; không tự ghi thắng đấu tay đôi. Cổ dịch chuyển bị hạn chế thật theo trận; rút bằng tuyến khác có thể hợp lệ |

Các hồi quy bổ sung phải kiểm trước khi chuyển phần triển khai:

- Gmail: không cấu hình gửi thật không báo gửi thành công; sai/hết hạn/dùng lại OTP bị từ chối; thử nhiều lần/gửi dồn bị chặn; không trả OTP trong môi trường chạy thật; đăng nhập không ghi đè một bản lưu mới bằng dữ liệu cũ.
- Di vật: mang đầy không xóa lương dư; nhặt một phần giữ phần còn lại; tiền và Cổ không nhận lại lần hai; không nhân trợ cấp qua vòng chết/tái sinh.
- Ngẫu nhiên: chỉ sinh tại điểm hợp lệ; cùng `OperationId` trả đúng kết quả đã lưu; RNG kiểm thử có thể được tiêm mà không cho client chọn kết quả.
- Đồng hồ: nhiều lần cập nhật nhỏ bằng một lần cập nhật dài; tỷ lệ đổi giữa mốc không hồi tố; đoạn có kiếp phải xử lý thiệt hại trước sản lượng kế tiếp; tới năm 300 có đúng 30+3.
- Quyền: thu hồi khi người mượn mất kết nối vẫn hiệu lực; chết không đổi chủ đồ mượn/tài sản chung; Cổ trong ký quỹ không dùng được ở túi.
- Lưu trữ: lệnh cũ không tác động đời mới; lỗi lưu không cấp thưởng một phần; khởi động lại giữ chủ/cá thể; nâng phiên bản bảo toàn tài sản lịch sử và bản lưu hỏng không bị thay bằng trạng thái rỗng.

## G Lộ trình phát triển và nghiệm thu từng phần

### G1 Thứ tự triển khai

Người dùng yêu cầu làm xong và kiểm thử từng phần rồi mới sang phần tiếp. Viết đặc tả và kiểm kê có thể thực hiện độc lập; thay đổi sản phẩm đi theo thứ tự dưới. Mỗi phần cần luồng chơi, kiểm thử phù hợp, kiểm tra tích hợp và cập nhật trạng thái, không chỉ thêm kiểu dữ liệu hoặc mục Wiki.

| Phần | Kết quả có thể nghiệm thu | Kiểm tra tối thiểu | Trạng thái ở mốc ban đầu |
|---|---|---|---|
| 1 Xác thực và tiến trình | Gmail OTP qua bộ gửi thật có cấu hình; đăng ký/đăng nhập/đăng xuất/khôi phục đúng; phân biệt sao lưu 2D với đời chung | Dịch vụ OTP giả cho test, tuyến HTTP, hết hạn/thu hồi/giới hạn, không rò mã, sửa lỗi mạng/khôi phục và thao tác trình duyệt. Gửi Gmail thật chỉ xác nhận khi có cấu hình và thực sự gửi | Khung có, cần sửa/hoàn thiện; ưu tiên đang được thực hiện |
| 2 Lỗi tài sản và vòng đời | Nhặt di vật không mất phần dư, không nhận lặp; spawn/tái sinh ngẫu nhiên hợp lệ; bảo toàn dữ liệu cũ | Hồi quy di vật đầy/một phần, RNG cố định, lệnh lặp/đời cũ, tải lại lúc chết và giữ đúng Tiên Cổ | Đã tái hiện lỗi lương dư; ngẫu nhiên còn thiếu |
| 3 Nền tu luyện phàm nhân | Khai khiếu, tư chất, dung lượng/phẩm chất/hồi phục, 4 tiểu cảnh giới 1–5, rủi ro Thập Tuyệt theo cấu hình | Ca 44%, Tửu Trùng không tăng tu vi, thiếu cost không trừ, tư chất không khóa cấp vô căn cứ, chuyển bản lưu | Chưa có mô hình đầy đủ |
| 4 Cá thể Cổ và kinh tế dưỡng | Định nghĩa loài tách cá thể, luyện hóa/dưỡng/dụng, bổn mạng theo khiếu, quyền mượn/thu hồi | Ca quyền bị thu hồi, hai con cùng loài đói riêng, thức ăn đúng, hủy/đói/bổn mạng và không nhân tài sản | 2D có một phần; mạng còn thiếu |
| 5 Luyện Cổ dùng chung | Công thức có đầu vào/chi phí từng mốc, ba nhóm lỗi, khóa duy nhất, xử lý gián đoạn | Ca đồng thời, retry, lỗi lưu, bảo toàn bổn mạng đúng trường hợp, thay đổi chủ/đầu vào khi đang luyện | Cơ chế duy nhất có nền; mẻ luyện dùng chung còn thiếu |
| 6 Bộ Cổ và mục tiêu chiến đấu | Bộ có vai trò/phụ thuộc, một số sát chiêu và phản chế, nhiệm vụ đoạt/giữ/phá/thoát | Hạch tâm mất, chuẩn bị bị ngắt, tầm nhìn/địa hình, điều kiện chiến trường tác động thật | Chiến đấu 2D có nền; mạng chưa có |
| 7 Tổ chức và giao dịch | Thành viên/quyền/nghĩa vụ, kho chung, ký quỹ, trao đổi nguyên tử, tiền tệ phân biệt | Chống nhận trợ cấp lặp, mua đua lệnh, chết lúc đang bán, thu hồi đồ mượn, tài sản chung giữ chủ | Chưa có hệ thống |
| 8 Thăng tiên và tiên khiếu | Nghi thức tam khí, không cấp thọ/Tiên Cổ tự động, một vùng sinh thái và sản xuất có điều kiện | Ca thăng tiên, thiếu khí/tài nguyên, nhận chủ không đổi tu vi, môi trường thiếu không sinh sản lượng | Chưa có |
| 9 Thời gian và tai kiếp | Hai đồng hồ, tỷ lệ có phiên bản, tuổi theo nơi hiện diện, chu kỳ trùng và thiệt hại sản nghiệp | Ca 6/7 ở F, 30+3/300 năm, nhiều cập nhật nhỏ, đổi tốc độ/đặt khiếu, offline/khởi động lại | Chưa có |
| 10 Mở rộng cao chuyển và nội dung | Điều kiện 7–8–9 được đối chiếu; cương/hồn/địa linh; chiến trường nhiều lớp; thập chuyển [GAME] tách riêng | Nghiệm thu từng phương pháp, nguồn từng luật truyện, cân bằng và kiểm tra không phá mô hình nền | Phần mở rộng sau nền đầu tiên |

### G2 Tiêu chí cho phiên bản có thể chơi

[ĐX] Một phiên bản đầu có thể giới hạn ở phàm nhân với vài loại Cổ và một số địa bàn, nhưng phải nối được xác thực → tiến trình → tu luyện → kiếm/nuôi/dùng/luyện Cổ → mục tiêu → tử vong/tái sinh. Các mục khóa cần ghi đúng trạng thái “chưa mở”, không cho nhãn lục chuyển rồi ngụ ý đã có tiên khiếu và tai kiếp.

Không chốt thêm mô hình kinh doanh hoặc thay nền tảng ở đợt này. Tiếp tục kiến trúc web/Android và máy chủ đang có cho các phần đã được giao; chỉ đánh giá thay kiến trúc khi các yêu cầu giao dịch, đồng thời và quy mô có bằng chứng cần thiết. Một máy chủ một tiến trình/file không phải cam kết vận hành MMO ở quy mô lớn.

### G3 Làm sạch mã đi cùng thay đổi

[ĐX] Làm sạch theo ranh giới hệ thống đang sửa: một nguồn cấu hình chi phí/giới hạn dùng chung server và UI; tách luật thuần khỏi vẽ màn hình và mạng; tách định nghĩa loài khỏi trạng thái cá thể; thống nhất thuật ngữ thể lực/chân nguyên/tiên nguyên. Không đổi tên hàng loạt hoặc xóa khung tính năng chưa hiểu trong lúc có phiên làm việc song song.

[ĐX] Giữ bộ kiểm thử cho hợp đồng thật: bảo toàn tài sản, quyền, mẫu số năng lượng, đồng hồ, giao dịch, vòng đời và di chuyển dữ liệu. Tránh bài chỉ kiểm nội bộ giống hệt mã thực hiện. Mã tạm, cờ thử và bộ gửi giả phải có ranh giới rõ. Các thông báo thành công dựa kết quả máy chủ, không dựa việc nút đã được nhấn.

[ĐX] Trước mở kinh tế nhiều người, chuyển từ ghi lại toàn bộ thế giới theo mỗi heartbeat sang lưu có giao dịch hoặc nhật ký phù hợp; giữ tính nguyên tử và khả năng khôi phục. Giới hạn/luân chuyển dữ liệu thao tác, sự kiện và di vật phải giữ chống lặp, lịch sử quyền và tài sản, không xóa tùy tiện để giảm dung lượng.

### G4 Nhật ký nghiệm thu cho đợt triển khai

| Hạng mục | Trạng thái đã chứng minh | Bằng chứng |
|---|---|---|
| Kiểm kê ban đầu | Hoàn thành đọc mã và so yêu cầu | Ma trận A4; các đường dẫn nguồn trong bảng |
| Kiểm thử world-store tại mốc kiểm kê | 23/23 qua | `node --test server/world-store.test.mjs`, chạy ngày 24/10/2026 |
| Lỗi mất lương khi nhặt đầy | Tái hiện trước sửa | A5: tổng lương 32 → 20, di vật bị xóa; cần kiểm thử mới để cập nhật |
| Lõi Phòng thử quy luật | Đã thực thi riêng trong mô phỏng; không thay hai tiến trình chơi hiện hữu | `src/rules` và `tests/rules-simulation.test.ts`: 41 kiểm thử qua; `npx tsc --noEmit` qua ngày 24/10/2026. Có 44%/phẩm chất, Tửu Trùng có điều kiện điều khiển, quyền mượn/thu hồi, mẻ luyện có giữ chỗ xuyên chuyển và phân loại lỗi, ba bước thăng tiên, đồng hồ/phân đoạn/tuổi/sinh thái và lịch 30+3. Thông số, phối phương và quà khởi tạo đều là bài thử [ĐX] |
| Gmail OTP, khôi phục và bảo vệ tiến trình | Chờ cập nhật sau phần 1 | Không suy ra gửi thư thật từ bộ gửi giả/OTP xem trước |
| Các phần sửa và bổ sung tiếp theo | Chưa được nghiệm thu trong tài liệu mốc này | Điền tên phần, lệnh/kịch bản, kết quả, phạm vi và giới hạn sau khi chạy thực tế |

Chỉ đánh dấu một phần hoàn tất khi cả quy tắc, luồng người dùng và dữ liệu được kiểm tra. Cập nhật kết quả mới tại đây hoặc liên kết báo cáo tích hợp; giữ ma trận mốc ban đầu để người đọc hiểu phần nào đã được bổ sung trong đợt này.

### G5 Phạm vi lõi mô phỏng đã thực thi

`createRulesDemo()` tạo một thế giới bài tập mới chỉ trong bộ nhớ. `snapshot()` trả bản sao; `execute()` nhận mã thao tác, phiên bản tùy chọn và hành động, sau đó sao chép, kiểm tra, áp dụng và công bố nguyên tử trong một tiến trình đồng bộ. Thử lại cùng mã không chi lần hai hoặc bốc kết quả luyện mới. Lỗi điều kiện giữ nguyên trạng thái; thất bại tự nhiên/kỹ thuật của mẻ đã cam kết được ghi cùng chi phí và tình trạng đầu vào.

Một năm mô phỏng bằng 1.000 tick. `advance-time.outerTicks` là **mốc ngoài tuyệt đối**, tiến tối đa 100 năm ngoài mỗi thao tác; không lấy đồng hồ thiết bị và không chạy bộ hẹn giờ nền. Sinh thái quyết toán theo mỗi năm nội khiếu hoàn thành, gồm nước, tăng trưởng, thức ăn, thiếu đói và thiệt hại sinh cảnh. Giải quyết kiếp bằng chi phí phòng vệ là bài học quản lý nguồn lực, chưa phải chiến đấu tai kiếp trên mạng. Kho tiên nguyên cá nhân không nhận sản lượng sau khi thân thể hết thọ trong một đoạn thời gian dài.

Phòng thử không đọc/ghi `localStorage`, bản lưu luyện tập hoặc sổ Ngũ Vực, không tạo tài sản máy chủ và không tự di chuyển số chuyển lịch sử. Nó cung cấp bộ luật có thể chạy và kiểm thử để học/kiểm tra các ví dụ, chưa thay thế vòng chơi chung. Các hệ giao dịch, tổ chức, sát chiêu chiến đấu, luyện hóa có tiến độ ý chí, sinh thái nhiều loài, thăng 7–9 và đầy đủ cơ chế tử vong/di sản vẫn theo lộ trình; không được coi là hoàn thiện chỉ vì một phần dữ liệu nền đã có.
