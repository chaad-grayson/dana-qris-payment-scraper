require("dotenv").config({ path: ".env" });

const BASE_URL = process.env.BASE_URL;
const API_KEY = process.env.API_KEY;
const ACCOUNT_NUMBER =  process.argv[2];
const CORE_MOBILE_URL = process.env.CORE_MOBILE_URL;

module.exports = {
    BASE_URL,
    API_KEY,
    ACCOUNT_NUMBER,
    CORE_MOBILE_URL
}
