CREATE DATABASE IF NOT EXISTS hotspot_payments;
USE hotspot_payments;

CREATE TABLE payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(15) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  duration_minutes INT NOT NULL,
  transaction_id VARCHAR(100) NOT NULL,
  mpesa_receipt VARCHAR(50),
  status ENUM('pending','success','failed') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE vouchers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(20) UNIQUE NOT NULL,
  password VARCHAR(20) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  duration_minutes INT NOT NULL,
  expiry DATETIME NOT NULL,
  status ENUM('active','expired') DEFAULT 'active',
  payment_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (payment_id) REFERENCES payments(id)
);

-- Test data (optional)
INSERT INTO payments (phone, amount, duration_minutes, transaction_id, status) VALUES 
('254712345678', 50, 60, 'TEST123', 'success');