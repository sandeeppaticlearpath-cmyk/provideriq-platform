from flask import Flask, request, jsonify, render_template
import requests
import os

app = Flask(__name__, template_folder="templates")

# HOME ROUTE (THIS LOADS YOUR UI)
@app.route("/")
def home():
    return render_template("index.html")


# SEARCH API
@app.route("/search")
def search():
    name = request.args.get("name")

    if not name:
        return jsonify({"error": "No name provided"}), 400

    # Split name into first + last (basic logic)
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

    response = requests.get(url, params=params)
    data = response.json()

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
        "query": name,
        "results": results
    })


# IMPORTANT FOR RENDER DEPLOYMENT
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
