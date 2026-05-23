const express = require('express');
const cors = require('cors');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

const app = express();

// تفعيل CORS للسماح بتطبيق Lovable بالاتصال بالخادم بدون قيود الحماية
app.use(cors());
app.use(express.json());

// إعداد الواتساب لحفظ الجلسة وإعدادات المتصفح المخفي المتوافقة مع Render
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

// عند إنشاء رمز QR جديد
client.on('qr', (qr) => {
    qrCodeData = qr;
    isReady = false;
    console.log('تم إنشاء رمز QR جديد جاهز للمسح.');
});

// عند الاتصال بنجاح
client.on('ready', () => {
    isReady = true;
    qrCodeData = '';
    console.log('الواتساب متصل بنجاح وجاهز لإرسال الرسائل!');
});

// في حال تم فصل الاتصال من الجوال أو الخادم
client.on('disconnected', (reason) => {
    console.log('تم فصل الاتصال بالواتساب:', reason);
    isReady = false;
    // إعادة محاولة الاتصال تلقائياً
    client.initialize();
});

client.initialize();

// 1. الواجهة الرئيسية لعرض الباركود أو حالة الاتصال
app.get('/', async (req, res) => {
    if (isReady) {
        return res.send('<h1 style="color:green; text-align:center; margin-top:50px; font-family:sans-serif;">الواتساب متصل بنجاح! الخادم جاهز استقبال طلبات Lovable</h1>');
    }
    if (qrCodeData) {
        try {
            const qrImage = await qrcode.toDataURL(qrCodeData);
            return res.send(`
                <div style="text-align:center; margin-top:50px; font-family:sans-serif;">
                    <h2>امسح الكود التالي باستخدام تطبيق واتساب في جوالك</h2>
                    <img src="${qrImage}" alt="QR Code" style="width:300px; border:2px solid #000; padding:10px; background:#fff;" />
                    <p style="color:#666; margin-top:20px;">قم بتحديث الصفحة إذا انتهت صلاحية الكود ولم يربط بعد.</p>
                </div>
            `);
        } catch (err) {
            return res.status(500).send('خطأ في توليد صورة الباركود');
        }
    }
    res.send('<h2 style="text-align:center; margin-top:50px; font-family:sans-serif; color:#ff9800;">جاري تهيئة النظام وتجهيز الباركود... قم بتحديث الصفحة بعد 10 ثوانٍ</h2>');
});

// 2. الرابط الخاص باستقبال طلبات الإرسال من Lovable
app.post('/send-otp', async (req, res) => {
    const { phoneNumber, otpCode } = req.body;
    
    if (!isReady) {
        return res.status(500).json({ success: false, error: 'الواتساب غير متصل في الخادم حالياً.' });
    }
    if (!phoneNumber || !otpCode) {
        return res.status(400).json({ success: false, error: 'البيانات المرسلة ناقصة (رقم الهاتف أو كود التحقق).' });
    }

    try {
        // تنظيف الرقم من أي رموز أو مسافات إضافية تم تمريرها بالخطأ
        const cleanNumber = phoneNumber.replace(/\D/g, '');
        const formattedNumber = `${cleanNumber}@c.us`;
        
        const message = `مرحباً، كود الدخول الخاص بك هو: *${otpCode}*`;
        
        await client.sendMessage(formattedNumber, message);
        console.log(`تم إرسال كود التحقق بنجاح إلى: ${cleanNumber}`);
        
        res.json({ success: true, message: 'تم إرسال الكود بنجاح' });
    } catch (error) {
        console.error('خطأ أثناء إرسال الرسالة من الواتساب:', error);
        res.status(500).json({ success: false, error: 'حدث خطأ داخلي في نظام الواتساب أثناء محاولة الإرسال.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
