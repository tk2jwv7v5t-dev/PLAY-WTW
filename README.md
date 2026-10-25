# PLAY WTW — Play with me and talk with me

My website is a place where you gather with your friends in a room, show them your screen, write to them and talk with them.

موقع مثل الديسكورد: تسجيل دخول، قروبات، رومات كتابية وصوتية، وبث شاشة لين 4K.

## المميزات
- **شاشة افتتاحية تفاعلية:** "PLAY WTW" تنفك وتصير "PLAY WITH ME AND TALK WITH ME"
- **حسابات:** تسجيل دخول باسم مستخدم وكلمة مرور (مشفّرة بـ PBKDF2)، وجلسة 30 يوم
- **قروبات:** كل واحد يسوي قروبه، ويدعو أصحابه برابط دعوة
- **رومات كتابية:** الرسايل تنحفظ، وفيه "فلان يكتب…" وتنبيه للرسايل الجديدة
- **رومات صوتية:** تشوف مين داخل كل روم من القائمة، ومين يتكلم
- **عزل ضوضاء بالذكاء الاصطناعي** (RNNoise و GTCRN) + حساسية مايك مثل الديسكورد
- **بث الشاشة** لين 4K وبين 15 و144 فريم، أكثر من شخص يقدر يبث بنفس الوقت
- يشتغل على الجوال والكمبيوتر

## الملفات
- `public/` — الواجهة (`index.html`، `style.css`، `js/`)
- `public/vendor/nsp/` — مكتبة عزل الضوضاء ([@sapphi-red/web-noise-suppressor](https://github.com/sapphi-red/web-noise-suppressor)، رخصة MIT)
- `worker/index.js` — الباك إند: الحسابات والقروبات والرسايل والاتصال المباشر
- `wrangler.jsonc` — إعدادات Cloudflare

## التشغيل
الموقع يشتغل على Cloudflare Workers. كل ما ينرفع تعديل على `main`، Cloudflare ينشره لحاله.

للتجربة على جهازك:
```sh
npx wrangler dev
```

## ملاحظات
- البيانات (الحسابات والرسايل) محفوظة في Durable Object (قاعدة SQLite داخل Cloudflare).
- الصوت والبث مباشر بين الأجهزة. كل مشاهد ياخذ نسخة من البث، فسرعة الرفع المطلوبة = البت ريت × عدد المشاهدين.
- لو فيه شبكات ما تتصل ببعض، أضف سيرفر TURN في `ICE_SERVERS` داخل `public/js/voice.js`.
