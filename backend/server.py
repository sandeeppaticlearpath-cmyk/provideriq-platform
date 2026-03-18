from flask import Flask, request, jsonify
import requests
import os

app = Flask(__name__)

@app.route("/")
def home():
    return "Backend is working 🚀"

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
        "limit": 10
    }

    response = requests.get(url, params=params)
    data = response.json()

    results = []

    if "results" in data:
        for item in data["results"]:
            basic = item.get("basic", {})
            address = item.get("addresses", [{}])[0]

            results.append({
                "name": basic.get("name"),
                "state": address.get("state"),
                "status": basic.get("status"),
                "npi": item.get("number")
            })

    return jsonify({
        "query": name,
        "results": results
    })

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
