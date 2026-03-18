from flask import Flask, request, jsonify, render_template
import requests
import json
import os

app = Flask(__name__)

DATA_FILE = "providers.json"


# ----------------------------
# Helper: Load data
# ----------------------------
def load_data():
    if not os.path.exists(DATA_FILE):
        return []
    try:
        with open(DATA_FILE, "r") as f:
            return json.load(f)
    except:
        return []


# ----------------------------
# Helper: Save data
# ----------------------------
def save_data(data):
    with open(DATA_FILE, "w") as f:
        json.dump(data, f)


# ----------------------------
# Home route (UI)
# ----------------------------
@app.route("/")
def home():
    return render_template("index.html")


# ----------------------------
# Search providers (NPI API)
# ----------------------------
@app.route("/search")
def search():
    query = request.args.get("query", "")

    url = "https://npiregistry.cms.hhs.gov/api/"
    params = {
        "version": "2.1",
        "last_name": query
    }

    res = requests.get(url, params=params)
    data = res.json()

    providers = []

    for item in data.get("results", []):
        basic = item.get("basic", {})
        providers.append({
            "name": basic.get("name", ""),
            "npi": item.get("number", ""),
            "state": item.get("addresses", [{}])[0].get("state", ""),
            "status": "New",
            "notes": ""
        })

    return jsonify(providers)


# ----------------------------
# Save provider
# ----------------------------
@app.route("/save_provider", methods=["POST"])
def save_provider():
    new_provider = request.json
    data = load_data()

    # Avoid duplicates by NPI
    if not any(p["npi"] == new_provider["npi"] for p in data):
        data.append(new_provider)
        save_data(data)

    return jsonify({"status": "saved"})


# ----------------------------
# Get saved providers
# ----------------------------
@app.route("/get_saved", methods=["GET"])
def get_saved():
    data = load_data()
    return jsonify(data)


# ----------------------------
# Update provider (status + notes)
# ----------------------------
@app.route("/update_provider", methods=["POST"])
def update_provider():
    updated = request.json
    data = load_data()

    for p in data:
        if p["npi"] == updated["npi"]:
            p["status"] = updated.get("status", p["status"])
            p["notes"] = updated.get("notes", p["notes"])

    save_data(data)
    return jsonify({"status": "updated"})


# ----------------------------
# Run app
# ----------------------------
if __name__ == "__main__":
    app.run(debug=True)
