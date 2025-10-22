const path = require("path");
const { default: ax } = require("axios");
const { BASE_URL, API_KEY, ACCOUNT_NUMBER } = require(".");

class Config {
    base_dir = path.join(__dirname, "../../data");
    axios;

    constructor() {
        this.axios = ax.create({
            baseURL: BASE_URL,
        });

        // Add interceptor to attach headers
        this.axios.interceptors.request.use(config => {
            config.headers["x-api-key"] = API_KEY;
            return config;
        });
    }

    account = async function() {
        const { data: response } = await this.axios.get("/bank-accounts", {
            params: {
                account_number: ACCOUNT_NUMBER,
            },
        });

        return response.data; 
    }
}

module.exports = Config;