let token = localStorage.getItem('adminToken');

async function login() { /* keep your existing login if needed, but since we already have it */ }

async function loadStats() {
  const res = await fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  document.getElementById('stats').innerHTML = `
    <div class="bg-white rounded-3xl p-6 shadow">
      <div class="text-teal-500 text-sm">Total Revenue</div>
      <div class="text-4xl font-bold text-slate-900">KES ${data.totalRevenue.toLocaleString()}</div>
    </div>
    <div class="bg-white rounded-3xl p-6 shadow">
      <div class="text-teal-500 text-sm">Today</div>
      <div class="text-4xl font-bold text-slate-900">KES ${data.todayRevenue.toLocaleString()}</div>
    </div>
    <div class="bg-white rounded-3xl p-6 shadow">
      <div class="text-teal-500 text-sm">Active Vouchers</div>
      <div class="text-4xl font-bold">${data.activeVouchers}</div>
    </div>
    <div class="bg-white rounded-3xl p-6 shadow">
      <div class="text-teal-500 text-sm">Success Rate</div>
      <div class="text-4xl font-bold">${data.successRate}%</div>
    </div>
  `;
}

async function loadPayments() {
  // ... keep your existing loadPayments but enhance table with better badges
  const res = await fetch('/api/admin/payments', { headers: { Authorization: `Bearer ${token}` } });
  const payments = await res.json();
  let html = `<div class="bg-white rounded-3xl overflow-hidden"><table class="w-full"><thead><tr class="bg-slate-50"><th class="py-5 px-6 text-left">Date</th><th>Phone</th><th>Amount</th><th>Status</th></tr></thead><tbody>`;
  payments.forEach(p => {
    const statusClass = p.status === 'success' ? 'bg-emerald-100 text-emerald-700' : p.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
    html += `<tr class="border-t"><td class="py-5 px-6">${new Date(p.created_at).toLocaleString()}</td>
             <td class="font-medium">${p.phone}</td>
             <td class="font-bold">KES ${p.amount}</td>
             <td><span class="px-4 py-1 text-xs font-medium rounded-2xl ${statusClass}">${p.status}</span></td></tr>`;
  });
  html += `</tbody></table></div>`;
  document.getElementById('tab-content-0').innerHTML = html;
}

async function loadVouchers() {
  const res = await fetch('/api/admin/vouchers', { headers: { Authorization: `Bearer ${token}` } });
  const vouchers = await res.json();
  let html = `<div class="bg-white rounded-3xl overflow-hidden"><table class="w-full"><thead><tr class="bg-slate-50"><th class="py-5 px-6 text-left">Username</th><th>Password</th><th>Expires</th><th>Status</th><th></th></tr></thead><tbody>`;
  vouchers.forEach(v => {
    const active = new Date(v.expiry) > Date.now();
    html += `<tr class="border-t"><td class="py-5 px-6 font-mono">${v.username}</td>
             <td class="font-mono">${v.password}</td>
             <td>${new Date(v.expiry).toLocaleString()}</td>
             <td><span class="${active ? 'text-emerald-600' : 'text-red-600'}">${active ? 'Active' : 'Expired'}</span></td>
             <td><button onclick="revoke('${v.username}')" class="text-red-600 text-sm hover:underline">Revoke</button></td></tr>`;
  });
  html += `</tbody></table></div>`;
  document.getElementById('tab-content-1').innerHTML = html;
}

function showTab(n) {
  document.querySelectorAll('[id^="tab-content"]').forEach(el => el.classList.add('hidden'));
  document.getElementById(`tab-content-${n}`).classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById(`nav-${n}`).classList.add('active');
}

async function refreshAll() {
  loadStats();
  loadPayments();
  loadVouchers();
}

async function exportCSV() {
  alert('CSV export coming in next update (or copy table manually)');
}

function revoke(username) {
  if (confirm(`Revoke ${username}?`)) {
    fetch(`/api/admin/revoke/${username}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      .then(() => loadVouchers());
  }
}

function logout() {
  localStorage.removeItem('adminToken');
  location.reload();
}

// Auto refresh every 8 seconds
setInterval(refreshAll, 8000);

// Load everything on start
if (token) {
  refreshAll();
  showTab(0);
}