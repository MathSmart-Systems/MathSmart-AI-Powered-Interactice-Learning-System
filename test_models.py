import urllib.request
import urllib.error
import json
import time
import os
import sys

API_KEY = os.getenv("XKIRO_API_KEY")
if not API_KEY or API_KEY == "YOUR_API_KEY_HERE":
    print("[-] Error: XKIRO_API_KEY environment variable is not set.")
    print("    Please run: export XKIRO_API_KEY='your-key-here'")
    sys.exit(1)

BASE_URL = "https://api.xkiro.com/v1"

# Added User-Agent to prevent WAFs from rejecting python-urllib
headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
    "User-Agent": "curl/8.4.0"
}

def get_models():
    req = urllib.request.Request(f"{BASE_URL}/models", headers=headers)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())["data"]

def test_model(model_id):
    payload = json.dumps({
        "model": model_id,
        "messages": [{"role": "user", "content": "Hi"}],
        "max_tokens": 5
    }).encode()

    req = urllib.request.Request(f"{BASE_URL}/chat/completions", data=payload, headers=headers)
    start = time.time()
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            elapsed = round(time.time() - start, 2)
            return "SUCCESS", f"{elapsed}s"
    except urllib.error.HTTPError as e:
        err_body = e.read().decode()
        try:
            msg = json.loads(err_body).get("error", {}).get("message", e.reason)
        except Exception:
            msg = e.reason
        return f"HTTP {e.code}", str(msg)[:40]
    except Exception as e:
        return "ERROR", str(e)[:40]

def main():
    print("Fetching model list...")
    try:
        models = get_models()
    except urllib.error.HTTPError as e:
        print(f"[-] Failed to fetch models: HTTP {e.code} - {e.reason}")
        print(f"    Body: {e.read().decode()[:100]}")
        return
    except Exception as e:
        print(f"[-] Connection error: {e}")
        return

    print(f"Found {len(models)} models. Beginning health checks...\n")
    print(f"{'STATUS':<12} | {'MODEL ID':<35} | {'LATENCY / ERROR'}")
    print("-" * 75)

    for m in models:
        model_id = m["id"]
        status, detail = test_model(model_id)

        flag = "[+]" if status == "SUCCESS" else "[-]"
        print(f"{flag} {status:<8} | {model_id:<35} | {detail}")
        
        time.sleep(0.5)

if __name__ == "__main__":
    main()
