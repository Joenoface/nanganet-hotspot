// admin-script.js - full version with good debug + compatibility

var token = localStorage.getItem('adminToken') || '';
var currentTab = 'dashboard';

// DOM elements
var loginScreen   = document.getElementById('loginScreen');
var adminPanel    = document.getElementById('adminPanel');
var loginForm     = document.getElementById('loginForm');
var loginBtn      = document.getElementById('loginBtn');
var loginError    = document.getElementById('loginError');
var logoutBtn     = document.getElementById('logoutBtn');
var refreshBtn    = document.getElementById('refreshBtn');
var createVoucherBtn = document.getElementById('createVoucherBtn');
var createModal   = document.getElementById('createModal');
var closeModal    = document.getElementById('closeModal');
var createForm    = document.getElementById('createForm');
var createResult  = document.getElementById('createResult');
var toast         = document.getElementById('toast');

// Tab elements
var tabs = {
    dashboard: document.getElementById('dashboard'),
    payments:  document.getElementById('payments'),
    vouchers:  document.getElementById('vouchers')
};
var navItems = document.querySelectorAll('.nav-item');

// Simple toast
function showToast(msg, type) {
    toast.textContent = msg;
    toast.className = 'toast ' + (type || 'success');
    toast.classList.remove('hidden');
    setTimeout(function() { toast.classList.add('hidden'); }, 3200);
}

// Show/hide error
function showLoginError(msg) {
    loginError.textContent = msg || '';
}

// Disable/enable button
function disableLoginBtn() { loginBtn.disabled = true; loginBtn.textContent = 'Signing in...'; }
function enableLoginBtn()  { loginBtn.disabled = false; loginBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In'; }

// Login handler
if (loginForm) {
    loginForm.onsubmit = function(e) {
        e.preventDefault();
        var username = document.getElementById('username').value.trim();
        var password = document.getElementById('password').value;

        if (!username || !password) {
            showLoginError('Please enter username and password');
            return false;
        }

        disableLoginBtn();
        showLoginError('');

        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/admin/login', true);
        xhr.setRequestHeader('Content-Type', 'application/json');

        xhr.onload = function() {
            enableLoginBtn();
            if (xhr.status === 200) {
                try {
                    var data = JSON.parse(xhr.responseText);
                    if (data.success && data.token) {
                        token = data.token;
                        localStorage.setItem('adminToken', token);
                        loginScreen.classList.add('hidden');
                        adminPanel.classList.remove('hidden');
                        loadDashboard();
                        showToast('Welcome to NangaNet Admin');
                    } else {
                        showLoginError(data.message || 'Login failed');
                    }
                } catch(e) {
                    showLoginError('Invalid server response');
                }
            } else {
                showLoginError('Login failed (' + xhr.status + ')');
            }
        };

        xhr.onerror = function() {
            enableLoginBtn();
            showLoginError('Cannot reach server. Is it running?');
        };

        xhr.send(JSON.stringify({ username: username, password: password }));
    };
}

// Logout
if (logoutBtn) {
    logoutBtn.onclick = function() {
        localStorage.removeItem('adminToken');
        token = '';
        adminPanel.classList.add('hidden');
        loginScreen.classList.remove('hidden');
        showToast('Logged out');
    };
}

// Tab switching
navItems.forEach(function(item) {
    item.onclick = function(e) {
        e.preventDefault();
        var tab = this.getAttribute('data-tab');

        navItems.forEach(function(el) { el.classList.remove('active'); });
        this.classList.add('active');

        for (var key in tabs) {
            tabs[key].classList.toggle('active', key === tab);
            tabs[key].classList.toggle('hidden', key !== tab);
        }

        document.getElementById('pageTitle').textContent = tab.charAt(0).toUpperCase() + tab.slice(1);

        if (tab === 'payments') loadPayments();
        if (tab === 'vouchers') loadVouchers();
    };
});

// Refresh button
if (refreshBtn) {
    refreshBtn.onclick = function() {
        showToast('Refreshing...');
        if (document.querySelector('.nav-item.active').getAttribute('data-tab') === 'dashboard') {
            loadDashboard();
        } else if (document.querySelector('.nav-item.active').getAttribute('data-tab') === 'payments') {
            loadPayments();
        } else if (document.querySelector('.nav-item.active').getAttribute('data-tab') === 'vouchers') {
            loadVouchers();
        }
    };
}

// Load dashboard stats
function loadDashboard() {
    if (!token) return;

    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/admin/stats', true);
    xhr.setRequestHeader('Authorization', 'Bearer ' + token);

    xhr.onload = function() {
        if (xhr.status === 200) {
            try {
                var data = JSON.parse(xhr.responseText);
                document.getElementById('totalRevenue').textContent = 'KSh ' + Number(data.totalRevenue || 0).toLocaleString();
                document.getElementById('todayRevenue').textContent = 'KSh ' + Number(data.todayRevenue || 0).toLocaleString();
                document.getElementById('totalVouchers').textContent = data.totalVouchers || 0;
                document.getElementById('activeVouchers').textContent = data.activeVouchers || 0;
            } catch(e) {}
        } else if (xhr.status === 401) {
            logoutBtn.click();
        }
    };

    xhr.send();
}

// Load payments
function loadPayments() {
    if (!token) return;

    var search = document.getElementById('paymentSearch') ? document.getElementById('paymentSearch').value.trim() : '';
    var status = document.getElementById('paymentStatus') ? document.getElementById('paymentStatus').value : 'all';

    var url = '/api/admin/payments';
    if (status !== 'all' || search) {
        url += '?';
        if (status !== 'all') url += 'status=' + status;
        if (search) url += (status !== 'all' ? '&' : '') + 'search=' + encodeURIComponent(search);
    }

    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.setRequestHeader('Authorization', 'Bearer ' + token);

    xhr.onload = function() {
        if (xhr.status === 200) {
            try {
                var data = JSON.parse(xhr.responseText);
                var tbody = document.getElementById('paymentsBody');
                tbody.innerHTML = '';

                data.forEach(function(p) {
                    var tr = document.createElement('tr');
                    tr.innerHTML =
                        '<td>' + new Date(p.created_at).toLocaleDateString() + '</td>' +
                        '<td>' + p.phone + '</td>' +
                        '<td>KSh ' + Number(p.amount).toLocaleString() + '</td>' +
                        '<td>' + p.duration_minutes + ' min</td>' +
                        '<td>' + p.transaction_id + '</td>' +
                        '<td>' + (p.mpesa_receipt || '-') + '</td>' +
                        '<td><span class="status-' + p.status + '">' + p.status.toUpperCase() + '</span></td>';
                    tbody.appendChild(tr);
                });
            } catch(e) {}
        }
    };

    xhr.send();
}

// Load vouchers
function loadVouchers() {
    if (!token) return;

    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/admin/vouchers', true);
    xhr.setRequestHeader('Authorization', 'Bearer ' + token);

    xhr.onload = function() {
        if (xhr.status === 200) {
            try {
                var data = JSON.parse(xhr.responseText);
                var tbody = document.getElementById('vouchersBody');
                tbody.innerHTML = '';

                data.forEach(function(v) {
                    var expiry = new Date(v.expiry);
                    var isActive = expiry > new Date();
                    var tr = document.createElement('tr');
                    tr.innerHTML =
                        '<td>' + v.username + '</td>' +
                        '<td>' + v.password + '</td>' +
                        '<td>KSh ' + Number(v.amount).toLocaleString() + '</td>' +
                        '<td>' + v.duration_minutes + ' min</td>' +
                        '<td>' + expiry.toLocaleString() + '</td>' +
                        '<td>' + (isActive ? '<span class="status-success">Active</span>' : '<span class="status-failed">Expired</span>') + '</td>' +
                        '<td><button class="revoke-btn" onclick="revokeVoucher(\'' + v.username + '\')">Revoke</button></td>';
                    tbody.appendChild(tr);
                });
            } catch(e) {}
        }
    };

    xhr.send();
}

// Revoke voucher
window.revokeVoucher = function(username) {
    if (!confirm('Revoke voucher ' + username + '?')) return;

    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/admin/revoke/' + username, true);
    xhr.setRequestHeader('Authorization', 'Bearer ' + token);

    xhr.onload = function() {
        if (xhr.status === 200) {
            showToast('Voucher revoked');
            loadVouchers();
            loadDashboard();
        } else {
            showToast('Revoke failed', 'error');
        }
    };

    xhr.send();
};

// Create voucher modal
if (createVoucherBtn) {
    createVoucherBtn.onclick = function() {
        createModal.classList.remove('hidden');
        createResult.textContent = '';
    };
}

if (closeModal) {
    closeModal.onclick = function() {
        createModal.classList.add('hidden');
    };
}

if (createForm) {
    createForm.onsubmit = function(e) {
        e.preventDefault();
        var amount   = document.getElementById('amount').value;
        var duration = document.getElementById('duration').value;

        if (!amount || !duration) {
            createResult.textContent = 'Please fill both fields';
            createResult.style.color = 'red';
            return false;
        }

        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/admin/create-voucher', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Authorization', 'Bearer ' + token);

        xhr.onload = function() {
            if (xhr.status === 200) {
                try {
                    var data = JSON.parse(xhr.responseText);
                    if (data.success) {
                        createResult.innerHTML = 'Created!<br>Username: <b>' + data.username + '</b><br>Password: <b>' + data.password + '</b>';
                        createResult.style.color = 'green';
                        createModal.classList.add('hidden');
                        showToast('Voucher created');
                        loadVouchers();
                        loadDashboard();
                    } else {
                        createResult.textContent = data.error || 'Failed to create';
                        createResult.style.color = 'red';
                    }
                } catch(e) {
                    createResult.textContent = 'Server error';
                    createResult.style.color = 'red';
                }
            } else {
                createResult.textContent = 'Server error (' + xhr.status + ')';
                createResult.style.color = 'red';
            }
        };

        xhr.send(JSON.stringify({ amount: amount, duration: duration }));
    };
}

// Auto-login if token exists
if (token) {
    var testXhr = new XMLHttpRequest();
    testXhr.open('GET', '/api/admin/stats', true);
    testXhr.setRequestHeader('Authorization', 'Bearer ' + token);

    testXhr.onload = function() {
        if (testXhr.status === 200) {
            loginScreen.classList.add('hidden');
            adminPanel.classList.remove('hidden');
            loadDashboard();
        } else {
            localStorage.removeItem('adminToken');
            token = '';
        }
    };

    testXhr.send();
}

console.log("Full admin-script.js loaded");