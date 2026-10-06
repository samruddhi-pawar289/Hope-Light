import os
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

import mysql.connector
from flask import Flask, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
app = Flask(__name__)


@app.after_request
def allow_local_frontend(response):
    origin = request.headers.get("Origin", "")
    parsed = urlparse(origin)
    if parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1"}:
        response.headers["Access-Control-Allow-Origin"] = origin
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
    today = date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def child_record(cursor, child):
    child_id = child["id"]
    cursor.execute(
        "SELECT recorded_on, weight_kg, height_cm, note FROM growth_records "
        "WHERE child_id=%s ORDER BY recorded_on DESC", (child_id,))
    history = [{"date": as_date(r["recorded_on"]), "weight": float(r["weight_kg"]),
                "height": float(r["height_cm"]), "note": r["note"]} for r in cursor.fetchall()]
    cursor.execute(
        "SELECT vaccine, dose, date_given, due_date, status FROM vaccinations "
        "WHERE child_id=%s ORDER BY COALESCE(date_given, due_date), id", (child_id,))
    vaccinations = [{"vaccine": r["vaccine"], "dose": r["dose"],
                     "dateGiven": as_date(r["date_given"]), "dueDate": as_date(r["due_date"]),
                     "status": r["status"]} for r in cursor.fetchall()]
    cursor.execute(
        "SELECT visited_on, visit_type, doctor, weight_kg, height_cm, blood_pressure, "
        "temperature_c, pulse, findings, follow_up FROM checkups "
        "WHERE child_id=%s ORDER BY visited_on DESC, id DESC", (child_id,))
    checkups = [{"date": as_date(r["visited_on"]), "type": r["visit_type"], "doctor": r["doctor"],
                 "weightKg": float(r["weight_kg"]) if r["weight_kg"] is not None else None,
                 "heightCm": float(r["height_cm"]) if r["height_cm"] is not None else None,
                 "bp": r["blood_pressure"], "temperatureC": float(r["temperature_c"]) if r["temperature_c"] is not None else None,
                 "pulse": r["pulse"], "findings": r["findings"], "followUp": r["follow_up"]}
                for r in cursor.fetchall()]
    return {"id": child_id, "name": child["name"], "dob": as_date(child["date_of_birth"]),
            "age": age_on(child["date_of_birth"]), "bloodType": child["blood_type"],
            "ward": child["ward"], "admitted": as_date(child["admitted_on"]),
            "status": child["health_status"], "weightKg": history[0]["weight"] if history else None,
            "heightCm": history[0]["height"] if history else None,
            "history": history, "vaccinations": vaccinations, "checkups": checkups}


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
        cursor.execute("SELECT COUNT(DISTINCT child_id) AS total FROM growth_records")
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
    query = request.args.get("q", "")
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

@app.put("/api/children/<child_id>")
def update_child(child_id):
    data = request.json
    connection = db_connection()
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            "UPDATE children SET name=%s, date_of_birth=%s, blood_type=%s, ward=%s, health_status=%s WHERE id=%s",
            (data.get("name"), data.get("dob"), data.get("bloodType"), data.get("ward"), data.get("status"), child_id)
        )
        connection.commit()
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)}), 400
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
