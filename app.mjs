import cluster from 'node:cluster';
import { cpus } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import crypto from 'crypto';
import bs58check from 'bs58check';
import elliptic from 'elliptic';
import fs from 'fs';
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
    const version = 0x80;
    const keyWithPrefix = Buffer.concat([Buffer.from([version]), privateKeyBuffer]);
    const checksum = crypto.createHash('sha256').update(crypto.createHash('sha256').update(keyWithPrefix).digest()).digest().slice(0, 4);
    const keyWithChecksum = Buffer.concat([keyWithPrefix, checksum]);
    return bs58check.encode(keyWithChecksum);
}

// Fungsi untuk menghitung Bitcoin address dari private key
function getBitcoinAddressFromPrivateKey(privateKey) {
    const keyPair = ecCurve.keyFromPrivate(privateKey, 'hex');
    const publicKey = keyPair.getPublic().encode('hex');

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

// Fungsi utama untuk mencari private key secara acak
async function findPrivateKeyRandomly(userAddress) {
    let count = 0;
    let start = Date.now();

    while (true) {
        const privateKey = crypto.randomBytes(32).toString('hex');
        const bitcoinAddress = getBitcoinAddressFromPrivateKey(privateKey);
        const privateKeyWIF = convertPrivateKeyToWIF(privateKey);

        count++;
        const elapsed = (Date.now() - start) / 1000; // elapsed time in seconds
        const speed = count / (elapsed || 1); // speed in keys per second

        if (bitcoinAddress === userAddress) {
            console.log(`Found address match!`);
            console.log(`Private Key: ${privateKey}`);
            console.log(`Private Key (WIF): ${privateKeyWIF}`);
            console.log(`Bitcoin Address: ${bitcoinAddress}`);
            
            // Kirim hasil ke Telegram
            const message = `Address match found!\nPrivate Key: ${privateKey}\nPrivate Key (WIF): ${privateKeyWIF}\nBitcoin Address: ${bitcoinAddress}`;
            await sendTelegramMessage(message);

            // Kirim status ke master
            if (parentPort) {
                parentPort.postMessage({ type: 'found', privateKey, privateKeyWIF, bitcoinAddress });
            }

            break; // Hentikan jika ditemukan
        }

        // Kirim status ke master
        if (parentPort) {
            parentPort.postMessage({ type: 'status', id: workerData.id, count, speed });
        }
    }
}

if (isMainThread) {
    let numCPUs = cpus().length;
    numCPUs = 5;
    const workers = [];
    const statuses = Array(numCPUs).fill({ count: 0, speed: 0 });

    console.log(`Master ${process.pid} is running`);

    // Fork workers
    for (let i = 0; i < numCPUs; i++) {
        const worker = new Worker(new URL(import.meta.url), { workerData: { id: i } });
        workers.push(worker);

        worker.on('message', (message) => {
            if (message.type === 'status') {
                const { id, count, speed } = message;
                statuses[id] = { count, speed };

                // Update display
                const statusLines = statuses.map((status, index) => 
                    `${index + 1}: status: ${status.count} /${status.speed.toFixed(2)}/sec`
                ).join(' | ');
                process.stdout.write(`\r${statusLines}`);
            }

            if (message.type === 'found') {
                console.log(`\nAddress match found!`, message);
            }
        });

        worker.on('error', (error) => {
            console.error(`Worker ${i} error:`, error);
        });

        worker.on('exit', (code) => {
            if (code !== 0) {
                console.error(`Worker ${i} exited with code ${code}`);
            }
        });
    }

} else {
    // Worker thread
    findPrivateKeyRandomly('1AC4fMwgY8j9onSbXEWeH6Zan8QGMSdmtA').catch(console.error);
}
