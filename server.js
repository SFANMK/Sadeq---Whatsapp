const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');

const app = express();
app.use(cors());
app.use(express.json());

let isReady = false;
let qrCodeData = '';
let statusMessage = 'جاري تهيئة النظام (Baileys)...';
let sock;

// دالة الاتصال بالواتساب
async function connectToWhatsApp() {
    // حفظ ملفات الجلسة لكي لا يطلب الباركود في كل مرة
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        // إخفاء سجلات المكتبة لتخفيف الضغط على الخادم
        logger: pino({ level: 'silent' }) 
    });

    // تحديث ملفات الاعتماد عند الاتصال
    sock.ev.on('creds.update', saveCreds);

    // مراقبة حالة الاتصال
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrCodeData = qr;
            isReady = false;
            statusMessage = 'بانتظار مسح الباركود...';
            console.log('تم إنشاء باركود جديد.');
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
            isReady = false;
            
            if (shouldReconnect) {
                statusMessage = 'انقطع الاتصال. جاري إعادة المحاولة...';
                connectToWhatsApp();
            } else {
                statusMessage = 'تم تسجيل الخروج. يرجى مسح الباركود من جديد.';
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            isReady = true;
            qrCodeData = '';
            statusMessage = 'الواتساب متصل بنجاح وجاهز للعمل!';
            console.log('تم الاتصال بنجاح!');
        }
    });
}

// تشغيل الواتساب عند بدء الخادم
connectToWhatsApp();

// نقطة فحص الحالة للواجهة (بدون إرهاق الخادم)
app.get('/status-check', (req, res) => {
    res.json({ isReady, qrCodeData, statusMessage });
});

// الواجهة التفاعلية (Dashboard)
app.get('/', (req, res) => {
    const htmlContent = `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <title>نظام الإرسال (Lovable API)</title>
        <style>
            body { font-family: Tahoma, Arial, sans-serif; text-align: center; margin-top: 50px; background-color: #f4f4f9; }
            .container { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); display: inline-block; max-width: 500px; }
            #status-box { padding: 15px; margin-top: 20px; border-radius: 5px; font-weight: bold; font-size: 18px; background-color: #fff3cd; color: #856404; border: 1px solid #ffeeba; }
            .ready-bg { background-color: #d4edda !important; color: #155724 !important; border-color: #c3e6cb !important; }
            img { margin-top: 20px; border: 2px solid #000; padding: 10px; border-radius: 10px; display: none; }
            .note { color: #666; font-size: 13px; margin-top: 15px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>نظام الإرسال الخفيف (Baileys API)</h2>
            <div id="status-box">⚙️ جاري جلب الحالة...</div>
            <img id="qr-image" src="" alt="QR Code" />
            <p class="note">هذه الصفحة تحدث نفسها بهدوء دون إرهاق الخادم.</p>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"></script>
        <script>
            async function checkStatus() {
                try {
                    const response = await fetch('/status-check');
                    const data = await response.json();
                    
                    const statusBox = document.getElementById('status-box');
                    const qrImg = document.getElementById('qr-image');

                    statusBox.innerHTML = data.isReady ? '✅ ' + data.statusMessage : '⏳ ' + data.statusMessage;
                    
                    if (data.isReady) {
                        statusBox.classList.add('ready-bg');
                        qrImg.style.display = 'none';
                    } else {
                        statusBox.classList.remove('ready-bg');
                        if (data.qrCodeData) {
                            QRCode.toDataURL(data.qrCodeData, function (err, url) {
                                if (!err) {
                                    qrImg.src = url;
                                    qrImg.style.display = 'inline-block';
                                }
                            });
                        } else {
                            qrImg.style.display = 'none';
                        }
                    }
                } catch (error) {
                    console.log("جارٍ محاولة الاتصال بالخادم...");
                }
            }
            setInterval(checkStatus, 3000);
            checkStatus();
        </script>
    </body>
    </html>
    `;
    res.send(htmlContent);
});

// إرسال الكود من تطبيق Lovable
app.post('/send-otp', async (req, res) => {
    const { phoneNumber, otpCode } = req.body;
    
    if (!isReady) return res.status(500).json({ success: false, error: 'الواتساب غير متصل في الخادم حالياً.' });
    if (!phoneNumber || !otpCode) return res.status(400).json({ success: false, error: 'البيانات ناقصة.' });

    try {
        const cleanNumber = phoneNumber.replace(/\D/g, '');
        // صيغة الرقم الخاصة بمكتبة Baileys
        const formattedNumber = \`\${cleanNumber}@s.whatsapp.net\`; 
        const message = \`مرحباً، كود الدخول الخاص بك هو: *\${otpCode}*\`;
        
        await sock.sendMessage(formattedNumber, { text: message });
        console.log(\`تم الإرسال بنجاح إلى: \${cleanNumber}\`);
        res.json({ success: true, message: 'تم إرسال الكود بنجاح' });
    } catch (error) {
        console.error('خطأ أثناء الإرسال:', error);
        res.status(500).json({ success: false, error: 'حدث خطأ أثناء محاولة الإرسال.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on port', PORT));
