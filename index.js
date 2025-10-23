const EventEmitter = require("events");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const QRCode = require("qrcode");
const Pusher = require("pusher-js");

const Driver = require("./src/driver");
const Scraper = require("./src/scraper");
const BankAccount = require("./src/bankAccount");
const { printMsg, stopInstance, sendTelegram } = require("./src/helpers");

// ========== QR Generator ==========
async function createQRCodeAndSendToDevice(qrString) {
    const localDir = path.join(__dirname, "qr");
    const localFile = path.join(localDir, "qr.png");
    const deviceDir = "/sdcard/MyQRs";
    const deviceFile = `${deviceDir}/qr.png`;

    if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
    if (fs.existsSync(localFile)) fs.unlinkSync(localFile);

    await QRCode.toFile(localFile, qrString, { type: "png" });
    printMsg("✅ QR generated locally");

    const sh = (cmd) =>
        new Promise((resolve, reject) =>
            exec(cmd, (err, stdout) => (err ? reject(err) : resolve(stdout)))
        );

    await sh(`adb shell "mkdir -p ${deviceDir}"`);
    await sh(`adb push "${localFile}" "${deviceFile}"`);
    printMsg("📲 QR pushed to device");

    try {
        await sh(
            `adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file://${deviceFile}`
        );
        printMsg("🔄 Media scanned (Google Photos updated)");
    } catch {
        printMsg("⚠️ Media scan broadcast failed (ignored)");
    }
}

// ========== Transaction Processor ==========
async function processTransaction({ scraper, bankAccount, account, trx }) {
    try {
        printMsg(`🔄 Processing transaction ${trx.id} ...`);
        await createQRCodeAndSendToDevice(trx.qr_string);

        await bankAccount.updateTransaction(trx.id, { status: "processing" });
        printMsg("✅ Transaction updated → processing");

        await scraper.paymentQris(account, trx);
        printMsg(`🏁 Finished transaction ${trx.id}`);
    } catch (err) {
        // stop instance if error adb
        if (err.message && err.message.toLowerCase().includes("adb")) {
            printMsg("❌ ADB error detected, stopping instance...");
            await stopInstance();
        }
        
        console.error("❌ processTransaction error:", err?.message || err);
    }
}

// ========== Queue Runtime ==========
function makeQueueRuntime({ scraper, bankAccount, account }) {
    const signal = new EventEmitter();
    const queue = [];
    const queuedIds = new Set();
    let processing = false;

    async function enqueueSingleTransaction() {
        try {
            const trx = await bankAccount.transactions(); // <-- sekarang cuma 1 object
            if (!trx || !trx.id) {
                printMsg("🕒 No transaction found.");
                return;
            }

            if (queuedIds.has(trx.id)) {
                printMsg(`↩️ Transaction ${trx.id} already queued.`);
                return;
            }

            queue.push(trx);
            queuedIds.add(trx.id);
            printMsg(`🧾 Enqueued transaction ${trx.id} (queue len=${queue.length})`);
            signal.emit("new-job");
        } catch (err) {
            console.error("❌ Failed to fetch transaction:", err.message);
        }
    }

    async function worker() {
        if (processing) return;
        processing = true;

        try {
            while (queue.length > 0) {
                const trx = queue.shift();
                if (!trx) continue;

                try {
                    await processTransaction({ scraper, bankAccount, account, trx });
                } finally {
                    queuedIds.delete(trx.id);
                }
            }
        } finally {
            processing = false;
        }
    }

    signal.on("new-job", async () => {
        if (!processing) await worker();
    });

    // fallback timer (15s)
    const safetyTimer = setInterval(async () => {
        if (!processing && queue.length === 0) {
            await enqueueSingleTransaction();
        }
    }, 15000);

    return {
        enqueueSingleTransaction,
        stop: () => clearInterval(safetyTimer),
    };
}

// ========== Main Entrypoint ==========
(async () => {
    let driver, scraper;

    try {
        printMsg("🚀 Booting QRIS Payment Scraper...");

        driver = await new Driver().init();
        scraper = new Scraper(driver);
        const bankAccount = new BankAccount();

        await sendTelegram(driver, "🚀 QRIS Payment Scraper Initialized");
        const account = await bankAccount.get();
        if (!account) throw new Error("❌ Bank account not found!");
        printMsg("✅ Bank account:", account.account_number);

        await scraper.homePage();

        await sendTelegram(driver, "✅ QRIS Payment Scraper Ready and Listening for Transactions", true);
        const runtime = makeQueueRuntime({ scraper, bankAccount, account });

        // Setup Pusher (Client)
        const pusher = new Pusher(process.env.PUSHER_APP_KEY, {
            cluster: process.env.PUSHER_APP_CLUSTER,
        });

        const channel = pusher.subscribe("transactions");

        channel.bind("pusher:subscription_succeeded", () => {
            printMsg("📡 Connected to Pusher channel 'transactions'");
        });

        channel.bind("process-transaction", async (data) => {
            printMsg("📩 Pusher event received:", data);
            await runtime.enqueueSingleTransaction(); // cuma fetch 1 transaksi terbaru
        });

        // Bootstrap pending (jaga-jaga kalau ada sebelum start)
        await runtime.enqueueSingleTransaction();

        // Graceful shutdown
        const shutdown = async (signal) => {
            printMsg(`🔻 Received ${signal}, shutting down...`);
            runtime.stop();
            await stopInstance();
            process.exit(0);
        };

        process.on("SIGINT", () => shutdown("SIGINT"));
        process.on("SIGTERM", () => shutdown("SIGTERM"));
    } catch (err) {
        console.error("💥 Fatal error:", err);
        await sendTelegram(null, `💥 Fatal error: ${err.message || err}`, false).catch(() => {});
        await stopInstance().catch(() => {});
        process.exit(1);
    }
})();
