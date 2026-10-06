# Hope&Light health records database

The Catalog page loads child profiles and their medical history from a Flask JSON API. Flask reads and writes to MySQL (XAMPP) using the normalized tables in `schema.sql`.

## Run locally with XAMPP

1. Start **MySQL** in the XAMPP Control Panel. Open phpMyAdmin, select **Import**, and import `schema.sql`.
2. Install Python packages from this project folder:

   ```powershell
   py -m pip install -r requirements.txt
   ```

3. Copy `.env.example` to `.env` and set your MySQL username/password if they differ from XAMPP defaults. In PowerShell, load values for the current terminal session, for example:

   ```powershell
   $env:DB_HOST = '127.0.0.1'
   $env:DB_PORT = '3306'
   $env:DB_NAME = 'hope_light'
   $env:DB_USER = 'root'
   $env:DB_PASSWORD = ''
   ```

   The app reads environment variables directly; `.env.example` documents the settings but is not auto-loaded.

4. Optionally load the included sample data once:

   ```powershell
   py seed_db.py
   ```

   The sample children are fictional demo records. `seed_db.py` replaces the related history rows for those IDs each time it runs.

5. Start the website and API together:

   ```powershell
   py app.py
   ```

6. Open `http://127.0.0.1:5000/`. The Analytics cards and Catalog page both read from the API. Endpoints are `GET /api/health`, `GET /api/summary`, `GET /api/children`, and `GET /api/children/<id>`.

## Data model

- `children`: identity, admission, ward, and current health status.
- `growth_records`: dated weight, height, and notes.
- `vaccinations`: vaccine/dose, given and due dates, and status.
- `checkups`: visit type, clinician, vitals, findings, and follow-up.

Child IDs link the related records with foreign keys. Add new records to these tables and the Catalog UI will receive the refreshed data from the API.
