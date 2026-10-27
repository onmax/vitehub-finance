# @vitehub-finance/brokers

One client for brokerage accounts. Brokers are read with read-only tokens, and every provider answers in one model: per
account, its open positions at the broker's own prices and its cash per currency, and over the period the broker reports
on, its trades, cash movements (deposits, withdrawals, dividends, tax, interest, fees), and daily value. It uses only `fetch`, so it runs on
Cloudflare Workers, Node, Deno, and Bun.

| Provider | Needs | Reads |
| --- | --- | --- |
| `ibkr` | Flex Web Service token and an Activity Flex Query id | open positions and ending cash per currency, and the period's trades, cash transactions, and net asset value per day |

## Usage

```ts
import { ibkr } from "@vitehub-finance/brokers"

const broker = ibkr({ token: process.env.IBKR_FLEX_TOKEN!, queryId: "987654" })
const accounts = await broker.accounts()
// [{ id: "U1234567", positions: [{ symbol: "VWCE", quantity: 42, markPrice: 138.56, value: 5819.52, currency: "EUR", … }],
//    cash: [{ currency: "EUR", amount: 5250.75 }, { currency: "USD", amount: 1314.03 }],
//    trades: [{ date: "2026-10-02", symbol: "VWCE", quantity: 28, price: 167.5, netCash: -4693, currency: "EUR", … }],
//    cashMovements: [{ date: "2026-10-01", type: "Deposits/Withdrawals", amount: 5000, currency: "EUR", … }],
//    history: [{ date: "2026-10-23", value: 14213.55, currency: "EUR" }] }]
```

## Interactive Brokers

The [Flex Web Service](https://www.ibkrguides.com/clientportal/performanceandstatements/flex3.htm) runs a saved Flex Query
and returns its statement. `SendRequest` (`https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService`,
version 3) answers a reference code, and `GetStatement` answers the statement once IBKR has generated it. While it is
still generating (error 1019 and the other "not ready" codes) the client asks again every 3 seconds, at most 10 times.
IBKR answers errors with HTTP 200 and a `FlexStatementResponse`, and its edge answers 403 to requests without a
User-Agent.

The query must be an Activity Flex Query with the Open Positions or Cash Report section, in any format: XML, or CSV and
Text, whose column names (`ClientAccountID`, `Quantity`) are read as the XML attributes they stand for. Trades
(executions, or orders when there are none), Cash Transactions (detail rows), and Net Asset Value (NAV) in Base
(`EquitySummaryByReportDateInBase`, one row per day) are read when the query has them, over its period: "Last 365
Calendar Days" gives a year. Dates are read as yyyyMMdd (IBKR's default), yyyy-MM-dd, or yyyy/MM/dd; a section whose
dates are all in another format fails with what to change. Open positions use the summary rows, or add the lots up per instrument when the query
only has lots. Cash is `endingCash` per currency; the `BASE_SUMMARY` row is left out because it repeats the others in
the base currency. One query can cover several linked accounts, one `BrokerAccount` each.

In Client Portal:

1. Performance & Reports › Flex Queries. Next to Activity Flex Query, click +. Tick Open Positions, Cash Report, Trades,
   Cash Transactions, and Net Asset Value (NAV) in Base, set Period to Last 365 Calendar Days, and save. The Query ID
   is in the query's info.
2. Flex Web Service Configuration: turn the service on and generate a token. Leave "Valid For IP Address" empty
   (Workers have no fixed IP) and pick the longest expiry. A new token replaces the old one.

## Model

- `Position`: `symbol`, `description`, `assetClass` (IBKR's `assetCategory`: STK, OPT, FUT, FUND, BOND, CRYPTO, …),
  `quantity` (negative when short), `markPrice` and `value` in the instrument's `currency` (value includes the
  multiplier), and the broker's `id` (conid) and `isin`.
- `CashBalance`: `currency` and `amount`, negative when the account borrows.
- `Trade`: `id`, `date`, `symbol`, `description`, `quantity` (negative when sold), `price`, and `netCash` (what the cash
  changed by, commission included: negative for a buy) in `currency`.
- `CashMovement`: `id`, `date`, IBKR's `type` ("Deposits/Withdrawals", "Dividends", "Withholding Tax", …),
  `description`, and `amount` (negative when money left) in `currency`.
- `DailyValue`: `date` and the account's whole `value` that day in its base `currency`.
- `BrokerError`: `code` is `invalid_credentials` (a token, a query id, or the query's setup needs fixing),
  `rate_limited`, or `unavailable`, and `message` is written for people.

## Options

`ibkr` takes `{ fetch, userAgent, timeoutMs }` like every client, plus `baseUrl`, `pollIntervalMs`, and `maxPolls`.

`parseXml(text)` is the small XML reader the client uses (Workers have no DOMParser): elements, attributes, text, and
entities, strict about broken documents. `parseFlexStatement(xml)` reads a statement you already have. `fake({ accounts })`
(from `@vitehub-finance/brokers/fake`) answers what you give it, for tests.
