from flask import Flask, request, jsonify
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

    return jsonify({
        "query": name,
        "results": [
            {
                "name": "John Doe PT",
                "location": "California",
                "status": "Active"
            }
        ]
    })

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
