import os
import re
import uuid
from datetime import date
from pathlib import Path

import mysql.connector
from flask import Flask, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
app = Flask(__name__)


@app.before_request
def handle_preflight():
    if request.method == "OPTIONS":
        response = app.make_default_options_response()
        origin = request.headers.get("Origin", "*")
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With"
        return response


@app.after_request
def allow_local_frontend(response):
    origin = request.headers.get("Origin", "*")
    response.headers["Access-Control-Allow-Origin"] = origin
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With"
    response.headers["Vary"] = "Origin"
    return response


def db_connection():
    return mysql.connector.connect(
        host=os.getenv("DB_HOST", "127.0.0.1"),
        port=int(os.getenv("DB_PORT", "3306")),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD", ""),
        database=os.getenv("DB_NAME", "hope_light"),
    )


def as_date(value):
    return value.isoformat() if value else None


def age_on(dob):
    if not dob:
        return None
    today = date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def child_record(cursor, child):
    child_id = child["id"]
    cursor.execute(
        "SELECT id, recorded_on, weight_kg, height_cm, note FROM growth_records "
        "WHERE child_id=%s ORDER BY recorded_on DESC, id DESC", (child_id,))
    history = [{"id": r["id"], "date": as_date(r["recorded_on"]), "weight": float(r["weight_kg"]),
                "height": float(r["height_cm"]), "note": r["note"]} for r in cursor.fetchall()]

    cursor.execute(
        "SELECT id, vaccine, dose, date_given, due_date, status FROM vaccinations "
        "WHERE child_id=%s ORDER BY COALESCE(date_given, due_date), id", (child_id,))
    vaccinations = [{"id": r["id"], "vaccine": r["vaccine"], "dose": r["dose"],
                     "dateGiven": as_date(r["date_given"]), "dueDate": as_date(r["due_date"]),
                     "status": r["status"]} for r in cursor.fetchall()]

    cursor.execute(
        "SELECT id, visited_on, visit_type, doctor, weight_kg, height_cm, blood_pressure, "
        "temperature_c, pulse, findings, follow_up FROM checkups "
        "WHERE child_id=%s ORDER BY visited_on DESC, id DESC", (child_id,))
    checkups = [{"id": r["id"], "date": as_date(r["visited_on"]), "type": r["visit_type"], "doctor": r["doctor"],
                 "weightKg": float(r["weight_kg"]) if r["weight_kg"] is not None else None,
                 "heightCm": float(r["height_cm"]) if r["height_cm"] is not None else None,
                 "bp": r["blood_pressure"], "temperatureC": float(r["temperature_c"]) if r["temperature_c"] is not None else None,
                 "pulse": r["pulse"], "findings": r["findings"], "followUp": r["follow_up"]}
                for r in cursor.fetchall()]

    cursor.execute(
        "SELECT id, date_added, type, description, file_url FROM medical_history_data "
        "WHERE child_id=%s ORDER BY date_added DESC, id DESC", (child_id,))
    medical_data = [{"id": r["id"], "date": as_date(r["date_added"]), "type": r["type"],
                     "description": r["description"], "fileUrl": r["file_url"]}
                    for r in cursor.fetchall()]

    return {"id": child_id, "name": child["name"], "dob": as_date(child["date_of_birth"]),
            "age": age_on(child["date_of_birth"]), "bloodType": child["blood_type"],
            "ward": child["ward"], "admitted": as_date(child["admitted_on"]),
            "status": child["health_status"], "weightKg": history[0]["weight"] if history else None,
            "heightCm": history[0]["height"] if history else None,
            "history": history, "vaccinations": vaccinations, "checkups": checkups, "medicalData": medical_data}


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.get("/api/summary")
def summary():
    connection = db_connection()
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT COUNT(*) AS total FROM children")
        total = cursor.fetchone()["total"]
        cursor.execute("SELECT (SELECT COUNT(*) FROM growth_records) + (SELECT COUNT(*) FROM medical_history_data) AS total")
        medical = cursor.fetchone()["total"]
        cursor.execute("SELECT COUNT(DISTINCT child_id) AS total FROM vaccinations WHERE status='Given'")
        vaccinated = cursor.fetchone()["total"]
        cursor.execute("SELECT COUNT(*) AS total FROM checkups")
        checkups = cursor.fetchone()["total"]
        cursor.close()
        return jsonify({"children": total, "medicalReports": medical,
                        "vaccinatedChildren": vaccinated, "checkups": checkups})
    finally:
        connection.close()


@app.get("/api/children")
def list_children():
    query = request.args.get("q", "").strip()
    connection = db_connection()
    try:
        cursor = connection.cursor(dictionary=True)
        if query:
            search = f"%{query}%"
            cursor.execute("SELECT * FROM children WHERE name LIKE %s OR id LIKE %s ORDER BY name", (search, search))
        else:
            cursor.execute("SELECT * FROM children ORDER BY name")
        records = [child_record(cursor, child) for child in cursor.fetchall()]
        cursor.close()
        return jsonify(records)
    finally:
        connection.close()


@app.post("/api/children")
def add_child():
    data = request.json or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Name is required"}), 400

    clean_id = re.sub(r'[^a-zA-Z0-9]+', '-', name).strip('-').lower() or "child"
    connection = db_connection()
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT id FROM children WHERE id=%s", (clean_id,))
        if cursor.fetchone():
            child_id = f"{clean_id}-{str(uuid.uuid4())[:4]}"
        else:
            child_id = clean_id

        dob = data.get("dob") or date.today().isoformat()
        blood_type = data.get("bloodType") or "O+"
        ward = data.get("ward") or "General Ward"
        admitted = data.get("admitted") or date.today().isoformat()
        status = data.get("status") or "Healthy"

        cursor.execute(
            "INSERT INTO children (id, name, date_of_birth, blood_type, ward, admitted_on, health_status) VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (child_id, name, dob, blood_type, ward, admitted, status)
        )

        weight = data.get("weightKg") or data.get("weight")
        height = data.get("heightCm") or data.get("height")
        if weight or height:
            cursor.execute(
                "INSERT INTO growth_records (child_id, recorded_on, weight_kg, height_cm, note) VALUES (%s, %s, %s, %s, %s)",
                (child_id, date.today().isoformat(), float(weight or 0), float(height or 0), "Initial intake record")
            )

        connection.commit()
        return jsonify({"status": "success", "id": child_id})
    finally:
        connection.close()


@app.get("/api/children/<child_id>")
def get_child(child_id):
    connection = db_connection()
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT * FROM children WHERE id=%s", (child_id,))
        child = cursor.fetchone()
        if not child:
            return jsonify({"error": "Child record not found"}), 404
        return jsonify(child_record(cursor, child))
    finally:
        connection.close()


@app.put("/api/children/<child_id>")
def update_child(child_id):
    data = request.json or {}
    connection = db_connection()
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            "UPDATE children SET name=COALESCE(%s, name), date_of_birth=COALESCE(%s, date_of_birth), "
            "blood_type=COALESCE(%s, blood_type), ward=COALESCE(%s, ward), health_status=COALESCE(%s, health_status) WHERE id=%s",
            (data.get("name"), data.get("dob"), data.get("bloodType"), data.get("ward"), data.get("status"), child_id)
        )
        connection.commit()
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)}), 400
    finally:
        connection.close()


@app.delete("/api/children/<child_id>")
def delete_child(child_id):
    connection = db_connection()
    try:
        cursor = connection.cursor()
        cursor.execute("DELETE FROM children WHERE id=%s", (child_id,))
        connection.commit()
        return jsonify({"status": "success"})
    finally:
        connection.close()


@app.post("/api/children/<child_id>/vaccinations")
def add_vaccination(child_id):
    data = request.json or {}
    connection = db_connection()
    try:
        cursor = connection.cursor()
        cursor.execute(
            "INSERT INTO vaccinations (child_id, vaccine, dose, date_given, due_date, status) VALUES (%s, %s, %s, %s, %s, %s)",
            (child_id, data.get("vaccine", "General Vaccine"), int(data.get("dose", 1)), data.get("dateGiven") or None, data.get("dueDate") or None, data.get("status", "Given"))
        )
        connection.commit()
        return jsonify({"status": "success", "id": cursor.lastrowid})
    finally:
        connection.close()


@app.delete("/api/vaccinations/<int:id>")
def delete_vaccination(id):
    connection = db_connection()
    try:
        cursor = connection.cursor()
        cursor.execute("DELETE FROM vaccinations WHERE id=%s", (id,))
        connection.commit()
        return jsonify({"status": "success"})
    finally:
        connection.close()


@app.post("/api/children/<child_id>/checkups")
def add_checkup(child_id):
    data = request.json or {}
    connection = db_connection()
    try:
        cursor = connection.cursor()
        date_val = data.get("date") or date.today().isoformat()
        w_val = float(data.get("weightKg")) if data.get("weightKg") else None
        h_val = float(data.get("heightCm")) if data.get("heightCm") else None
        findings = data.get("findings") or "Normal routine checkup"

        cursor.execute(
            "INSERT INTO checkups (child_id, visited_on, visit_type, doctor, weight_kg, height_cm, blood_pressure, temperature_c, pulse, findings, follow_up) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (child_id, date_val, data.get("type", "Routine"), data.get("doctor", "Doctor"),
             w_val, h_val, data.get("bp", "110/70"),
             float(data.get("temperatureC")) if data.get("temperatureC") else 36.6,
             int(data.get("pulse")) if data.get("pulse") else 80,
             findings, data.get("followUp", "As needed"))
        )
        new_id = cursor.lastrowid

        if w_val is not None or h_val is not None:
            cursor.execute(
                "INSERT INTO growth_records (child_id, recorded_on, weight_kg, height_cm, note) VALUES (%s, %s, %s, %s, %s)",
                (child_id, date_val, w_val or 0.0, h_val or 0.0, f"Checkup finding: {findings}")
            )

        connection.commit()
        return jsonify({"status": "success", "id": new_id})
    finally:
        connection.close()


@app.delete("/api/checkups/<int:id>")
def delete_checkup(id):
    connection = db_connection()
    try:
        cursor = connection.cursor()
        cursor.execute("DELETE FROM checkups WHERE id=%s", (id,))
        connection.commit()
        return jsonify({"status": "success"})
    finally:
        connection.close()


@app.post("/api/children/<child_id>/growth")
def add_growth(child_id):
    data = request.json or {}
    connection = db_connection()
    try:
        cursor = connection.cursor()
        date_val = data.get("date") or date.today().isoformat()
        w_val = float(data.get("weight") or data.get("weightKg") or 0.0)
        h_val = float(data.get("height") or data.get("heightCm") or 0.0)
        note_val = data.get("note") or "Routine measurement"

        cursor.execute(
            "INSERT INTO growth_records (child_id, recorded_on, weight_kg, height_cm, note) VALUES (%s, %s, %s, %s, %s)",
            (child_id, date_val, w_val, h_val, note_val)
        )
        connection.commit()
        return jsonify({"status": "success", "id": cursor.lastrowid})
    finally:
        connection.close()


@app.delete("/api/growth/<int:id>")
def delete_growth(id):
    connection = db_connection()
    try:
        cursor = connection.cursor()
        cursor.execute("DELETE FROM growth_records WHERE id=%s", (id,))
        connection.commit()
        return jsonify({"status": "success"})
    finally:
        connection.close()


@app.post("/api/children/<child_id>/medical_history")
def add_medical_history(child_id):
    data = request.json or {}
    connection = db_connection()
    try:
        cursor = connection.cursor()
        cursor.execute(
            "INSERT INTO medical_history_data (child_id, date_added, type, description, file_url) VALUES (%s, %s, %s, %s, %s)",
            (child_id, data.get("date") or date.today().isoformat(), data.get("type", "Report"), data.get("description", ""), data.get("fileUrl"))
        )
        connection.commit()
        return jsonify({"status": "success", "id": cursor.lastrowid})
    finally:
        connection.close()


@app.delete("/api/medical_history/<int:id>")
def delete_medical_history(id):
    connection = db_connection()
    try:
        cursor = connection.cursor()
        cursor.execute("DELETE FROM medical_history_data WHERE id=%s", (id,))
        connection.commit()
        return jsonify({"status": "success"})
    finally:
        connection.close()


@app.get("/")
def home():
    return send_from_directory(BASE_DIR, "index.html")


@app.get("/<path:filename>")
def frontend_files(filename):
    if filename.startswith("folder/"):
        return send_from_directory(BASE_DIR, "catalog.html")
    return send_from_directory(BASE_DIR, filename)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=os.getenv("FLASK_DEBUG", "0") == "1")
