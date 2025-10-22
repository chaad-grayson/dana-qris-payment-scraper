const wdio = require("webdriverio");
const { spawn, exec } = require("child_process");
const { printMsg } = require("./helpers");
const Config = require("./config/config");
const fs = require("fs");

class Driver {
    terminalProcess = null;

    stopAppium = function ({
        port
    }) {
        if (this.terminalProcess) {
            try {
                process.kill(-this.terminalProcess.pid);
                printMsg("🛑 Appium terminal closed");
            } catch (e) {
                printMsg("⚠️ Failed to kill Appium terminal:", e.message);
            }
            this.terminalProcess = null;
        }

        if (process.platform === "win32") {
            exec(
                'for /f "tokens=5" %a in (\'netstat -ano ^| findstr :' + port + '\') do taskkill /F /PID %a',
                () => {
                    printMsg("🛑 Appium stopped on " + port);
                }
            );
        } else {
            exec("lsof -ti:" + port + " | xargs kill -9", () => {
                printMsg("🛑 Appium stopped on " + port);
            });
        }
    }

    startAppium = async function ({
        backgroundProcess = true,
        port
    }) {
        if (backgroundProcess) {
            return new Promise((resolve) => {
                const logStream = fs.createWriteStream("appium.log", { flags: "a" });

                this.terminalProcess = spawn("appium", ["-p", port], {
                    detached: true,
                    stdio: ["ignore", "pipe", "pipe"],
                    shell: true,
                });

                this.terminalProcess.stdout.pipe(logStream);
                this.terminalProcess.stderr.pipe(logStream);

                this.terminalProcess.unref();
                printMsg("🚀 Appium started (background, logs → appium.log)");

                setTimeout(resolve, 5000);
            });
        }

        return new Promise((resolve) => {
            if (process.platform === "win32") {
                this.terminalProcess = spawn("cmd", ["/c", "start", "cmd", "/k", "appium -p " + port], {
                    detached: true,
                    stdio: "ignore",
                });
            } else {
                this.terminalProcess = spawn("gnome-terminal", [
                    "--",
                    "bash",
                    "-c",
                    "appium -p " + port + "; exec bash",
                ], {
                    detached: true,
                    stdio: "ignore",
                });
            }

            if (this.terminalProcess) {
                this.terminalProcess.unref();
                printMsg("🚀 Appium started in new terminal");
            }

            setTimeout(() => resolve(), 5000);
        });
    }

    startApp = async function () {
        return new Promise((resolve, reject) => {
            printMsg("🔴 Stopping DANA...");
            exec(`adb shell am force-stop id.dana`, (err) => {
                if (err) return reject("❌ Failed to stop app");

                printMsg("🟢 Starting DANA...");
                exec(`adb shell monkey -p id.dana -c android.intent.category.LAUNCHER 1`, (err2) => {
                    if (err2) return reject("❌ Failed to start app");

                    printMsg("✅ DANA launched successfully");
                    resolve();
                });
            });
        });
    };

    init = async function () {
        try {
            const config = new Config();
            const account = await config.account();

            if (!account) {
                console.error("Bank Account Not FOUND!!");
                return;
            }

            printMsg("Re open app");
            await this.startApp();

            printMsg("stopping appium");
            await this.stopAppium({
                port: 4723
            });

            printMsg("restarting appium");
            await this.startAppium({
                port: 4723
            });

            const opts = {
                hostname: "127.0.0.1",
                path: "/",
                port: 4723,
                logLevel: "error",
                capabilities: {
                    platformName: "Android",
                    "appium:automationName": "UiAutomator2",
                    "appium:deviceName": "RR8Y200XBGZ",
                    "appium:appPackage": "id.dana",
                    "appium:appActivity": "id.dana.home_v2.main.MainHomeActivity",
                    "appium:noReset": true,
                    "appium:fullReset": false,
                    "appium:newCommandTimeout": 300,
                    "appium:autoGrantPermissions": true,
                    "appium:ignoreHiddenApiPolicyError": true,
                },
            };
            const driver = await wdio.remote(opts);
            printMsg("Session ID:", driver.sessionId);

            return driver;
        } catch (err) {
            printMsg(err)
        }
    }
}

const driver = new Driver();

process.on("exit", driver.stopAppium);
process.on("SIGINT", () => process.exit());
process.on("SIGTERM", () => process.exit());

module.exports = Driver;