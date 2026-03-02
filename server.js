require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const axios = require('axios');
const cors = require('cors');
const crypto = require('crypto');
const { RouterOSClient } = require('mikro-routeros');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ========== ADMIN AUTH (simple, production-ready enough for start) ==========
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin2026';   // ← CHANGE THIS IMMEDIATELY!
const adminTokens = new Map();        // token → expiry timestamp

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function isAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.slice(7);
  const expiry = adminTokens.get(token);
  if (!expiry || Date.now() > expiry) {
    adminTokens.delete(token);
    return res.status(401).json({ error: 'Session expired' });
  }
  next();
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});

const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT}`;
const DARAJA_BASE = 'https://sandbox.safaricom.co.ke'; // change to https://api.safaricom.co.ke for live

async function getDarajaToken() {
  const auth = Buffer.from(`${process.env.CONSUMER_KEY}:${process.env.CONSUMER_SECRET}`).toString('base64');
  const res = await axios.get(`${DARAJA_BASE}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` }
  });
  return res.data.access_token;
}

function normalizePhone(phone) {
  phone = phone.replace(/\D/g, '');
  if (phone.startsWith('0')) phone = '254' + phone.slice(1);
  if (!phone.startsWith('254')) phone = '254' + phone;
  return phone;
}

function minutesToLimit(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

async function addVoucherToMikroTik(username, password, limitUptime) {
  let client = null;
  try {
    client = new RouterOSClient(
      process.env.MIKRO_HOST, 
      parseInt(process.env.MIKRO_PORT || 8728)
    );
    
    await client.connect();
    await client.login(process.env.MIKRO_USER, process.env.MIKRO_PASS);
    
    await client.runQuery('/ip/hotspot/user/add', {
      name: username,
      password: password,
      'limit-uptime': limitUptime,
      comment: 'Auto-generated via M-Pesa'
    });

    console.log(`✅ MikroTik voucher added: ${username}`);
  } catch (e) {
    console.error('❌ MikroTik error:', e.message);
    throw e;
  } finally {
    if (client) {
      try {
        if (typeof client.close === 'function') {
          await Promise.resolve(client.close());
        }
      } catch (closeErr) {
        console.warn('⚠️ Could not close MikroTik connection cleanly (safe to ignore):', closeErr.message);
      }
    }
  }
}

app.post('/api/initiate', async (req, res) => {
  let { phone, amount, duration } = req.body;
  phone = normalizePhone(phone);
  const checkoutRef = 'HS' + Date.now();

  try {
    const token = await getDarajaToken();
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const pass = Buffer.from(`${process.env.SHORTCODE}${process.env.PASSKEY}${timestamp}`).toString('base64');

    const payload = {
      BusinessShortCode: process.env.SHORTCODE,
      Password: pass,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: amount,
      PartyA: phone,
      PartyB: process.env.SHORTCODE,
      PhoneNumber: phone,
      CallBackURL: `${BASE_URL}/mpesa/callback`,
      AccountReference: checkoutRef,
      TransactionDesc: "Hotspot Access"
    };

    const stkRes = await axios.post(`${DARAJA_BASE}/mpesa/stkpush/v1/processrequest`, payload, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const checkoutRequestID = stkRes.data.CheckoutRequestID;

    await pool.execute(
      `INSERT INTO payments (phone, amount, duration_minutes, transaction_id, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [phone, amount, duration, checkoutRequestID]
    );

    res.json({ success: true, checkoutRequestID, message: '✅ Check your phone for M-Pesa STK push' });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ success: false, message: 'Payment initiation failed' });
  }
});

app.post('/mpesa/callback', async (req, res) => {
  try {
    const data = req.body;
    const stk = data.Body.stkCallback;
    const checkoutID = stk.CheckoutRequestID;

    const [rows] = await pool.execute('SELECT * FROM payments WHERE transaction_id = ?', [checkoutID]);
    if (rows.length === 0) return res.json({ ResultCode: 0 });

    const payment = rows[0];

    if (stk.ResultCode === 0) {
      const meta = stk.CallbackMetadata.Item;
      const mpesaReceipt = meta.find(i => i.Name === 'MpesaReceiptNumber').Value;
      const amountPaid = parseFloat(meta.find(i => i.Name === 'Amount').Value);

      const username = 'HS' + crypto.randomBytes(4).toString('hex').toUpperCase();
      const password = crypto.randomBytes(3).toString('hex').toUpperCase().padEnd(6, 'X');
      const limitStr = minutesToLimit(payment.duration_minutes);
      const expiry = new Date(Date.now() + payment.duration_minutes * 60000);

      // Add to MikroTik
      await addVoucherToMikroTik(username, password, limitStr);

      // Save voucher
      await pool.execute(
        `INSERT INTO vouchers (username, password, amount, duration_minutes, expiry, payment_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [username, password, amountPaid, payment.duration_minutes, expiry, payment.id]
      );

      // Update payment
      await pool.execute(
        `UPDATE payments SET status='success', mpesa_receipt=? WHERE id=?`,
        [mpesaReceipt, payment.id]
      );

      console.log(`🎉 Payment success! Voucher ${username} created`);
    } else {
      await pool.execute("UPDATE payments SET status='failed' WHERE id=?", [payment.id]);
    }

    res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (e) {
    console.error('Callback error:', e);
    res.json({ ResultCode: 0 });
  }
});

app.get('/api/status/:checkoutID', async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT p.status, v.username, v.password, v.expiry 
     FROM payments p 
     LEFT JOIN vouchers v ON v.payment_id = p.id 
     WHERE p.transaction_id = ?`,
    [req.params.checkoutID]
  );

  if (rows.length === 0) return res.json({ status: 'notfound' });

  const r = rows[0];
  if (r.status === 'success') {
    res.json({
      status: 'success',
      username: r.username,
      password: r.password,
      expiry: r.expiry
    });
  } else {
    res.json({ status: r.status });
  }
});

// ====================== ADMIN ROUTES ======================

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = generateToken();
    const expiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    adminTokens.set(token, expiry);
    res.json({ success: true, token });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

// Stats
app.get('/api/admin/stats', isAdminAuth, async (req, res) => {
  try {
    const [[totalRevenue]] = await pool.execute(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE status = 'success'`
    );
    const [[todayRevenue]] = await pool.execute(
      `SELECT COALESCE(SUM(amount), 0) AS today FROM payments 
       WHERE status = 'success' AND DATE(created_at) = CURDATE()`
    );
    const [[totalVouchers]] = await pool.execute(`SELECT COUNT(*) AS cnt FROM vouchers`);
    const [[activeVouchers]] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM vouchers WHERE expiry > NOW()`
    );
    const [[successRate]] = await pool.execute(
      `SELECT ROUND(COALESCE(COUNT(CASE WHEN status='success' THEN 1 END)*100/NULLIF(COUNT(*),0), 0), 1) AS rate 
       FROM payments`
    );

    res.json({
      totalRevenue: parseFloat(totalRevenue.total),
      todayRevenue: parseFloat(todayRevenue.today),
      totalVouchers: totalVouchers.cnt,
      activeVouchers: activeVouchers.cnt,
      successRate: successRate.rate
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// All Payments
app.get('/api/admin/payments', isAdminAuth, async (req, res) => {
  const { search, status } = req.query;
  let sql = `SELECT * FROM payments ORDER BY created_at DESC`;
  const params = [];
  if (status && status !== 'all') {
    sql = `SELECT * FROM payments WHERE status = ? ORDER BY created_at DESC`;
    params.push(status);
  }
  if (search) {
    sql = sql.includes('WHERE') 
      ? sql.replace('ORDER BY', `AND (phone LIKE ? OR transaction_id LIKE ?) ORDER BY`) 
      : `SELECT * FROM payments WHERE (phone LIKE ? OR transaction_id LIKE ?) ORDER BY created_at DESC`;
    params.push(`%${search}%`, `%${search}%`);
  }
  const [rows] = await pool.execute(sql, params);
  res.json(rows);
});

// All Vouchers
app.get('/api/admin/vouchers', isAdminAuth, async (req, res) => {
  const [rows] = await pool.execute(`
    SELECT v.*, p.phone, p.mpesa_receipt 
    FROM vouchers v 
    LEFT JOIN payments p ON v.payment_id = p.id 
    ORDER BY v.created_at DESC
  `);
  res.json(rows);
});

// Replace the whole revoke block with this:
app.post('/api/admin/revoke/:username', isAdminAuth, async (req, res) => {
  const { username } = req.params;
  let client = null;
  try {
    client = new RouterOSClient(process.env.MIKRO_HOST, parseInt(process.env.MIKRO_PORT || 8728));
    await client.connect();
    await client.login(process.env.MIKRO_USER, process.env.MIKRO_PASS);
    await client.runQuery('/ip/hotspot/user/remove', { name: username });
    console.log(`🗑️ MikroTik voucher revoked: ${username}`);
  } catch (e) {
    console.error('MikroTik revoke error:', e.message);
  } finally {
    if (client) {
      try {
        if (typeof client.close === 'function') {
          await Promise.resolve(client.close());
        }
      } catch {}
    }
  }

  // Delete from DB
  await pool.execute('DELETE FROM vouchers WHERE username = ?', [username]);
  res.json({ success: true });
});

// Manual voucher creation (bonus feature)
app.post('/api/admin/create-voucher', isAdminAuth, async (req, res) => {
  const { amount, duration } = req.body;
  const username = 'MAN' + crypto.randomBytes(4).toString('hex').toUpperCase();
  const password = crypto.randomBytes(4).toString('hex').toUpperCase();
  const limitStr = minutesToLimit(duration);
  const expiry = new Date(Date.now() + duration * 60000);

  try {
    await addVoucherToMikroTik(username, password, limitStr);
    await pool.execute(
      `INSERT INTO vouchers (username, password, amount, duration_minutes, expiry)
       VALUES (?, ?, ?, ?, ?)`,
      [username, password, amount, duration, expiry]
    );
    res.json({ success: true, username, password });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));