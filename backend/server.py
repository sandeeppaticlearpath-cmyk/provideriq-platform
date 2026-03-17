from flask import Flask, request, jsonify
import requests
import os

app = Flask(__name__)

# Home route
@app.route("/")
def home():
    return "Backend is working 🚀"

# Search route
@app.route("/search", methods=["GET"])
def search():
    name = request.args.get("name")

    if not name:
        return jsonify({"error": "Please provide a name"}), 400

    # NPI API URL
    url = "https://npiregistry.cms.hhs.gov/api/"

    params = {
        "version": "2.1",
        "name": name,
        "limit": 5
    }

    response = requests.get(url, params=params)
    data = response.json()

    results = []

    for item in data.get("results", []):
        basic = item.get("basic", {})
        address = item.get("addresses", [{}])[0]

        results.append({
            "name": basic.get("first_name", "") + " " + basic.get("last_name", ""),
            "location": address.get("state", ""),
            "status": basic.get("status", "")
        })

    return jsonify({
        "query": name,
        "results": results
    })

# Run app
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
