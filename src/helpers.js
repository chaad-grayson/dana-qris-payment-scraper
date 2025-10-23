const moment = require("moment");
const colors = require("colors");
const { CORE_MOBILE_URL, ACCOUNT_NUMBER } = require("./config");
const BankAccount = require("./bankAccount");
const FormData = require("form-data");
const fs = require("fs");
const axios = require("axios");

const printMsg = (msg) => {
    console.log(
        colors.yellow(moment().format("YYYY-MM-DD hh:mm:ss")),
        colors.green(msg)
    );
};

async function stopInstance() {
    try {
        await new BankAccount().updateIdleBank(true);
        await sendTelegram(null, `🛑 Stopping instance for account ${ACCOUNT_NUMBER}`, false);
        await fetch(`${CORE_MOBILE_URL}/stop?account_number=${ACCOUNT_NUMBER}`);
    } catch (e) {
        console.error(e);
    }
}

async function sendTelegram(driver, message, isImage = false) {
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
    const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

    try {
        if (isImage) {
            if (!driver) {
                throw new Error(
                    "Driver instance is required when sending image"
                );
            }

            const screenshotBase64 = await driver.takeScreenshot();
            const buffer = Buffer.from(screenshotBase64, "base64");

            const formData = new FormData();
            formData.append("chat_id", TELEGRAM_CHAT_ID);
            formData.append("caption", message || "");
            formData.append("photo", buffer, { filename: "screenshot.png" });

            const response = await axios.post(
                `${telegramApiUrl}/sendPhoto`,
                formData,
                {
                    headers: formData.getHeaders(),
                }
            );

            console.log("✅ Telegram screenshot sent:", response.data);
        } else {
            const response = await axios.post(`${telegramApiUrl}/sendMessage`, {
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
            });

            console.log("✅ Telegram message sent:", response.data);
        }
    } catch (error) {
        console.error(
            `❌ Error sending Telegram message:`,
            error.response?.data || error.message
        );
    }
}

module.exports = {
    printMsg,
    stopInstance,
    sendTelegram,
};
