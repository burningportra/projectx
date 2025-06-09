#!/usr/bin/env python3

"""
Test script to verify authentication with the ProjectX Gateway API
using the application authentication method.
"""

import os
import json
import asyncio
import aiohttp
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

async def test_gateway_app_auth():
    """Test application authentication with the ProjectX Gateway API."""
    print("Testing ProjectX Gateway API application authentication...")
    
    # Get credentials from environment variables
    api_url = os.getenv("PROJECTX_API_URL", "https://gateway-api-demo.s2f.projectx.com")
    username = os.getenv("PROJECTX_USERNAME", "")
    
    # Fallback to prompting for credentials
    if not username:
        username = input("Enter username: ")
        
    password = input("Enter password (will not be displayed): ")
    device_id = input("Enter device ID (or just press Enter for default): ") or "default-device-id"
    app_id = input("Enter app ID (or just press Enter for default): ") or "B76015F2-04D3-477E-9191-C5E22CB2C957"  # Default from docs
    verify_key = input("Enter verify key: ")
    
    print(f"API URL: {api_url}")
    print(f"Username: {username}")
    
    # Create URL for authentication
    auth_url = f"{api_url}/api/Auth/loginApp"
    
    # Create headers
    headers = {
        "accept": "text/plain",  # Exactly as in docs
        "Content-Type": "application/json"
    }
    
    # Create request body
    data = {
        "userName": username.strip(),
        "password": password,
        "deviceId": device_id,
        "appId": app_id,
        "verifyKey": verify_key
    }
    
    print(f"Request URL: {auth_url}")
    print(f"Request headers: {headers}")
    print(f"Request data (sanitized): {{'userName': '{username}', 'password': '***', 'deviceId': '{device_id}', 'appId': '{app_id}', 'verifyKey': '***'}}")
    
    # Make the request
    async with aiohttp.ClientSession() as session:
        try:
            async with session.post(auth_url, headers=headers, json=data) as response:
                print(f"Response status: {response.status}")
                
                # Read the response text
                response_text = await response.text()
                print(f"Raw response: {response_text}")
                
                try:
                    # Parse the response as JSON
                    response_data = json.loads(response_text)
                    print(f"Response data: {json.dumps(response_data, indent=2)}")
                    
                    # Check for success
                    if response.ok and response_data.get("success", False):
                        token = response_data.get("token")
                        if token:
                            print("Authentication successful!")
                            print(f"Token (masked): {token[:5]}...{token[-5:] if len(token) > 10 else ''}")
                        else:
                            print("Error: No token in response.")
                    else:
                        error_msg = response_data.get("errorMessage", "Unknown error")
                        error_code = response_data.get("errorCode", "Unknown")
                        print(f"Authentication failed: {error_msg} (Error code: {error_code})")
                except json.JSONDecodeError:
                    print(f"Error: Invalid JSON response")
                    
        except aiohttp.ClientError as e:
            print(f"Error: HTTP request failed: {str(e)}")
        except Exception as e:
            print(f"Error: Unexpected error: {str(e)}")
    
# Run the test
if __name__ == "__main__":
    asyncio.run(test_gateway_app_auth())
