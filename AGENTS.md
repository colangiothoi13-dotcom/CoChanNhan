# AGENTS

## Cổ Tiên Lộ — luật game cần đọc trước khi sửa

Đọc [thiết lập tu vi 1–9, cuộc đời mới và thế giới chung](docs/THIET_LAP_TU_VI_1_DEN_9.md) trước khi sửa `cotienlo-game`. Đời mới không có Cổ; sở hữu Cổ và quyền sử dụng là hai trạng thái khác nhau. Hệ số cân bằng và các kỹ năng phóng tác phải được ghi rõ là quy ước game. Điều kiện cửu chuyển chưa đối chiếu trong phạm vi đến đại chiến Nghĩa Thiên lần thứ nhất được khóa mặc định, không tự bổ sung như luật nguyên tác. Cập nhật trạng thái triển khai và kết quả kiểm tra trong tài liệu khi thay đổi hệ thống.

Khi làm tài nguyên, tìm/bắt Cổ, luyện hóa, quyền cho mượn/chuyển giao, nuôi dưỡng, luyện chế, sản xuất hoặc giao dịch, đọc thêm [yêu cầu vòng đời Cổ và tài nguyên](docs/TAI_NGUYEN_BAT_CO_LUYEN_HOA_NUOI_CO_LUYEN_CHE.md). Đây là tài liệu yêu cầu, không phải xác nhận toàn bộ tính năng đã triển khai. Giữ riêng việc bắt/giữ thân Cổ, quyền điều khiển, quyền sử dụng, lịch ăn và trạng thái luyện chế; mọi thay đổi dữ liệu cần bảo toàn cá thể và tính duy nhất Tiên Cổ trong thế giới chung.

Mục 13 của tài liệu tài nguyên ghi trạng thái triển khai và kiểm tra hiện hành. Không khôi phục đường hợp luyện tức thời cũ trên máy chủ để bỏ qua cá thể/nguyên liệu/khóa; không đặt lại lịch ăn khi chuyển kho hoặc giao dịch. Snapshot công khai phải giấu thông tin chủ Tiên Cổ mà nhân vật chưa có căn cứ biết.

<skills_system priority="1">

## Available Skills

<!-- SKILLS_TABLE_START -->
<usage>
When users ask you to perform tasks, check if any of the available skills below can help complete the task more effectively. Skills provide specialized capabilities and domain knowledge.

How to use skills:
- Invoke: `npx openskills read <skill-name>` (run in your shell)
  - For multiple: `npx openskills read skill-one,skill-two`
- The skill content will load with detailed instructions on how to complete the task
- Base directory provided in output for resolving bundled resources (references/, scripts/, assets/)

Usage notes:
- Only use skills listed in <available_skills> below
- Do not invoke a skill that is already loaded in your context
- Each skill invocation is stateless
</usage>

<available_skills>

<skill>
<name>banner-design</name>
<description>"Design banners for social media, ads, website heroes, creative assets, and print. Multiple art direction options with optional generated or supplied visuals. Actions: design, create, generate banner. Platforms: Facebook, Twitter/X, LinkedIn, YouTube, Instagram, Google Display, website hero, print. Styles: minimalist, gradient, bold typography, photo-based, illustrated, geometric, retro, glassmorphism, 3D, neon, duotone, editorial, collage."</description>
<location>global</location>
</skill>

<skill>
<name>brand</name>
<description>Brand voice, visual identity, messaging frameworks, asset management, brand consistency. Activate for branded content, tone of voice, marketing assets, brand compliance, style guides.</description>
<location>global</location>
</skill>

<skill>
<name>design</name>
<description>"Comprehensive design skill: brand identity, design tokens, UI styling, logo generation (55 styles, Gemini, Atlas Cloud, or MuAPI AI), corporate identity program (50 deliverables, CIP mockups), HTML presentations (Chart.js), banner design (22 styles, social/ads/web/print), icon design (15 styles, SVG, Gemini 3.1 Pro), social photos (HTML→screenshot, multi-platform). Actions: design logo, create CIP, generate mockups, build slides, design banner, generate icon, create social photos, social media images, brand identity, design system. Platforms: Facebook, Twitter, LinkedIn, YouTube, Instagram, Pinterest, TikTok, Threads, Google Ads."</description>
<location>global</location>
</skill>

<skill>
<name>design-system</name>
<description>Token architecture, component specifications, and slide generation. Three-layer tokens (primitive→semantic→component), CSS variables, spacing/typography scales, component specs, strategic slide creation. Use for design tokens, systematic design, brand-compliant presentations.</description>
<location>global</location>
</skill>

<skill>
<name>slides</name>
<description>Create strategic HTML presentations with Chart.js, design tokens, responsive layouts, copywriting formulas, and contextual slide strategies.</description>
<location>global</location>
</skill>

<skill>
<name>ui-styling</name>
<description>Create beautiful, accessible user interfaces with shadcn/ui components (built on Radix UI + Tailwind), Tailwind CSS utility-first styling, and canvas-based visual designs. Use when building user interfaces, implementing design systems, creating responsive layouts, adding accessible components (dialogs, dropdowns, forms, tables), customizing themes and colors, implementing dark mode, generating visual designs and posters, or establishing consistent styling patterns across applications.</description>
<location>global</location>
</skill>

<skill>
<name>ui-ux-pro-max</name>
<description>"UI/UX design intelligence for web, mobile, and desktop. This skill should be used when designing, building, reviewing, or fixing interfaces, including pages, components, design systems, accessibility, interaction, responsive layout, typography, color, charts, and stack-specific UI implementation. Searchable local data: 79 searchable styles (50 active), 192 product palettes and reasoning profiles, 74 font pairings, 119 UX guidelines, 105 icons, 17 GSAP presets, 25 chart types, and 22 stacks."</description>
<location>global</location>
</skill>

</available_skills>
<!-- SKILLS_TABLE_END -->

</skills_system>
