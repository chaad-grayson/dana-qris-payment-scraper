const { ACCOUNT_NUMBER } = require("./config");
const Config = require("./config/config");

class BankAccount {
    config;

    constructor() {
        this.config = new Config();
    }

    update = async (body) => {
        try {
            await this.config.axios.post("/bank-accounts/update", {
                account_number: ACCOUNT_NUMBER,
                ...body,
            });
        } catch (error) {
            console.error(error);
        }
    };

    updateIdleBank = async (idle) => {
        try {
            await this.config.axios.patch("/bank-accounts/update-idle", {
                account_number: ACCOUNT_NUMBER,
                is_idle: idle,
            });
        } catch (error) {
            console.error(error);
        }
    };

    get = async function () {
        const { data: response } = await this.config.axios.get(
            "/bank-accounts",
            {
                params: {
                    account_number: ACCOUNT_NUMBER,
                },
            }
        );

        return response.data;
    };

    transactions = async function () {
        const { data: response } = await this.config.axios.get(
            "/transactions",
            {
                params: {
                    account_number: ACCOUNT_NUMBER,
                    status: "pending",
                },
            }
        );

        return response.data;
    };

    updateTransaction = async (transactionId, body) => {
        try {
            await this.config.axios.patch(`/transactions/${transactionId}`, {
                ...body,
            });
        } catch (error) {
            console.error(error);
        }
    };
}

module.exports = BankAccount;
