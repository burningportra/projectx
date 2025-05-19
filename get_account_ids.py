import requests
import os
import json
import sys

# Configuration
# Assuming the base URL is consistent with the one used for token generation.
# If the docs (gateway-api-demo.s2f.projectx.com) are correct, change this.
ACCOUNT_SEARCH_URL = "https://api.topstepx.com/api/Account/search"
TOKEN_ENV_VAR = "PROJECTX_API_TOKEN_SESSION" # This should be your SESSION TOKEN

def fetch_account_ids():
    """
    Retrieves session token from environment variable, and makes a POST request
    to search for active accounts and print their details.
    """
    print("--- ProjectX Account ID Fetcher ---")

    # Get Session Token
    session_token = os.environ.get(TOKEN_ENV_VAR)
    if not session_token:
        print(f"Warning: Environment variable {TOKEN_ENV_VAR} not found. Falling back to hardcoded token for this session.")
        session_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJodHRwOi8vc2NoZW1hcy54bWxzb2FwLm9yZy93cy8yMDA1LzA1L2lkZW50aXR5L2NsYWltcy9uYW1laWRlbnRpZmllciI6IjQyODE1IiwiaHR0cDovL3NjaGVtYXMueG1sc29hcC5vcmcvd3MvMjAwNS8wNS9pZGVudGl0eS9jbGFpbXMvc2lkIjoiMmIzZTNjMDAtMWVhNS00ODkzLWJkYWYtNWI5OTZiZTA5NTEzIiwiaHR0cDovL3NjaGVtYXMueG1sc29hcC5vcmcvd3MvMjAwNS8wNS9pZGVudGl0eS9jbGFpbXMvbmFtZSI6ImtldnRyaW5oIiwiaHR0cDovL3NjaGVtYXMubWljcm9zb2Z0LmNvbS93cy8yMDA4LzA2L2lkZW50aXR5L2NsYWltcy9yb2xlIjoidXNlciIsImh0dHA6Ly9zY2hlbWFzLm1pY3Jvc29mdC5jb20vd3MvMjAwOC8wNi9pZGVudGl0eS9jbGFpbXMvYXV0aGVudGljYXRpb25tZXRob2QiOiJhcGkta2V5IiwibXNkIjpbIkNNRUdST1VQX1RPQiIsIkNNRV9UT0IiXSwibWZhIjoidmVyaWZpZWQiLCJleHAiOjE3NDc3MDE1MDR9.-lLPeniMivwws9CsVgt2dpfy01eXAGGHQ64VO3G7lgE"

    if session_token == 'your_session_token_here' or session_token == 'your_bearer_token':
        print(f"Error: The token is still a placeholder. Please set the {TOKEN_ENV_VAR} environment variable or update the hardcoded token in the script.")
        return
    
    print(f"Using Session Token from {TOKEN_ENV_VAR}.")

    # Prepare request
    headers = {
        "accept": "text/plain", # Though the example response is JSON, the API docs often show this accept header.
                              # The server likely responds with JSON based on Content-Type of request or standard behavior.
        "Content-Type": "application/json",
        "Authorization": f"Bearer {session_token}"
    }
    payload = {
        "onlyActiveAccounts": True
    }

    print(f"\nSending POST request to: {ACCOUNT_SEARCH_URL}")

    try:
        response = requests.post(ACCOUNT_SEARCH_URL, headers=headers, json=payload, timeout=10)
        response.raise_for_status()  # Raise an exception for bad status codes (4xx or 5xx)

        response_data = response.json()

        if response_data.get("success") and response_data.get("errorCode") == 0:
            accounts = response_data.get("accounts")
            if accounts:
                print("\nSuccessfully retrieved accounts!")
                print("-----------------------------------")
                for account in accounts:
                    print(f"  ID: {account.get('id')}")
                    print(f"  Name: {account.get('name')}")
                    print(f"  Balance: {account.get('balance')}")
                    print(f"  Can Trade: {account.get('canTrade')}")
                    print(f"  Is Visible: {account.get('isVisible')}")
                    print("  ---")
                print("-----------------------------------")
                print("Use one of these IDs for the SELECTED_ACCOUNT_ID in 'test_user_hub_connection.py'.")
            else:
                print("No accounts found in the response, or 'accounts' field is missing/empty.")
                print(f"Full response: {response_data}")
        else:
            error_message = response_data.get("errorMessage", "Unknown error")
            error_code = response_data.get("errorCode", "N/A")
            print(f"\nError retrieving accounts. Server responded with:")
            print(f"  Success: {response_data.get('success')}")
            print(f"  Error Code: {error_code}")
            print(f"  Error Message: {error_message}")
            print(f"Full response: {response_data}")

    except requests.exceptions.HTTPError as http_err:
        print(f"\nHTTP error occurred: {http_err}")
        print(f"This could be due to an invalid/expired session token (401 Unauthorized), or other server-side issues.")
        try:
            print(f"Response content: {response.text}")
        except Exception:
            pass
    except requests.exceptions.ConnectionError as conn_err:
        print(f"\nConnection error occurred: {conn_err}")
    except requests.exceptions.Timeout as timeout_err:
        print(f"\nRequest timed out: {timeout_err}")
    except requests.exceptions.RequestException as req_err:
        print(f"\nAn unexpected error occurred with the request: {req_err}")
    except json.JSONDecodeError:
        print("\nError: Could not decode the JSON response from the server.")
        print(f"Response text: {response.text}")

if __name__ == "__main__":
    # Ensure requests is installed
    try:
        import requests
    except ImportError:
        print("The 'requests' library is not installed. Please install it by running:")
        print("  pip install requests")
        sys.exit(1)
        
    fetch_account_ids() 