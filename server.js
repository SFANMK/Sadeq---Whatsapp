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
            '--disable-gpu'
        ]
    }
});

let qrCodeData = '';
let isReady = false;
let statusMessage = 'جاري تهيئة النظام ومكتبة الواتساب...';

// تتبع دقيق لحالات الواتساب
client.on('qr', (qr) => {
    qrCodeData = qr;
    isReady = false;
    statusMessage = 'بانتظار مسح الباركود...';
    console.log('تم إنشاء رمز QR جديد.');
});

client.on('authenticated', () => {
    statusMessage = 'تمت المصادقة من الجوال! جاري إعداد الاتصال...';
    console.log('تمت المصادقة!');
});

client.on('ready', () => {
    isReady = true;
    qrCodeData = '';
    statusMessage = 'الواتساب متصل بنجاح وجاهز للعمل!';
    console.log('الواتساب متصل بنجاح وجاهز!');
});

client.on('auth_failure', (msg) => {
    isReady = false;
    statusMessage = 'حدث فشل في المصادقة، يرجى مسح الباركود من جديد.';
    console.error('فشل في المصادقة:', msg);
});

client.on('disconnected', (reason) => {
    isReady = false;
    qrCodeData = '';
    statusMessage = 'انقطع الاتصال بالواتساب. جاري إعادة التشغيل...';
    console.log('تم فصل الاتصال:', reason);
    client.destroy().then(() => client.initialize()).catch(() => client.initialize());
});

client.initialize();

// الواجهة التفاعلية (Dashboard)
app.get('/', async (req, res) => {
    let htmlContent = `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta http-equiv="refresh" content="3">
        <title>حالة نظام الواتساب</title>
        <style>
            body { font-family: Tahoma, Arial, sans-serif; text-align: center; margin-top: 50px; background-color: #f4f4f9; }
            .container { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); display: inline-block; max-width: 500px; }
            .status { padding: 15px; margin-top: 20px; border-radius: 5px; font-weight: bold; font-size: 18px; }
            .ready { background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
            .waiting { background-color: #fff3cd; color: #856404; border: 1px solid #ffeeba; }
            .note { color: #666; font-size: 13px; margin-top: 15px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>نظام الإرسال (Lovable API)</h2>
    `;

    if (isReady) {
        htmlContent += `
            <div class="status ready">✅ ${statusMessage}</div>
            <p>يمكنك الآن إرسال الأكواد من التطبيق بأمان.</p>
            <p class="note">لا تغلق هذه الصفحة إذا كنت تختبر النظام، فهي ستُعلمك فوراً إذا انقطع الاتصال.</p>
        `;
    } else if (qrCodeData) {
        try {
            const qrImage = await qrcode.toDataURL(qrCodeData);
            htmlContent += `
                <div class="status waiting">⏳ ${statusMessage}</div>
                <img src="${qrImage}" alt="QR Code" style="margin-top: 20px; border: 2px solid #000; padding: 10px; border-radius: 10px;" />
                <p class="note">هذه الصفحة تتحدث برمجياً كل 3 ثوانٍ، لا تضغط على أي زر، فقط امسح الباركود وراقب الشاشة.</p>
            `;
        } catch (err) {
            htmlContent += `<p style="color:red;">خطأ في عرض الباركود.</p>`;
        }
    } else {
        htmlContent += `
            <div class="status waiting">⚙️ ${statusMessage}</div>
            <p class="note">الرجاء الانتظار، الصفحة تُحدث نفسها تلقائياً...</p>
        `;
    }

    htmlContent += `
        </div>
    </body>
    </html>
    `;

    res.send(htmlContent);
});

// استقبال الطلبات من Lovable
app.post('/send-otp', async (req, res) => {
    const { phoneNumber, otpCode } = req.body;
    
    if (!isReady) {
        return res.status(500).json({ success: false, error: 'الواتساب غير متصل في الخادم حالياً.' });
    }
    if (!phoneNumber || !otpCode) {
        return res.status(400).json({ success: false, error: 'البيانات المرسلة ناقصة.' });
    }

    try {
        const cleanNumber = phoneNumber.replace(/\D/g, '');
        const formattedNumber = `${cleanNumber}@c.us`;
        const message = `مرحباً، كود الدخول الخاص بك هو: *${otpCode}*`;
        
        await client.sendMessage(formattedNumber, message);
        console.log(`تم الإرسال إلى: ${cleanNumber}`);
        res.json({ success: true, message: 'تم إرسال الكود بنجاح' });
    } catch (error) {
        console.error('خطأ الإرسال:', error);
        res.status(500).json({ success: false, error: 'حدث خطأ في الواتساب أثناء محاولة الإرسال.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('Server running on port', PORT);
});
