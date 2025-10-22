const moment = require("moment");
const colors = require("colors");
const { CORE_MOBILE_URL, ACCOUNT_NUMBER } = require('./config')
const BankAccount = require("./bankAccount");

const printMsg = (msg) => {
    console.log(
        colors.yellow(moment().format("YYYY-MM-DD hh:mm:ss")),
        colors.green(msg)
    );
};

async function stopInstance() {
  try {
    await new BankAccount().updateIdleBank(true);
    await fetch(`${CORE_MOBILE_URL}/stop?account_number=${ACCOUNT_NUMBER}`);
  } catch (e) {
    console.error(e);
  }
}

module.exports = {
    printMsg,
    stopInstance
};
