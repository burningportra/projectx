# ProjectX Gateway API Documentation

## Table of Contents
- [Quick Start](#quick-start)
- [Base URLs](#base-urls)
- [Authentication](#authentication)
- [Error Handling](#error-handling)
- [Account Operations](#account-operations)
- [Market Data](#market-data)
- [Order Operations](#order-operations)
- [Position Operations](#position-operations)
- [Real-Time Updates](#real-time-updates)
- [Advanced Topics](#advanced-topics)
- [Best Practices](#best-practices)
- [Support](#support)

## Quick Start
1. Get your API credentials (API key or Application credentials)
2. Authenticate to get your JWT token
3. Use the token in the Authorization header for all subsequent requests
4. Subscribe to real-time updates for your required data

### Development Checklist
- [ ] Set up development environment
- [ ] Obtain API credentials
- [ ] Implement authentication flow
- [ ] Set up WebSocket connections
- [ ] Implement error handling
- [ ] Add rate limiting logic
- [ ] Set up logging
- [ ] Implement reconnection handling
- [ ] Add monitoring
- [ ] Test in demo environment

### SDK Quick Install
```bash
# NPM
npm install @projectx/trading-api @microsoft/signalr

# Python
pip install projectx-trading-api signalr-client-aio

# Java
<dependency>
  <groupId>com.projectx</groupId>
  <artifactId>trading-api</artifactId>
  <version>1.0.0</version>
</dependency>
```

## Base URLs
### REST API
- Demo: `https://gateway-api-demo.s2f.projectx.com`
- Production: `https://api.topstepx.com`

### WebSocket
- Demo: `https://gateway-rtc-demo.s2f.projectx.com`
- Production: 
  - User Hub: `https://rtc.topstepx.com/hubs/user`
  - Market Hub: `https://rtc.topstepx.com/hubs/market`

### Environment Variables
```bash
# Demo
PROJECTX_API_URL=https://gateway-api-demo.s2f.projectx.com
PROJECTX_WS_URL=https://gateway-rtc-demo.s2f.projectx.com

# Production
PROJECTX_API_URL=https://api.topstepx.com
PROJECTX_WS_URL=https://rtc.topstepx.com
```

## Authentication
All API requests must include the JWT token in the Authorization header:
```http
Authorization: Bearer your_jwt_token_here
```

### API Key Authentication
**Endpoint:** `POST /api/Auth/loginKey`

**Request Body:**
```json
{
  "userName": "string",
  "apiKey": "string"
}
```

**Response:**
```json
{
  "token": "your_session_token_here",
  "success": true,
  "errorCode": 0,
  "errorMessage": null
}
```

**Implementation Examples:**

1. **Python with Request Retry:**
```python
import requests
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.retry import Retry

class ProjectXClient:
    def __init__(self, base_url, username, api_key):
        self.base_url = base_url
        self.username = username
        self.api_key = api_key
        self.session = self._create_session()
        self.token = None

    def _create_session(self):
        session = requests.Session()
        retry = Retry(
            total=3,
            backoff_factor=0.5,
            status_forcelist=[500, 502, 503, 504]
        )
        adapter = HTTPAdapter(max_retries=retry)
        session.mount('http://', adapter)
        session.mount('https://', adapter)
        return session

    def authenticate(self):
        response = self.session.post(
            f"{self.base_url}/api/Auth/loginKey",
            json={
                "userName": self.username,
                "apiKey": self.api_key
            }
        )
        response.raise_for_status()
        data = response.json()
        self.token = data["token"]
        self.session.headers.update({
            "Authorization": f"Bearer {self.token}"
        })
        return data

    def refresh_token(self):
        # Implement token refresh logic
        pass
```

2. **TypeScript with Axios:**
```typescript
import axios, { AxiosInstance } from 'axios';

class ProjectXClient {
    private baseUrl: string;
    private username: string;
    private apiKey: string;
    private client: AxiosInstance;
    private token: string | null = null;

    constructor(baseUrl: string, username: string, apiKey: string) {
        this.baseUrl = baseUrl;
        this.username = username;
        this.apiKey = apiKey;
        this.client = this.createClient();
    }

    private createClient(): AxiosInstance {
        const client = axios.create({
            baseURL: this.baseUrl,
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // Add response interceptor for token handling
        client.interceptors.response.use(
            response => response,
            async error => {
                if (error.response?.status === 401) {
                    await this.authenticate();
                    const failedRequest = error.config;
                    failedRequest.headers['Authorization'] = `Bearer ${this.token}`;
                    return client(failedRequest);
                }
                return Promise.reject(error);
            }
        );

        return client;
    }

    async authenticate(): Promise<void> {
        const response = await this.client.post('/api/Auth/loginKey', {
            userName: this.username,
            apiKey: this.apiKey
        });

        this.token = response.data.token;
        this.client.defaults.headers.common['Authorization'] = `Bearer ${this.token}`;
    }
}
```

3. **Java with OkHttp:**
```java
import okhttp3.*;
import java.io.IOException;

public class ProjectXClient {
    private final String baseUrl;
    private final String username;
    private final String apiKey;
    private final OkHttpClient client;
    private String token;

    public ProjectXClient(String baseUrl, String username, String apiKey) {
        this.baseUrl = baseUrl;
        this.username = username;
        this.apiKey = apiKey;
        this.client = new OkHttpClient.Builder()
            .addInterceptor(this::authInterceptor)
            .build();
    }

    private Response authInterceptor(Chain chain) throws IOException {
        Request request = chain.request();
        Response response = chain.proceed(request);

        if (response.code() == 401) {
            response.close();
            authenticate();
            Request newRequest = request.newBuilder()
                .header("Authorization", "Bearer " + token)
                .build();
            return chain.proceed(newRequest);
        }

        return response;
    }

    public void authenticate() throws IOException {
        MediaType JSON = MediaType.get("application/json; charset=utf-8");
        String json = String.format(
            "{\"userName\":\"%s\",\"apiKey\":\"%s\"}",
            username, apiKey
        );

        Request request = new Request.Builder()
            .url(baseUrl + "/api/Auth/loginKey")
            .post(RequestBody.create(json, JSON))
            .build();

        try (Response response = client.newCall(request).execute()) {
            // Handle response and set token
        }
    }
}
```

### Token Management
```typescript
class TokenManager {
    private token: string | null = null;
    private expiryTime: number | null = null;
    private refreshThreshold = 5 * 60 * 1000; // 5 minutes

    async getToken(): Promise<string> {
        if (this.shouldRefresh()) {
            await this.refresh();
        }
        return this.token!;
    }

    private shouldRefresh(): boolean {
        if (!this.token || !this.expiryTime) return true;
        const now = Date.now();
        return now + this.refreshThreshold > this.expiryTime;
    }

    private async refresh(): Promise<void> {
        // Implement token refresh logic
    }
}
```

## Error Handling

### Error Codes
| Code | Description | Resolution | Example |
|------|-------------|------------|---------|
| 0 | Success | Request processed successfully | - |
| 1000 | Invalid credentials | Check your API key or username/password | Incorrect API key |
| 1001 | Token expired | Re-authenticate to get a new token | JWT expired |
| 1002 | Invalid token | Ensure token is properly formatted and valid | Malformed JWT |
| 2000 | Rate limit exceeded | Reduce request frequency | Too many requests |
| 3000 | Invalid account | Verify account ID exists and is active | Account not found |
| 4000 | Invalid order | Check order parameters | Invalid price |
| 5000 | Market closed | Wait for market hours | Trading outside hours |

### Error Response Format
```json
{
  "success": false,
  "errorCode": 1000,
  "errorMessage": "Detailed error message",
  "data": {
    "details": "Additional error context",
    "timestamp": "2024-05-12T10:30:00Z",
    "requestId": "req_123456"
  }
}
```

### Error Handling Patterns

1. **Retry Handler:**
```typescript
class RetryHandler {
    private maxRetries: number;
    private backoffMs: number;

    constructor(maxRetries = 3, backoffMs = 1000) {
        this.maxRetries = maxRetries;
        this.backoffMs = backoffMs;
    }

    async execute<T>(
        operation: () => Promise<T>,
        shouldRetry: (error: any) => boolean
    ): Promise<T> {
        let lastError: any;
        
        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                
                if (!shouldRetry(error)) {
                    throw error;
                }
                
                await this.delay(attempt);
            }
        }
        
        throw lastError;
    }

    private async delay(attempt: number): Promise<void> {
        const ms = this.backoffMs * Math.pow(2, attempt);
        const jitter = Math.random() * 100;
        await new Promise(resolve => setTimeout(resolve, ms + jitter));
    }
}
```

2. **Circuit Breaker:**
```typescript
class CircuitBreaker {
    private failures: number = 0;
    private lastFailureTime: number = 0;
    private readonly threshold: number;
    private readonly resetTimeoutMs: number;

    constructor(threshold = 5, resetTimeoutMs = 60000) {
        this.threshold = threshold;
        this.resetTimeoutMs = resetTimeoutMs;
    }

    async execute<T>(operation: () => Promise<T>): Promise<T> {
        if (this.isOpen()) {
            throw new Error('Circuit breaker is open');
        }

        try {
            const result = await operation();
            this.reset();
            return result;
        } catch (error) {
            this.recordFailure();
            throw error;
        }
    }

    private isOpen(): boolean {
        if (this.failures >= this.threshold) {
            const now = Date.now();
            if (now - this.lastFailureTime < this.resetTimeoutMs) {
                return true;
            }
            this.reset();
        }
        return false;
    }

    private recordFailure(): void {
        this.failures++;
        this.lastFailureTime = Date.now();
    }

    private reset(): void {
        this.failures = 0;
        this.lastFailureTime = 0;
    }
}
```

## Account Operations

### Search Accounts
**Endpoint:** `POST /api/Account/search`

**Request Body:**
```json
{
  "onlyActiveAccounts": true,
  "searchText": "optional search term",
  "page": 1,
  "pageSize": 100
}
```

**Response:**
```json
{
  "accounts": [
    {
      "id": 1,
      "name": "TEST_ACCOUNT_1",
      "balance": 50000,
      "currency": "USD",
      "type": "DEMO",
      "status": "ACTIVE",
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-05-12T10:30:00Z",
      "settings": {
        "maxPositionSize": 10,
        "maxLoss": 1000,
        "marginRequirement": 500
      },
      "permissions": {
        "canTrade": true,
        "canWithdraw": false,
        "isMarginEnabled": true
      },
      "metrics": {
        "dailyPnL": 150.25,
        "totalTrades": 42,
        "winRate": 0.65
      }
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalItems": 450,
    "hasMore": true
  },
  "success": true,
  "errorCode": 0,
  "errorMessage": null
}
```

**Implementation Example:**
```typescript
class AccountManager {
    private client: ProjectXClient;
    private cache: Map<number, Account>;
    private cacheExpiry: Map<number, number>;
    private cacheDuration = 5 * 60 * 1000; // 5 minutes

    constructor(client: ProjectXClient) {
        this.client = client;
        this.cache = new Map();
        this.cacheExpiry = new Map();
    }

    async getAccount(accountId: number): Promise<Account> {
        const cached = this.getCached(accountId);
        if (cached) return cached;

        const account = await this.fetchAccount(accountId);
        this.cache.set(accountId, account);
        this.cacheExpiry.set(accountId, Date.now() + this.cacheDuration);
        return account;
    }

    private getCached(accountId: number): Account | null {
        const expiry = this.cacheExpiry.get(accountId);
        if (!expiry || Date.now() > expiry) {
            this.cache.delete(accountId);
            this.cacheExpiry.delete(accountId);
            return null;
        }
        return this.cache.get(accountId) || null;
    }

    async searchAccounts(params: SearchParams): Promise<SearchResult> {
        // Implement search with pagination
    }

    async updateAccountSettings(
        accountId: number,
        settings: AccountSettings
    ): Promise<void> {
        // Implement settings update
    }
}
```

## Market Data

### Search Contracts
**Endpoint:** `POST /api/Contract/search`

**Request Body:**
```json
{
  "live": false,
  "searchText": "NQ"
}
```

**Response Example:**
```json
{
  "contracts": [
    {
      "id": "CON.F.US.ENQ.H25",
      "name": "ENQH25",
      "description": "E-mini NASDAQ-100: March 2025",
      "tickSize": 0.25,
      "tickValue": 5,
      "activeContract": true,
      "tradingHours": {
        "open": "17:00:00",
        "close": "16:00:00",
        "timeZone": "America/Chicago"
      }
    }
  ]
}
```

**Rate Limit:** 20 requests per minute per token

### Retrieve Bars
**Endpoint:** `POST /api/History/retrieveBars`

**Request Body:**
```json
{
  "contractId": "CON.F.US.ENQ.H25",
  "live": false,
  "startTime": "2024-01-01T00:00:00Z",
  "endTime": "2024-01-02T00:00:00Z",
  "unit": 2,
  "unitNumber": 1,
  "limit": 1000,
  "includePartialBar": false
}
```

**Parameters:**
- contractId (string, required): Contract identifier
- live (boolean, required): Use live or delayed data
- startTime (datetime, required): ISO 8601 format
- endTime (datetime, required): ISO 8601 format
- unit (integer, required):
  - 1 = Second
  - 2 = Minute
  - 3 = Hour
  - 4 = Day
  - 5 = Week
  - 6 = Month
- unitNumber (integer, required): Number of units to aggregate
- limit (integer, required): Max 1000 bars per request
- includePartialBar (boolean, required): Include current incomplete bar

**Rate Limit:** 
- Historical: 60 requests per minute
- Live: 120 requests per minute

### Real-time Market Data Processing
```typescript
class MarketDataProcessor {
    private readonly priceQueue: AsyncQueue<PriceUpdate>;
    private readonly orderQueue: AsyncQueue<OrderUpdate>;
    private readonly tradeQueue: AsyncQueue<TradeUpdate>;
    
    constructor() {
        this.priceQueue = new AsyncQueue(1000);
        this.orderQueue = new AsyncQueue(1000);
        this.tradeQueue = new AsyncQueue(1000);
        
        this.startProcessing();
    }
    
    private async startProcessing() {
        // Process price updates
        this.priceQueue.process(async (update) => {
            await this.processPriceUpdate(update);
        });
        
        // Process order updates
        this.orderQueue.process(async (update) => {
            await this.processOrderUpdate(update);
        });
        
        // Process trade updates
        this.tradeQueue.process(async (update) => {
            await this.processTradeUpdate(update);
        });
    }
    
    private async processPriceUpdate(update: PriceUpdate) {
        // Implement price update logic
    }
    
    private async processOrderUpdate(update: OrderUpdate) {
        // Implement order update logic
    }
    
    private async processTradeUpdate(update: TradeUpdate) {
        // Implement trade update logic
    }
}

class AsyncQueue<T> {
    private queue: T[] = [];
    private processing = false;
    private readonly maxSize: number;
    
    constructor(maxSize: number) {
        this.maxSize = maxSize;
    }
    
    async push(item: T) {
        if (this.queue.length >= this.maxSize) {
            this.queue.shift(); // Remove oldest item
        }
        this.queue.push(item);
    }
    
    async process(handler: (item: T) => Promise<void>) {
        if (this.processing) return;
        
        this.processing = true;
        while (this.queue.length > 0) {
            const item = this.queue.shift()!;
            await handler(item);
        }
        this.processing = false;
    }
}
```

## Order Operations

### Place Order
**Endpoint:** `POST /api/Order/place`

**Request Body:**
```json
{
  "accountId": 1,
  "contractId": "CON.F.US.ENQ.H25",
  "type": 2,
  "side": 0,
  "size": 1,
  "limitPrice": 15000.50,
  "stopPrice": null,
  "trailPrice": null,
  "customTag": "MyOrder123",
  "linkedOrderId": null
}
```

**Parameters:**
- accountId (integer, required): Your account ID
- contractId (string, required): Contract identifier
- type (integer, required):
  - 1 = Limit
  - 2 = Market
  - 4 = Stop
  - 5 = TrailingStop
  - 6 = JoinBid
  - 7 = JoinAsk
- side (integer, required):
  - 0 = Bid (buy)
  - 1 = Ask (sell)
- size (integer, required): Order quantity
- limitPrice (decimal, optional): Required for limit orders
- stopPrice (decimal, optional): Required for stop orders
- trailPrice (decimal, optional): Required for trailing stop orders
- customTag (string, optional): Your reference ID
- linkedOrderId (integer, optional): Parent order ID for OCO orders

**Response:**
```json
{
  "orderId": 9056,
  "success": true,
  "errorCode": 0,
  "errorMessage": null
}
```

**Rate Limit:** 50 orders per minute per account

**Risk Checks:**
- Maximum position size
- Maximum order size
- Price limits
- Loss limits
- Pattern day trading rules

### Cancel Order
**Endpoint:** `POST /api/Order/cancel`

**Request Body:**
```json
{
  "accountId": 465,
  "orderId": 26974
}
```

**Rate Limit:** 50 cancels per minute per account

### Modify Order
**Endpoint:** `POST /api/Order/modify`

**Request Body:**
```json
{
  "accountId": 465,
  "orderId": 26974,
  "size": 2,
  "limitPrice": 15001.00,
  "stopPrice": null,
  "trailPrice": null
}
```

**Notes:**
- Only working orders can be modified
- Modification maintains order priority if only size is reduced
- Price changes result in new queue position

## Position Operations

### Close Position
**Endpoint:** `POST /api/Position/closeContract`

**Request Body:**
```json
{
  "accountId": 536,
  "contractId": "CON.F.US.GMET.J25"
}
```

**Notes:**
- Closes entire position at market
- Cancels all working orders for the contract
- Returns error if no position exists

### Partial Close Position
**Endpoint:** `POST /api/Position/partialCloseContract`

**Request Body:**
```json
{
  "accountId": 536,
  "contractId": "CON.F.US.GMET.J25",
  "size": 1
}
```

## Real-Time Updates
ProjectX uses SignalR for real-time updates via WebSocket. 

### Connection Setup
```javascript
// NPM: @microsoft/signalr
import * as signalR from "@microsoft/signalr";

const connection = new signalR.HubConnectionBuilder()
  .withUrl(hubUrl, {
    skipNegotiation: true,
    transport: signalR.HttpTransportType.WebSockets,
    accessTokenFactory: () => JWT_TOKEN
  })
  .withAutomaticReconnect([0, 2000, 5000, 10000, 20000]) // Retry delays
  .configureLogging(signalR.LogLevel.Information)
  .build();

// Handle connection events
connection.onreconnecting(error => {
  console.log('Reconnecting:', error);
});

connection.onreconnected(connectionId => {
  console.log('Reconnected:', connectionId);
  // Resubscribe to all feeds
});

connection.onclose(error => {
  console.log('Connection closed:', error);
});

// Start connection
await connection.start();
```

### User Hub Events
```javascript
// Subscribe to account updates
await connection.invoke("SubscribeAccounts");
connection.on("GatewayUserAccount", data => {
  console.log('Account update:', data);
});

// Subscribe to order updates
await connection.invoke("SubscribeOrders", accountId);
connection.on("GatewayUserOrder", data => {
  console.log('Order update:', data);
});

// Subscribe to position updates
await connection.invoke("SubscribePositions", accountId);
connection.on("GatewayUserPosition", data => {
  console.log('Position update:', data);
});
```

### Market Hub Events
```javascript
// Subscribe to market data
await connection.invoke("SubscribeContractQuotes", contractId);
connection.on("GatewayQuote", (contractId, data) => {
  console.log('Quote:', contractId, data);
});

// Subscribe to market depth
await connection.invoke("SubscribeContractMarketDepth", contractId);
connection.on("GatewayDepth", (contractId, data) => {
  console.log('Market depth:', contractId, data);
});
```

### WebSocket Rate Limits
- Maximum 50 subscriptions per connection
- Maximum 3 concurrent connections per token
- Message rate: 100 messages per second
- Reconnection backoff: Exponential with jitter

## Advanced Topics

### Rate Limiting
```typescript
class RateLimiter {
    private readonly limits: Map<string, TokenBucket>;
    
    constructor() {
        this.limits = new Map([
            ['orders', new TokenBucket(50, 60000)],   // 50 orders per minute
            ['market', new TokenBucket(120, 60000)],  // 120 market data requests per minute
            ['account', new TokenBucket(10, 60000)]   // 10 account requests per minute
        ]);
    }
    
    async checkLimit(type: string): Promise<boolean> {
        const limiter = this.limits.get(type);
        if (!limiter) return true;
        return limiter.tryConsume();
    }
}

class TokenBucket {
    private tokens: number;
    private readonly capacity: number;
    private readonly refillRate: number;
    private lastRefill: number;
    
    constructor(capacity: number, refillIntervalMs: number) {
        this.capacity = capacity;
        this.tokens = capacity;
        this.refillRate = capacity / refillIntervalMs;
        this.lastRefill = Date.now();
    }
    
    tryConsume(): boolean {
        this.refill();
        if (this.tokens >= 1) {
            this.tokens--;
            return true;
        }
        return false;
    }
    
    private refill() {
        const now = Date.now();
        const elapsed = now - this.lastRefill;
        const tokensToAdd = elapsed * this.refillRate;
        
        this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
        this.lastRefill = now;
    }
}
```

### Monitoring and Metrics
```typescript
class MetricsCollector {
    private metrics: Map<string, Metric>;
    private readonly reporter: MetricsReporter;
    
    constructor(reporter: MetricsReporter) {
        this.metrics = new Map();
        this.reporter = reporter;
        
        // Setup default metrics
        this.setupMetrics();
    }
    
    private setupMetrics() {
        this.addMetric('api.latency', new HistogramMetric());
        this.addMetric('api.errors', new CounterMetric());
        this.addMetric('ws.connected', new GaugeMetric());
        this.addMetric('orders.placed', new CounterMetric());
        this.addMetric('orders.filled', new CounterMetric());
    }
    
    recordLatency(operation: string, latencyMs: number) {
        const metric = this.metrics.get('api.latency');
        if (metric instanceof HistogramMetric) {
            metric.record(latencyMs);
        }
    }
    
    incrementErrors() {
        const metric = this.metrics.get('api.errors');
        if (metric instanceof CounterMetric) {
            metric.increment();
        }
    }
    
    async reportMetrics() {
        const metrics = Array.from(this.metrics.entries()).map(([key, metric]) => ({
            name: key,
            value: metric.getValue(),
            type: metric.getType()
        }));
        
        await this.reporter.report(metrics);
    }
}

class HistogramMetric {
    private readonly buckets: number[];
    private readonly counts: number[];
    private sum: number = 0;
    private count: number = 0;
    
    constructor() {
        this.buckets = [1, 5, 10, 25, 50, 100, 250, 500, 1000];
        this.counts = new Array(this.buckets.length + 1).fill(0);
    }
    
    record(value: number) {
        this.sum += value;
        this.count++;
        
        let i = 0;
        while (i < this.buckets.length && value > this.buckets[i]) {
            i++;
        }
        this.counts[i]++;
    }
    
    getValue() {
        return {
            buckets: this.buckets,
            counts: this.counts,
            sum: this.sum,
            count: this.count
        };
    }
    
    getType() {
        return 'histogram';
    }
}
```

### Logging
```typescript
class Logger {
    private readonly context: string;
    private readonly level: LogLevel;
    
    constructor(context: string, level: LogLevel = LogLevel.INFO) {
        this.context = context;
        this.level = level;
    }
    
    log(level: LogLevel, message: string, meta?: object) {
        if (level < this.level) return;
        
        const entry = {
            timestamp: new Date().toISOString(),
            level: LogLevel[level],
            context: this.context,
            message,
            ...meta
        };
        
        console.log(JSON.stringify(entry));
    }
    
    error(message: string, error?: Error, meta?: object) {
        this.log(LogLevel.ERROR, message, {
            error: error?.message,
            stack: error?.stack,
            ...meta
        });
    }
    
    warn(message: string, meta?: object) {
        this.log(LogLevel.WARN, message, meta);
    }
    
    info(message: string, meta?: object) {
        this.log(LogLevel.INFO, message, meta);
    }
    
    debug(message: string, meta?: object) {
        this.log(LogLevel.DEBUG, message, meta);
    }
}

enum LogLevel {
    ERROR = 0,
    WARN = 1,
    INFO = 2,
    DEBUG = 3
}
```

## Testing

### Integration Testing
```typescript
describe('ProjectX API Integration Tests', () => {
    let client: ProjectXClient;
    
    beforeAll(async () => {
        client = new ProjectXClient(
            process.env.API_URL!,
            process.env.API_USERNAME!,
            process.env.API_KEY!
        );
        await client.authenticate();
    });
    
    describe('Account Operations', () => {
        it('should retrieve account details', async () => {
            const account = await client.getAccount(123);
            expect(account).toBeDefined();
            expect(account.id).toBe(123);
        });
        
        it('should handle invalid account', async () => {
            await expect(client.getAccount(999999))
                .rejects
                .toThrow('Account not found');
        });
    });
    
    describe('Order Operations', () => {
        it('should place and cancel order', async () => {
            // Place order
            const order = await client.placeOrder({
                accountId: 123,
                contractId: 'TEST',
                type: OrderType.LIMIT,
                side: OrderSide.BUY,
                size: 1,
                limitPrice: 100
            });
            
            expect(order.id).toBeDefined();
            
            // Cancel order
            await client.cancelOrder(order.id);
            
            // Verify cancelled
            const status = await client.getOrderStatus(order.id);
            expect(status).toBe('CANCELLED');
        });
    });
});
```

### Mock WebSocket Server
```typescript
class MockWebSocketServer {
    private server: WebSocket.Server;
    private clients: Set<WebSocket>;
    
    constructor(port: number) {
        this.server = new WebSocket.Server({ port });
        this.clients = new Set();
        
        this.server.on('connection', this.handleConnection.bind(this));
    }
    
    private handleConnection(ws: WebSocket) {
        this.clients.add(ws);
        
        ws.on('message', this.handleMessage.bind(this, ws));
        ws.on('close', () => this.clients.delete(ws));
    }
    
    private handleMessage(ws: WebSocket, message: string) {
        const data = JSON.parse(message);
        
        switch (data.type) {
            case 'subscribe':
                this.handleSubscribe(ws, data);
                break;
            case 'unsubscribe':
                this.handleUnsubscribe(ws, data);
                break;
        }
    }
    
    private handleSubscribe(ws: WebSocket, data: any) {
        // Send mock market data
        setInterval(() => {
            ws.send(JSON.stringify({
                type: 'quote',
                data: {
                    contractId: data.contractId,
                    price: Math.random() * 100,
                    timestamp: new Date()
                }
            }));
        }, 1000);
    }
    
    private handleUnsubscribe(ws: WebSocket, data: any) {
        // Handle unsubscribe
    }
}
```

## Support
- Technical Support: support@projectx.com
- API Status: status.projectx.com
- Documentation: docs.projectx.com
- Developer Forum: forum.projectx.com
- API Updates: updates.projectx.com

### Common Issues
1. Authentication Failures
   - Check API key format
   - Verify token expiration
   - Check request headers

2. Rate Limiting
   - Implement backoff strategy
   - Cache responses
   - Use bulk endpoints

3. WebSocket Disconnects
   - Implement reconnection logic
   - Monitor connection health
   - Handle missed messages

4. Order Rejections
   - Validate parameters
   - Check account status
   - Verify market hours

### Monitoring Checklist
- [ ] API response times
- [ ] WebSocket connection status
- [ ] Error rates
- [ ] Rate limit usage
- [ ] Order success rate
- [ ] Data latency
- [ ] System health metrics 