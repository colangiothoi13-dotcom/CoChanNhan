# Tài nguyên, bắt Cổ, luyện hóa, nuôi Cổ và luyện chế

Tài liệu yêu cầu bổ sung do người dùng cung cấp ngày 24/10/2026, dùng làm căn cứ cho các phiên AI triển khai tiếp.

## Hướng dẫn sử dụng cho các phiên sau

- Đọc cùng [thiết lập tu vi 1–9 và thế giới chung](THIET_LAP_TU_VI_1_DEN_9.md). Tài liệu này bổ sung vòng đời Cổ và kinh tế tài nguyên, không thay thế hệ thống tu vi.
- Trạng thái: **đã triển khai vòng chơi phàm cảnh và khung mở rộng tiên cảnh**. Các mục 1–12 giữ nguyên yêu cầu gốc; xem mục 13 để phân biệt phần đã chạy, quy ước game và phần còn cần mở rộng. Kiểm tra mã nguồn, migration và test hiện hành trước khi đổi trạng thái.
- Nội dung yêu cầu bên dưới được giữ nguyên từ tệp người dùng, chỉ thay tiêu đề tài liệu. Khi triển khai, bổ sung nguồn/chương cho dữ liệu nguyên tác và phân loại rõ: **đã xác minh từ truyện**, **diễn giải để mô phỏng**, **quy ước thiết kế game**. Chi tiết chưa đối chiếu trong phạm vi đến hết đại chiến Nghĩa Thiên lần thứ nhất phải để **chưa rõ**.
- Các câu ghi “đã xác minh” hoặc khẳng định chi tiết nguyên tác trong phần nguồn là nội dung người dùng cung cấp; phiên lưu tài liệu này chưa đối chiếu độc lập các chương truyện đó.
- Nếu cơ chế phóng tác cũ khác yêu cầu mới, ghi rõ điểm khác và có migration bảo toàn cá thể, quyền sở hữu, ID Cổ/cổ phương và dữ liệu đang lưu; không tự đổi yêu cầu để khớp cách làm cũ. Tiên Cổ duy nhất theo loại xuyên các chuyển; không dùng ID riêng cho từng chuyển để tạo thêm cá thể cùng loại.
- Ưu tiên hoàn thiện một vòng chơi phàm cảnh: kiếm tài nguyên → tìm/bắt và giữ Cổ sống → luyện hóa → nuôi dưỡng → dùng Cổ → luyện chế; sau đó mở rộng sang tiên cảnh theo cùng cấu trúc.

---
Bạn là chuyên gia phân tích thế giới Cổ Chân Nhân và nhà thiết kế hệ thống game nhập vai.

Hãy xây dựng hệ thống tài nguyên và toàn bộ vòng hoạt động liên quan đến Cổ trùng, kết nối với hệ thống tu vi từ nhất chuyển đến cửu chuyển.

Phạm vi kiến thức nguyên tác là từ đầu truyện đến kết thúc đại chiến núi Nghĩa Thiên lần thứ nhất. Các chi tiết chưa được xác minh trong phạm vi này phải được ghi nhận là chưa rõ.

Mọi giá bán, sản lượng, thời gian chờ, xác suất, sức chứa và hệ số do game đặt ra phải được đánh dấu là **quy ước thiết kế game**.

## 1. Phân biệt các hoạt động cốt lõi

| Hoạt động | Ý nghĩa trong hệ thống |
|---|---|
| **Tìm Cổ** | Phát hiện dấu vết, nơi sinh sống hoặc nguồn cung cấp Cổ. |
| **Bắt Cổ** | Khống chế và giữ được thân Cổ còn sống. |
| **Luyện hóa** | Giành quyền điều khiển Cổ bằng cách xử lý ý chí chống cự bên trong. |
| **Nuôi Cổ** | Đáp ứng nhu cầu duy trì sự sống và trạng thái của từng loại Cổ. |
| **Dùng Cổ** | Kích hoạt công dụng khi đáp ứng đúng điều kiện. |
| **Luyện chế** | Tạo hoặc chuyển hóa Cổ thông qua cổ phương, nguyên liệu và phương pháp luyện. |
| **Nghiên cứu cổ phương** | Tìm hiểu, bổ sung, suy diễn hoặc cải tiến phương pháp luyện chế. |

**Bắt được Cổ, giữ Cổ trong tay và điều khiển được Cổ là các trạng thái khác nhau.** Cổ có ý chí chống cự; thậm chí ý chí của chủ cũ vẫn có thể tồn tại sau khi người đó chết.

Hệ thống phải xử lý những hoạt động này riêng, đồng thời cho chúng tác động qua lại.

## 2. Hệ thống tài nguyên

### 2.1. Các nhóm tài nguyên

| Nhóm | Công dụng |
|---|---|
| **Nguyên thạch** | Trao đổi trong kinh tế phàm nhân và bổ sung chân nguyên. |
| **Tiên nguyên thạch** | Giao dịch trong kinh tế Cổ Tiên và chuyển hóa thành tiên nguyên cá nhân theo cơ chế phù hợp. |
| **Chân nguyên, tiên nguyên** | Nguồn lực của người tu dùng cho những hoạt động tương ứng. |
| **Vật liệu luyện Cổ** | Nguyên liệu được cổ phương yêu cầu: khoáng vật, thực vật, bộ phận sinh vật, khí, chất lỏng hoặc vật phẩm đặc thù. |
| **Thức ăn của Cổ** | Những vật phẩm hoặc nguồn cung mà từng loại Cổ cần để được nuôi dưỡng. |
| **Cổ trùng thành phẩm** | Có thể dùng, cho mượn, trao đổi hoặc đưa vào một cổ phương phù hợp. |
| **Giống và nguồn nuôi trồng** | Hạt giống, đàn sinh vật, cây mẹ và những nguồn có khả năng tạo sản vật. |
| **Môi trường sản xuất** | Đất, nước, khí hậu, ánh sáng, môi trường đặc thù và điều kiện đạo ngân. |
| **Tri thức** | Cổ phương, tàn phương, kinh nghiệm nuôi trồng, phương pháp luyện và thông tin thị trường. |
| **Dịch vụ chuyên môn** | Luyện Cổ thuê, suy diễn cổ phương, chăm sóc nguồn tài nguyên hoặc dùng năng lực chuyên biệt. |

Một vật phẩm có thể có nhiều công dụng. Hệ thống phải lưu các công dụng đó riêng; cùng phẩm cấp không có nghĩa mọi vật phẩm thay thế được cho nhau.

Nguyên thạch có thể bổ sung chân nguyên. Trong trường hợp được mô tả ở nguyên tác, một tiên nguyên thạch có thể chuyển thành một hạt thanh đề tiên nguyên cá nhân; không được tự suy ra tỷ lệ đó áp dụng giống hệt cho mọi loại tiên nguyên hoặc có thể đổi ngược tùy ý.

### 2.2. Thuộc tính của một tài nguyên

Mỗi loại tài nguyên cần có:

- Tên, mô tả và công dụng.
- Phẩm cấp hoặc chuyển khi có.
- Thuộc tính, lưu phái liên quan.
- Nguồn xuất hiện.
- Điều kiện thu hoạch.
- Khả năng tái tạo.
- Điều kiện bảo quản.
- Chất lượng và tình trạng hiện tại.
- Giá tham khảo theo thị trường.
- Mức độ hiểu biết mà nhân vật có về tài nguyên đó.

**Độ hiếm, phẩm cấp và giá trị sử dụng phải là các thông số riêng.** Một nguyên liệu thấp cấp nhưng đang thiếu nguồn cung vẫn có thể rất quan trọng với một cổ phương hoặc chuỗi sản xuất.

### 2.3. Những cách kiếm tài nguyên

Cho phép người chơi phát triển qua nhiều hoạt động:

- Thăm dò và thu hái.
- Khai thác điểm tài nguyên.
- Săn bắt và thu hồi vật liệu phù hợp.
- Nuôi trồng.
- Mua bán, đổi hàng và đấu giá.
- Hoàn thành nhiệm vụ.
- Cung cấp dịch vụ.
- Tiếp nhận hoặc khám phá truyền thừa.
- Hợp tác với người khác để khai thác nguồn lực.

Mỗi nguồn cần có đầu vào, điều kiện tiếp cận, rủi ro và giới hạn sản lượng. Cơ chế tái tạo phải phù hợp với từng loại tài nguyên; thông số cụ thể là phần cân bằng của game.

## 3. Hệ thống tìm và bắt Cổ

### 3.1. Phát hiện

Người chơi có thể tìm Cổ thông qua dấu vết, thông tin, phương tiện trinh sát, thức ăn dẫn dụ hoặc khảo sát nơi sinh sống.

Khả năng phát hiện phụ thuộc vào:

- Phương tiện trinh sát có phù hợp không.
- Kiến thức về loài Cổ.
- Địa hình và điều kiện môi trường.
- Khả năng ẩn nấp hoặc ngụy trang của mục tiêu.
- Độ chính xác của thông tin thu thập được.

Bản đồ chỉ hiển thị những thông tin người chơi có căn cứ để biết.

### 3.2. Tiếp cận và khống chế

Cổ hoang có thể trốn chạy, chống trả và sử dụng năng lực của nó. Cổ sống trên thân thú có thể bỏ chạy khi vật chủ bị đánh bại; muốn bắt sống cần kiểm soát lực công kích và phương tiện giam giữ. Nguyên tác thể hiện rõ tình huống này khi các Cổ sư tranh bắt Cổ trên thân Lôi Quan Lang.

Thiết kế các phương án:

- Dẫn dụ bằng thức ăn hoặc điều kiện hấp dẫn.
- Bao vây đường chạy.
- Giam giữ bằng Cổ, sát chiêu hoặc phương tiện phù hợp.
- Khống chế vật chủ.
- Làm suy yếu có kiểm soát.
- Phối hợp nhiều nhân vật.

Kết quả có thể là bắt sống, mục tiêu bị thương, mục tiêu trốn thoát, giam giữ thất bại hoặc mục tiêu chết.

Mỗi kết quả phải có nguyên nhân liên quan đến hành động và điều kiện thực tế. Xác suất bắt do game đặt phải được ghi rõ là thông số mô phỏng.

### 3.3. Sau khi bắt

Cổ bị bắt phải tiếp tục được theo dõi:

- Tình trạng giam giữ.
- Thương tích.
- Ý chí bên trong.
- Nhu cầu nuôi dưỡng.
- Khả năng bỏ trốn.
- Điều kiện cất giữ.

Cổ chưa luyện hóa không được tự động trở thành kỹ năng sử dụng ngay.

## 4. Luyện hóa và quyền điều khiển

### 4.1. Các quyền phải lưu riêng

Mỗi con Cổ cần phân biệt:

- Người đang giữ thân Cổ.
- Người có quyền điều khiển do luyện hóa.
- Người được cho phép sử dụng.
- Ý chí còn tồn tại bên trong.

Nguyên tác có cơ chế cho mượn Cổ mà chủ vẫn giữ quyền điều khiển; quyền sử dụng có thể bị thu hồi. Chủ cũng có thể ra lệnh cho Cổ tự hủy trong những tình huống phù hợp.

Bởi vậy, chiến lợi phẩm sau giao tranh phải được xử lý theo trạng thái thực tế của từng con Cổ.

### 4.2. Quá trình luyện hóa

Thiết kế quá trình luyện hóa có:

- Mức độ chống cự.
- Nguyên lực cần thiết.
- Phương pháp hỗ trợ.
- Thời gian và khả năng duy trì.
- Tiến độ đã đạt được.
- Hậu quả khi gián đoạn.

Ở quá trình luyện hóa thông thường được mô tả đầu truyện, ý chí của Cổ có thể đẩy lùi phần chân nguyên đã xâm nhập khi người luyện dừng lại. Vì thế, tiến độ không mặc định được giữ nguyên vĩnh viễn.

Các phương tiện đặc biệt có thể làm quá trình dễ hơn, nhưng phải được khai báo thành cơ chế riêng.

### 4.3. Chuyển giao

Khi mua bán, tặng hoặc cho mượn Cổ, hệ thống phải xác định:

- Có chuyển quyền điều khiển hay chỉ chuyển quyền sử dụng.
- Chủ cũ có chủ động phối hợp hay không.
- Người nhận còn cần thực hiện bước gì.
- Cổ hiện đang ở đâu.
- Ai chịu trách nhiệm nuôi trong thời gian giao nhận.

## 5. Hệ thống nuôi Cổ

### 5.1. Hồ sơ nuôi dưỡng riêng cho từng loại

Mỗi loại Cổ phải có:

- Thức ăn hoặc nguồn nuôi dưỡng.
- Lượng cần dùng.
- Chu kỳ hoặc điều kiện cần cho ăn.
- Khả năng chấp nhận thức ăn thay thế.
- Tác động của mức sử dụng.
- Hậu quả thiếu ăn.
- Điều kiện hồi phục.
- Phương pháp bảo tồn hoặc ngủ đông nếu có.

Nguyệt Quang Cổ ăn cánh Nguyệt Lan. Thiếu thức ăn có thể khiến Cổ chết; hiện tượng tự phong ấn hoặc ngủ đông chỉ xảy ra ở một số trường hợp có điều kiện.

### 5.2. Tách thức ăn khỏi chi phí kích hoạt

Hệ thống cần hai khoản riêng:

1. **Chi phí duy trì:** Để nuôi Cổ.
2. **Chi phí sử dụng:** Để kích hoạt công dụng.

Một số Cổ có cơ chế riêng, nhưng tiên nguyên không mặc nhiên thay thế được mọi thức ăn. Nguyên tác mô tả các Tiên Cổ cần những nguồn nuôi rất khác nhau, và có tiền cũng chưa chắc mua được đúng loại đang cần.

### 5.3. Tình trạng nuôi dưỡng

Có thể dùng các trạng thái giao diện sau như quy ước của game:

- Được nuôi đầy đủ.
- Sắp đến kỳ.
- Đang thiếu thức ăn.
- Suy yếu.
- Nguy kịch.
- Đã chết.

Tác động cụ thể của từng trạng thái phải phụ thuộc hồ sơ loại Cổ. Không tự suy ra mọi Cổ chịu cùng một mức giảm hiệu quả khi đói.

Hạn cho ăn và thương tích phải được giữ khi chuyển kho, cho mượn hoặc giao dịch.

### 5.4. Ngủ đông và bảo tồn

Phân biệt hai trường hợp:

- Tự phong ấn trong những hoàn cảnh đặc biệt.
- Được đặt trong môi trường bảo tồn có thiết kế.

Nguyên tác có phương pháp tạo môi trường khiến phàm Cổ ngủ đông để giảm gánh nặng nuôi; Tiên Cổ trong cơ chế được mô tả vẫn cần thức ăn. Vì vậy, kho bảo tồn phải có điều kiện và công dụng cụ thể.

### 5.5. Quản lý thức ăn

Cho người chơi xem:

- Nhu cầu thức ăn của toàn bộ Cổ.
- Lượng dự trữ.
- Những Cổ sắp đến kỳ ăn.
- Nguồn tự sản xuất.
- Nguồn đang phải mua.
- Chi phí duy trì dự kiến.
- Rủi ro nếu nguồn cung bị gián đoạn.

Tự động cho ăn chỉ hoạt động khi có thức ăn phù hợp và quyền sử dụng kho tương ứng.

## 6. Hệ thống luyện chế Cổ

### 6.1. Cổ phương

Mỗi cổ phương cần ghi:

- Thành phẩm.
- Những Cổ đầu vào.
- Nguyên liệu.
- Thành phần bị tiêu hao và thành phần được giữ lại.
- Trình tự thao tác.
- Điều kiện môi trường.
- Phương tiện hỗ trợ.
- Yêu cầu nguyên lực và năng lực thực hiện.
- Các kết quả thành công hoặc thất bại có thể xảy ra.
- Mức độ đầy đủ, độ tin cậy và nguồn gốc của phương.

Cổ phương có thể là bản hoàn chỉnh, tàn phương hoặc một phương pháp đang được nghiên cứu. Việc sở hữu thành phẩm không tự động cung cấp toàn bộ cổ phương cho người chơi.

### 6.2. Hợp luyện, thăng chuyển và nghịch luyện

Cho phép những đường luyện khác nhau khi có phương pháp tương ứng.

- **Hợp luyện:** Kết hợp các Cổ và thành phần theo cổ phương.
- **Thăng chuyển:** Mục tiêu nâng chuyển của Cổ thông qua đường luyện phù hợp.
- **Nghịch luyện:** Chuyển Cổ theo một phương pháp ngược hoặc phân giải đã xác định.

Nghịch luyện không mặc định trả lại đầy đủ đầu vào ban đầu. Nguyên tác cho thấy cùng Tứ Vị Tửu Trùng nhưng dùng phương pháp khác nhau có thể nhận kết quả khác nhau.

Nghiên cứu để suy diễn cổ phương phải là hoạt động riêng với việc nghịch luyện một con Cổ.

### 6.3. Năng lực người luyện

Theo dõi riêng:

- Tu vi.
- Cảnh giới Luyện đạo.
- Hiểu biết về cổ phương đang dùng.
- Kinh nghiệm thực hành.
- Phương tiện và sát chiêu hỗ trợ.
- Trạng thái cơ thể, tinh thần và nguyên lực.

Cảnh giới Luyện đạo và khả năng thực hiện phương pháp cần được đánh giá riêng với cấp chuyển. Truyện cũng cho thấy việc nghiên cứu lại cổ phương có thể đòi hỏi trình độ, vật mẫu và chi phí đáng kể.

### 6.4. Thực hiện một lần luyện

Quy trình gameplay đề xuất:

1. Chọn cổ phương.
2. Kiểm tra mức độ hiểu biết và điều kiện.
3. Chọn đúng Cổ, nguyên liệu và phương tiện.
4. Xem chi phí cùng rủi ro ước tính.
5. Bắt đầu quá trình.
6. Giải quyết các bước và biến cố.
7. Cập nhật thành phẩm, tổn thất và trạng thái người luyện.

Chỉ các nguyên liệu thực sự tham gia mới được tiêu hao theo diễn biến. Những Cổ đang bị dùng làm đầu vào không đồng thời được đem bán hoặc sử dụng trong hoạt động khác.

### 6.5. Thất bại

Phải phân biệt:

- Sai sót thao tác.
- Thiếu hoặc sai điều kiện.
- Vấn đề ở cổ phương hoặc đầu vào.
- Xác suất thất bại tự nhiên.
- Tiên Cổ mục tiêu đã tồn tại.

Nguyên tác xác nhận luyện chế có thể thất bại dù thao tác đúng; ngay cả đạo ngân thành công cũng không giúp vượt qua việc làm sai kỹ thuật hoặc cố tạo thêm một Tiên Cổ đã tồn tại.

Kết quả thất bại có thể làm mất nguyên liệu, gây thương tích cho Cổ, phá hủy một phần đầu vào hoặc gây hậu quả nghiêm trọng hơn. Phạm vi tổn thất phải phụ thuộc quá trình cụ thể.

Hệ thống có thể lưu nguyên nhân thật để xử lý, nhưng chỉ giải thích cho nhân vật những điều họ có khả năng nhận biết.

### 6.6. Cổ bản mệnh

Quan hệ bản mệnh phải được theo dõi riêng với vai trò “Cổ chủ lực”.

Cổ bản mệnh được bảo toàn trước tổn hại do luyện chế thất bại theo cơ chế nguyên tác; điều đó không khiến nó bất hoại trong mọi hoàn cảnh. Bị hủy có thể gây phản phệ nặng cho chủ nhân, và thay đổi bản mệnh là việc có rủi ro.

## 7. Tính duy nhất của Tiên Cổ

Áp dụng quy luật:

**Trong cùng một thế giới, một loại Tiên Cổ chỉ có một cá thể tồn tại tại một thời điểm; tính duy nhất xuyên qua các chuyển.**

Ví dụ trong truyện, khi Sát Vận Tiên Cổ lục chuyển đã tồn tại, người khác không thể tạo thêm một Sát Vận Tiên Cổ thất chuyển độc lập.

Yêu cầu thiết kế:

- Theo dõi loại Tiên Cổ trên toàn thế giới.
- Phân biệt thăng luyện cá thể đang có với tạo thêm một cá thể.
- Giữ tính duy nhất khi Cổ được trao đổi, cho mượn, phong ấn hoặc chuyển kho.
- Chỉ cập nhật trạng thái mất đi khi cơ chế thực tế xác nhận Cổ đã bị hủy, tiêu hao hoặc chuyển hóa.
- Nếu nhiều người cùng luyện một loại, kết quả phải nhất quán với tính duy nhất.
- Trạng thái toàn cục không tự động tiết lộ chủ sở hữu hoặc vị trí cho người chơi.

Nếu game có nhiều thế giới độc lập, phạm vi áp dụng tính duy nhất là một quyết định thiết kế phải công bố rõ.

## 8. Nuôi trồng và sản xuất trong tiên khiếu

### 8.1. Điểm sản xuất

Mỗi điểm tài nguyên cần có:

- Giống hoặc nguồn khởi đầu.
- Không gian và điều kiện môi trường.
- Đầu vào phải cung cấp.
- Thời gian phát triển.
- Sức chứa.
- Sản lượng.
- Quan hệ với những sinh vật hoặc tài nguyên khác.
- Rủi ro mất mùa, suy thoái hoặc bị phá hủy.

Tiên khiếu phải hoạt động như một môi trường có điều kiện. Nguyên tác mô tả việc bố trí đất, hồ, sinh vật và chuỗi thức ăn; đạo ngân cũng ảnh hưởng những nguồn tài nguyên có thể phát triển.

### 8.2. Tạo nguồn Cổ

Phải phân biệt:

- Sinh sản của động thực vật thông thường.
- Sự hình thành Cổ trong một môi trường.
- Sản xuất Cổ bằng luyện chế.

Không tự thêm cơ chế ghép đôi hai Cổ bất kỳ để sinh ra Cổ con. Với từng nguồn Cổ, phải chỉ rõ phương thức tạo ra nó.

### 8.3. Thời gian

Theo dõi thời gian tại nơi hoạt động diễn ra.

Tốc độ thời gian trong tiên khiếu có thể tác động đến sinh trưởng, tiêu thụ thức ăn, chu kỳ nuôi và tiến trình tai kiếp. Chu kỳ nuôi một số Cổ còn phụ thuộc mức sử dụng, vì vậy phải xét hồ sơ riêng.

Các tỷ lệ thời gian do game lựa chọn phải được ghi là thông số thiết kế nếu không có căn cứ cho tiên khiếu cụ thể.

### 8.4. Rủi ro và lợi nhuận

Cho người chơi lựa chọn giữa:

- Tập trung sản xuất một nguồn có lợi thế.
- Đa dạng hóa nguồn thu.
- Tự sản xuất thức ăn cho Cổ.
- Mua ngoài để dành không gian cho sản vật khác.
- Di chuyển tài nguyên khi chuẩn bị đối mặt nguy hiểm.
- Đầu tư vào cải tạo môi trường.

Tính lợi nhuận sau khi trừ giống, thức ăn, nguyên lực, nhân công, vận chuyển và tổn thất theo mô hình game.

## 9. Thị trường và giao dịch

### 9.1. Các kênh giao dịch

Có thể triển khai cửa hàng, thương đội, kho gia tộc hoặc môn phái, đấu giá, trao đổi trực tiếp và Bảo Hoàng Thiên.

Mỗi kênh cần có:

- Điều kiện tiếp cận.
- Nguồn hàng.
- Người mua có nhu cầu.
- Khả năng thanh toán.
- Phí và chi phí vận chuyển nếu có.
- Mức độ tin cậy.
- Những thông tin người chơi được biết.

### 9.2. Bảo Hoàng Thiên

Tiếp cận phải gắn với phương tiện phù hợp hoặc người hỗ trợ. Truyện có việc dùng Thông Thiên Cổ để kết nối và chuyển hàng, Thần Niệm Cổ để liên lạc. Nhân vật chưa tự đáp ứng điều kiện có thể sử dụng sự hỗ trợ hợp lý trong thế giới.

Bảo Hoàng Thiên có giao dịch, thương lượng và phí. Bảo quang hỗ trợ đánh giá nhưng không bảo đảm mọi thông tin về món hàng đều chính xác hoặc đã được phát hiện.

### 9.3. Giá cả

Giá mô phỏng cần xét:

- Nguồn cung và nhu cầu.
- Tình trạng của hàng.
- Độ khó vận chuyển và bảo quản.
- Thông tin người mua biết.
- Sự độc quyền.
- Khả năng thay thế.
- Mức độ khẩn cấp.

Mua cổ phương, thuê luyện chế và mua Cổ thành phẩm phải là những lựa chọn có chi phí, rủi ro và lợi ích khác nhau.

## 10. Dữ liệu và giao diện

### 10.1. Hồ sơ một con Cổ

Lưu ít nhất:

- Mã cá thể, loại và chuyển.
- Công dụng, điều kiện kích hoạt.
- Người giữ, chủ luyện hóa và người được mượn.
- Ý chí và tiến độ luyện hóa.
- Sức khỏe, thương tích.
- Quan hệ bản mệnh.
- Thức ăn và lịch nuôi.
- Nơi cất giữ cùng điều kiện bảo tồn.
- Trạng thái đang được dùng, luyện chế, giao dịch hoặc vận chuyển.
- Nguồn thông tin về loại Cổ.

Thông tin trên giao diện phải phù hợp mức hiểu biết của nhân vật.

### 10.2. Các màn hình cần có

| Màn hình | Người chơi cần hiểu được |
|---|---|
| **Kho tài nguyên** | Có gì, dùng làm gì, ở đâu và bảo quản ra sao. |
| **Quản lý Cổ** | Con nào đã luyện hóa, đang bị thương, bị giam giữ hoặc được cho mượn. |
| **Nuôi dưỡng** | Cần thức ăn gì, còn bao lâu, dự trữ đủ đến khi nào. |
| **Cổ phương và luyện chế** | Thiếu thành phần nào, chi phí gì, rủi ro gì. |
| **Nuôi trồng** | Đầu vào, sản lượng, điều kiện môi trường và lợi nhuận. |
| **Thị trường** | Nguồn hàng, giá, phí và điều kiện giao dịch. |

Cho phép thiết lập cảnh báo, thứ tự ưu tiên cho ăn và ngân sách mua thức ăn. Tự động hóa phải hoạt động trong giới hạn tài nguyên và quyền mà người chơi đã thiết lập.

### 10.3. Tính nhất quán

Một cá thể Cổ hoặc một lượng tài nguyên không được đồng thời tồn tại ở nhiều nơi.

Chuyển kho, đưa ra chợ, cho mượn, dùng làm nguyên liệu và tiêu hao phải cập nhật cùng một trạng thái thực tế. Đổi chủ không làm hồi phục thương tích hoặc đặt lại lịch ăn.

## 11. Ba ví dụ để thể hiện vòng chơi

### Ví dụ A: Nuôi một Nguyệt Quang Cổ

Người chơi có Nguyệt Quang Cổ và cần duy trì nguồn cánh Nguyệt Lan.

Cho phép lựa chọn mua thức ăn hoặc phát triển nguồn cung phù hợp với điều kiện của game. Hệ thống thể hiện dự trữ, chi phí duy trì và nguy cơ thiếu thức ăn. Việc sử dụng Cổ tiêu hao nguyên lực được tính riêng với việc nuôi. Thức ăn cánh Nguyệt Lan là chi tiết nguyên tác; sản lượng và thời gian nuôi trồng cụ thể phải được xác định riêng.

### Ví dụ B: Hợp luyện Nguyệt Mang Cổ

Thành phần Cổ đã được xác minh:

**Một Nguyệt Quang Cổ + hai Tiểu Quang Cổ → Nguyệt Mang Cổ nhị chuyển.**

Trong một lần thất bại được mô tả, một Tiểu Quang Cổ chết; Nguyệt Quang Cổ và Tiểu Quang Cổ còn lại bị thương.

Dùng ví dụ này để thể hiện việc tiêu hao, hồi phục Cổ, mua bù thành phần và cân nhắc thử lại. Các lượng nguyên liệu phụ, thời gian chuẩn hoặc tỷ lệ thành công chưa được xác minh phải ghi rõ là thông số game.

### Ví dụ C: Phát triển nguồn Tinh Huỳnh Cổ

Xây dựng chuỗi:

**Môi trường phù hợp → Tinh Tiết Thảo → đàn Tinh Huỳnh Trùng → nguồn Tinh Huỳnh Cổ.**

Phải phân biệt đàn côn trùng thông thường với những cá thể đã trở thành Cổ. Truyện có việc mua giống, kiến thức nuôi trồng và chuẩn bị môi trường; Tinh Tiết Thảo cần điều kiện trồng thích hợp, còn đàn đom đóm hỗ trợ phát tán hạt.

Ví dụ này phải thể hiện giá trị của kiến thức và đầu tư ban đầu, cùng chi phí duy trì một nguồn sản xuất.

## 12. Yêu cầu bàn giao

Hãy cung cấp một thiết kế có thể triển khai, gồm:

1. Các loại tài nguyên và cách kiếm.
2. Cơ chế tìm, bắt và giữ Cổ sống.
3. Cơ chế luyện hóa, cho mượn và chuyển giao.
4. Hồ sơ thức ăn, lịch nuôi và bảo tồn.
5. Cổ phương, quy trình luyện chế và xử lý thất bại.
6. Quy luật duy nhất của Tiên Cổ.
7. Sản xuất và quản lý tài nguyên trong tiên khiếu.
8. Kinh tế, giao dịch và dịch vụ.
9. Dữ liệu, giao diện và ví dụ chơi.
10. Danh sách thông số cân bằng do game đặt.

Bắt đầu bằng dữ liệu đủ để chơi trọn một vòng kiếm tài nguyên, bắt Cổ, luyện hóa, nuôi dưỡng và hợp luyện ở phàm cảnh; sau đó mở rộng cùng cấu trúc sang tiên cảnh.

Mỗi dữ liệu quan trọng phải được phân loại rõ là **đã xác minh từ truyện**, **diễn giải để mô phỏng** hoặc **quy ước thiết kế game**.

Mục tiêu trải nghiệm là để người chơi phải cân nhắc: **mình kiếm được Cổ nào, điều khiển được nó chưa, nuôi nổi không, dùng vào việc gì và có đủ tài nguyên để phát triển nó hay không.**

## 13. Bản triển khai ngày 24/10/2026

### 13.1. Vòng chơi đang có

Người chơi mới không có Cổ. Đến học đường nhận một Cổ chưa luyện hóa hoặc đi khảo sát nguồn lân cận, chuẩn bị lưới/mồi rồi bắt Cổ sống. Mỗi con có ID riêng, thương tích, ý chí và lịch ăn. Luyện hóa từng cá thể trên máy chủ, chuẩn bị thức ăn, nghiên cứu cổ phương, chọn đúng cá thể/nguyên liệu rồi thực hiện một mẻ luyện có thời gian. Có thể sản xuất thức ăn, làm việc cho NPC và mua/bán để duy trì vòng chơi.

- Nguyệt Quang ăn **cánh Nguyệt Lan**, riêng với phí chân nguyên khi kích hoạt.
- Cổ phương Nguyệt Mang dùng **một Nguyệt Quang + hai cá thể Tiểu Quang khác nhau**. ID `moonbeam` tách khỏi `moonblade` và cổ phương phóng tác cũ.
- Đầu vào đang luyện bị khóa khỏi sử dụng, giao dịch và chuyển giao. Rời cơ sở/gián đoạn trả phần nguyên liệu chưa thực sự tham gia; không hoàn lại phần đã dùng.
- Thất bại có thể làm mất một Tiểu Quang và gây thương tích cho đầu vào khác; Cổ bản mệnh được bảo toàn khỏi tổn hại do thất bại đó. Thăng tiên cần quan hệ bản mệnh thật, không thay bằng Cổ chủ lực hoặc Cổ mượn.
- Kết quả nhị chuyển không tự nâng nhân vật: người nhất chuyển vẫn chưa đủ điều kiện dùng Cổ đó. Có thể lắp Nguyệt Mang vào ô chiêu trong Cài đặt khi đã sở hữu.
- Chuỗi sản xuất gồm vườn Nguyệt Lan, Tinh Tiết Thảo, đàn Tinh Huỳnh Trùng thường và sinh cảnh tạo Tinh Huỳnh Cổ. Giống, nước, thức ăn và sức chứa được kiểm tra; không ghép đôi hai Cổ tùy ý.

### 13.2. Quyền, nuôi dưỡng và giao dịch

`ownerLifeId` cũ được giữ để tương thích; quyền thực tế phải đọc `holderLifeId`, `controllerLifeId`, `authorizedLifeIds` và trạng thái ý chí. Chỉ một tập hợp người giữ hoặc di vật chứa cá thể thật. Cho mượn di chuyển cá thể, không sao chép nó; thu hồi quyền không tự dịch chuyển thân Cổ. Luyện hóa thù địch gặp lại ý chí chủ cũ và không đồng thời cho dùng Cổ.

Nuôi Cổ dùng hồ sơ từng loại: thức ăn, lượng, chu kỳ, thời gian thiếu ăn, trạng thái và khả năng bảo tồn. Tự cho ăn dùng tồn kho trước, rồi chỉ mua trong ngân sách được người chơi đặt. Chuyển kho/cho mượn/giao dịch/nhặt di vật không đặt lại lịch ăn hoặc chữa thương. Bảo tồn chỉ giảm nhu cầu cho Phàm Cổ phù hợp; không mặc định cho Tiên Cổ ngủ đông.

Có chợ giá cố định tại cùng khu dân cư, gửi bán tài nguyên hoặc cá thể Cổ, mua và hủy gửi bán. Hàng gửi bán được escrow; hai người không mua được cùng một lô. Giá và phí bán được công bố; tiền và cá thể chuyển cùng giao dịch nguyên tử.

**Bảo Hoàng Thiên qua NPC tiếp dẫn:** nhân vật từ lục chuyển có thể trả một tiên nguyên thạch tại học đường/Cổ khố để mở phiên tiếp dẫn 180.000 ms đồng hồ thế giới. Phiên cho gửi/mua hàng xuyên khu vực bằng tiên nguyên thạch trong kho; không trộn với hạt tiên nguyên cá nhân hoặc nguyên thạch phàm nhân. Đây là **dịch vụ mô phỏng của game**, không tặng Thông Thiên Cổ hoặc giả định nhân vật đã sở hữu phương tiện kết nối. Hết hạn không xóa hàng hoặc buộc trả phí để lấy lại hàng của chính mình tại NPC.

Chủ luyện hóa có thể ra lệnh hủy Cổ đang giữ hoặc đang cho mượn khi đủ điều kiện. Giao diện yêu cầu xác nhận rõ trước thao tác không thể hoàn tác; phản phệ bản mệnh áp dụng cho đúng chủ. Tử vong chuyển cá thể còn sống vào di vật, giữ ý chí và lịch ăn; nhận vượt sức chứa giữ lại phần chưa lấy.

### 13.3. Đồng hồ và tính nhất quán

- Máy chủ sở hữu đồng hồ tài nguyên; chỉ tiến khi còn người chơi hoạt động. Có grace heartbeat 15 giây. Clock ngừng khi không ai hoạt động và không cộng thời gian máy chủ tắt. Tu luyện cá nhân vẫn giữ chính sách tạm dừng riêng đã có.
- Dinh dưỡng xét vị trí giữ từng cá thể. Nông trại phàm cảnh dùng `clock: outer`; không tự được tăng tốc khi chủ thăng tiên. Nông trại mới trong tiên cảnh dùng `clock: aperture`; chỉ các nguồn ở tiên khiếu hưởng tỷ lệ nội tại. Quy tắc tự chọn vị trí ban đầu này là quy ước game.
- Input chỉ gửi hướng/chiêu và ACK `resourceClockMs`, không gửi số dư, thời gian mô phỏng, roll hoặc tỷ lệ thành công. ACK chỉ giảm dữ liệu lặp. Gói di chuyển thường khoảng 3,2 KB thay vì 18 KB với fixture nhân vật mới; hành trang đầy đủ cập nhật theo giây và sau lệnh kinh tế.
- `ResourceSnapshot.revision` ngăn phản hồi mạng cũ ghi đè hành trang đã quyết toán. Tồn kho, thưởng, quyền, di vật và biên nhận lệnh cùng rollback nếu lưu thất bại.
- Giới hạn: 75 điểm nguồn hình học, tối đa 128 lô hàng và 256 bản ghi cho mượn trong kho thế giới. Lịch sử Cổ kết thúc giữ tối đa 32 dòng gần đây, không xóa Cổ sống/đang khóa hoặc tái sử dụng ID.

### 13.4. Tệp cần đọc khi sửa tiếp

| Tệp | Vai trò |
|---|---|
| `cotienlo-game/shared/resource-catalogs.mjs` | Tài nguyên, hồ sơ ăn, cổ phương, mô hình sản xuất và số cân bằng có nhãn |
| `cotienlo-game/shared/resource-core.mjs` + `.d.mts` | Luật thuần, trạng thái, tiến trình, snapshot theo hiểu biết và validator |
| `cotienlo-game/shared/cultivation-core.mjs` | Cá thể Cổ, quyền dùng, thân/hồn, nguyên lực, bản mệnh và cổng thăng tiên |
| `cotienlo-game/server/resource-world.mjs` | Nguồn chung, bắt sống, dịch vụ NPC, thị trường, cho mượn, singleton và di vật |
| `cotienlo-game/server/world-store.mjs` | Migration, đồng hồ, xác thực, idempotence, publish nguyên tử |
| `cotienlo-game/src/ui/ResourceModal.ts` | Sáu tab và form gửi lệnh thực; giữ dữ liệu nhập/focus khi snapshot thay đổi |
| `cotienlo-game/src/world/FieldClient.ts` | ACK, giữ cache theo lifeId và phiên bản, cập nhật tức thì từ lệnh đã quyết toán |
| `cotienlo-game/src/world/FieldSceneView.ts` | Vẽ điểm nguồn gần viewport, chọn NPC/nguồn gần hơn cho phím F |
| `tools/check-gu-resource-world.mjs` | Chrome cô lập chơi trọn vòng phàm cảnh bằng input thật |

B mở Chăm sóc Cổ; H mở Cổ phương; nút Tài nguyên mở đủ sáu tab. F tại NPC hoặc dấu vết chọn đối tượng gần hơn. Luyện tập cục bộ giữ giao diện cũ; không upload kho luyện tập để tạo tài sản ở máy chủ.

### 13.5. Phần cần mở rộng sau

Bản này có vòng phàm cảnh hoàn chỉnh và dữ liệu tương thích chuyển cao; **không coi là toàn bộ nội dung nguyên tác đã hoàn tất**. Chưa có AI Cổ bám vật chủ chạy thoát từ dị thú, hệ thống truy tung/ảo giác/trinh sát sâu, đấu giá/thương lượng tự động, giá NPC tự điều chỉnh cung cầu, vận chuyển thương đội có rủi ro, kho nguyên liệu theo lô hư hỏng/chất lượng, sinh thái tiên khiếu đầy đủ hoặc danh mục Tiên Cổ/sát chiêu cấp cao. Thị trường hiện là giá cố định do người gửi công bố. Các cơ chế còn thiếu cần triển khai thành hành động/thế giới thực trước khi đánh dấu hoàn thành.

Các con số trong catalog, NPC, nguồn, chu kỳ và dịch vụ tiếp dẫn đều là **quy ước thiết kế game**. Các tên thức ăn/cổ phương/chuỗi Tinh Huỳnh trong ba ví dụ vẫn gắn nhãn **nguồn người dùng cung cấp**, chưa được phiên triển khai này đối chiếu độc lập toàn bộ chương truyện. Không sửa ngược yêu cầu gốc hoặc tự nâng nhãn thành đã đối chiếu.

### 13.6. Xác minh và artifact

| Bộ kiểm tra | Kết quả cuối |
|---|---|
| Giao diện, điều khiển và các luật phía client | 323/323, 37 tệp Vitest |
| Máy chủ/auth/world/tài nguyên | 124/124 |
| Core tu vi và bản mệnh | 27/27 |
| Core tài nguyên/vòng đời Cổ | 35/35 |
| Đồng bộ tài nguyên Android | 3/3 |
| [Chrome vòng phàm cảnh](../.tmp/gu-resource/browser/report.json) | 20/20, không exception chưa bắt |
| [Chrome điều khiển/AI/tái sinh](../.tmp/five-regions/browser/report.json) | 27/27 |
| [Chrome thế giới tự chạy](../.tmp/living-world/browser/report.json) | 20/20 |
| [Chrome thông báo góc/chữ lớn](../.tmp/toast-corner/browser/report.json) | 26/26 |

Tổng **512 test tự động và 93 kiểm tra trình duyệt đạt**. Bài Chrome mới dùng dịch vụ trong bộ nhớ và profile riêng, không sửa HP/vị trí/tiền của người chơi để giả lập thành công. Thao tác bàn phím đi tới nguồn, khảo sát, bắt hai cá thể Tiểu Quang, luyện hóa, cho ăn, nghiên cứu, khóa ba đầu vào, luyện thành Nguyệt Mang và thu sản vật đều đã chạy qua UI thực. Việc sở hữu kết quả nhị chuyển ở nhất chuyển vẫn bị chặn dùng chiêu.

Đã sửa race khiến cập nhật snapshot thay nút submit giữa `pointerdown` và `click`: giữ cấu trúc form tới khi thao tác kết thúc; có test tái hiện lỗi cũ, pointercancel và nhiều pointer. Ca vừa chạy vừa bắn chờ bước vật lý máy chủ thay vì giả định ACK đã di chuyển nhân vật.

Đã xác minh migration trên bản sao dữ liệu đang lưu: giữ lifeId, ID từng Cổ và nguyên thạch. Bản sao nằm trong `.tmp/gu-resource/deployment-backup/`; không dùng tài khoản thật để thử giao dịch. Máy chủ thật đã mở lại và hai địa chỉ [LAN](http://192.168.0.104:5173/) / [dịch vụ](http://127.0.0.1:8787/) qua [kiểm tra chỉ đọc](../.tmp/five-regions/running-services.json).

Snapshot công khai giấu chủ/UUID Tiên Cổ không thuộc kiến thức được cấp, giữ nguyên nhật ký riêng; chặn cả đường đọc file `.world-data` trực tiếp qua Vite bằng `server.fs.deny`. HEAD tới dữ liệu thô trả 403; API riêng vẫn yêu cầu phiên và chặn origin bên ngoài. Không mở CORS tùy ý hoặc thay SMTP.

APK cuối: [app-debug.apk](../app/build/outputs/apk/debug/app-debug.apk), **88.971.497 byte**, SHA-256 `271EB35E703CCFF3C32C2996D08E181112F0595DFD345BAD217312588E9862DC`. Gradle offline đạt; [7/7 tệp game trong APK trùng SHA-256 với dist](../.tmp/gu-resource/apk-verification.json). Chạy lại bằng `powershell -File tools/verify-cotienlo-apk.ps1 -ReportPath .tmp/gu-resource/apk-verification.json`. Chưa kiểm thử cài trên điện thoại Android thật.
