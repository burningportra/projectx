# ProjectX Gateway API Documentation

## Connection Details

API Endpoint: https://api.topstepx.com
User Hub: https://rtc.topstepx.com/hubs/user
Market Hub: https://rtc.topstepx.com/hubs/market


---

## Authenticate Api Key

Source: https://gateway.docs.projectx.com/docs/getting-started/authenticate/authenticate-api-key

Getting Started
Authenticate
Authenticate (with API key)
On this page
Authenticate (with API key)
We utilize JSON Web Tokens to authenticate all requests sent to the API. This process involves obtaining a session token, which is required for future requests.
Step 1
â
To begin, ensure you have the following:
An API key obtained from your firm. If you do not have these credentials, please contact your firm.
The connection URLs, obtained
here
.
Step 2
â
API Reference:
Login API
Create a
POST
request with your username and API key.
cURL Request
curl
-
X
'POST'
\
'https://gateway-api-demo.s2f.projectx.com/api/Auth/loginKey'
\
-
H
'accept: text/plain'
\
-
H
'Content-Type: application/json'
\
-
d '
{
"userName"
:
"string"
,
"apiKey"
:
"string"
}
'
Step 3
â
Process the API response, and make sure the result is Success (0), then store your session token in a safe place.
This session token will grant full access to the Gateway API.
Response
{
"token"
:
"your_session_token_here"
,
"success"
:
true
,
"errorCode"
:
0
,
"errorMessage"
:
null
}
Notes
â
All further requests will require you to provide the session token in the
"Authorization"
HTTP header using the
Bearer
method.
Session tokens are only valid for 24 hours. You must revalidate your token to continue using the same session.
The next step will explain how to extend / re-validate your session in case your token has expired.
Previous
Authenticate
Next
Authenticate (for authorized applications)
Step 1
Step 2
Step 3
Notes

---

## Placing Your First Order

Source: https://gateway.docs.projectx.com/docs/getting-started/placing-your-first-order

Getting Started
Placing Your First Order
On this page
Placing Your First Order
This documentation outlines the process for placing your first order using our API. To successfully execute an order, you must have an active trading account associated with your user. Follow the steps below to retrieve your account details, browse available contracts, and place your order.
Step 1
â
To initiate the order process, you must first retrieve a list of active accounts linked to your user. This step is essential for confirming your account status before placing an order.
API URL
:
POST
https://gateway-api-demo.s2f.projectx.com
/api/account/search
API Reference
:
/api/account/search
Request
Response
cURL Request
{
"onlyActiveAccounts"
:
true
}
{
"accounts"
:
[
{
"id"
:
1
,
"name"
:
"TEST_ACCOUNT_1"
,
"canTrade"
:
true
,
"isVisible"
:
true
}
]
,
"success"
:
true
,
"errorCode"
:
0
,
"errorMessage"
:
null
}
curl
-
X
'POST'
\
'https://gateway-api-demo.s2f.projectx.com/api/Account/search'
\
-
H
'accept: text/plain'
\
-
H
'Content-Type: application/json'
\
-
d '
{
"onlyActiveAccounts"
:
true
}
'
Step 2
â
Once you have identified your active accounts, the next step is to retrieve a list of contracts available for trading. This information will assist you in choosing the appropriate contracts for your order.
API URL
:
POST
https://gateway-api-demo.s2f.projectx.com
/api/contract/search
API Reference
:
/api/contract/search
Request
Response
cURL Request
{
"live"
:
false
,
"searchText"
:
"NQ"
}
{
"contracts"
:
[
{
"id"
:
"CON.F.US.ENQ.H25"
,
"name"
:
"ENQH25"
,
"description"
:
"E-mini NASDAQ-100: March 2025"
,
"tickSize"
:
0.25
,
"tickValue"
:
5
,
"activeContract"
:
true
}
,
{
"id"
:
"CON.F.US.MNQ.H25"
,
"name"
:
"MNQH25"
,
"description"
:
"Micro E-mini Nasdaq-100: March 2025"
,
"tickSize"
:
0.25
,
"tickValue"
:
0.5
,
"activeContract"
:
true
}
,
{
"id"
:
"CON.F.US.NQG.G25"
,
"name"
:
"NQGG25"
,
"description"
:
"E-Mini Natural Gas: February 2025"
,
"tickSize"
:
0.005
,
"tickValue"
:
12.5
,
"activeContract"
:
true
}
,
{
"id"
:
"CON.F.US.NQM.G25"
,
"name"
:
"NQMG25"
,
"description"
:
"E-Mini Crude Oil: February 2025"
,
"tickSize"
:
0.025
,
"tickValue"
:
12.5
,
"activeContract"
:
true
}
]
,
"success"
:
true
,
"errorCode"
:
0
,
"errorMessage"
:
null
}
curl
-
X
'POST'
\
'https://gateway-api-demo.s2f.projectx.com/api/Contract/search'
\
-
H
'accept: text/plain'
\
-
H
'Content-Type: application/json'
\
-
d '
{
"live"
:
false
,
"searchText"
:
"NQ"
}
'
Final Step
â
Having noted your account ID and the selected contract ID, you are now ready to place your order. Ensure that you provide accurate details to facilitate a successful transaction.
API URL
:
POST
https://gateway-api-demo.s2f.projectx.com
/api/order/place
API Reference
:
/api/order/place
Parameters
â
Name
Type
Description
Required
Nullable
accountId
integer
The account ID.
Required
false
contractId
string
The contract ID.
Required
false
type
integer
The order type:
1
= Limit
2
= Market
4
= Stop
5
= TrailingStop
6
= JoinBid
7
= JoinAsk
Required
false
side
integer
The side of the order:
0
= Bid (buy)
1
= Ask (sell)
Required
false
size
integer
The size of the order.
Required
false
limitPrice
decimal
The limit price for the order, if applicable.
Optional
true
stopPrice
decimal
The stop price for the order, if applicable.
Optional
true
trailPrice
decimal
The trail price for the order, if applicable.
Optional
true
customTag
string
An optional custom tag for the order.
Optional
true
linkedOrderId
integer
The linked order id.
Optional
true
Request
Response
cURL Request
{
"accountId"
:
1
,
"contractId"
:
"CON.F.US.DA6.M25"
,
"type"
:
2
,
"side"
:
1
,
"size"
:
1
,
"limitPrice"
:
null
,
"stopPrice"
:
null
,
"trailPrice"
:
null
,
"customTag"
:
null
,
"linkedOrderId"
:
null
}
{
"orderId"
:
9056
,
"success"
:
true
,
"errorCode"
:
0
,
"errorMessage"
:
null
}
curl
-
X
'POST'
\
'https://gateway-api-demo.s2f.projectx.com/api/Order/place'
\
-
H
'accept: text/plain'
\
-
H
'Content-Type: application/json'
\
-
d '
{
"accountId"
:
1
,
"contractId"
:
"CON.F.US.DA6.M25"
,
"type"
:
2
,
"side"
:
1
,
"size"
:
1
,
"limitPrice"
:
null
,
"stopPrice"
:
null
,
"trailPrice"
:
null
,
"customTag"
:
null
,
"linkedOrderId"
:
null
}
'
Previous
Authenticate (for authorized applications)
Next
Connection URLs
Step 1
Step 2
Final Step
Parameters

---

## Authenticate As Application

Source: https://gateway.docs.projectx.com/docs/getting-started/authenticate/authenticate-as-application

Getting Started
Authenticate
Authenticate (for authorized applications)
On this page
Authenticate (for authorized applications)
We utilize JSON Web Tokens to authenticate all requests sent to the API.
Step 1
â
Retrieve the admin credentials (username and password, appId, and verifyKey) that have been provided for your firm. You will need these credentials to authenticate with the API.
If you do not have these credentials, please contact your Account Manager for more information.
Step 2
â
API Reference:
Login API
Create a
POST
request with your username and password.
cURL Request
curl
-
X
'POST'
\
'https://gateway-api-demo.s2f.projectx.com/api/Auth/loginApp'
\
-
H
'accept: text/plain'
\
-
H
'Content-Type: application/json'
\
-
d '
{
"userName"
:
"yourUsername"
,
"password"
:
"yourPassword"
,
"deviceId"
:
"yourDeviceId"
,
"appId"
:
"B76015F2-04D3-477E-9191-C5E22CB2C957"
,
"verifyKey"
:
"yourVerifyKey"
}
'
Step 3
â
Process the API response, and make sure the result is Success (0), then store your session token in a safe place.
This session token will grant full access to the Gateway API.
Response
{
"token"
:
"your_session_token_here"
,
"success"
:
true
,
"errorCode"
:
0
,
"errorMessage"
:
null
}
Notes
â
All further requests will require you to provide the session token in the
"Authorization"
HTTP header using the
Bearer
method.
Session tokens are only valid for 24 hours. You must revalidate your token to continue using the same session.
The next step will explain how to extend / re-validate your session in case your token has expired.
Previous
Authenticate (with API key)
Next
Placing Your First Order
Step 1
Step 2
Step 3
Notes

---

## Search Accounts

Source: https://gateway.docs.projectx.com/docs/api-reference/account/search-accounts

API Reference
Account
Search for Account
On this page
Search for Account
API URL
:
POST
https://gateway-api-demo.s2f.projectx.com
/api/Account/search
API Reference
:
/api/account/search
Description
â
Search for accounts.
Parameters
â
Name
Type
Description
Required
Nullable
onlyActiveAccounts
boolean
Whether to filter only active accounts.
Required
false
Example Usage
â
Example Request
â
cURL Request
curl
-
X
'POST'
\
'https://gateway-api-demo.s2f.projectx.com/api/Account/search'
\
-
H
'accept: text/plain'
\
-
H
'Content-Type: application/json'
\
-
d '
{
"onlyActiveAccounts"
:
true
}
'
Example Response
â
Success
Error
{
"accounts"
:
[
{
"id"
:
1
,
"name"
:
"TEST_ACCOUNT_1"
,
"balance"
:
50000
,
"canTrade"
:
true
,
"isVisible"
:
true
}
]
,
"success"
:
true
,
"errorCode"
:
0
,
"errorMessage"
:
null
}
Error: response status is 401
Previous
Account
Next
Market Data
Description
Parameters
Example Usage
Example Request
Example Response

---

## Retrieve Bars

Source: https://gateway.docs.projectx.com/docs/api-reference/market-data/retrieve-bars

API Reference
Market Data
Retrieve Bars
On this page
Retrieve Bars
API URL
:
POST
https://gateway-api-demo.s2f.projectx.com
/api/History/retrieveBars
API Reference
:
/api/history/retrieveBars
Description
â
Retrieve bars.
Parameters
â
Name
Type
Description
Required
Nullable
contractId
integer
The contract ID.
Required
false
live
boolean
Whether to retrieve bars using the sim or live data subscription.
Required
false
startTime
datetime
The start time of the historical data.
Required
false
endTime
datetime
The end time of the historical data.
Required
false
unit
integer
The unit of aggregation for the historical data:
1
= Second
2
= Minute
3
= Hour
4
= Day
5
= Week
6
= Month
Required
false
unitNumber
integer
The number of units to aggregate.
Required
false
limit
integer
The maximum number of bars to retrieve.
Required
false
includePartialBar
boolean
Whether to include a partial bar representing the current time unit.
Required
false
Example Usage
â
Example Request
â
cURL Request
curl
-
X
'POST'
\
'https://gateway-api-demo.s2f.projectx.com/api/History/retrieveBars'
\
-
H
'accept: text/plain'
\
-
H
'Content-Type: application/json'
\
-
d '
{
"contractId"
:
"CON.F.US.RTY.Z24"
,
"live"
:
false
,
"startTime"
:
"2024-12-01T00:00:00Z"
,
"endTime"
:
"2024-12-31T21:00:00Z"
,
"unit"
:
3
,
"unitNumber"
:
1
,
"limit"
:
7
,
"includePartialBar"
:
false
}
'
Example Response
â
Success
Error
{
"bars"
:
[
{
"t"
:
"2024-12-20T14:00:00+00:00"
,
"o"
:
2208.100000000
,
"h"
:
2217.000000000
,
"l"
:
2206.700000000
,
"c"
:
2210.100000000
,
"v"
:
87
}
,
{
"t"
:
"2024-12-20T13:00:00+00:00"
,
"o"
:
2195.800000000
,
"h"
:
2215.000000000
,
"l"
:
2192.900000000
,
"c"
:
2209.800000000
,
"v"
:
536
}
,
{
"t"
:
"2024-12-20T12:00:00+00:00"
,
"o"
:
2193.600000000
,
"h"
:
2200.300000000
,
"l"
:
2192.000000000
,
"c"
:
2198.000000000
,
"v"
:
180
}
,
{
"t"
:
"2024-12-20T11:00:00+00:00"
,
"o"
:
2192.200000000
,
"h"
:
2194.800000000
,
"l"
:
2189.900000000
,
"c"
:
2194.800000000
,
"v"
:
174
}
,
{
"t"
:
"2024-12-20T10:00:00+00:00"
,
"o"
:
2200.400000000
,
"h"
:
2200.400000000
,
"l"
:
2191.000000000
,
"c"
:
2193.100000000
,
"v"
:
150
}
,
{
"t"
:
"2024-12-20T09:00:00+00:00"
,
"o"
:
2205.000000000
,
"h"
:
2205.800000000
,
"l"
:
2198.900000000
,
"c"
:
2200.500000000
,
"v"
:
56
}
,
{
"t"
:
"2024-12-20T08:00:00+00:00"
,
"o"
:
2207.700000000
,
"h"
:
2210.100000000
,
"l"
:
2198.100000000
,
"c"
:
2204.900000000
,
"v"
:
144
}
]
,
"success"
:
true
,
"errorCode"
:
0
,
"errorMessage"
:
null
}
Error: response status is 401
Previous
Market Data
Next
Search for Contracts
Description
Parameters
Example Usage
Example Request
Example Response

---

## Search Contracts

Source: https://gateway.docs.projectx.com/docs/api-reference/market-data/search-contracts

API Reference
Market Data
Search for Contracts
On this page
Search for Contracts
API URL
:
POST
https://gateway-api-demo.s2f.projectx.com
/api/Contract/search
API Reference
:
/api/contract/search
Description
â
Search for contracts.
Parameters
â
Name
Type
Description
Required
Nullable
searchText
string
The name of the contract to search for.
Required
false
live
boolean
Whether to search for contracts using the sim/live data subscription.
Required
false
Example Usage
â
Example Request
â
cURL Request
curl
-
X
'POST'
\
'https://gateway-api-demo.s2f.projectx.com/api/Contract/search'
\
-
H
'accept: text/plain'
\
-
H
'Content-Type: application/json'
\
-
d '
{
"live"
:
false
,
"searchText"
:
"NQ"
}
'
Example Response
â
Success
Error
{
"contracts"
:
[
{
"id"
:
"CON.F.US.ENQ.H25"
,
"name"
:
"ENQH25"
,
"description"
:
"E-mini NASDAQ-100: March 2025"
,
"tickSize"
:
0.25
,
"tickValue"
:
5
,
"activeContract"
:
true
}
,
{
"id"
:
"CON.F.US.MNQ.H25"
,
"name"
:
"MNQH25"
,
"description"
:
"Micro E-mini Nasdaq-100: March 2025"
,
"tickSize"
:
0.25
,
"tickValue"
:
0.5
,
"activeContract"
:
true
}
,
{
"id"
:
"CON.F.US.NQG.G25"
,
"name"
:
"NQGG25"
,
"description"
:
"E-Mini Natural Gas: February 2025"
,
"tickSize"
:
0.005
,
"tickValue"
:
12.5
,
"activeContract"
:
true
}
,
{
"id"
:
"CON.F.US.NQM.G25"
,
"name"
:
"NQMG25"
,
"description"
:
"E-Mini Crude Oil: February 2025"
,
"tickSize"
:
0.025
,
"tickValue"
:
12.5
,
"activeContract"
:
true
}
]
,
"success"
:
true
,
"errorCode"
:
0
,
"errorMessage"
:
null
}
Error: response status is 401
Previous
Retrieve Bars
Next
Search for Contract by Id
Description
Parameters
Example Usage
Example Request
Example Response

---

## Search Contracts By Id

Source: https://gateway.docs.projectx.com/docs/api-reference/market-data/search-contracts-by-id

API Reference
Market Data
Search for Contract by Id
On this page
Search for Contract by Id
API URL
:
POST
https://gateway-api-demo.s2f.projectx.com
/api/Contract/searchById
API Reference
:
/api/contract/searchbyid
Description
â
Search for contracts.
Parameters
â
Name
Type
Description
Required
Nullable
contractId
string
The id of the contract to search for.
Required
false
Example Usage
â
Example Request
â
cURL Request
curl
-
X
'POST'
\
'https://gateway-api-demo.s2f.projectx.com/api/Contract/searchById'
\
-
H
'accept: text/plain'
\
-
H
'Content-Type: application/json'
\
-
d '
{
"contractId"
:
"CON.F.US.ENQ.H25"
}
'
Example Response
â
Success
Error
{
"contracts"
:
[
{
"id"
:
"CON.F.US.ENQ.H25"
,
"name"
:
"ENQH25"
,
"description"
:
"E-mini NASDAQ-100: March 2025"
,
"tickSize"
:
0.25
,
"tickValue"
:
5
,
"activeContract"
:
true
}
]
,
"success"
:
true
,
"errorCode"
:
0
,
"errorMessage"
:
null
}
Error: response status is 401
Previous
Search for Contracts
Next
Orders
Description
Parameters
Example Usage
Example Request
Example Response

---

## Order Search

Source: https://gateway.docs.projectx.com/docs/api-reference/order/order-search

API Reference
Orders
Search for Orders
On this page
Search for Orders
API URL
:
POST
https://gateway-api-demo.s2f.projectx.com
/api/Order/search
API Reference
:
/api/order/search
Description
â
Search for orders.
Parameters
â
Name
Type
Description
Required
Nullable
accountId
integer
The account ID.
Required
false
startTimestamp
datetime
The start of the timestamp filter.
Required
false
endTimestamp
datetime
The end of the timestamp filter.
Optional
true
Example Usage
â
Example Request
â
cURL Request
curl
-
X
'POST'
\
'https://gateway-api-demo.s2f.projectx.com/api/Order/search'
\
-
H
'accept: text/plain'
\
-
H
'Content-Type: application/json'
\
-
d '
{
"accountId"
:
202
,
"startTimestamp"
:
"2024-12-30T16:48:16.003Z"
,
"endTimestamp"
:
"2025-12-30T16:48:16.003Z"
}
'
Example Response
â
Success
Error
{
"orders"
:
[
{
"id"
:
26060
,
"accountId"
:
545
,
"contractId"
:
"CON.F.US.EP.M25"
,
"creationTimestamp"
:
"2025-04-14T17:49:10.142532+00:00"
,
"updateTimestamp"
:
null
,
"status"
:
2
,
"type"
:
2
,
"side"
:
0
,
"size"
:
1
,
"limitPrice"
:
null
,
"stopPrice"
:
null
}
,
{
"id"
:
26062
,
"accountId"
:
545
,
"contractId"
:
"CON.F.US.EP.M25"
,
"creationTimestamp"
:
"2025-04-14T17:49:53.043234+00:00"
,
"updateTimestamp"
:
null
,
"status"
:
2
,
"type"
:
2
,
"side"
:
1
,
"size"
:
1
,
"limitPrice"
:
null
,
"stopPrice"
:
null
}
]
,
"success"
:
true
,
"errorCode"
:
0
,
"errorMessage"
:
null
}
Error: response status is 401
Previous
Orders
Next
Search for Open Orders
Description
Parameters
Example Usage
Example Request
Example Response

---

## Order Search Open

Source: https://gateway.docs.projectx.com/docs/api-reference/order/order-search-open

API Reference
Orders
Search for Open Orders
On this page
Search for Open Orders
API URL
:
POST
https://gateway-api-demo.s2f.projectx.com
/api/Order/searchOpen
API Reference
:
/api/order/searchopen
Description
â
Search for open orders.
Parameters
â
Name
Type
Description
Required
Nullable
accountId
integer
The account ID.
Required
false
Example Usage
â
Example Request
â
cURL Request
curl
-
X
'POST'
\
'https://gateway-api-demo.s2f.projectx.com/api/Order/search'
\
-
H
'accept: text/plain'
\
-
H
'Content-Type: application/json'
\
-
d '
{
"accountId"
:
212
}
'
Example Response
â
Success
Error
{
"orders"
:
[
{
"id"
:
26970
,
"accountId"
:
212
,
"contractId"
:
"CON.F.US.EP.M25"
,
"creationTimestamp"
:
"2025-04-21T19:45:52.105808+00:00"
,
"updateTimestamp"
:
"2025-04-21T19:45:52.105808+00:00"
,
"status"
:
1
,
"type"
:
4
,
"side"
:
1
,
"size"
:
1
,
"limitPrice"
:
null
,
"stopPrice"
:
5138.000000000
}
]
,
"success"
:
true
,
"errorCode"
:
0
,
"errorMessage"
:
null
}
Error: response status is 401
Previous
Search for Orders
Next
Place an Order
Description
Parameters
Example Usage
Example Request
Example Response

---

## Order Place

Source: https://gateway.docs.projectx.com/docs/api-reference/order/order-place

API Reference
Orders
Place an Order
On this page
Place an Order
API URL
:
POST
https://gateway-api-demo.s2f.projectx.com
/api/Order/place
API Reference
:
/api/order/place
Description
â
Place an order.
Parameters
â
Name
Type
Description
Required
Nullable
accountId
integer
The account ID.
Required
false
contractId
string
The contract ID.
Required
false
type
integer
The order type:
1
= Limit
2
= Market
4
= Stop
5
= TrailingStop
6
= JoinBid
7
= JoinAsk
Required
false
side
integer
The side of the order:
0
= Bid (buy)
1
= Ask (sell)
Required
false
size
integer
The size of the order.
Required
false
limitPrice
decimal
The limit price for the order, if applicable.
Optional
true
stopPrice
decimal
The stop price for the order, if applicable.
Optional
true
trailPrice
decimal
The trail price for the order, if applicable.
Optional
true
customTag
string
An optional custom tag for the order.
Optional
true
linkedOrderId
integer
The linked order id.
Optional
true
Example Usage
â
Example Request
â
cURL Request
curl
-
X
'POST'
\
'https://gateway-api-demo.s2f.projectx.com/api/Order/place'
\
-
H
'accept: text/plain'
\
-
H
'Content-Type: application/json'
\
-
d '
{
"accountId"
:
465
,
"contractId"
:
"CON.F.US.DA6.M25"
,
"type"
:
2
,
"side"
:
1
,
"size"
:
1
,
"limitPrice"
:
null
,
"stopPrice"
:
null
,
"trailPrice"
:
null
,
"customTag"
:
null
,
"linkedOrderId"
:
null
}
'
Example Response
â
Success
Error
{
"orderId"
:
9056
,
"success"
:
true
,
"errorCode"
:
0
,
"errorMessage"
:
null
}
Error: response status is 401
Previous
Search for Open Orders
Next
Cancel an Order
Description
Parameters
Example Usage
Example Request
Example Response

---

## Order Cancel

Source: https://gateway.docs.projectx.com/docs/api-reference/order/order-cancel

API Reference
Orders
Cancel an Order
On this page
Cancel an Order
API URL
:
POST
https://gateway-api-demo.s2f.projectx.com
/api/Order/cancel
API Reference
:
/api/order/cancel
Description
â
Cancel an order.
Parameters
â
Name
Type
Description
Required
Nullable
accountId
integer
The account ID.
Required
false
orderId
integer
The order id.
Required
false
Example Usage
â
Example Request
â
cURL Request
curl
-
X
'POST'
\
'https://gateway-api-demo.s2f.projectx.com/api/Order/cancel'
\
-
H
'accept: text/plain'
\
-
H
'Content-Type: application/json'
\
-
d '
{
"accountId"
:
465
,
"orderId"
:
26974
}
'
Example Response
â
Success
Error
{
"success"
:
true
,
"errorCode"
:
0
,
"errorMessage"
:
null
}
Error: response status is 401
Previous
Place an Order
Next
Modify an Order
Description
Parameters
Example Usage
Example Request
Example Response

---

## Order Modify

Source: https://gateway.docs.projectx.com/docs/api-reference/order/order-modify

API Reference
Orders
Modify an Order
On this page
Modify an Order
API URL
:
POST
https://gateway-api-demo.s2f.projectx.com
/api/Order/modify
API Reference
:
/api/order/modify
Description
â
Modify an open order.
Parameters
â
Name
Type
Description
Required
Nullable
accountId
integer
The account ID.
Required
false
orderId
integer
The order id.
Required
false
size
integer
The size of the order.
Optional
true
limitPrice
decimal
The limit price for the order, if applicable.
Optional
true
stopPrice
decimal
The stop price for the order, if applicable.
Optional
true
trailPrice
decimal
The trail price for the order, if applicable.
Optional
true
Example Usage
â
Example Request
â
cURL Request
curl
-
X
'POST'
\
'https://gateway-api-demo.s2f.projectx.com/api/Order/modify'
\
-
H
'accept: text/plain'
\
-
H
'Content-Type: application/json'
\
-
d '
{
"accountId"
:
465
,
"orderId"
:
26974
,
"size"
:
1
,
"limitPrice"
:
null
,
"stopPrice"
:
1604
,
"trailPrice"
:
null
}
'
Example Response
â
Success
Error
{
"success"
:
true
,
"errorCode"
:
0
,
"errorMessage"
:
null
}
Error: response status is 401
Previous
Cancel an Order
Next
Positions
Description
Parameters
Example Usage
Example Request
Example Response

---

## Close Positions

Source: https://gateway.docs.projectx.com/docs/api-reference/positions/close-positions

API Reference
Positions
Close Positions
On this page
Close Positions
API URL
:
POST
https://gateway-api-demo.s2f.projectx.com
/api/Position/closeContract
API Reference
:
/api/position/closeContract
Description
â
Close a position.
Parameters
â
Name
Type
Description
Required
Nullable
accountId
integer
The account ID.
Required
false
contractId
string
The contract ID.
Required
false
Example Usage
â
Example Request
â
cURL Request
curl
-
X
'POST'
\
'https://gateway-api-demo.s2f.projectx.com/api/Position/partialCloseContract'
\
-
H
'accept: text/plain'
\
-
H
'Content-Type: application/json'
\
-
d '
{
"accountId"
:
536
,
"contractId"
:
"CON.F.US.GMET.J25"
,
"size"
:
1
}
'
Example Response
â
Success
Error
{
"success"
:
true
,
"errorCode"
:
0
,
"errorMessage"
:
null
}
Error: response status is 401
Previous
Positions
Next
Partially Close Positions
Description
Parameters
Example Usage
Example Request
Example Response

---

## Close Positions Partial

Source: https://gateway.docs.projectx.com/docs/api-reference/positions/close-positions-partial

API Reference
Positions
Partially Close Positions
On this page
Partially Close Positions
API URL
:
POST
https://gateway-api-demo.s2f.projectx.com
/api/Position/partialCloseContract
API Reference
:
/api/position/partialclosecontract
Description
â
Partially close a position.
Parameters
â
Name
Type
Description
Required
Nullable
accountId
integer
The account ID.
Required
false
contractId
string
The contract ID.
Required
false
size
integer
The size to close.
Required
false
Example Usage
â
Example Request
â
cURL Request
curl
-
X
'POST'
\
'https://gateway-api-demo.s2f.projectx.com/api/Position/closeContract'
\
-
H
'accept: text/plain'
\
-
H
'Content-Type: application/json'
\
-
d '
{
"accountId"
:
536
,
"contractId"
:
"CON.F.US.GMET.J25"
}
'
Example Response
â
Success
Error
{
"success"
:
true
,
"errorCode"
:
0
,
"errorMessage"
:
null
}
Error: response status is 401
Previous
Close Positions
Next
Search for Positions
Description
Parameters
Example Usage
Example Request
Example Response

---

## Search Open Positions

Source: https://gateway.docs.projectx.com/docs/api-reference/positions/search-open-positions

API Reference
Positions
Search for Positions
On this page
Search for Positions
API URL
:
POST
https://gateway-api-demo.s2f.projectx.com
/api/Position/searchOpen
API Reference
:
/api/position/searchOpen
Description
â
Search for open positions.
Parameters
â
Name
Type
Description
Required
Nullable
accountId
integer
The account ID.
Required
false
Example Usage
â
Example Request
â
cURL Request
curl
-
X
'POST'
\
'https://gateway-api-demo.s2f.projectx.com/api/Position/searchOpen'
\
-
H
'accept: text/plain'
\
-
H
'Content-Type: application/json'
\
-
d '
{
"accountId"
:
536
}
'
Example Response
â
Success
Error
{
"positions"
:
[
{
"id"
:
6124
,
"accountId"
:
536
,
"contractId"
:
"CON.F.US.GMET.J25"
,
"creationTimestamp"
:
"2025-04-21T19:52:32.175721+00:00"
,
"type"
:
1
,
"size"
:
2
,
"averagePrice"
:
1575.750000000
}
]
,
"success"
:
true
,
"errorCode"
:
0
,
"errorMessage"
:
null
}
Error: response status is 401
Previous
Partially Close Positions
Next
Trades
Description
Parameters
Example Usage
Example Request
Example Response

---

## Trade Search

Source: https://gateway.docs.projectx.com/docs/api-reference/trade/trade-search

API Reference
Trades
Search for Trades
On this page
Search for Trades
API URL
:
POST
https://gateway-api-demo.s2f.projectx.com
/api/Trade/search
API Reference
:
/api/Trade/search
Description
â
Search for trades from the request parameters.
Parameters
â
Name
Type
Description
Required
Nullable
accountId
integer
The account ID.
Required
false
startTimestamp
datetime
The start of the timestamp filter.
Required
false
endTimestamp
datetime
The end of the timestamp filter.
Optional
true
Example Usage
â
Example Request
â
cURL Request
curl
-
X
'POST'
\
'https://gateway-api-demo.s2f.projectx.com/api/Trade/search'
\
-
H
'accept: text/plain'
\
-
H
'Content-Type: application/json'
\
-
d '
{
"accountId"
:
203
,
"startTimestamp"
:
"2025-01-20T15:47:39.882Z"
,
"endTimestamp"
:
"2025-01-30T15:47:39.882Z"
}
'
Example Response
â
Success
Error
{
"trades"
:
[
{
"id"
:
8604
,
"accountId"
:
203
,
"contractId"
:
"CON.F.US.EP.H25"
,
"creationTimestamp"
:
"2025-01-21T16:13:52.523293+00:00"
,
"price"
:
6065.250000000
,
"profitAndLoss"
:
50.000000000
,
"fees"
:
1.4000
,
"side"
:
1
,
"size"
:
1
,
"voided"
:
false
,
"orderId"
:
14328
}
,
{
"id"
:
8603
,
"accountId"
:
203
,
"contractId"
:
"CON.F.US.EP.H25"
,
"creationTimestamp"
:
"2025-01-21T16:13:04.142302+00:00"
,
"price"
:
6064.250000000
,
"profitAndLoss"
:
null
,
//a null value indicates a half-turn trade
"fees"
:
1.4000
,
"side"
:
0
,
"size"
:
1
,
"voided"
:
false
,
"orderId"
:
14326
}
]
,
"success"
:
true
,
"errorCode"
:
0
,
"errorMessage"
:
null
}
Error: response status is 401
Previous
Trades
Next
Realtime Updates
Description
Parameters
Example Usage
Example Request
Example Response

---

## 

Source: https://gateway.docs.projectx.com/docs/realtime/

Realtime Updates
Real Time Data Overview
On this page
Real Time Data Overview
The ProjectX Real Time API utilizes SignalR library (via WebSocket) to provide real-time access to data updates involving accounts, orders, positions, balances and quotes.
There are two hubs:
user
and
market
.
The user hub will provide real-time updates to a user's accounts, orders, and positions.
The market hub will provide market data such as market trade events, DOM events, etc.
What is SignalR?
â
SignalR is a real-time web application framework developed by Microsoft that simplifies the process of adding real-time functionality to web applications. It allows for bidirectional communication between clients (such as web browsers) and servers, enabling features like live chat, notifications, and real-time updates without the need for constant client-side polling or manual handling of connections.
SignalR abstracts away the complexities of real-time communication by providing high-level APIs for developers. It supports various transport protocols, including WebSockets, Server-Sent Events (SSE), Long Polling, and others, automatically selecting the most appropriate transport mechanism based on the capabilities of the client and server.
The framework handles connection management, message routing, and scaling across multiple servers, making it easier for developers to build scalable and responsive web applications. SignalR is available for multiple platforms, including .NET and JavaScript, allowing developers to build real-time applications using their preferred programming languages and frameworks.
Further information on SignalR can be found
here
.
Example Usage
â
User Hub
Market Hub
// Import the necessary modules from @microsoft/signalr
const
{
HubConnectionBuilder
,
HttpTransportType
}
=
require
(
'@microsoft/signalr'
)
;
// Function to set up and start the SignalR connection
function
setupSignalRConnection
(
)
{
const
JWT_TOKEN
=
'your_bearer_token'
;
const
SELECTED_ACCOUNT_ID
=
123
;
//your currently selected/visible account ID
const
userHubUrl
=
'https://gateway-rtc-demo.s2f.projectx.com/hubs/user?access_token='
+
JWT_TOKEN
;
// Create the connection
const
rtcConnection
=
new
HubConnectionBuilder
(
)
.
withUrl
(
userHubUrl
,
{
skipNegotiation
:
true
,
transport
:
HttpTransportType
.
WebSockets
,
accessTokenFactory
:
(
)
=>
JWT_TOKEN
,
// Replace with your current JWT token
timeout
:
10000
// Optional timeout
}
)
.
withAutomaticReconnect
(
)
.
build
(
)
;
// Start the connection
rtcConnection
.
start
(
)
.
then
(
(
)
=>
{
// Function to subscribe to the necessary events
const
subscribe
=
(
)
=>
{
rtcConnection
.
invoke
(
'SubscribeAccounts'
)
;
rtcConnection
.
invoke
(
'SubscribeOrders'
,
SELECTED_ACCOUNT_ID
)
;
//you can call this function multiple times with different account IDs
rtcConnection
.
invoke
(
'SubscribePositions'
,
SELECTED_ACCOUNT_ID
)
;
//you can call this function multiple times with different account IDs
rtcConnection
.
invoke
(
'SubscribeTrades'
,
SELECTED_ACCOUNT_ID
)
;
//you can call this function multiple times with different account IDs
}
;
// Functions to unsubscribe, if needed
const
unsubscribe
=
(
)
=>
{
rtcConnection
.
invoke
(
'UnsubscribeAccounts'
)
;
rtcConnection
.
invoke
(
'UnsubscribeOrders'
,
SELECTED_ACCOUNT_ID
)
;
//you can call this function multiple times with different account IDs
rtcConnection
.
invoke
(
'UnsubscribePositions'
,
SELECTED_ACCOUNT_ID
)
;
//you can call this function multiple times with different account IDs
rtcConnection
.
invoke
(
'UnsubscribeTrades'
,
SELECTED_ACCOUNT_ID
)
;
//you can call this function multiple times with different account IDs
}
;
// Set up the event listeners
rtcConnection
.
on
(
'GatewayUserAccount'
,
(
data
)
=>
{
console
.
log
(
'Received account update'
,
data
)
;
}
)
;
rtcConnection
.
on
(
'GatewayUserOrder'
,
(
data
)
=>
{
console
.
log
(
'Received order update'
,
data
)
;
}
)
;
rtcConnection
.
on
(
'GatewayUserPosition'
,
(
data
)
=>
{
console
.
log
(
'Received position update'
,
data
)
;
}
)
;
rtcConnection
.
on
(
'GatewayUserTrade'
,
(
data
)
=>
{
console
.
log
(
'Received trade update'
,
data
)
;
}
)
;
// Subscribe to the events
subscribe
(
)
;
// Handle reconnection
rtcConnection
.
onreconnected
(
(
connectionId
)
=>
{
console
.
log
(
'RTC Connection Reconnected'
)
;
subscribe
(
)
;
}
)
;
}
)
.
catch
(
(
err
)
=>
{
console
.
error
(
'Error starting connection:'
,
err
)
;
}
)
;
}
// Call the function to set up and start the connection
setupSignalRConnection
(
)
;
// Import the necessary modules from @microsoft/signalr
const
{
HubConnectionBuilder
,
HttpTransportType
}
=
require
(
'@microsoft/signalr'
)
;
// Function to set up and start the SignalR connection
function
setupSignalRConnection
(
)
{
const
JWT_TOKEN
=
'your_bearer_token'
;
const
marketHubUrl
=
'https://gateway-rtc-demo.s2f.projectx.com/hubs/market?access_token='
+
JWT_TOKEN
;
const
CONTRACT_ID
=
'CON.F.US.RTY.H25'
;
// Example contract ID
// Create the connection
const
rtcConnection
=
new
HubConnectionBuilder
(
)
.
withUrl
(
marketHubUrl
,
{
skipNegotiation
:
true
,
transport
:
HttpTransportType
.
WebSockets
,
accessTokenFactory
:
(
)
=>
JWT_TOKEN
,
// Replace with your current JWT token
timeout
:
10000
// Optional timeout
}
)
.
withAutomaticReconnect
(
)
.
build
(
)
;
// Start the connection
rtcConnection
.
start
(
)
.
then
(
(
)
=>
{
// Function to subscribe to the necessary events
const
subscribe
=
(
)
=>
{
rtcConnection
.
invoke
(
'SubscribeContractQuotes'
,
CONTRACT_ID
)
;
rtcConnection
.
invoke
(
'SubscribeContractTrades'
,
CONTRACT_ID
)
;
rtcConnection
.
invoke
(
'SubscribeContractMarketDepth'
,
CONTRACT_ID
)
;
}
;
// Functions to unsubscribe, if needed
const
unsubscribe
=
(
)
=>
{
rtcConnection
.
invoke
(
'UnsubscribeContractQuotes'
,
CONTRACT_ID
)
;
rtcConnection
.
invoke
(
'UnsubscribeContractTrades'
,
CONTRACT_ID
)
;
rtcConnection
.
invoke
(
'UnsubscribeContractMarketDepth'
,
CONTRACT_ID
)
;
}
;
// Set up the event listeners
rtcConnection
.
on
(
'GatewayQuote'
,
(
contractId
,
data
)
=>
{
console
.
log
(
'Received market quote data'
,
data
)
;
}
)
;
rtcConnection
.
on
(
'GatewayTrade'
,
(
contractId
,
data
)
=>
{
console
.
log
(
'Received market trade data'
,
data
)
;
}
)
;
rtcConnection
.
on
(
'GatewayDepth'
,
(
contractId
,
data
)
=>
{
console
.
log
(
'Received market depth data'
,
data
)
;
}
)
;
// Subscribe to the events
subscribe
(
)
;
// Handle reconnection
rtcConnection
.
onreconnected
(
(
connectionId
)
=>
{
console
.
log
(
'RTC Connection Reconnected'
)
;
subscribe
(
)
;
}
)
;
}
)
.
catch
(
(
err
)
=>
{
console
.
error
(
'Error starting connection:'
,
err
)
;
}
)
;
}
// Call the function to set up and start the connection
setupSignalRConnection
(
)
;
Previous
Realtime Updates
What is SignalR?
Example Usage

---

