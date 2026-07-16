


































































































































































































































































































































































































































































import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import sql from '../db.js';
import auth from '../middleware/auth.js';
import axios from 'axios';
import { dbErrorResponse } from '../utils/dbError.js';

const router = Router();

// Generate unique ID like SM-XXXXXX
function generateUniqueId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'SM-';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Register
router.post('/register', async (req, res) => {
    try {
        const {
            email, mobile, password, profileFor, gender, fullName,
            dob, dobDay, dobMonth, dobYear, motherTongue, height, physicalStatus,
            maritalStatus, religion, sect, caste, country, state, city,
            education, employmentType, occupation, currency, income,
            horoscope, timeOfBirth, placeOfBirth, diet, smoking, drinking,
            familyType, fatherOccupation, motherOccupation,
            brothers, brothersMarried, sisters, sistersMarried,
            familyLivingIn, contactAddress, havingChildren, numberOfChildren,
            residentialStatus, partnerPreference, about, photo,
            uniqueId: requestedUniqueId
        } = req.body;

        // Validate required fields
        if (!email && !mobile) {
            return res.status(400).json({ error: 'Email or mobile is required' });
        }
        if (!password || password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        // Check if email already exists
        if (email) {
            const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
            if (existing.length > 0) {
                return res.status(400).json({ error: 'Email already registered' });
            }
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Generate or use provided unique ID
        let uniqueId = requestedUniqueId || generateUniqueId();

        // Ensure unique ID is actually unique
        let idExists = await sql`SELECT id FROM users WHERE unique_id = ${uniqueId}`;
        while (idExists.length > 0) {
            uniqueId = generateUniqueId();
            idExists = await sql`SELECT id FROM users WHERE unique_id = ${uniqueId}`;
        }

        // Determine gender from profileFor
        let finalGender = gender;
        if (profileFor === 'Son') finalGender = 'Male';
        else if (profileFor === 'Daughter') finalGender = 'Female';

        // Create user
        const userResult = await sql`
      INSERT INTO users (unique_id, email, mobile, password_hash, profile_for, gender)
      VALUES (${uniqueId}, ${email || null}, ${mobile || null}, ${passwordHash}, ${profileFor || 'Self'}, ${finalGender || null})
      RETURNING id, unique_id, email, mobile, gender, profile_for, created_at
    `;

        const user = userResult[0];

        // Create profile
        await sql`
      INSERT INTO profiles (
        user_id, full_name, gender, dob, dob_day, dob_month, dob_year,
        mother_tongue, height, physical_status, marital_status,
        having_children, number_of_children, religion, sect, caste,
        horoscope, time_of_birth, place_of_birth,
        country, state, city, residential_status,
        education, employment_type, occupation, currency, income,
        smoking, drinking, diet, about, partner_preference,
        family_type, father_occupation, mother_occupation,
        brothers, brothers_married, sisters, sisters_married,
        family_living_in, contact_address, photo
      ) VALUES (
        ${user.id}, ${fullName || null}, ${finalGender || null},
        ${dob || null}, ${dobDay || null}, ${dobMonth || null}, ${dobYear || null},
        ${motherTongue || null}, ${height || null}, ${physicalStatus || 'Normal'},
        ${maritalStatus || 'Never Married'},
        ${havingChildren || null}, ${numberOfChildren || null},
        ${religion || null}, ${sect || null}, ${caste || null},
        ${horoscope || null}, ${timeOfBirth || null}, ${placeOfBirth || null},
        ${country || null}, ${state || null}, ${city || null}, ${residentialStatus || null},
        ${education || null}, ${employmentType || null}, ${occupation || null},
        ${currency || 'INR'}, ${income || null},
        ${smoking || null}, ${drinking || null}, ${diet || null},
        ${about || null}, ${partnerPreference || null},
        ${familyType || null}, ${fatherOccupation || null}, ${motherOccupation || null},
        ${brothers || null}, ${brothersMarried || null},
        ${sisters || null}, ${sistersMarried || null},
        ${familyLivingIn || null}, ${contactAddress || null}, ${photo || null}
      )
    `;

        // Create default preferences
        await sql`
      INSERT INTO preferences (user_id, pref_age_from, pref_age_to)
      VALUES (${user.id}, '18', '30')
    `;

        // Create default favourites
        await sql`
      INSERT INTO user_favourites (user_id)
      VALUES (${user.id})
    `;

        // Generate JWT
        const token = jwt.sign(
            { id: user.id, uniqueId: user.unique_id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.status(201).json({
            message: 'Registration successful',
            token,
            user: {
                id: user.id,
                uniqueId: user.unique_id,
                email: user.email,
                mobile: user.mobile,
                gender: user.gender,
                profileFor: user.profile_for,
                fullName: fullName || ''
            }
        });
    } catch (error) {
        return dbErrorResponse(res, 'Register error', error, 'Registration failed. Please try again.');
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        // Find user by email or mobile
        const users = await sql`
      SELECT u.*, p.full_name FROM users u
      LEFT JOIN profiles p ON p.user_id = u.id
      WHERE u.email = ${username} OR u.mobile = ${username} OR u.unique_id = ${username}
    `;

        if (users.length === 0) {
            return res.status(401).json({ error: 'Email does not exist.' });
        }

        const user = users[0];

        // Check password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Password is incorrect.' });
        }

        // Generate JWT
        const token = jwt.sign(
            { id: user.id, uniqueId: user.unique_id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        // Check deactivation status
        let isDeactivated = false;
        let reactivateAt = null;
        try {
            const deactivation = await sql`SELECT is_active, reactivate_at FROM deactivations WHERE user_id = ${user.id}`;
            if (deactivation.length > 0 && !deactivation[0].is_active) {
                // Check if auto-reactivation time has passed
                if (deactivation[0].reactivate_at && new Date(deactivation[0].reactivate_at) <= new Date()) {
                    await sql`UPDATE deactivations SET is_active = true, reactivate_at = NULL WHERE user_id = ${user.id}`;
                } else {
                    isDeactivated = true;
                    reactivateAt = deactivation[0].reactivate_at;
                }
            }
        } catch (e) {
            // deactivations table might not exist yet, ignore
        }

        res.json({
            message: 'Login successful',
            token,
            isDeactivated,
            reactivateAt,
            user: {
                id: user.id,
                uniqueId: user.unique_id,
                email: user.email,
                mobile: user.mobile,
                gender: user.gender,
                profileFor: user.profile_for,
                fullName: user.full_name || ''
            }
        });
    } catch (error) {
        return dbErrorResponse(res, 'Login error', error, 'Login failed. Please try again.');
    }
});

// Get current user
router.get('/me', auth, async (req, res) => {
    try {
        const users = await sql`
      SELECT u.id, u.unique_id, u.email, u.mobile, u.gender, u.profile_for, u.created_at,
             p.full_name, p.photo
      FROM users u
      LEFT JOIN profiles p ON p.user_id = u.id
      WHERE u.id = ${req.user.id}
    `;

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = users[0];
        res.json({
            id: user.id,
            uniqueId: user.unique_id,
            email: user.email,
            mobile: user.mobile,
            gender: user.gender,
            profileFor: user.profile_for,
            fullName: user.full_name || '',
            photo: user.photo || '',
            createdAt: user.created_at
        });
    } catch (error) {
        return dbErrorResponse(res, 'Get me error', error, 'Failed to get user info');
    }
});

// Check email availability
router.post('/check-email', async (req, res) => {
    try {
        const { email } = req.body;
        const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
        res.json({ available: existing.length === 0 });
    } catch (error) {
        res.status(500).json({ error: 'Check failed' });
    }
});

// Check mobile availability
router.post('/check-mobile', async (req, res) => {
    try {
        const { mobile } = req.body;
        const existing = await sql`SELECT id FROM users WHERE mobile = ${mobile}`;
        res.json({ available: existing.length === 0 });
    } catch (error) {
        res.status(500).json({ error: 'Check failed' });
    }
});

// Check unique ID availability
router.post('/check-id', async (req, res) => {
    try {
        const { uniqueId } = req.body;
        const existing = await sql`SELECT id FROM users WHERE unique_id = ${uniqueId}`;
        res.json({ available: existing.length === 0 });
    } catch (error) {
        res.status(500).json({ error: 'Check failed' });
    }
});

// Message Central API Helper
async function getMessageCentralToken() {
    const customerId = process.env.MESSAGECENTRAL_CUSTOMER_ID;
    const password = process.env.MESSAGECENTRAL_PASSWORD;
    if (!customerId || !password) return null;

    // If the provided password is a long-lived JWT token, return it directly
    if (password.startsWith('eyJ')) {
        return password;
    }

    if (global.mcToken && global.mcTokenExpires > Date.now()) {
        return global.mcToken;
    }

    const key = Buffer.from(password).toString('base64');
    const url = `https://cpaas.messagecentral.com/auth/v1/authentication/token?country=IN&customerId=${customerId}&key=${key}&scope=NEW`;

    const response = await axios.get(url);
    if (response.data && response.data.token) {
        global.mcToken = response.data.token;
        global.mcTokenExpires = Date.now() + (23 * 60 * 60 * 1000); // Token expires in 24 hours, Cache for 23 hours
        return global.mcToken;
    }
    throw new Error('Could not generate Message Central token');
}

// Send OTP
router.post('/send-otp', async (req, res) => {
    try {
        const { type, value } = req.body;

        if (type === 'login' || type === 'forgot') {
            const users = await sql`SELECT id FROM users WHERE email = ${value} OR mobile = ${value} OR unique_id = ${value}`;
            if (users.length === 0) {
                return res.status(404).json({ error: 'Account with this mobile/email does not exist.' });
            }
        }

        global.otpStore = global.otpStore || {};
        const isMobile = /^\d{10}$/.test(value);

        if (isMobile) {
            try {
                const token = await getMessageCentralToken();
                if (!token) {
                    return res.status(500).json({ error: 'SMS service not configured.' });
                }

                console.log(`Attempting to send OTP via Message Central to ${value}...`);
                const customerId = process.env.MESSAGECENTRAL_CUSTOMER_ID;
                const url = `https://cpaas.messagecentral.com/verification/v3/send?countryCode=91&customerId=${customerId}&flowType=SMS&mobileNumber=${value}`;

                const response = await axios.post(url, {}, { headers: { authToken: token } });

                if (response.data && response.data.responseCode == 200) {
                    const verificationId = response.data.data.verificationId;
                    console.log(`Message Central Success! Verification ID: ${verificationId}`);
                    global.otpStore[value] = { verificationId, type: 'sms', expires: Date.now() + 5 * 60 * 1000 };
                } else if (response.data && response.data.responseCode == 506) {
                    return res.status(429).json({ error: 'OTP request already exists. Please wait a minute and try again.' });
                } else if (response.data && response.data.responseCode == 508) {
                    return res.status(503).json({ error: 'SMS service temporarily unavailable. Please login with your password instead.' });
                } else {
                    throw new Error(JSON.stringify(response.data));
                }
            } catch (err) {
                console.error("Message Central Error Details:", err.response?.data || err.message);
                const errorMessage = err.response?.data?.message || err.message || 'Failed to send SMS.';
                return res.status(500).json({ error: `Message Central: ${errorMessage}` });
            }
        } else {
            const otp = Math.floor(1000 + Math.random() * 9000).toString();
            console.log(`Mock OTP for ${type} (${value}): ${otp}`);
            global.otpStore[value] = { otp, type: 'mock', expires: Date.now() + 5 * 60 * 1000 };
        }

        res.json({ message: `OTP sent to ${value}` });
    } catch (error) {
        console.error('OTP Error:', error);
        res.status(500).json({ error: 'Failed to send OTP' });
    }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
    try {
        const { value, otp } = req.body;

        const stored = global.otpStore?.[value];
        if (!stored || stored.expires < Date.now()) {
            return res.status(400).json({ error: 'OTP expired. Please request a new one.' });
        }

        if (stored.type === 'sms') {
            try {
                const token = await getMessageCentralToken();
                const customerId = process.env.MESSAGECENTRAL_CUSTOMER_ID;
                const url = `https://cpaas.messagecentral.com/verification/v3/validateOtp?countryCode=91&customerId=${customerId}&mobileNumber=${value}&verificationId=${stored.verificationId}&code=${otp}`;

                const response = await axios.get(url, { headers: { authToken: token } });
                console.log("Message Central Verify Response:", response.data);

                if (response.data && response.data.responseCode == 200) {
                    // Success: OTP is valid, let code flow continue to JWT generation below
                } else if (response.data && response.data.responseCode == 702) {
                    return res.status(400).json({ error: 'Incorrect OTP. Please try again.' });
                } else if (response.data && response.data.responseCode == 705) {
                    return res.status(400).json({ error: 'OTP has expired.' });
                } else {
                    return res.status(400).json({ error: response.data?.message || 'Invalid OTP' });
                }
            } catch (err) {
                console.error("Message Central Verify Error:", err.response?.data || err.message);
                return res.status(400).json({ error: 'Invalid OTP' });
            }
        } else {
            if (stored.otp !== otp) {
                return res.status(400).json({ error: 'Invalid OTP' });
            }
        }

        delete global.otpStore[value];

        // Check if user exists to provide token
        const users = await sql`
            SELECT u.id, u.email, u.mobile, p.full_name as "fullName", u.unique_id as "uniqueId", u.gender, u.profile_for as "profileFor" 
            FROM users u
            LEFT JOIN profiles p ON p.user_id = u.id
            WHERE u.email = ${value} OR u.mobile = ${value}
        `;

        if (users.length > 0) {
            const user = users[0];
            const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
            return res.json({
                verified: true,
                message: 'OTP verified and logged in',
                token,
                user
            });
        }

        res.json({ verified: true, message: 'OTP verified successfully' });
    } catch (error) {
        return dbErrorResponse(res, 'Verify OTP Error', error, 'Verification failed. Please try again.');
    }
});

// Reset Password
router.post('/reset-password', async (req, res) => {
    try {
        const { value, otp, newPassword } = req.body;

        if (!value || !otp || !newPassword) {
            return res.status(400).json({ error: 'Value, OTP, and new password are required' });
        }

        // 1. Verify OTP first
        const stored = global.otpStore?.[value];
        if (!stored || stored.expires < Date.now()) {
            return res.status(400).json({ error: 'OTP expired. Please request a new one.' });
        }

        if (stored.type === 'sms') {
            try {
                const token = await getMessageCentralToken();
                const customerId = process.env.MESSAGECENTRAL_CUSTOMER_ID;
                const url = `https://cpaas.messagecentral.com/verification/v3/validateOtp?countryCode=91&customerId=${customerId}&mobileNumber=${value}&verificationId=${stored.verificationId}&code=${otp}`;

                const response = await axios.get(url, { headers: { authToken: token } });
                
                if (!(response.data && response.data.responseCode == 200)) {
                    return res.status(400).json({ error: 'Incorrect or expired OTP' });
                }
            } catch (err) {
                console.error("Message Central Verify Error:", err.response?.data || err.message);
                return res.status(400).json({ error: 'Invalid OTP' });
            }
        } else {
            if (stored.otp !== otp) {
                return res.status(400).json({ error: 'Invalid OTP' });
            }
        }

        // 2. OTP is valid, clear it
        delete global.otpStore[value];

        // 3. Update password
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(newPassword, salt);

        const result = await sql`
            UPDATE users SET password_hash = ${hash}
            WHERE email = ${value} OR mobile = ${value} OR unique_id = ${value}
            RETURNING id
        `;

        if (result.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ success: true, message: 'Password reset successfully' });
    } catch (error) {
        return dbErrorResponse(res, 'Reset Password Error', error, 'Failed to reset password');
    }
});

export default router;
