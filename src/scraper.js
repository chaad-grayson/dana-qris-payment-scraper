const { printMsg } = require("./helpers");
const Config = require("./config/config");
const { KEYCODES } = require("./utils");
const BankAccount = require("./bankAccount");

class Scraper {
    driver;
    config;

    constructor(driver) {
        this.driver = driver;
        this.config = new Config();
    }

    async homePage() {
        printMsg("wait for stable");
        await this.driver.$('id=id.dana:id/iv_dana_icon').waitForDisplayed({ timeout: 120 * 1000 });

        await this.handlePopUpSystem();
        await this.closeAds();

        printMsg("Switching to context activity");
        await this.driver.switchContext('NATIVE_APP');
        printMsg("Switched successfully");
    }

    async paymentQris(account, transaction) {
        printMsg("Click QRIS button");
        const qrisBtn = await this.driver.$('//android.widget.ImageButton[@content-desc="btn-payment-offline"]');
        await qrisBtn.waitForDisplayed({ timeout: 10000 });
        await qrisBtn.click();

        printMsg("Click Scan By File");
        const galleryBtn = await this.driver.$('//android.widget.ImageView[@resource-id="id.dana:id/iv_gallery"]');
        await galleryBtn.waitForDisplayed({ timeout: 10000 });
        await galleryBtn.click();

        await new Promise((resolve) => { setTimeout(resolve, 5000); });

        printMsg("Select Image from Gallery");
        const folderImage = await this.driver.$('//android.widget.TextView[@resource-id="com.google.android.apps.photos:id/title" and @text="MyQRs"]');
        await folderImage.waitForDisplayed({ timeout: 10000 });
        await folderImage.click();

        printMsg("Choose QRIS Image");
        const qrisImage = await this.driver.$(`//android.support.v7.widget.RecyclerView[@resource-id="com.google.android.apps.photos:id/recycler_view"]//android.widget.ImageView`);
        await qrisImage.waitForDisplayed({ timeout: 10000 });
        await qrisImage.click();

        if (!transaction.is_dynamic) {
            printMsg("Input Amount for Static QRIS");
            const amountField = await this.driver.$('//android.widget.EditText[@resource-id="id.dana:id/etAmount"]');
            await amountField.waitForDisplayed({ timeout: 10000 });
            await amountField.setValue(Number(transaction.amount));
            printMsg("✅ Amount entered");

            printMsg("Confirm Payment for Static QRIS");
            const btnNext = await this.driver.$('//android.view.ViewGroup[@resource-id="id.dana:id/cl_container_dana_button_primary_view"]');
            await btnNext.waitForDisplayed({ timeout: 10000 });
            await btnNext.click();
        }

        printMsg("Confirm Payment for QRIS");
        const btnPayment = await this.driver.$('//android.view.ViewGroup[@resource-id="id.dana:id/cl_container_dana_button_primary_view"]')
        await btnPayment.waitForDisplayed({ timeout: 10000 });
        await btnPayment.click();

        printMsg("Waiting for PIN input page");
        await this.driver.$('id=id.dana:id/tvEnterPin').waitForDisplayed({ timeout: 10 * 1000 });

        printMsg("Input PIN to Confirm Payment");
        const pin = account?.safe_key
        if (!pin) {
            throw new Error("PIN Not FOUND!!");
        }
        await this.type(pin);
        printMsg("✅ PIN entered");

        try {
            // Check if failed
            await this.driver.$('//android.widget.TextView[@content-desc="sdet-lbl-header" and @text="Pembayaran Gagal"]').waitForDisplayed({ timeout: 5 * 1000 });
            printMsg("❌ Payment Failed");
            const bankAccountInstance = new BankAccount();
            await bankAccountInstance.updateTransaction(transaction.id, {
                status: "failed",
                remarks: "Payment Failed",
            });
            await bankAccountInstance.updateIdleBank(true);
            throw new Error("Payment Failed");
            return;
        } catch (err) {
        }

        printMsg("waiting result");
        await this.driver.$('//android.widget.TextView[@content-desc="sdet-lbl-header" and @text="Pembayaran Sukses"]').waitForDisplayed({ timeout: 10 * 1000 });

        printMsg("✅ Payment Successful");
        const btnCheckDetail = await this.driver.$('id=id.dana:id/btnSecondaryAction')
        await btnCheckDetail.waitForDisplayed({ timeout: 10000 });
        await btnCheckDetail.click();

        await this.driver.pause(3000);
        await this.driver.$('//android.widget.Image[@text="Logo"]').waitForDisplayed({ timeout: 10 * 1000 });
        printMsg("Click transaction detail");
        const detailBtn = await this.driver.$('//android.view.View[@resource-id="transaction-detail"]/android.view.View[1]/android.view.View[2]/android.view.View[4]/android.view.View/android.widget.Image')
        await detailBtn.waitForDisplayed({ timeout: 10000 });
        await detailBtn.click();
        await this.driver.pause(3000);

        printMsg("Fetching Transaction ID");
        const trxId = await this.getNextElementText('ID Transaksi');
        printMsg("Transaction ID result :: " + trxId);

        const bankAccountInstance = new BankAccount();
        await bankAccountInstance.updateTransaction(transaction.id, {
            status: "success",
            remarks: trxId,
        });

        await bankAccountInstance.updateIdleBank(true);
        await this.driver.$('//android.widget.ImageView[@resource-id="id.dana:id/h5_iv_nav_back"]')
            .waitForDisplayed({ timeout: 10000 });
        await this.driver.$('//android.widget.ImageView[@resource-id="id.dana:id/h5_iv_nav_back"]').click();
        await this.driver.$('//android.view.ViewGroup[@resource-id="id.dana:id/cl_container_dana_button_secondary_view"]').waitForDisplayed({ timeout: 10000 });
        await this.driver.$('//android.view.ViewGroup[@resource-id="id.dana:id/cl_container_dana_button_secondary_view"]').click();
        printMsg("Transaction status updated to 'success' with details: " + trxId);
    }

    handlePopUpSystem = async () => {
        await this.driver.pause(1000);
        if (await this.driver.$('id=com.android.permissioncontroller:id/permission_allow_button').isExisting()) {
            await allowBtn.$('id=com.android.permissioncontroller:id/permission_allow_button').click();
            printMsg("✅ Notification popup allowed");
        } else {
            printMsg("ℹ️ No notification popup appeared");
        }
    }

    closeAds = async (maxRetries = 2) => {
        let attempts = 0;

        while (attempts < maxRetries) {
            attempts++;

            await this.driver.pause(1000);

            try {
                if (await this.driver.$('id=id.dana:id/close').isExisting()) {
                    await this.driver.$('id=id.dana:id/close').click();
                    printMsg("✅ ADS closed");
                } else {
                    printMsg("ℹ️ No ads to close");
                    break;
                }
            } catch (err) {
                console.warn("⚠️ Cannot find or click close button, retrying...", err.message);
                await this.driver.pause(1000);
            }
        }

        if (attempts >= maxRetries) {
            printMsg("⚠️ Max retries reached, stop trying to close ads");
        }
    }

    getNextElementText = async (label) => {
        const allTextViews = await this.driver.$$('//android.widget.TextView');

        let result = null;
        for (let i = 0; i < allTextViews.length; i++) {
            const text = await allTextViews[i].getText();
            if (typeof label == 'string') {
                if (text === label) {
                    result = await allTextViews[i + 1].getText();
                    break;
                }
            } else if (label?.length > 1) {
                if (label?.includes(text)) {
                    result = await allTextViews[i + 1].getText();
                    break;
                }
            }
        }

        return result;
    }

    type = async (value) => {
        await new Promise((r) => setTimeout(r, 2000));
        const str = typeof value == 'string' ? value : value?.toString();
        let capsOn = false;
        for (const char of str) {
            const keyCode = KEYCODES[char];
            if (keyCode !== undefined) {
                if (char >= "A" && char <= "Z" && !capsOn) {
                    await this.driver.pressKeyCode(KEYCODES.CAPS_LOCK);
                    capsOn = true;
                } else if (capsOn) {
                    await this.driver.pressKeyCode(KEYCODES.CAPS_LOCK);
                    capsOn = false;
                }

                await this.driver.pressKeyCode(keyCode);
            } else {
                throw new Error(`Unsupported char: ${char}`);
            }
        }
    }
}

module.exports = Scraper;