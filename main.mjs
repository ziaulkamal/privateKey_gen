// Fungsi utama untuk melakukan pencarian private key berdasarkan rentang dan address
async function findPrivateKeyInReverseRange(startPrivateKey, userAddress) {
    let start = new BigNumber(startPrivateKey, 16);
    let max = new BigNumber('0000000000000000000000000000000000000000000000000000000000000001', 16);

    for (let i = start; i.isGreaterThanOrEqualTo(max); i = i.minus(1)) {
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
const startPrivateKey = 'fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364140'; // Ganti dengan private key awal
const userAddress = '1AC4fMwgY8j9onSbXEWeH6Zan8QGMSdmtA';  // Ganti dengan Bitcoin address target

await findPrivateKeyInReverseRange(startPrivateKey, userAddress);
