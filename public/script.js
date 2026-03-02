const packages = [
  {id:1, name:"1 Hour", amount:1, duration:60},
  {id:2, name:"1 Day", amount:10, duration:1440},
  {id:3, name:"1 Week", amount:100, duration:10080}
];

let selectedPackage = null;

function renderPackages() {
  const container = document.getElementById('packages');
  container.innerHTML = packages.map(p => `
    <div onclick="selectPackage(${p.id})" id="pkg-${p.id}"
         class="package-card border-2 rounded-2xl p-4 cursor-pointer hover:border-blue-500 transition">
      <div class="flex justify-between">
        <div>
          <div class="font-semibold">${p.name}</div>
          <div class="text-3xl font-bold text-green-600">KES ${p.amount}</div>
        </div>
        <div class="text-right text-sm text-gray-500">${p.duration/60} hrs</div>
      </div>
    </div>
  `).join('');
}

function selectPackage(id) {
  selectedPackage = packages.find(p => p.id === id);
  document.querySelectorAll('.package-card').forEach(c => c.classList.remove('border-blue-500', 'bg-blue-50'));
  document.getElementById(`pkg-${id}`).classList.add('border-blue-500', 'bg-blue-50');
  document.getElementById('payAmount').textContent = selectedPackage.amount;
  document.getElementById('payBtn').disabled = false;
}

async function initiatePayment() {
  const phone = document.getElementById('phone').value.trim();
  if (!selectedPackage || !phone) return alert('Select package & enter phone');

  document.getElementById('payBtn').disabled = true;
  document.getElementById('payBtn').textContent = 'Sending STK...';

  try {
    const res = await fetch('/api/initiate', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        phone,
        amount: selectedPackage.amount,
        duration: selectedPackage.duration
      })
    });
    const data = await res.json();

    if (data.success) {
      showStatusScreen(data.checkoutRequestID);
    } else {
      alert(data.message);
    }
  } catch(e) {
    alert('Network error');
  }
}

function showStatusScreen(checkoutID) {
  document.getElementById('package-screen').classList.add('hidden');
  const statusScreen = document.getElementById('status-screen');
  statusScreen.classList.remove('hidden');
  document.getElementById('status-text').innerHTML = `⏳ Waiting for M-Pesa payment...<br><small class="text-sm">Checkout ID: ${checkoutID}</small>`;

  const poll = setInterval(async () => {
    const res = await fetch(`/api/status/${checkoutID}`);
    const data = await res.json();

    if (data.status === 'success') {
      clearInterval(poll);
      document.getElementById('status-text').classList.add('hidden');
      const v = document.getElementById('voucher');
      v.classList.remove('hidden');
      document.getElementById('v-username').textContent = data.username;
      document.getElementById('v-password').textContent = data.password;
      document.getElementById('v-expiry').textContent = new Date(data.expiry).toLocaleString();
    } else if (data.status === 'failed') {
      clearInterval(poll);
      document.getElementById('status-text').innerHTML = '❌ Payment failed or cancelled';
    }
  }, 3000);
}

renderPackages();