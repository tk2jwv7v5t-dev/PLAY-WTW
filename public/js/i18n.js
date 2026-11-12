/* اللغة: عربي (الأصل) أو English.
   النصوص مكتوبة بالعربي في الصفحة والكود، ولما تكون اللغة إنجليزي نترجم أي نص يظهر في الصفحة
   (نص كامل، أو جملة فيها اسم أو رقم) من القاموس تحت. رسايل الناس وأسماءهم ما تنترجم. */

const AR = /[؀-ۿ]/;

export const LANG = (() => {
  try { const v = localStorage.getItem('lang'); if (v === 'en' || v === 'ar') return v; } catch { /* ممنوع التخزين */ }
  return 'ar';
})();
export const isEn = LANG === 'en';
export function setLang(l) {
  try { localStorage.setItem('lang', l); } catch { /* */ }
  location.reload();
}

/* ---------- نصوص كاملة ---------- */
const EN = {
  // عام
  'قروبات ورومات صوت وشات وبث شاشة لين 4K مع أصحابك.': 'Groups, voice and chat rooms, and up to 4K screen sharing with your friends.',
  'إظهار كلمة المرور': 'Show password', 'القروبات': 'Groups', 'سوّ قروب أو ادخل واحد': 'Create or join a group',
  'بلاغات الموقع (للمشرف)': 'Site reports (admin)', 'دوّر في رسايلك': 'Search your messages', 'دوّر في الرسايل الخاصة': 'Search direct messages',
  'رسالة جديدة': 'New message', 'بث الشاشة': 'Share screen', 'اطلع من الصوت': 'Leave voice', 'المايك (M)': 'Mic (M)', 'كتم الصوت (D)': 'Deafen (D)',
  'الإعدادات': 'Settings', 'رجوع': 'Back', 'الإشعارات': 'Notifications', 'الدعم الفني': 'Support', 'الأعضاء': 'Members', 'الرئيسية': 'Home',
  'اختر الشخص اللي تبي تنشنه': 'Pick who to mention', 'الصورة اللي بترسلها': 'Photo to send', 'شيل الصورة': 'Remove photo', 'ارسل صورة': 'Send a photo',
  'اكتب رسالة…': 'Write a message…', 'ارسال': 'Send', 'التحكم': 'Controls', 'المايك': 'Mic', 'كتم الصوت': 'Deafen', 'الشات': 'Chat',
  'افتح شات القروب': 'Open group chat', 'جودة البث': 'Stream quality', 'اقلب الكاميرا': 'Flip camera', 'حسابي': 'My account', 'التنقل': 'Navigation',
  'سكّر': 'Close', 'اختر صورة للقروب': 'Pick a group picture', 'مثال: شلة الويكند': 'e.g. Weekend squad', 'كلمة المرور': 'Password',
  'البت ريت بالميقابت': 'Bitrate in Mbps', 'حد فتح المايك بالديسيبل': 'Mic threshold in dB', 'اسم المستخدم': 'Username', 'عرض الصورة': 'View photo',
  // الشاشة الافتتاحية والدخول
  'سولف مع ربعك، العبوا سوا، وشارك شاشتك بجودة 4K': 'Hang out with friends, play together, and share your screen in 4K',
  'انتقل لتسجيل الدخول': 'Go to sign in', 'حرّك الماوس · اضغط على الشعار يعيد الحركة': 'Move your mouse · tap the logo to replay',
  'سهرتك مع ربعك': 'Your night with friends', 'تبدأ من هنا': 'starts here',
  'قروب لكم، رومات للسوالف واللعب، وشاشة تشاركها بضغطة.': 'A group for you, rooms to talk and play, and screen sharing in one tap.',
  'الديوانية': 'The Lounge', '4 داخل': '4 inside', 'تسجيل الدخول': 'Sign in', 'حساب جديد': 'Sign up', 'هلا بعودتك 👋': 'Welcome back 👋',
  'سجّل دخولك وكمّل سوالفك.': 'Sign in and pick up where you left off.', 'الاسم اللي يظهر للناس': 'Display name', '(اختياري، يقبل عربي)': '(optional)',
  'اسم المستخدم: 3–20 حرف إنجليزي صغير أو أرقام أو _ . — كلمة المرور 8 أحرف أو أكثر.': 'Username: 3–20 lowercase letters, numbers, _ or . — password: 8+ characters.',
  'دخول': 'Sign in', 'تحتاج مساعدة؟': 'Need help?', 'عندك دعوة لقروب 🎉 سوّ حساب أو سجّل دخولك عشان تدخل.': "You've been invited to a group 🎉 Sign up or sign in to join.",
  'حياك معنا ✨': 'Welcome ✨', 'سوّ حسابك بثواني.': 'Create your account in seconds.', 'سوّ الحساب': 'Create account',
  'اكتب اسم المستخدم وكلمة المرور': 'Enter your username and password', 'جاري الدخول…': 'Signing in…', 'جاري إنشاء الحساب…': 'Creating account…',
  'انطلعت من حسابك في هذا الجهاز. سجّل دخولك من جديد': 'You were signed out on this device. Please sign in again',
  // قائمة القروب
  'دعوة أصحابك': 'Invite friends', 'إشعارات القروب': 'Group notifications', 'البلاغات': 'Reports', 'روم كتابي جديد': 'New text room',
  'روم صوتي جديد': 'New voice room', 'تعديل القروب': 'Edit group', 'اطلع من القروب': 'Leave group', 'احذف القروب': 'Delete group',
  'متصل بالصوت': 'Voice connected', 'هلا فيك في PLAY WTW': 'Welcome to PLAY WTW',
  'سوّ قروب لك ولأصحابك، أو ادخل قروب بكود الدعوة.': 'Create a group for you and your friends, or join one with an invite code.',
  'سوّ قروب': 'Create group', 'ادخل بكود دعوة': 'Join with invite', 'رسالة خاصة': 'Direct message',
  'حظرت هالشخص، فما تقدر تراسله.': "You blocked this person, so you can't message them.", 'فك الحظر': 'Unblock',
  'صورة جاهزة للإرسال. تقدر تكتب معها رسالة.': 'Photo ready to send. You can add a message.', 'ادخل الروم الصوتي': 'Join voice room',
  'ارسل دعوة': 'Send invite', 'تحديد الكل كمقروء': 'Mark all as read', 'حسابي والصورة': 'Account & picture', 'الصوت والمايك': 'Voice & mic',
  'المظهر': 'Appearance', 'تسجيل الخروج': 'Sign out', 'أنت': 'You', 'قروب جديد': 'New group', 'ادخل بكود': 'Join with code', 'صورة القروب': 'Group picture',
  'من جهازك: PNG أو JPG أو WebP. بنقصّها مربعة لحالها.': "From your device: PNG, JPG or WebP. We'll crop it square.",
  'ارفع صورة': 'Upload picture', 'اسم القروب': 'Group name', 'سوّه': 'Create', 'كود الدعوة أو الرابط': 'Invite code or link', 'ادخل': 'Join',
  'روم جديد': 'New room', 'كتابي': 'Text', 'رسايل وصور وروابط': 'Messages, photos and links', 'صوتي': 'Voice', 'سوالف وبث شاشة': 'Talk and share screens',
  'اسم الروم': 'Room name', 'إلغاء': 'Cancel', 'سوّ الروم': 'Create room', 'حفظ': 'Save', 'ادعُ أصحابك': 'Invite friends',
  'ارسل لهم الرابط. لازم يكون عندهم حساب، وإذا ما عندهم يسوون واحد.': "Send them the link. They need an account — they can make one if they don't have it.",
  'نسخ': 'Copy', 'كود الدعوة:': 'Invite code:', 'تأكيد': 'Confirm',
  // جودة البث
  'جودة بث الشاشة': 'Screen share quality', 'إعدادات جاهزة': 'Presets', 'الدقة': 'Resolution', 'دقة شاشتي': 'My screen', 'الفريمات (FPS)': 'Frame rate (FPS)',
  'وش بتبث؟': 'What are you sharing?', 'نصوص وكود (أوضح)': 'Text and code (sharper)', 'متوازن': 'Balanced', 'ألعاب وأفلام (أنعم)': 'Games and movies (smoother)',
  'البت ريت': 'Bitrate', 'تلقائي حسب الدقة والفريمات': 'Auto, based on resolution and FPS', 'بث صوت الجهاز / التاب مع الشاشة': 'Share device / tab audio with the screen',
  'إذا البث يقطّع، نزّل الفريمات أو الدقة أو البت ريت. الدقة ما تطلع أعلى من دقة شاشتك.': "If the stream stutters, lower the FPS, resolution or bitrate. Resolution can't exceed your screen.",
  'ابدأ البث': 'Start sharing', 'موفّر': 'Saver', 'قيمرز': 'Gamers', 'طبّق على البث': 'Apply to stream',
  'تغيير صوت الجهاز يتطبق لما تعيد البث': 'Device audio changes apply when you restart the stream',
  // الإعدادات
  'المظهر والاختصارات': 'Appearance & shortcuts', 'السماعة': 'Speaker', 'عزل الضوضاء': 'Noise suppression', 'ذكاء اصطناعي قوي': 'AI (strong)',
  'ذكاء اصطناعي خفيف': 'AI (light)', 'المتصفح': 'Browser', 'مقفل': 'Off', 'حساسية المايك': 'Mic sensitivity', 'تحديد تلقائي': 'Automatic',
  'إذا الشريط تحت الخط الأبيض، صوتك ما يوصل. حرّك الخط لين ما يفتح المايك إلا وانت تتكلم.': "If the bar is below the white line, you won't be heard. Move the line so the mic opens only when you talk.",
  'مستوى المايك': 'Mic volume', 'مستوى الصوت': 'Output volume', 'منع الصدى': 'Echo cancellation', 'ضبط مستوى المايك تلقائياً': 'Automatic gain control',
  'جرّب المايك': 'Test mic', 'وقف التجربة': 'Stop test', 'تسمع صوتك بعد المعالجة. استخدم سماعة عشان ما يصير صدى.': "You'll hear yourself after processing. Use headphones to avoid echo.",
  'الاسم اللي يظهر': 'Display name', 'لون الصورة': 'Avatar color', 'تغيير كلمة المرور': 'Change password', 'كلمة المرور الحالية': 'Current password',
  'كلمة المرور الجديدة': 'New password', '8 أحرف أو أكثر. بعد التغيير بنطلّعك من أي جهاز ثاني مسجّل فيه.': "8+ characters. We'll sign you out on every other device.",
  'غيّر كلمة المرور': 'Change password', 'حذف الحساب': 'Delete account', 'إشعارات والموقع مسكّر': 'Notifications while closed',
  'فعّلها على هذا الجهاز': 'Turn on for this device',
  'توصلك على الجوال أو الكمبيوتر حتى لو الموقع مسكّر. الإشعارات مشفّرة، ما يقراها إلا جهازك.': 'Arrive on your phone or computer even when the site is closed. Encrypted so only your device can read them.',
  'في الآيفون والآيباد:': 'On iPhone and iPad:', 'افتح الموقع في سفاري.': 'Open the site in Safari.', 'اضغط زر المشاركة': 'Tap the Share button',
  'تحت.': 'at the bottom.', 'اختر': 'Choose', '"إضافة إلى الشاشة الرئيسية"': '"Add to Home Screen"',
  'افتح PLAY WTW من الأيقونة الجديدة، وفعّل الإشعارات من هنا.': 'Open PLAY WTW from the new icon and turn on notifications here.',
  'جرّب إشعار': 'Send test', 'والموقع مفتوح': 'While the site is open', 'أصوات التنبيه (دخول وطلوع ورسايل)': 'Sounds (join, leave, messages)',
  'إشعار لما توصل رسالة وانا في تاب ثاني': "Notify me when I'm in another tab", 'حتى لو الموقع مفتوح قدامي': 'Even when the site is in front of me',
  'إشعار لما توصل رسالة والتطبيق بالخلفية': 'Notify me when the app is in the background',
  'تقدر تختار لكل قروب: كل الرسايل، أو المنشن بس، أو بدون. من قائمة القروب ← إشعارات القروب.': 'Choose per group: all messages, mentions only, or nothing — from the group menu → Group notifications.',
  'الشكل': 'Theme', 'زجاجي فاتح': 'Light glass', 'داكن': 'Dark', 'اللغة': 'Language', 'حجم الخط': 'Text size', 'صغير': 'Small', 'عادي': 'Normal', 'كبير': 'Large',
  'تقليل الحركة (بدون أنيميشن)': 'Reduce motion (no animations)', 'اضغط عشان تتكلم': 'Push to talk', 'المايك ما يفتح إلا وانت ضاغط زر': 'Mic only opens while you hold a key',
  'الزر': 'Key', 'اضغط عليه ثم اضغط الزر اللي تبيه': 'Click it, then press the key you want', 'للكمبيوتر. يشتغل لما تكون داخل الموقع.': 'Desktop only. Works while the site is focused.',
  'الاختصارات': 'Shortcuts', 'فتح وقفل المايك': 'Toggle mic', 'سكّر النوافذ وملء الشاشة': 'Close windows and full screen', 'ارسال الرسالة': 'Send message',
  'سطر جديد في الرسالة': 'New line', 'اضغط الزر…': 'Press a key…', 'الافتراضي': 'Default',
  'المايك مطفي الحين. اضغط "جرّب المايك" تحت عشان تسمع صوتك وتشوف مستواه.': 'The mic is off. Press "Test mic" below to hear yourself and see the level.',
  'أقوى عزل: يشيل المكيف والكيبورد والأصوات اللي حولك. ياخذ معالج أكثر شوي.': 'Strongest: removes AC, keyboard and background noise. Uses a bit more CPU.',
  'عزل ممتاز وخفيف على الجهاز. أنسب خيار لأغلب الناس.': 'Great and lightweight. Best for most people.',
  'العزل المدمج في المتصفح. أضعف من الذكاء الاصطناعي.': "The browser's built-in suppression. Weaker than AI.",
  'بدون عزل. استخدمه لو مايكك احترافي أو تبي تبث موسيقى.': 'No suppression. Use it with a pro mic or for music.',
  'ما قدرنا نشغل المايك بهذي الإعدادات': "Couldn't start the mic with these settings",
  'الجوال منع الإشعارات. فعّلها من إعدادات الآيفون ← PLAY WTW ← الإشعارات.': 'Notifications are blocked. Enable them in iPhone Settings → PLAY WTW → Notifications.',
  'المتصفح منع الإشعارات. اسمح لها من أيقونة القفل جنب رابط الموقع.': 'The browser blocked notifications. Allow them from the lock icon next to the address.',
  'المتصفح منع المايك. اسمح له من أيقونة القفل جنب رابط الموقع': 'The browser blocked the mic. Allow it from the lock icon next to the address',
  'ما قدرنا نشغّل المايك': "Couldn't start the mic", 'اكتب كلمة المرور الحالية': 'Enter your current password',
  'كلمة المرور الجديدة نفس الحالية': 'The new password is the same as the current one', 'جاري الحفظ…': 'Saving…',
  'تغيّرت كلمة المرور. وطلّعناك من أي جهاز ثاني كان مسجّل': 'Password changed. You were signed out on other devices',
  'تحذف حسابك؟': 'Delete your account?',
  'بينحذف حسابك ورسايلك والقروبات اللي سويتها، وتطلع من باقي القروبات. ما تقدر ترجعه. اكتب كلمة المرور للتأكيد.': "Your account, messages and the groups you created will be deleted, and you'll leave other groups. This can't be undone. Enter your password to confirm.",
  'احذف حسابي نهائياً': 'Delete my account forever', 'انحفظ ✅': 'Saved ✅',
  // مركز المساعدة
  'حلول أكثر المشاكل اللي تصير. اضغط على السؤال يطلع لك الحل.': 'Fixes for the most common problems. Tap a question to see the answer.',
  'خويي ما يسمعني': "My friend can't hear me", 'تأكد إن المايك مو مقفول (زر المايك تحت مو أحمر).': "Make sure your mic isn't muted (the mic button isn't red).",
  'افتح': 'Open', 'الإعدادات ← الصوت والمايك': 'Settings → Voice & mic', 'واضغط': 'and press', '. إذا ما سمعت نفسك، غيّر المايك من القائمة.': ". If you can't hear yourself, pick another mic.",
  'شوف شريط': 'Check the', ': لازم يصير أخضر وانت تتكلم. إذا ما وصل، حرّك الخط الأبيض لليسار.': ' bar: it should turn green when you talk. If not, move the white line left.',
  'إذا المتصفح منع المايك: اضغط أيقونة القفل جنب رابط الموقع واسمح للمايك، وحدّث الصفحة.': 'If the browser blocked the mic: tap the lock icon next to the address, allow the mic, and reload.',
  'ما أسمع أحد': "I can't hear anyone", 'تأكد إن زر السماعة تحت مو أحمر (كتم الصوت).': "Make sure the headphones button isn't red (deafened).",
  'اضغط على الشخص في الروم وشيّك إن صوته مو مكتوم عندك ومو على 0%.': "Tap the person in the room and check they aren't muted for you or at 0%.",
  'جرّب تغيّر السماعة من': 'Try another speaker in', 'اضغط أي مكان في الصفحة، بعض المتصفحات ما تشغل الصوت إلا بعد ضغطة.': "Tap anywhere on the page — some browsers won't play audio until you do.",
  'ندخل نفس الروم بس ما نسمع بعض أبد': "We're in the same room but can't hear each other",
  'غالباً واحد منكم على شبكة تمنع الاتصال المباشر (كثير منها بيانات الجوال). جرّبوا الواي فاي. وإذا المشكلة تتكرر، صاحب الموقع يقدر يفعّل سيرفر TURN اللي يحلها.': "One of you is probably on a network that blocks direct connections (often mobile data). Try Wi‑Fi. If it keeps happening, the site owner can enable a TURN server.",
  'الصوت يتقطع أو فيه تأخير': 'Audio cuts out or lags', 'إذا أحد يبث شاشة، خلّ الجودة عندك': "If someone is sharing, set your quality to", 'أو': 'or',
  'من زر الجودة على البث.': 'from the quality button on the stream.', 'اللي يبث: نزّل الفريمات أو الدقة من': 'The sharer: lower FPS or resolution in',
  'سكّر البرامج اللي تسحب نت (تحميل، تحديثات).': 'Close apps using bandwidth (downloads, updates).', 'صوت الكيبورد أو المكيف يوصل لهم': 'They hear my keyboard or AC',
  'من': 'from', 'خلّ عزل الضوضاء على': 'Set noise suppression to', '. وإذا تبي المايك ما يفتح أبد إلا وانت تبيه، فعّل': '. To open the mic only when you want, turn on',
  'من تبويب المظهر والاختصارات.': 'in the Appearance & shortcuts tab.', 'ما أقدر أبث شاشتي من الجوال': "I can't share my screen from my phone",
  'متصفحات الجوال ما تسمح ببث الشاشة. تقدر تتفرج على بث غيرك وتكبّره بإصبعين، بس البث نفسه لازم يكون من كمبيوتر (كروم أو إيدج أو فايرفوكس).': "Mobile browsers don't allow screen sharing. You can share your camera instead, and watch others' streams and pinch to zoom.",
  'البث يطلع أسود أو ما يبان': 'The stream is black or not showing',
  'بعض التطبيقات (مثل نتفلكس) تمنع تصوير شاشتها. وفي الماك لازم تسمح للمتصفح من': 'Some apps (like Netflix) block screen capture. On Mac, allow your browser in',
  'إعدادات النظام ← الخصوصية ← تسجيل الشاشة': 'System Settings → Privacy → Screen Recording', 'نسيت كلمة المرور': 'Forgot password',
  'للحين ما فيه استرجاع تلقائي لأن التسجيل بدون إيميل. تواصل مع الدعم تحت. وإذا انت داخل حسابك، تقدر تغيّرها من': "There's no automatic reset since sign-up has no email. Contact support below. If you're signed in, change it in",
  'الإعدادات ← حسابي': 'Settings → My account', 'ما لقيت الحل؟': "Didn't find a fix?", 'تواصل معنا واشرح المشكلة، ويفضّل ترسل صورة للشاشة.': 'Contact us and describe the problem — a screenshot helps.',
  'راسلنا على X': 'Message us on X', 'راسلنا على الإيميل': 'Email us', 'راسل الدعم الفني هنا في الموقع': 'Message support here', 'مشكلة في PLAY WTW': 'Problem with PLAY WTW',
  // البلاغات
  'بلّغ عن الرسالة': 'Report message', 'وش المشكلة؟': "What's wrong?", 'سبام': 'Spam', 'رسايل مكررة أو إعلانات': 'Repeated messages or ads',
  'إزعاج أو تنمّر': 'Harassment or bullying', 'سب، تهديد، أو مضايقة': 'Insults, threats or harassment', 'محتوى غير لائق': 'Inappropriate content',
  'صور أو كلام ما يناسب': 'Inappropriate images or words', 'سبب ثاني': 'Something else', 'اكتبه تحت': 'Describe it below', 'تفاصيل': 'Details', '(اختياري)': '(optional)',
  'واحظره عشان ما يرسل لي': "and block them so they can't message me", 'ارسل البلاغ': 'Send report',
  'رسايل بلّغ عنها أعضاء القروب. انت تقرر: تحذف الرسالة، أو تحذفها وتطرد صاحبها، أو تتجاهل البلاغ.': 'Messages reported by group members. You decide: delete it, delete and ban the sender, or dismiss.',
  'إدارة الموقع': 'Site admin', 'الحسابات الموقوفة': 'Suspended accounts',
  'كل البلاغات من القروبات والرسائل الخاصة. تشوف الرسالة اللي انبلّغ عنها بس، مو المحادثة كاملة.': 'All reports from groups and DMs. You only see the reported message, not the whole conversation.',
  'الحساب الموقوف ما يقدر يسجّل دخول. لو أوقفت أحد بالغلط، رجّعه من هنا.': "Suspended accounts can't sign in. Restore anyone suspended by mistake here.",
  'رسالة خاصة جديدة': 'New direct message', 'ابدأ': 'Start', 'افتحها كاملة': 'Open full size', 'البلاغ ينحفظ عندنا. والحظر يمنعه يرسل لك.': "We keep the report. Blocking stops them messaging you.",
  'وصل بلاغك، وحظرناه عنك': 'Report sent, and they are blocked', 'وصل بلاغك': 'Report sent', 'وصل بلاغك لصاحب القروب. شكراً إنك تساعد': 'Report sent to the group owner. Thanks for helping',
  'تطرده من القروب؟': 'Ban them from the group?', 'بتنحذف رسالته، ويطلع من القروب وما يقدر يرجع حتى برابط الدعوة.': "Their message is deleted and they're removed — they can't rejoin even with an invite.",
  'اطرده': 'Ban', 'تجاهلنا البلاغ': 'Report dismissed', 'انحذفت الرسالة': 'Message deleted', 'انحذفت الرسالة وانطرد من القروب': 'Message deleted and user banned',
  'احذفها واطرده': 'Delete and ban', 'ما فيه بلاغات مفتوحة 👍': 'No open reports 👍', 'الرسالة انحذفت.': 'The message was deleted.',
  'احذفها وأوقف الحساب': 'Delete and suspend', 'ما فيه حسابات موقوفة.': 'No suspended accounts.', 'رجع الحساب، يقدر يسجّل دخول': 'Account restored, they can sign in',
  'توقف الحساب؟': 'Suspend this account?', 'بتنحذف الرسالة، ويطلع من الموقع وما يقدر يسجّل دخول لين ترجّعه.': "The message is deleted and they can't sign in until you restore them.",
  'أوقف الحساب': 'Suspend', 'انحذفت الرسالة وانوقف الحساب': 'Message deleted and account suspended', 'تجاهل': 'Dismiss', 'احذف الرسالة': 'Delete message',
  'اكتب اسم المستخدم حق الشخص اللي تبي تراسله.': 'Enter the username of the person you want to message.', 'اكتب اسم المستخدم': 'Enter a username', 'جاري البحث…': 'Searching…',
  // الشريط الجانبي والقوائم
  'الرسائل': 'Messages', 'الرومات الكتابية': 'Text rooms', 'الرومات الصوتية': 'Voice rooms', 'في روم صوتي الحين': 'In voice now', 'ابدأ السوالف': 'Say hi',
  'حساب موثّق — الدعم الفني لـ PLAY WTW': 'Verified — PLAY WTW Support', 'موثّق': 'Verified', 'الدعم الفني · راسلنا لأي مشكلة أو اقتراح': 'Support · message us about any issue or idea',
  'رسمي': 'Official', 'رسايل جديدة': 'New messages', 'ما عندك رسايل خاصة للحين.': 'No direct messages yet.', 'ابدأ محادثة': 'Start a chat',
  'الرسائل الخاصة': 'Direct messages', 'منشن': 'mention', 'احذف الروم': 'Delete room', 'مكتوم عندك': 'Muted for you', 'روم صوتي': 'Voice room',
  'صاحب القروب': 'Group owner', 'اقفل المايك': 'Mute mic', 'افتح المايك': 'Unmute mic', 'رجّع الصوت': 'Undeafen', 'اكتم الصوت': 'Deafen',
  'وقف البث': 'Stop sharing', 'بث الكاميرا': 'Share camera', 'بث الشاشة أو الكاميرا': 'Share screen or camera', '📷 صورة': '📷 Photo',
  'هذي بداية الروم. ابدأ السالفة!': "This is the start of the room. Say something!", 'رسايل أقدم': 'Older messages', 'خيارات الرسالة': 'Message options',
  'يكتبون': 'are typing', 'يكتب': 'is typing', 'متصل': 'Online', 'غير متصل': 'Offline', 'المايك شغال': 'Mic on', 'المايك مقفل': 'Mic off',
  'الصوت مكتوم': 'Deafened', 'الصوت شغال': 'Sound on', 'العام': 'general', 'الصوتي': 'Voice',
  // المكالمات والبث
  'عزل الضوضاء بالذكاء الاصطناعي ما اشتغل على جهازك — جرّب نوع ثاني من الإعدادات': "AI noise suppression didn't work on your device — try another type in settings",
  'المتصفح منع المايك — اسمح له من أيقونة القفل جنب الرابط': 'The browser blocked the mic — allow it from the lock icon',
  'ما قدرنا نشغل المايك — تقدر تسمع بس': "Couldn't start the mic — you can listen only", 'اضغط في أي مكان عشان يشتغل الصوت 🔊': 'Tap anywhere to enable sound 🔊',
  'ما قدرنا نوصل للمايك — اسمح له من إعدادات المتصفح': "Couldn't access the mic — allow it in browser settings", 'ما فيه أحد للحين — كن أول واحد': 'Nobody here yet — be the first',
  'انتقل لهذا الروم': 'Switch to this room', 'كاميرتك': 'Your camera', 'شاشتك': 'Your screen', 'شخص': 'person', 'أشخاص': 'people', 'يبث كاميرته': 'is sharing camera', 'يبث': 'is sharing',
  'مستوى صوته عندك': 'Their volume for you', '(أنت)': '(you)', 'رجّع الحجم': 'Reset zoom', 'صوت البث': 'Stream audio', 'مستوى صوت البث': 'Stream volume',
  'جودة البث عندك': 'Your stream quality', 'صورة داخل صورة': 'Picture in picture', 'الإحصائيات': 'Stats', 'تكبير': 'Focus', 'ملء الشاشة': 'Full screen',
  'اطلع من ملء الشاشة': 'Exit full screen', 'تلقائي': 'Auto', 'بدون صورة': 'Audio only', 'المتصفح يضبطها حسب نتك': 'Adjusts to your connection',
  'أخف على النت': 'Lighter on data', 'لبيانات الجوال': 'For mobile data', 'تسمع صوت البث بس': 'Hear the stream audio only',
  'الصورة موقفة عندك — تسمع صوت البث بس': 'Video off for you — audio only',
  'ما قدرنا نفتح صورة داخل صورة — جرّب كروم أو إيدج أو سفاري': "Couldn't open picture-in-picture — try Chrome, Edge or Safari",
  'ادخل روم صوتي أول عشان تبث': 'Join a voice room first to share', 'وش تبي تبث؟': 'What do you want to share?', 'شاشة الجوال': 'Phone screen',
  'كل اللي قدامك على الشاشة': "Everything on your screen", 'الكاميرا الخلفية': 'Back camera', 'اللي قدامك، مثل التصوير': "What's in front of you", 'الكاميرا الأمامية': 'Front camera', 'وجهك': 'Your face',
  'متصفحات الآيفون وأغلب الجوالات ما تسمح للمواقع تبث الشاشة، فتقدر تبث الكاميرا بدالها.': "iPhone and most phone browsers don't let websites share the screen, so you can share your camera instead.",
  'متصفحك ما يدعم البث. جرّب كروم أو سفاري بآخر تحديث.': "Your browser doesn't support sharing. Try the latest Chrome or Safari.",
  'لازم تسمح للموقع يستخدم الكاميرا من إعدادات المتصفح': 'Allow camera access in your browser settings', 'ما لقينا كاميرا في جهازك': 'No camera found on your device',
  'ما قدرنا نقلب الكاميرا': "Couldn't flip the camera", 'جهازك فيه كاميرا وحدة بس': 'Your device has only one camera', 'بدأ البث': 'Sharing started',
  'جهازك أو متصفحك ما يدعم بث الشاشة — جرّب كروم أو إيدج على الكمبيوتر': "Your device or browser can't share the screen — try Chrome or Edge on a computer",
  '⚠ محدود بالنت': '⚠ Limited by network', '⚠ محدود بالمعالج': '⚠ Limited by CPU', 'ارسل دعوة ': 'Send invite',
  // القروبات والرومات
  'اكتب كود الدعوة أو الصق الرابط': 'Enter the invite code or paste the link', 'تقدر ترجع بعدين برابط دعوة.': 'You can come back later with an invite link.', 'اطلع': 'Leave',
  'كل الرومات والرسايل بتنحذف للأبد، وما تقدر ترجعها.': "All rooms and messages will be deleted forever. This can't be undone.", 'احذف': 'Delete',
  'انسخ الرابط ✅': 'Link copied ✅', 'جاري الإنشاء…': 'Creating…', 'الروم الصوتي': 'voice room', 'الروم': 'room', 'كل رسايل الروم بتنحذف.': 'All messages in this room will be deleted.',
  'اللي فيه بيطلعون منه.': "Everyone in it will be disconnected.", 'ما فيه روم كتابي في هالقروب': 'This group has no text room', 'كل الرسايل': 'All messages',
  'إشعار لكل رسالة جديدة': 'Notify for every new message', 'المنشن بس': 'Mentions only', 'بس لما أحد يكتب @اسمك': 'Only when someone writes @you', 'بدون': 'Nothing',
  'ما يجيك ولا إشعار من هالقروب': 'No notifications from this group', 'هالروم أو القروب انحذف': 'That room or group was deleted',
  // إشعارات الجهاز
  'إشعارات الجوال داخل التطبيق جاية في تحديث قادم. الرسايل توصلك وانت فاتح التطبيق.': "Phone notifications while closed are coming in a future update. Messages arrive while the app is open.",
  'تمام! بتوصلك الإشعارات على هذا الجهاز حتى لو الموقع مسكّر': "Done! You'll get notifications on this device even when the site is closed",
  'وقّفنا الإشعارات على هذا الجهاز': 'Notifications turned off on this device', 'جاري الإرسال…': 'Sending…',
  'خدمة الإشعارات استلمت الإشعار التجريبي، المفروض يطلع لك خلال ثواني': 'The push service accepted the test — it should appear in a few seconds',
  'جددنا اشتراك الإشعارات وأرسلنا إشعار تجريبي': 'Renewed your subscription and sent a test', 'السيرفر ما قدر يوصل لخدمة الإشعارات': "The server couldn't reach the push service",
  'خدمة الإشعارات رفضت الطلب': 'The push service rejected the request', 'خدمة الإشعارات رفضت توقيع الموقع': "The push service rejected the site's signature",
  'الإشعار كبير': 'The notification is too large', 'خدمة الإشعارات طلبت نخفف الإرسال، جرّب بعد شوي': 'The push service asked us to slow down — try again soon',
  'خدمة الإشعارات ردت بخطأ': 'The push service returned an error', 'عدم الإزعاج': 'Do Not Disturb', 'ما عندك إشعارات للحين': 'No notifications yet',
  'ما عندك إشعارات للحين. المنشن ومين دخل قروبك ومين يبث، كلها تطلع هنا.': 'No notifications yet. Mentions, new members and live streams show up here.',
  'المنشن ومين دخل قروبك ومين يبث، كلها تطلع هنا.': 'Mentions, new members and live streams show up here.',
  'متصفحك ما يدعم الإشعارات. في الآيفون: أضف الموقع للشاشة الرئيسية أول.': "Your browser doesn't support notifications. On iPhone, add the site to your Home Screen first.",
  // الرسايل
  'انسخ النص': 'Copy text', 'انسخ النص ✅': 'Text copied ✅', 'ما قدرنا ننسخ': "Couldn't copy", 'تحذف الرسالة؟': 'Delete this message?',
  'بتنحذف عند الكل.': "It'll be deleted for everyone.", 'بتنحذف عند الكل، لأنك صاحب القروب.': "It'll be deleted for everyone, since you own the group.",
  'افتح الصورة': 'Open photo', 'صورة': 'Photo', 'منشنك': 'mentioned you', 'خاصة': 'in a DM', 'في': 'in', 'و': 'and',
  // الرئيسية
  'سهرانين الليلة': 'Up late tonight', 'صباح الخير': 'Good morning', 'مساء الخير': 'Good evening', 'رسالة خاصة جديدة': 'new direct message',
  'رسالتين خاصة': '2 direct messages', 'رسايل خاصة جديدة': 'new direct messages', 'منشن ما شفته': 'unread mention', 'منشنين ما شفتهم': '2 unread mentions',
  'منشنات ما شفتها': 'unread mentions', 'كل شي مقري. وش ناوي تسوي الحين؟': "You're all caught up. What's next?",
  'خلّنا نبدأ: سوّ قروب لك ولأصحابك، أو ادخل واحد بكود دعوة.': "Let's start: create a group for you and your friends, or join one with an invite code.",
  'ادخل أول قروب': 'Join your first group', 'ادعُ أصحابك للقروب': 'Invite friends to your group', 'فعّل الإشعارات': 'Turn on notifications',
  'مكان لك ولأصحابك': 'A place for you and your friends', 'عندك رابط أو كود دعوة': 'Got a link or invite code', 'كلّم أحد على انفراد': 'Talk to someone privately',
  'جهّز المايك': 'Set up your mic', 'اختبر صوتك وعزل الضوضاء': 'Test your voice and noise suppression', 'خلّنا نجهّزك': "Let's get you set up",
  'ما أحتاجها': "Don't need this", 'شغّال الحين': 'Live now', 'مباشر': 'Live', 'انت فيه': "You're here", 'شخص واحد': 'one person', 'شخصين': 'two people',
  'رومات صوتية': 'voice rooms', 'ما أحد في روم صوتي الحين. ادخل واحد وخلّهم يلحقونك 🎧': 'Nobody is in voice right now. Join one and they\'ll follow 🎧',
  'ما عندك قروبات للحين. اضغط "سوّ قروب" فوق.': 'No groups yet. Press "Create group" above.', 'يحتاج انتباهك': 'Needs your attention',
  'ارسل له رسالة': 'Send a message', 'متصلين الحين': 'Online now', 'ما أحد من قروباتك متصل الحين.': 'Nobody from your groups is online right now.',
  'ما عندك محادثات خاصة للحين.': 'No direct chats yet.', 'تقدر تلقى كل هذي من الأزرار فوق': 'You can find all of these from the buttons above',
  'قروباتك': 'Your groups', 'آخر المحادثات': 'Recent chats', 'الحين': 'now', 'أمس': 'yesterday', 'يومين': '2 days', 'أسبوع': '1 week', 'أسبوعين': '2 weeks',
  'شهر': '1 month', 'جديدة': 'new', '؟': '?', 'شهرين': '2 months', 'سنة': '1 year', 'اليوم': 'Today',
  // الأخطاء
  'اسم المستخدم لازم يكون 3–20 حرف إنجليزي صغير أو أرقام أو _ .': 'Username must be 3–20 lowercase letters, numbers, _ or .',
  'كلمة المرور لازم تكون 8 أحرف أو أكثر': 'Password must be at least 8 characters', 'اسم المستخدم محجوز، جرّب غيره': 'That username is taken, try another',
  'اسم المستخدم أو كلمة المرور غلط': 'Wrong username or password', 'كلمة المرور غلط': 'Wrong password',
  'الملف مو صورة، أو نوعه ما ينقبل. جرّب PNG أو JPG': "That file isn't a supported image. Try PNG or JPG", 'الصورة كبيرة، جرّب صورة ثانية': 'The image is too large, try another',
  'محاولات كثير — انتظر شوي وجرّب': 'Too many attempts — wait a bit and try again', 'كود الدعوة غلط أو القروب انحذف': 'Invalid invite code, or the group was deleted',
  'اكتب اسم': 'Enter a name', 'هالاسم محجوز لحساب الدعم الفني، اختر اسم ثاني.': 'That name is reserved for the support account. Pick another.',
  'وصلت الحد الأعلى للقروبات اللي تقدر تسويها': "You've reached the maximum number of groups", 'القروب وصل الحد الأعلى للرومات': 'This group has the maximum number of rooms',
  'انت صاحب القروب — تقدر تحذفه بدل ما تطلع': 'You own this group — delete it instead of leaving', 'ما عندك صلاحية': "You don't have permission",
  'شوي شوي 😅 انتظر ثواني': 'Slow down 😅 wait a few seconds', 'صار خطأ في السيرفر، جرّب مرة ثانية بعد شوي': 'Server error, please try again shortly',
  'ما قدرنا نوصل للسيرفر. تأكد من اتصالك بالنت وجرّب مرة ثانية': "Couldn't reach the server. Check your connection and try again",
  'السيرفر تأخر بالرد. جرّب مرة ثانية': 'The server took too long. Try again', 'انتهت جلستك. سجّل دخولك من جديد': 'Your session expired. Please sign in again',
  'الطلب انرفض لأسباب أمنية. حدّث الصفحة وجرّب': 'Request blocked for security reasons. Reload and try again', 'صار خطأ في الطلب. حدّث الصفحة وجرّب': 'Something went wrong. Reload and try again',
  'الشي اللي تدوره مو موجود أو انحذف': "That doesn't exist or was deleted",
  'المتصفح منع الإشعارات. اسمح لها من أيقونة القفل جنب رابط الموقع، وجرّب مرة ثانية': 'The browser blocked notifications. Allow them from the lock icon and try again',
  'متصفحك ما يدعم الإشعارات والموقع مسكّر. جرّب كروم أو إيدج أو فايرفوكس': "Your browser doesn't support notifications while closed. Try Chrome, Edge or Firefox",
  'ما وصل الإشعار التجريبي. طفّ الإشعارات وشغّلها مرة ثانية': "The test didn't arrive. Turn notifications off and on again", 'الإشعارات مو مفعّلة على هذا الجهاز': "Notifications aren't on for this device",
  'ما قدرنا نفعّل الإشعارات. إذا انت في نافذة خاصة (Incognito) جرّب نافذة عادية، وتأكد إن إشعارات المتصفح مو مقفلة من إعدادات الجهاز': "Couldn't enable notifications. If you're in a private window, try a normal one, and check notifications aren't blocked in device settings",
  'صار خطأ في تفعيل الإشعارات. حدّث الصفحة وجرّب': 'Error enabling notifications. Reload and try again', 'ما تقدر تراسل هالشخص': "You can't message this person",
  'ما لقينا أحد بهالاسم. تأكد من اسم المستخدم (مو الاسم اللي يظهر)': 'No one with that username. Check the username (not the display name)',
  'ما تقدر ترسل لنفسك 😄': "You can't message yourself 😄", 'الصورة ما انرفعت صح، جرّب مرة ثانية': "The photo didn't upload, try again",
  'انطردت من هالقروب، فما تقدر ترجع له': "You were banned from this group and can't rejoin", 'حسابك موقوف بسبب مخالفة. إذا تشوف إنه غلط، تواصل مع الدعم': 'Your account is suspended for a violation. If you think this is a mistake, contact support',
  'كل اللي قدامك، حتى لو طلعت من التطبيق': 'Everything on your screen, even outside the app', 'وقّفنا بث شاشة الجوال': 'Stopped sharing your phone screen', 'شارك شاشتك': 'Share your screen', 'الكاميرا': 'Camera', 'وقف الكاميرا': 'Stop camera', 'أي كاميرا؟': 'Which camera?',
  'اضغط «بدء البث» عشان تبدأ تشارك شاشتك': 'Tap "Start Broadcast" to share your screen', 'ما قدرنا نبدأ بث الشاشة': "Couldn't start screen sharing",
  'المايك انفصل — نحاول نرجعه': 'Mic disconnected — reconnecting', 'انقطع الاتصال… نحاول نرجع': 'Connection lost… reconnecting',
};

/* ---------- جمل فيها اسم أو رقم ----------
   {} أي شي، {#} رقم. في الترجمة: {} بالترتيب، أو {1} {2} لو الترتيب يختلف. */
const PATTERNS = [
  ['ادخل يا {}', 'Enter, {}'], ['انطردت من قروب {}', 'You were banned from {}'], ['ما عدت في قروب {}', "You're no longer in {}"],
  ['{} دخل قروبك', '{} joined your group'], ['دخل قروبك', 'joined your group'], ['{} بدأ يبث الحين', '{} started streaming'], ['بلاغ جديد من {}', 'New report from {}'],
  ['{#} منشن', '{} mentions'], ['{#} رسايل خاصة جديدة', '{} new direct messages'], ['ما لقينا أحد باسم "{}".', 'No one named "{}".'],
   ['اكتب رسالة لـ {}', 'Message {}'], ['اكتب رسالة في #{}', 'Message #{}'], ['متصلين — {#}', 'Online — {}'], ['غير متصلين — {#}', 'Offline — {}'],
  ['هذي بداية محادثتك الخاصة مع {}', 'This is the start of your private chat with {}'], ['. محد يشوفها غيركم.', '. Only the two of you can see it.'],
  ['هلا في #{}', 'Welcome to #{}'], ['الصورة ما انرسلت: {}', "Photo wasn't sent: {}"], ['فيه {#} {} يسولفون الحين', '{} {} talking now'],
  ['{} يبث كاميرته', '{} is sharing camera'], ['{} يبث شاشة جواله', '{} is sharing their phone screen'], ['ما قدرنا نبدأ بث الشاشة ({})', "Couldn't start screen sharing ({})"], ['{} يبث', '{} is sharing'], ['بدأ بث {}', 'Started sharing: {}'],
  ['بدأ البث: {} · {#} فريم · {} Mbps', 'Sharing: {} · {} fps · {} Mbps'], ['تحدثت الجودة: {} · {#} فريم · {} Mbps', 'Quality updated: {} · {} fps · {} Mbps'],
  ['ما قدرنا نفتح الكاميرا: {}', "Couldn't open the camera: {}"], ['ما قدرنا نبدأ البث: {}', "Couldn't start sharing: {}"],
  ['سوّينا القروب بس الصورة ما انرفعت: {}', "Group created, but the picture didn't upload: {}"], ['سوّينا {} 🎉 ادعُ أصحابك من قائمة القروب', 'Created {} 🎉 Invite friends from the group menu'],
  ['دخلت {} 👋', 'Joined {} 👋'], ['تطلع من {}؟', 'Leave {}?'], ['تحذف {}؟', 'Delete {}?'], ['سوّينا {} {}', 'Created {} {}'],
  ['تحتاج سرعة', 'Needs about'], ['تقريباً', 'upload,'], ['({} لكل مشاهد × {}).', '({} per viewer × {}).'], ['({} لكل مشاهد × {} — للحين ما فيه أحد).', '({} per viewer × {} — nobody watching yet).'],
  ['جهاز {#}', 'Device {}'], ['"{}" ما اشتغل على جهازك، جرّب نوع ثاني.', '"{}" didn\'t work on your device, try another.'],
  ['المايك يفتح بس وانت ضاغط {}', 'Mic opens only while you hold {}'], ['{} منشنك في #{}', '{} mentioned you in #{}'], 
  ['إشعارات {}: {}', '{} notifications: {}'], ['الإشعارات، {#} جديدة', 'Notifications, {} new'], ['منشنك في', 'mentioned you in'], ['بث شاشته في', 'went live in'],
  ['بلّغ عن رسالة', 'reported a message'], ['بلّغ عن رسالة في', 'reported a message in'],
  ['آخر تجربة: وصلت لخدمة الإشعارات ({}). {}', 'Last test: reached the push service ({}).'], ['{} (الرمز {}{})', '{} (code {}{})'], [' من {}', ' from {}'],
  ['آخر تجربة فشلت: {}. صوّر هالرسالة وارسلها للدعم.', 'Last test failed: {}. Screenshot this and send it to support.'],
  ['احظر {}', 'Block {}'], ['البلاغ يوصل لصاحب القروب ({}) وهو يقرر وش يسوي. ما أحد يدري إنك انت اللي بلّغت غيره.', 'The report goes to the group owner ({}), who decides what to do. Nobody else knows you reported it.'],
  ['حظرت {}. ما يقدر يرسل لك', "You blocked {}. They can't message you"], ['فكّيت الحظر عن {}', 'You unblocked {}'], ['بلّغ عنها {}', 'Reported by {}'],
  ['{#} بلاغ', '{} reports'], ['عندك {}.', 'You have {}.'], ['فيه {} في {} الحين.', '{} in {} right now.'], 
  ['{#} من {#}', '{} of {}'], ['{} متصل من {}', '{} of {} online'], ['متصل من', 'online of'], ['ارسل رسالة لـ {}', 'Message {}'],
  ['{#} د', '{}m'], ['{#} س', '{}h'], ['{#} أيام', '{} days'], ['{#} أسابيع', '{} weeks'], ['{#} شهور', '{} months'], ['{#} سنين', '{} years'],
  ['اليوم {}', 'Today {}'], ['أمس {}', 'Yesterday {}'], ['{} / {}', '{} / {}'],
  // عامة: آخر شي عشان ما تسبق الجمل الأدق
  ['{} في #{}', '{} in #{}'], ['في {}', 'in {}'], ['{#} {}', '{} {}'], ['{} و{}', '{} & {}'], ['{}، {}', '{}, {}'],  ['هلا {}', 'Hi {}'], 
];

const esc = (s) => s.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
const COMPILED = PATTERNS.map(([k, v]) => {
  const parts = k.split(/(\{#?\})/);
  const re = parts.map((p) => (p === '{}' ? '(.*?)' : p === '{#}' ? '([\\d٠-٩]+)' : esc(p))).join('');
  return [new RegExp('^' + re + '$'), v];
});

export function tr(s) {
  if (!isEn || s == null) return s;
  const str = String(s);
  if (!AR.test(str)) return str;
  const key = str.replace(/\s+/g, ' ').trim();
  let out = EN[key];
  if (out === undefined) {
    for (const [re, v] of COMPILED) {
      const m = key.match(re);
      if (!m) continue;
      let i = 0;
      out = v.replace(/\{(\d*)\}/g, (_, n) => tr((m[n ? Number(n) : ++i] || '').trim()));
      break;
    }
  }
  if (out === undefined) return str;
  return str.match(/^\s*/)[0] + out + str.match(/\s*$/)[0];
}

/* ---------- ترجمة الصفحة وهي تتغير ---------- */
const SKIP = '.msg-text, .msg-body q, q, .dm-sub, .an-name, .tile-name, .m-text, .dm-name, .hl-text b, .pop-user b, script, style, [data-no-tr]';
const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
// أسماء الناس ورسايلهم ما تنترجم، إلا النصوص الثابتة داخلها مثل "(أنت)" أو [data-tr]
function skip(el) {
  if (!el) return true;
  if (el.tagName === 'SMALL' || el.closest?.('[data-tr]')) return false;
  return !!el.closest?.(SKIP);
}
function fixText(n) {
  if (!n.nodeValue || !AR.test(n.nodeValue) || skip(n.parentElement)) return;
  const v = tr(n.nodeValue);
  if (v !== n.nodeValue) n.nodeValue = v;
}
function fixAttrs(el) {
  for (const a of ATTRS) {
    const v = el.getAttribute?.(a);
    if (v && AR.test(v)) { const t = tr(v); if (t !== v) el.setAttribute(a, t); }
  }
}
function walk(root) {
  if (root.nodeType === 3) { fixText(root); return; }
  if (root.nodeType !== 1 || skip(root)) return;
  fixAttrs(root);
  const it = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n = it.nextNode(); n; n = it.nextNode()) {
    if (n.nodeType === 3) fixText(n); else if (!skip(n)) fixAttrs(n);
  }
}

export function startI18n() {
  const html = document.documentElement;
  html.lang = LANG;
  html.dir = isEn ? 'ltr' : 'rtl';
  if (!isEn) return;
  document.title = tr(document.title);
  walk(document.body);
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'childList') m.addedNodes.forEach(walk);
      else if (m.type === 'characterData') fixText(m.target);
      else if (!skip(m.target)) fixAttrs(m.target);
    }
  }).observe(html, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
