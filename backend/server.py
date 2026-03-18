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
    with open(DB_FILE, "r") as f:
        return json.load(f)

def save_data(data):
    with open(DB_FILE, "w") as f:
        json.dump(data, f)


# ---------- HOME ----------
@app.route("/")
def home():
    return render_template("index.html")


# ---------- SEARCH ----------
@app.route("/search")
def search():
    name = request.args.get("name")

    if not name:
        return jsonify({"error": "No name"}), 400

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

    res = requests.get(url, params=params)
    data = res.json()

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

    return jsonify({"results": results})


# ---------- SAVE PROVIDER ----------
@app.route("/save", methods=["POST"])
def save_provider():
    provider = request.json

    data = load_data()

    # prevent duplicates
    if any(p["npi"] == provider["npi"] for p in data):
        return jsonify({"message": "Already saved"})

    data.append(provider)
    save_data(data)

    return jsonify({"message": "Saved"})


# ---------- GET SAVED ----------
@app.route("/saved")
def get_saved():
    return jsonify(load_data())


# ---------- DELETE ----------
@app.route("/delete", methods=["POST"])
def delete_provider():
    npi = request.json.get("npi")

    data = load_data()
    data = [p for p in data if p["npi"] != npi]

    save_data(data)

    return jsonify({"message": "Deleted"})


# ---------- RUN ----------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
