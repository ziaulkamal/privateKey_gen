import bitcoin from 'bitcoinjs-lib';
import bs58check from 'bs58check';
import axios from 'axios';

// Konversi dari hex ke desimal
const hexToDecimal = (hex) => BigInt('0x' + hex);
const decimalToHex = (decimal) => decimal.toString(16).padStart(64, '0');

// Rentang kunci
const startKeyHex = '80000000000000000';
const endKeyHex = '3ffffffffffffffff';

// Konversi ke desimal
const startKey = hexToDecimal(startKeyHex);
const endKey = hexToDecimal(endKeyHex);

// Fungsi untuk menghasilkan alamat Bitcoin dari kunci privat
const generateAddressFromPrivateKey = (privateKeyHex) => {
  const privateKeyBuffer = Buffer.from(privateKeyHex, 'hex');
  const keyPair = bitcoin.ECPair.fromPrivateKey(privateKeyBuffer);
  const { address } = bitcoin.payments.p2pkh({ pubkey: keyPair.publicKey });
  return address;
};

// Fungsi untuk menghasilkan kunci privat dan alamat secara acak dalam rentang yang ditentukan
const generateRandomKeyPairs = (numAddresses) => {
  const addresses = [];
  for (let i = 0; i < numAddresses; i++) {
    // Generate a random key within the range
    const randomKey = BigInt.asUintN(256, BigInt(Math.floor(Math.random() * Number(endKey - startKey + 1n))) + startKey);
    const privateKeyHex = decimalToHex(randomKey);
    const networkByte = '80';
    const extendedKey = networkByte + privateKeyHex;
    const wif = bs58check.encode(Buffer.from(extendedKey, 'hex'));
    const address = generateAddressFromPrivateKey(privateKeyHex);
    addresses.push({ address, privateKeyWIF: wif });
  }
  return addresses;
};

// Fungsi untuk memeriksa saldo alamat menggunakan API Blockchain
const checkBalances = async (addresses) => {
  if (addresses.length === 0) {
    console.log('Tidak ada alamat untuk diperiksa.');
    return {};
  }

  try {
    const url = `https://blockchain.info/balance?active=${addresses.map(a => a.address).join('|')}&cors=true`;
    // console.log(`Fetching balances from: ${url}`);
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error('Gagal memeriksa saldo:', error.message);
    return {};
  }
};

// Fungsi untuk mengirim pesan ke Telegram
const sendMessageToTelegram = async (message) => {
  const TELEGRAM_TOKEN = '6789484876:AAFR1OQRssKGrk8aIF0jAn0zB3eWF33XtrE';
  const TELEGRAM_CHAT_ID = '-4562112556';
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  try {
    console.log(`Sending message to Telegram: ${message}`);
    await axios.post(url, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
    });
  } catch (error) {
    console.error('Gagal mengirim pesan ke Telegram:', error.message);
  }
};

// Fungsi utama untuk menghasilkan alamat dan memeriksa saldo dengan batch dan jeda
const generateAndCheckAddresses = async () => {
  const batchSize = 250;
  const delay = 500; // 1 detik

  while (true) {
    const keyPairs = generateRandomKeyPairs(batchSize);
    const addresses = keyPairs.map(kp => kp.address);

    // console.log(`Generated addresses: ${addresses.join(', ')}`);
    
    const balances = await checkBalances(keyPairs);
    
    // Tampilkan saldo dan kirimkan ke Telegram jika saldo ditemukan
    for (const { address, privateKeyWIF } of keyPairs) {
      const balanceData = balances[address];
      if (balanceData) {
        console.log(`Address: ${address}`);
        console.log(`Balance: ${balanceData.final_balance || 'Saldo tidak ditemukan'}`);
        if (balanceData.final_balance > 0) {
          const message = `Address: ${address}\nBalance: ${balanceData.final_balance}\nPrivate Key (WIF): ${privateKeyWIF}`;
          console.log(`Sending message: ${message}`);
          await sendMessageToTelegram(message);
        }
      } else {
        console.log(`Address: ${address} tidak ditemukan dalam hasil saldo.`);
      }
    }

    // Tunggu sebelum menghasilkan batch berikutnya
    await new Promise(resolve => setTimeout(resolve, delay));
  }
};

// Jalankan fungsi utama
generateAndCheckAddresses();
