const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

const app = express();
app.use(express.json());

// إعداد الواتساب لحفظ الجلسة
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './.data/auth' }),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

let qrCodeData = '';
let isReady = false;

client.on('qr', (qr) => {
    qrCodeData = qr;
    console.log('تم إنشاء QR Code');
});

client.on('ready', () => {
    isReady = true;
    console.log('الواتساب متصل وجاهز لإرسال الرسائل!');
});

client.initialize();

// واجهة عرض الباركود
app.get('/', async (req, res) => {
    if (isReady) {
        return res.send('<h1 style="color:green; text-align:center; margin-top:50px;">الواتساب متصل بنجاح! الخادم جاهز</h1>');
    }
    if (qrCodeData) {
        const qrImage = await qrcode.toDataURL(qrCodeData);
        return res.send(`<div style="text-align:center; margin-top:50px;">
            <h2>امسح الكود التالي باستخدام تطبيق واتساب في جوالك</h2>
            <img src="${qrImage}" alt="QR Code" style="width:300px; border:2px solid #000;" />
        </div>`);
    }
    res.send('<h2 style="text-align:center; margin-top:50px;">جاري تجهيز الواتساب... قم بتحديث الصفحة بعد 10 ثوانٍ</h2>');
});

// الرابط الذي سيستقبل طلبات الإرسال من Lovable
app.post('/send-otp', async (req, res) => {
    const { phoneNumber, otpCode } = req.body;
    
    if (!isReady) return res.status(500).send({ error: 'الواتساب غير متصل بعد.' });
    if (!phoneNumber || !otpCode) return res.status(400).send({ error: 'بيانات ناقصة' });

    try {
        const cleanNumber = phoneNumber.replace('+', '');
        const formattedNumber = `${cleanNumber}@c.us`;
        const message = `مرحباً، كود الدخول الخاص بك هو: *${otpCode}*`;
        
        await client.sendMessage(formattedNumber, message);
        res.send({ success: true, message: 'تم إرسال الكود بنجاح' });
    } catch (error) {
        res.status(500).send({ error: 'حدث خطأ أثناء الإرسال' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
