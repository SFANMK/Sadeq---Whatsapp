const express = require('express');
const cors = require('cors');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

const app = express();
app.use(cors());
app.use(express.json());

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './.data/auth' }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--mute-audio',
            '--disable-background-networking'
        ]
    }
});

let qrCodeData = '';
let isReady = false;
let statusMessage = 'جاري تهيئة النظام...';

client.on('qr', (qr) => {
    qrCodeData = qr;
    isReady = false;
    statusMessage = 'بانتظار مسح الباركود...';
    console.log('تم إنشاء رمز QR جديد.');
});

client.on('authenticated', () => {
    statusMessage = 'تمت المصادقة! جاري مزامنة البيانات بلطف...';
    console.log('تمت المصادقة!');
});

client.on('ready', () => {
    isReady = true;
    qrCodeData = '';
    statusMessage = 'الواتساب متصل بنجاح وجاهز للعمل!';
    console.log('الواتساب متصل بنجاح وجاهز!');
});

client.on('disconnected', (reason) => {
    isReady = false;
    qrCodeData = '';
    statusMessage = 'انقطع الاتصال بالواتساب. جاري إعادة التشغيل...';
    console.log('تم فصل الاتصال:', reason);
    client.destroy().then(() => client.initialize()).catch(() => client.initialize());
});

client.initialize();

// نقطة فحص الحالة (API خفيف جداً لا يستهلك الذاكرة)
app.get('/status-check', (req, res) => {
    res.json({ isReady, qrCodeData, statusMessage });
});

// الواجهة التفاعلية (Dashboard) الخفيفة
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
            <h2>نظام الإرسال (Lovable API)</h2>
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
            // فحص الحالة كل 3 ثوانٍ برمجياً (بدون إعادة تحميل الصفحة)
            setInterval(checkStatus, 3000);
            checkStatus();
        </script>
    </body>
    </html>
    `;
    res.send(htmlContent);
});

app.post('/send-otp', async (req, res) => {
    const { phoneNumber, otpCode } = req.body;
    if (!isReady) return res.status(500).json({ success: false, error: 'الواتساب غير متصل في الخادم حالياً.' });
    if (!phoneNumber || !otpCode) return res.status(400).json({ success: false, error: 'البيانات ناقصة.' });

    try {
        const cleanNumber = phoneNumber.replace(/\D/g, '');
        const formattedNumber = `${cleanNumber}@c.us`;
        const message = `مرحباً، كود الدخول الخاص بك هو: *${otpCode}*`;
        
        await client.sendMessage(formattedNumber, message);
        res.json({ success: true, message: 'تم إرسال الكود بنجاح' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'حدث خطأ أثناء محاولة الإرسال.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on port', PORT));
