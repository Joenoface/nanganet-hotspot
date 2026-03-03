const packages = [
  {id:1, name:"1 Hour", amount:1, duration:60},
  {id:2, name:"24 Hours", amount:200, duration:1440},
  {id:3, name:"7 Days", amount:1000, duration:10080}
];

let selected = null;

function renderPackages() {
  const html = packages.map(p => `
    <div onclick="select(${p.id})" id="pkg-${p.id}" 
         class="package-card cursor-pointer bg-white border-2 border-transparent rounded-3xl p-6 hover:border-teal-400">
      <div class="flex justify-between items-start">
        <div>
          <div class="font-semibold text-xl">${p.name}</div>
          <div class="text-4xl font-bold text-slate-900 mt-1">KES ${p.amount}</div>
        </div>
        <button onclick="event.stopImmediatePropagation(); select(${p.id});" 
                class="gloss-btn text-white text-sm font-medium px-6 py-2.5 rounded-2xl shadow">
          SELECT
        </button>
      </div>
      <div class="text-xs text-teal-600 mt-4">${Math.floor(p.duration/60)} hours</div>
    </div>
  `).join('');
  document.getElementById('packages').innerHTML = html;
}

function select(id) {
  selected = packages.find(p => p.id === id);
  document.querySelectorAll('.package-card').forEach(c => c.classList.remove('selected'));
  document.getElementById(`pkg-${id}`).classList.add('selected');
  document.getElementById('payAmount').textContent = selected.amount;
  document.getElementById('payBtn').disabled = false;
}

async function initiatePayment() {
  const phone = document.getElementById('phone').value.trim();
  if (!selected || !phone) return alert('Please select package and enter phone');
  
  const btn = document.getElementById('payBtn');
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing...`;
  btn.disabled = true;

  const res = await fetch('/api/initiate', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({phone, amount: selected.amount, duration: selected.duration})
  });
  const data = await res.json();

  if (data.success) showStatus(data.checkoutRequestID);
  else {
    alert(data.message || 'Error');
    btn.innerHTML = `Pay KES <span id="payAmount">${selected.amount}</span> <i class="fa-solid fa-bolt"></i>`;
    btn.disabled = false;
  }
}

function showStatus(checkoutID) {
  document.getElementById('package-screen').classList.add('hidden');
  const statusScreen = document.getElementById('status-screen');
  statusScreen.classList.remove('hidden');
  document.getElementById('status-icon').innerHTML = `<i class="fa-solid fa-hourglass-half text-6xl text-teal-400 animate-spin"></i>`;
  document.getElementById('status-text').innerHTML = `Waiting for M-Pesa...<br><small class="text-slate-400">ID: ${checkoutID}</small>`;

  const poll = setInterval(async () => {
    const r = await fetch(`/api/status/${checkoutID}`);
    const d = await r.json();
    if (d.status === 'success') {
      clearInterval(poll);
      document.getElementById('status-icon').innerHTML = `<i class="fa-solid fa-circle-check text-7xl text-emerald-500"></i>`;
      document.getElementById('status-text').innerHTML = `Payment Confirmed!`;
      const v = document.getElementById('voucher');
      v.classList.remove('hidden');
      document.getElementById('v-username').textContent = d.username;
      document.getElementById('v-password').textContent = d.password;
      document.getElementById('v-expiry').textContent = new Date(d.expiry).toLocaleString('en-KE');
    }
  }, 4000);
}

renderPackages();