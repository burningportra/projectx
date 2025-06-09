#!/usr/bin/env python3

"""
Test script to verify authentication with the ProjectX Gateway API.
"""

import os
import json
import asyncio
import aiohttp
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

async def test_gateway_auth():
    """Test authentication with the ProjectX Gateway API."""
    print("Testing ProjectX Gateway API authentication...")
    
    # Get credentials from environment variables
    api_url = os.getenv("PROJECTX_API_URL", "https://gateway-api-demo.s2f.projectx.com")
    api_key = os.getenv("PROJECTX_API_TOKEN", "")
    username = os.getenv("PROJECTX_USERNAME", "")
    
    if not api_key or not username:
        print("Error: Missing API key or username in environment variables.")
        return
    
    print(f"API URL: {api_url}")
    print(f"Username: {username}")
    print(f"API Key (masked): {api_key[:5]}...{api_key[-5:] if len(api_key) > 10 else ''}")
    
    # Create URL for authentication
    auth_url = f"{api_url}/api/Auth/loginKey"
    
    # Create headers
    headers = {
        "accept": "application/json",
        "Content-Type": "application/json"
    }
    
    # Create request body
    data = {
        "userName": username.strip(),
        "apiKey": api_key.strip()
    }
    
    print(f"Request URL: {auth_url}")
    print(f"Request headers: {headers}")
    print(f"Request data (sanitized): {{'userName': '{username}', 'apiKey': '***'}}")
    
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
                        print(f"Authentication failed: {error_msg}")
                except json.JSONDecodeError:
                    print(f"Error: Invalid JSON response")
                    
        except aiohttp.ClientError as e:
            print(f"Error: HTTP request failed: {str(e)}")
        except Exception as e:
            print(f"Error: Unexpected error: {str(e)}")
    
# Run the test
if __name__ == "__main__":
    asyncio.run(test_gateway_auth())
