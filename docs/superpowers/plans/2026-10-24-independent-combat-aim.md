# Kế hoạch ngắm và chạy độc lập

**Mục tiêu:** Chuột hoặc kéo trên nút chọn hướng chiêu riêng, trong khi cần chạy và lướt giữ đúng hướng di chuyển.
**Thiết kế:** [Ngắm chiêu độc lập](../specs/2026-10-24-independent-combat-aim-design.md).
**Công nghệ:** TypeScript, canvas, Pointer Events, Vitest; không thêm dependency.

## Việc thực hiện

- [x] Viết hồi quy runtime cho chạy sang phải/bắn sang trái, cả Công kích và Nguyệt Quang/Nguyệt Nhận; thấy thất bại vì vẫn dùng `facingAngle`.
- [x] Tách `CombatAimInput` quản lý chuột, ngón kéo, chạm nhanh, hủy và chặn click lặp; kiểm thử trước/sau khi triển khai.
- [x] Nối cả hai kiểu bắn với góc ngắm; thêm K cho kỹ năng, nhấp trái đánh thường, hiển thị hướng và cập nhật hướng dẫn.
- [x] Kiểm tra bắn không đổi di chuyển/lướt, không vượt kiểm tra sống/modal/Cổ/MP/hồi chiêu; nhiều ngón không cướp cần chạy.
- [x] Rà soát độc lập; chạy toàn bộ Vitest, build web/Android và Chrome thật trên chuột và cảm ứng hai ngón.
- [x] Build APK và đối chiếu tài nguyên; cập nhật README/kết quả kiểm tra.

Các tệp liên quan: tạo `src/engine/CombatAimInput.ts`, `tests/combat-aim-input.test.ts`, `tests/combat-aim-runtime.test.ts`; sửa `src/main.ts`, `index.html`, hướng dẫn và CSS nút. Dự án không có Git; giữ bản sao mốc trong `.tmp/combat-aim/baseline`.

Trọng tâm kiểm tra: click sau pointerup không bắn hai lần; ngón cần chạy khác ngón ngắm; hủy không bắn; pointer trên HUD không đổi ngắm; lướt không đi theo chuột.
