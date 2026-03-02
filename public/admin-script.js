let currentToken = null;

function login() {
  const username = document.getElementById('admin-user').value;
  const password = document.getElementById('admin-pass').value;
  fetch('/api/admin/login', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({username, password})
  })
  .then(r => r.json())
  .then(data => {
    if (data.success) {
      currentToken = data.token;
      localStorage.setItem('adminToken', currentToken);
      document.getElementById('login-screen').classList.add('hidden');
      document.getElementById('dashboard').classList.remove('hidden');
      loadAll();
    } else {
      document.getElementById('login-error').classList.remove('hidden');
      document.getElementById('login-error').textContent = data.message;
    }
  });
}

function logout() {
  localStorage.removeItem('adminToken');
  location.reload();
}

// Auth header helper
function authHeaders() {
  return { Authorization: `Bearer ${currentToken || localStorage.getItem('adminToken')}` };
}

async function loadStats() {
  const res = await fetch('/api/admin/stats', { headers: authHeaders() });
  const data = await res.json();
  document.getElementById('stats').innerHTML = `
    <div class="bg-white p-6 rounded-3xl shadow">
      <p class="text-sm text-gray-500">Total Revenue</p>
      <p class="text-4xl font-bold text-green-600">KES ${data.totalRevenue.toLocaleString()}</p>
    </div>
    <div class="bg-white p-6 rounded-3xl shadow">
      <p class="text-sm text-gray-500">Today</p>
      <p class="text-4xl font-bold text-green-600">KES ${data.todayRevenue.toLocaleString()}</p>
    </div>
    <div class="bg-white p-6 rounded-3xl shadow">
      <p class="text-sm text-gray-500">Active Vouchers</p>
      <p class="text-4xl font-bold">${data.activeVouchers}</p>
    </div>
    <div class="bg-white p-6 rounded-3xl shadow">
      <p class="text-sm text-gray-500">Total Vouchers</p>
      <p class="text-4xl font-bold">${data.totalVouchers}</p>
    </div>
    <div class="bg-white p-6 rounded-3xl shadow">
      <p class="text-sm text-gray-500">Success Rate</p>
      <p class="text-4xl font-bold">${data.successRate}%</p>
    </div>
  `;
}

async function loadPayments() {
  const search = document.getElementById('payment-search').value;
  const status = document.getElementById('status-filter').value;
  const res = await fetch(`/api/admin/payments?search=${encodeURIComponent(search)}&status=${status}`, { headers: authHeaders() });
  const payments = await res.json();
  let html = `<thead><tr class="bg-gray-50"><th class="py-4 px-6 text-left">Date</th><th>Phone</th><th>Amount</th><th>Duration</th><th>TX ID</th><th>Status</th></tr></thead><tbody>`;
  payments.forEach(p => {
    const statusColor = p.status === 'success' ? 'text-green-600' : p.status === 'failed' ? 'text-red-600' : 'text-amber-600';
    html += `<tr class="border-t"><td class="py-4 px-6">${new Date(p.created_at).toLocaleString()}</td>
             <td>${p.phone}</td><td class="font-semibold">KES ${p.amount}</td>
             <td>${p.duration_minutes} min</td><td class="font-mono text-xs">${p.transaction_id}</td>
             <td><span class="${statusColor} font-medium">${p.status}</span></td></tr>`;
  });
  html += `</tbody>`;
  document.getElementById('payments-table').innerHTML = html;
}

async function loadVouchers() {
  const res = await fetch('/api/admin/vouchers', { headers: authHeaders() });
  const vouchers = await res.json();
  let html = `<thead><tr class="bg-gray-50"><th class="py-4 px-6 text-left">Username</th><th>Password</th><th>Amount</th><th>Expires</th><th>Status</th><th>Action</th></tr></thead><tbody>`;
  vouchers.forEach(v => {
    const active = new Date(v.expiry) > new Date();
    html += `<tr class="border-t"><td class="py-4 px-6 font-mono">${v.username}</td>
             <td class="font-mono">${v.password}</td>
             <td>KES ${v.amount}</td>
             <td>${new Date(v.expiry).toLocaleString()}</td>
             <td><span class="${active ? 'text-green-600' : 'text-red-600'}">${active ? 'Active' : 'Expired'}</span></td>
             <td><button onclick="revokeVoucher('${v.username}')" class="text-red-600 hover:underline text-sm">Revoke</button></td></tr>`;
  });
  html += `</tbody>`;
  document.getElementById('vouchers-table').innerHTML = html;
}

async function revokeVoucher(username) {
  if (!confirm(`Revoke voucher ${username}?`)) return;
  await fetch(`/api/admin/revoke/${username}`, { method: 'POST', headers: authHeaders() });
  loadVouchers();
}

async function createManualVoucher() {
  const amount = parseFloat(document.getElementById('manual-amount').value);
  const duration = parseInt(document.getElementById('manual-duration').value);
  if (!amount || !duration) return alert('Fill both fields');
  const res = await fetch('/api/admin/create-voucher', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ amount, duration })
  });
  const data = await res.json();
  if (data.success) {
    alert(`✅ Voucher created!\nUsername: ${data.username}\nPassword: ${data.password}`);
    loadVouchers();
  }
}

function showTab(n) {
  document.querySelectorAll('[id^="tab-content"]').forEach(el => el.classList.add('hidden'));
  document.getElementById(`tab-content-${n}`).classList.remove('hidden');
  document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active', 'border-b-2', 'border-indigo-600', 'text-indigo-600'));
  document.getElementById(`tab-${n}`).classList.add('active', 'border-b-2', 'border-indigo-600', 'text-indigo-600');
}

async function loadAll() {
  loadStats();
  loadPayments();
  loadVouchers();
  showTab(0);
}

// Auto login if token exists
if (localStorage.getItem('adminToken')) {
  currentToken = localStorage.getItem('adminToken');
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');
  loadAll();
}