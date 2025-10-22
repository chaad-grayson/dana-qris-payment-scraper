const Driver = require("./src/driver");
const Scraper = require("./src/scraper");
const BankAccount = require("./src/bankAccount");
const { printMsg, stopInstance } = require("./src/helpers");
const QRCode = require("qrcode");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

async function createQRCodeAndSendToDevice(qrString) {
    const localDir = path.join(__dirname, "qr");
    const localFile = path.join(localDir, "qr.png");

    const deviceDir = "/sdcard/MyQRs";
    const deviceFile = `${deviceDir}/qr.png`;

    printMsg("Generating QR code...");
    if (!fs.existsSync(localDir)) {
        printMsg("Creating local directory for QR code...");
        fs.mkdirSync(localDir, { recursive: true });
    }

    printMsg("Removing old QR code...");
    if (fs.existsSync(localFile)) {
        printMsg("Old QR code found, removing...");
        fs.unlinkSync(localFile);
    }

    await QRCode.toFile(localFile, qrString, { type: "png" });
    printMsg("✅ QR generated locally");

    exec(`adb shell "mkdir -p ${deviceDir}"`, (err) => {
        if (err)
            return console.error("❌ Failed to create dir on device:", err);

        exec(`adb shell "rm -f ${deviceFile}"`, () => {
            exec(`adb push ${localFile} ${deviceFile}`, (err, stdout) => {
                if (err) return console.error("❌ Failed to push QR:", err);
                printMsg("📲 Pushed to device:", stdout);

                // ✅ Now trigger media scan
                exec(
                    `adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file://${deviceFile}`,
                    () => {
                        printMsg(
                            "🔄 Media scanned! Try checking Google Photos 📸"
                        );
                    }
                );
            });
        });
    });
}

(async () => {
    const driverInstance = await new Driver().init();
    const scraper = new Scraper(driverInstance);

    try {
        printMsg("Starting QRIS Payment...");
        const bankAccountInstance = new BankAccount();
        const account = await bankAccountInstance.get();
        const transaction = await bankAccountInstance.transactions();
        if (!account) {
            throw new Error("Bank Account Not FOUND!!");
        }
        printMsg("✅ Bank account found:", account.account_number);

        if (!transaction || transaction.length === 0) {
            throw new Error("No transaction found.");
        }
        printMsg(`✅ Transactions found:`, transaction);
        await createQRCodeAndSendToDevice(transaction.qr_string);

        // update status transction to 'processing'
        await bankAccountInstance.updateTransaction(transaction.id, {
            status: "processing",
        });
        printMsg("Transaction status updated to 'processing'");

        printMsg("Opening App...");
        await scraper.homePage();
        await scraper.paymentQris(account, transaction);
        printMsg("Scraper finished.");

        await stopInstance()
    } catch (error) {
        console.error(error);

        await stopInstance()
    }
})();
