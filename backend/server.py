from flask import Flask, request, jsonify
import requests

app = Flask(__name__)

@app.route("/")
def home():
    return "ProviderIQ API is running 🚀"


@app.route("/search", methods=["GET"])
def search():
    name = request.args.get("name")

    if not name:
        return jsonify({"error": "Please provide a name"}), 400

    url = "https://npiregistry.cms.hhs.gov/api/"

    results = []

    try:
        # 🔹 Try searching as FIRST NAME
        params = {
            "version": "2.1",
            "first_name": name,
            "enumeration_type": "NPI-1",
            "limit": 10
        }

        response = requests.get(url, params=params)
        data = response.json()

        results = data.get("results", [])

        # 🔹 If empty → try LAST NAME (fallback)
        if not results:
            params = {
                "version": "2.1",
                "last_name": name,
                "enumeration_type": "NPI-1",
                "limit": 10
            }

            response = requests.get(url, params=params)
            data = response.json()
            results = data.get("results", [])

        formatted_results = []

        for item in results:
            basic = item.get("basic", {})
            address = item.get("addresses", [{}])[0]

            formatted_results.append({
                "name": f"{basic.get('first_name', '')} {basic.get('last_name', '')}".strip(),
                "state": address.get("state", ""),
                "status": basic.get("status", ""),
                "npi": item.get("number", "")
            })

        return jsonify({
            "query": name,
            "count": len(formatted_results),
            "results": formatted_results
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=10000)
