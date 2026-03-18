from flask import Flask, request, jsonify, render_template
import requests
import os
import json

app = Flask(__name__, template_folder="templates")

DB_FILE = "providers.json"


# ---------- UTIL ----------
def load_data():
    if not os.path.exists(DB_FILE):
        return []
    try:
        with open(DB_FILE, "r") as f:
            return json.load(f)
    except:
        return []


def save_data(data):
    with open(DB_FILE, "w") as f:
        json.dump(data, f, indent=2)


# ---------- HOME ----------
@app.route("/")
def home():
    return render_template("index.html")


# ---------- SEARCH ----------
@app.route("/search")
def search():
    name = request.args.get("name")

    if not name:
        return jsonify({"error": "No name provided"}), 400

    parts = name.split()
    first = parts[0]
    last = parts[1] if len(parts) > 1 else ""

    url = "https://npiregistry.cms.hhs.gov/api/"
    params = {
        "version": "2.1",
        "first_name": first,
        "last_name": last,
        "limit": 10
    }

    try:
        res = requests.get(url, params=params)
        data = res.json()
    except:
        return jsonify({"error": "API request failed"}), 500

    results = []

    for r in data.get("results", []):
        basic = r.get("basic", {})
        addr = r.get("addresses", [{}])[0]

        results.append({
            "name": basic.get("name", ""),
            "npi": r.get("number", ""),
            "state": addr.get("state", ""),
            "status": basic.get("status", "")
        })

    return jsonify({
        "count": len(results),
        "results": results
    })


# ---------- SAVE PROVIDER ----------
@app.route("/save", methods=["POST"])
def save_provider():
    provider = request.json

    if not provider or "npi" not in provider:
        return jsonify({"error": "Invalid provider data"}), 400

    data = load_data()

    # prevent duplicates
    if any(p["npi"] == provider["npi"] for p in data):
        return jsonify({"message": "Already saved"})

    # add default fields
    provider["notes"] = ""
    provider["tag"] = "New"

    data.append(provider)
    save_data(data)

    return jsonify({"message": "Saved successfully"})


# ---------- GET SAVED ----------
@app.route("/saved")
def get_saved():
    return jsonify(load_data())


# ---------- UPDATE PROVIDER ----------
@app.route("/update", methods=["POST"])
def update_provider():
    updated = request.json

    if not updated or "npi" not in updated:
        return jsonify({"error": "Invalid update data"}), 400

    npi = updated.get("npi")

    data = load_data()

    for p in data:
        if p["npi"] == npi:
            p["notes"] = updated.get("notes", p.get("notes", ""))
            p["tag"] = updated.get("tag", p.get("tag", "New"))

    save_data(data)

    return jsonify({"message": "Updated successfully"})


# ---------- DELETE PROVIDER ----------
@app.route("/delete", methods=["POST"])
def delete_provider():
    req = request.json

    if not req or "npi" not in req:
        return jsonify({"error": "Invalid request"}), 400

    npi = req.get("npi")

    data = load_data()
    new_data = [p for p in data if p["npi"] != npi]

    save_data(new_data)

    return jsonify({"message": "Deleted successfully"})


# ---------- HEALTH CHECK (OPTIONAL BUT USEFUL) ----------
@app.route("/health")
def health():
    return jsonify({"status": "running"})


# ---------- RUN ----------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
