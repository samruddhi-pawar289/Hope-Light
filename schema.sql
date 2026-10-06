CREATE DATABASE IF NOT EXISTS hope_light CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE hope_light;

CREATE TABLE IF NOT EXISTS children (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  date_of_birth DATE NOT NULL,
  blood_type VARCHAR(4),
  ward VARCHAR(80),
  admitted_on DATE,
  health_status VARCHAR(40) NOT NULL DEFAULT 'Healthy',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS growth_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  child_id VARCHAR(64) NOT NULL,
  recorded_on DATE NOT NULL,
  weight_kg DECIMAL(5,2) NOT NULL,
  height_cm DECIMAL(5,2) NOT NULL,
  note TEXT,
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  INDEX idx_growth_child_date (child_id, recorded_on)
);

CREATE TABLE IF NOT EXISTS vaccinations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  child_id VARCHAR(64) NOT NULL,
  vaccine VARCHAR(100) NOT NULL,
  dose INT NOT NULL,
  date_given DATE,
  due_date DATE,
  status VARCHAR(20) NOT NULL,
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  INDEX idx_vaccines_child_due (child_id, due_date)
);

CREATE TABLE IF NOT EXISTS checkups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  child_id VARCHAR(64) NOT NULL,
  visited_on DATE NOT NULL,
  visit_type VARCHAR(60) NOT NULL,
  doctor VARCHAR(120),
  weight_kg DECIMAL(5,2),
  height_cm DECIMAL(5,2),
  blood_pressure VARCHAR(20),
  temperature_c DECIMAL(4,1),
  pulse INT,
  findings TEXT,
  follow_up VARCHAR(255),
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  INDEX idx_checkups_child_date (child_id, visited_on)
);
