from flask import Flask, request, jsonify, render_template
import requests
import json
import os

app = Flask(__name__)

DATA_FILE = "providers.json"


# ----------------------------
# INIT FILE
# ----------------------------
if not os.path.exists(DATA_FILE):
    with open(DATA_FILE, "w") as f:
        json.dump([], f)


# ----------------------------
# LOAD DATA
# ----------------------------
def load_data():
    try:
        with open(DATA_FILE, "r") as f:
            return json.load(f)
    except:
        return []


# ----------------------------
# SAVE DATA
# ----------------------------
def save_data(data):
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2)


# ----------------------------
# HOME (UI)
# ----------------------------
@app.route("/")
def home():
    return render_template("index.html")


# ----------------------------
# SEARCH (NPI REGISTRY)
# ----------------------------
@app.route("/search")
def search():
    query = request.args.get("query", "")

    url = "https://npiregistry.cms.hhs.gov/api/"
    params = {
        "version": "2.1",
        "last_name": query,
        "limit": 15
    }

    try:
        res = requests.get(url, params=params)
        data = res.json()
    except:
        return jsonify([])

    providers = []

    for item in data.get("results", []):
        basic = item.get("basic", {})
        address = item.get("addresses", [{}])[0]

        providers.append({
            "name": basic.get("name", ""),
            "npi": item.get("number", ""),
            "state": address.get("state", ""),
            "status": "New",
            "notes": ""
        })

    return jsonify(providers)


# ----------------------------
# SAVE PROVIDER
# ----------------------------
@app.route("/save_provider", methods=["POST"])
def save_provider():
    new_provider = request.json
    data = load_data()

    # Prevent duplicates
    if not any(p["npi"] == new_provider["npi"] for p in data):
        data.append(new_provider)
        save_data(data)

    return jsonify({"status": "saved"})


# ----------------------------
# GET SAVED (BOOK OF BUSINESS)
# ----------------------------
@app.route("/get_saved", methods=["GET"])
def get_saved():
    return jsonify(load_data())


# ----------------------------
# UPDATE PROVIDER
# ----------------------------
@app.route("/update_provider", methods=["POST"])
def update_provider():
    updated = request.json
    data = load_data()

    for p in data:
        if p["npi"] == updated["npi"]:
            p["status"] = updated.get("status", p.get("status", "New"))
            p["notes"] = updated.get("notes", p.get("notes", ""))

    save_data(data)
    return jsonify({"status": "updated"})


# ----------------------------
# DELETE PROVIDER
# ----------------------------
@app.route("/delete_provider", methods=["POST"])
def delete_provider():
    req = request.json
    data = load_data()

    data = [p for p in data if p["npi"] != req["npi"]]

    save_data(data)
    return jsonify({"status": "deleted"})


# ----------------------------
# RUN
# ----------------------------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
