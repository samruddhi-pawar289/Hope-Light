"""Import the sample catalog records once after schema.sql has been applied."""
import json
import os
from pathlib import Path

import mysql.connector

BASE_DIR = Path(__file__).resolve().parent
with (BASE_DIR / "seed_data.json").open(encoding="utf-8") as data_file:
    children = json.load(data_file)

connection = mysql.connector.connect(
    host=os.getenv("DB_HOST", "127.0.0.1"), port=int(os.getenv("DB_PORT", "3306")),
    user=os.getenv("DB_USER", "root"), password=os.getenv("DB_PASSWORD", ""),
    database=os.getenv("DB_NAME", "hope_light"))
cursor = connection.cursor()
try:
    for child in children:
        cursor.execute("""INSERT INTO children
            (id, name, date_of_birth, blood_type, ward, admitted_on, health_status)
            VALUES (%s,%s,%s,%s,%s,%s,%s)
            ON DUPLICATE KEY UPDATE name=VALUES(name), date_of_birth=VALUES(date_of_birth),
            blood_type=VALUES(blood_type), ward=VALUES(ward), admitted_on=VALUES(admitted_on),
            health_status=VALUES(health_status)""",
            (child["id"], child["name"], child["dob"], child["bloodType"], child["ward"], child["admitted"], child["status"]))
        cursor.execute("DELETE FROM growth_records WHERE child_id=%s", (child["id"],))
        cursor.execute("DELETE FROM vaccinations WHERE child_id=%s", (child["id"],))
        cursor.execute("DELETE FROM checkups WHERE child_id=%s", (child["id"],))
        for record in child["history"]:
            cursor.execute("INSERT INTO growth_records (child_id,recorded_on,weight_kg,height_cm,note) VALUES (%s,%s,%s,%s,%s)",
                           (child["id"], record["date"], record["weight"], record["height"], record["note"]))
        for record in child["vaccinations"]:
            cursor.execute("INSERT INTO vaccinations (child_id,vaccine,dose,date_given,due_date,status) VALUES (%s,%s,%s,%s,%s,%s)",
                           (child["id"], record["vaccine"], record["dose"], record["dateGiven"], record["dueDate"], record["status"]))
        for record in child["checkups"]:
            cursor.execute("""INSERT INTO checkups
                (child_id,visited_on,visit_type,doctor,weight_kg,height_cm,blood_pressure,temperature_c,pulse,findings,follow_up)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (child["id"], record["date"], record["type"], record["doctor"], record["weightKg"], record["heightCm"],
                 record["bp"], record["temperatureC"], record["pulse"], record["findings"], record["followUp"]))
    connection.commit()
    print(f"Imported {len(children)} child records.")
finally:
    cursor.close()
    connection.close()
