import cluster from 'node:cluster';
import { cpus } from 'node:os';
import crypto from 'crypto';
import bs58check from 'bs58check';
import elliptic from 'elliptic';
import fs from 'fs';
import fetch from 'node-fetch';
import blessed from 'blessed';

let numCPUs = cpus().length;
numCPUs = 20; // Ubah sesuai kebutuhan

const TELEGRAM_TOKEN = '6789484876:AAFR1OQRssKGrk8aIF0jAn0zB3eWF33XtrE';
const TELEGRAM_CHAT_ID = '-4562112556';

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

const EC = elliptic.ec;
const ecCurve = new EC('secp256k1');

let totalGenerated = 0;
const status = Array(numCPUs).fill({ total: 0, startTime: Date.now(), keysGenerated: 0, speed: 0 });

function convertPrivateKeyToWIF(privateKeyHex) {
    const privateKeyBuffer = Buffer.from(privateKeyHex, 'hex');
    const version = 0x80;
    const keyWithPrefix = Buffer.concat([Buffer.from([version]), privateKeyBuffer]);
    const checksum = crypto.createHash('sha256').update(crypto.createHash('sha256').update(keyWithPrefix).digest()).digest().slice(0, 4);
    const keyWithChecksum = Buffer.concat([keyWithPrefix, checksum]);
    return bs58check.encode(keyWithChecksum);
}

function getBitcoinAddressFromPrivateKey(privateKey) {
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

function generateRandomPrivateKey() {
    return crypto.randomBytes(32).toString('hex');
}

function workerFunction(workerId, userAddress) {
    let localGenerated = 0;
    const localStartTime = Date.now();

    const intervalId = setInterval(() => {
        const elapsed = (Date.now() - localStartTime) / 1000;
        const speed = localGenerated / (elapsed / 60);
        process.send({ id: workerId, count: localGenerated, speed: speed });
    }, 1000);

    while (true) {
        try {
            const privateKey = generateRandomPrivateKey();
            const bitcoinAddress = getBitcoinAddressFromPrivateKey(privateKey);
            const privateKeyWIF = convertPrivateKeyToWIF(privateKey);

            localGenerated++;

            if (bitcoinAddress === userAddress) {
                console.log(`Worker ${workerId}: Address cocok ditemukan!`);
                console.log(`[+] Private Key: ${privateKey}`);
                console.log(`[+] Private Key (WIF): ${privateKeyWIF}`);
                console.log(`[+] Bitcoin Address: ${bitcoinAddress}`);
                fs.appendFileSync('recovered.txt', `Private Key: ${privateKey}\nPrivate Key (WIF): ${privateKeyWIF}\nAddress: ${bitcoinAddress}\n\n`);
                
                const message = `Address cocok ditemukan!\nPrivate Key: ${privateKey}\nPrivate Key (WIF): ${privateKeyWIF}\nBitcoin Address: ${bitcoinAddress}`;
                sendTelegramMessage(message);

                clearInterval(intervalId);
                process.exit(0);
            }
        } catch (error) {
            console.error(`Worker ${workerId} error:`, error);
        }
    }
}

function updateStatus(boxes) {
    const now = Date.now();
    boxes.forEach((box, i) => {
        const workerStatus = status[i] || { keysGenerated: 0, speed: 0 };
        box.setContent(`Worker ${i + 1}\nKeys generated: ${workerStatus.keysGenerated}\nSpeed: ${workerStatus.speed.toFixed(2)} keys/min`);
    });

    const totalElapsed = (now - status[0].startTime) / 1000;
    const totalSpeed = totalGenerated / (totalElapsed / 60);
    const totalStatusBox = boxes[boxes.length - 1];
    totalStatusBox.setContent(`Total Generate: ${totalGenerated}\nOverall Speed: ${totalSpeed.toFixed(2)}/min`);

    boxes[0].screen.render();
}

if (cluster.isMaster) {
    console.log(`Master ${process.pid} is running`);
    console.log(`Starting ${numCPUs} workers`);

    const screen = blessed.screen({
        smartCSR: true,
        title: 'Private Key Generator Status'
    });

    const numColumns = 5;
    const numRows = Math.ceil(numCPUs / numColumns);
    const boxWidth = Math.floor(100 / numColumns);
    const boxHeight = Math.floor(100 / numRows);

    const boxes = [];
    for (let i = 0; i < numCPUs; i++) {
        const column = i % numColumns;
        const row = Math.floor(i / numColumns);

        const box = blessed.box({
            top: `${row * boxHeight}%`,
            left: `${column * boxWidth}%`,
            width: `${boxWidth}%`,
            height: `${boxHeight}%`,
            scrollable: true,
            alwaysScroll: true,
            keys: true,
            vi: true,
            border: {
                type: 'line'
            },
            style: {
                border: {
                    fg: 'cyan'
                },
                header: {
                    fg: 'black',
                    bg: 'yellow'
                },
                label: {
                    fg: 'cyan'
                }
            }
        });

        screen.append(box);
        boxes.push(box);
    }

    const totalStatusBox = blessed.box({
        top: `${(numRows - 1) * boxHeight}%`,
        left: '0%',
        width: '100%',
        height: `${boxHeight}%`,
        scrollable: true,
        alwaysScroll: true,
        border: {
            type: 'line'
        },
        style: {
            border: {
                fg: 'cyan'
            },
            header: {
                fg: 'black',
                bg: 'yellow'
            },
            label: {
                fg: 'cyan'
            }
        }
    });
    screen.append(totalStatusBox);
    boxes.push(totalStatusBox);

    for (let i = 0; i < numCPUs; i++) {
        const worker = cluster.fork();
        worker.on('message', (message) => {
            if (message.id !== undefined) {
                const workerId = message.id;
                status[workerId] = { ...status[workerId], keysGenerated: message.count, speed: message.speed, startTime: Date.now() };
                totalGenerated += message.count;
                console.log(`Received update from worker ${workerId}:`, message);
            }
        });
    }

    const userAddress = '1AC4fMwgY8j9onSbXEWeH6Zan8QGMSdmtA';

    setInterval(() => updateStatus(boxes), 1000);

    screen.key(['escape', 'q', 'C-c'], function(ch, key) {
        return process.exit(0);
    });

    screen.render();

    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died`);
    });

    cluster.on('fork', (worker) => {
        console.log(`Worker ${worker.process.pid} forked`);
    });
} else {
    const userAddress = '1AC4fMwgY8j9onSbXEWeH6Zan8QGMSdmtA';
    workerFunction(cluster.worker.id - 1, userAddress);
}
