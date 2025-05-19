import requests
import os
import json
import sys

# Configuration
LOGIN_URL = "https://api.topstepx.com/api/Auth/loginKey"
API_KEY_ENV_VAR = "PROJECTX_API_TOKEN"

def generate_token():
    """
    Prompts for username, retrieves API key from environment variable,
    and makes a POST request to obtain a session token.
    """
    print("--- ProjectX Session Token Generation ---")

    # Get API Key
    api_key = os.environ.get(API_KEY_ENV_VAR)
    if not api_key:
        print(f"Error: The environment variable {API_KEY_ENV_VAR} is not set.")
        print(f"Please set your API key in {API_KEY_ENV_VAR} before running this script.")
        return None
    print(f"Using API Key from {API_KEY_ENV_VAR}.")

    # Get Username
    username = "kevtrinh" # Hardcoded username
    print(f"Using hardcoded username: {username}")

    # Prepare request
    headers = {
        "accept": "text/plain",
        "Content-Type": "application/json"
    }
    payload = {
        "userName": username,
        "apiKey": api_key
    }

    print(f"\nSending POST request to: {LOGIN_URL}")
    # print(f"Payload: {json.dumps(payload)}") # Uncomment for debugging, be careful with sensitive data

    try:
        response = requests.post(LOGIN_URL, headers=headers, json=payload, timeout=10)
        response.raise_for_status()  # Raise an exception for bad status codes (4xx or 5xx)

        response_data = response.json()

        if response_data.get("success") and response_data.get("errorCode") == 0:
            token = response_data.get("token")
            if token:
                print("\nSuccessfully obtained session token!")
                print("--------------------------------------")
                print(f"Your Session Token: {token}")
                print("--------------------------------------")
                print("This token is valid for 24 hours.")
                print("Please copy this token and set it as your PROJECTX_API_TOKEN environment variable for other scripts, or use it as required.")
                return token
            else:
                print("Error: Token not found in successful response.")
                print(f"Full response: {response_data}")
                return None
        else:
            error_message = response_data.get("errorMessage", "Unknown error")
            error_code = response_data.get("errorCode", "N/A")
            print(f"\nError obtaining token. Server responded with:")
            print(f"  Success: {response_data.get('success')}")
            print(f"  Error Code: {error_code}")
            print(f"  Error Message: {error_message}")
            print(f"Full response: {response_data}")
            return None

    except requests.exceptions.HTTPError as http_err:
        print(f"\nHTTP error occurred: {http_err}")
        try:
            print(f"Response content: {response.text}")
        except Exception:
            pass # response might not be available or readable
    except requests.exceptions.ConnectionError as conn_err:
        print(f"\nConnection error occurred: {conn_err}")
    except requests.exceptions.Timeout as timeout_err:
        print(f"\nRequest timed out: {timeout_err}")
    except requests.exceptions.RequestException as req_err:
        print(f"\nAn unexpected error occurred with the request: {req_err}")
    except json.JSONDecodeError:
        print("\nError: Could not decode the JSON response from the server.")
        print(f"Response text: {response.text}")

    return None

if __name__ == "__main__":
    # Ensure requests is installed
    try:
        import requests
    except ImportError:
        print("The 'requests' library is not installed. Please install it by running:")
        print("  pip install requests")
        sys.exit(1)
        
    generate_token() 