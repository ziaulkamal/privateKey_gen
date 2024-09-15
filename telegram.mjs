// Import node-fetch untuk melakukan HTTP request
import fetch from 'node-fetch';

// Konfigurasi Telegram
const TELEGRAM_TOKEN = '6789484876:AAFR1OQRssKGrk8aIF0jAn0zB3eWF33XtrE';
const TELEGRAM_CHAT_ID = '-4562112556';

// Fungsi untuk mengirim pesan ke Telegram
async function sendTelegramMessage(message) {
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    const body = JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
    });

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
        });

        const result = await response.json();

        if (result.ok) {
            console.log('Pesan berhasil dikirim ke Telegram:', result);
        } else {
            console.error('Gagal mengirim pesan ke Telegram:', result);
        }
    } catch (error) {
        console.error('Error saat mengirim pesan ke Telegram:', error);
    }
}

// Panggil fungsi untuk mengirim pesan uji coba
sendTelegramMessage('Ini adalah pesan uji coba dari bot Telegram menggunakan Node.js.');
