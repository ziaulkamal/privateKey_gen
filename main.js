const crypto = require('crypto');
const bitcoin = require('bitcoinjs-lib'); // Library untuk encoding Bitcoin address
const EC = require('elliptic').ec;
const fs = require('fs');

// Elliptic curve secp256k1
const ecCurve = new EC('secp256k1');

// Fungsi untuk menghasilkan private key secara acak
function generateRandomPrivateKey() {
    return crypto.randomBytes(32).toString('hex');
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

    // Mengonversi address menjadi format Base58 (Bitcoin address) menggunakan bitcoinjs-lib
    return bitcoin.address.toBase58Check(fullAddress.slice(0, 21), 0x00);
}

// Fungsi utama untuk melakukan brute force recovery berdasarkan address
async function recoverWalletByAddress(userAddress) {
    let attempt = 0;
    while (true) {
        attempt++;
        // Menghasilkan private key acak
        const privateKey = generateRandomPrivateKey();
        
        // Mendapatkan Bitcoin address dari private key
        const bitcoinAddress = getBitcoinAddressFromPrivateKey(privateKey);

        // Mencetak setiap percobaan untuk memonitor progres
        console.log(`Percobaan ke-${attempt}: Private Key: ${privateKey} -> Address: ${bitcoinAddress}`);

        // Cek apakah address yang dihasilkan cocok dengan address target
        if (bitcoinAddress === userAddress) {
            console.log("====================================================================================");
            console.log(`Address cocok ditemukan!`);
            console.log(`[+] Private Key: ${privateKey}`);
            console.log(`[+] Bitcoin Address: ${bitcoinAddress}`);
            fs.appendFileSync("recovered.txt", `Private Key: ${privateKey}\nAddress: ${bitcoinAddress}\n\n`);
            break; // Hentikan jika ditemukan
        }
    }
}


const userAddress = "1AC4fMwgY8j9onSbXEWeH6Zan8QGMSdmtA";  // Ganti dengan Bitcoin address target
recoverWalletByAddress(userAddress);
