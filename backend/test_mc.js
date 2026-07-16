import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

async function testMC() {
    try {
        const customerId = process.env.MESSAGECENTRAL_CUSTOMER_ID;
        const password = process.env.MESSAGECENTRAL_PASSWORD;
        let token = password;
        if (!password.startsWith('eyJ')) {
            const key = Buffer.from(password).toString('base64');
            const authUrl = `https://cpaas.messagecentral.com/auth/v1/authentication/token?country=IN&customerId=${customerId}&key=${key}&scope=NEW`;
            console.log('Authenticating...');
            const authRes = await axios.get(authUrl);
            token = authRes.data.token;
            console.log('Got token:', token ? 'yes' : 'no');
        } else {
            console.log('Using JWT token directly');
        }

        const value = "9942277523"; // the number in the screenshot
        const url = `https://cpaas.messagecentral.com/verification/v3/send?countryCode=91&customerId=${customerId}&flowType=SMS&mobileNumber=${value}`;
        console.log('Sending OTP...');
        const res = await axios.post(url, {}, { headers: { authToken: token } });
        console.log('Response:', JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.error('Error:', e.response?.data || e.message);
    }
}
testMC();
