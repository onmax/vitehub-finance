<script setup lang="ts">
import type { LegalInfo } from "#shared/api"

// What this instance keeps, where, and who sees it. Public: Enable Banking's app registration links here.
definePageMeta({ layout: "auth", wide: true })
useHead({ title: "Privacy" })
const demo = useDemo()
const { data: legal } = useFetch<LegalInfo>("/api/legal", { key: "legal", default: () => ({ contactEmail: null, ai: false }) })
</script>

<template>
  <LegalPage title="Privacy" updated="October 2026">
    <p>
      ViteHub Finance is open-source software that a person or household runs for themselves. Whoever runs this copy (the
      operator) holds your data. This page covers what it keeps, where, and who can see it.
    </p>
    <p v-if="demo">
      This is the public demo. Its household, people, banks, and transactions are made up, and everything resets every night.
      Don’t enter real data here.
    </p>

    <h2>What it stores</h2>
    <ul>
      <li>Your name, email, and sign-in details: a hashed password, passkeys, your two-factor secret, and active sessions (with their IP address and browser).</li>
      <li>Your household and its members.</li>
      <li>The accounts you connect or add: balances, transactions, holdings, and what you add to them (categories, notes, rules, budgets, goals, recurring payments).</li>
      <li>How to reach each connection: a bank session, an exchange’s API key, or a wallet address.</li>
      <li>API keys you create and the agents (MCP clients) you approve.</li>
      <li>
        Logs, for finding and fixing errors: each request’s page or API path, timing, and outcome, with your user and
        household ids but never your name, email, or transaction details; and errors your browser hits, with the page’s path
        (no query) and the error message. They’re kept for a few days.
      </li>
    </ul>

    <h2>Where it lives</h2>
    <p>
      In this instance’s own database: Cloudflare D1 when it runs on Cloudflare, or an SQLite file on the operator’s server.
      There is no central service; the ViteHub Finance project never receives your data.
    </p>

    <h2>Bank data</h2>
    <p>
      Banks connect through <a href="https://enablebanking.com" target="_blank" rel="noopener">Enable Banking</a>, a
      licensed account information service provider under PSD2. You give consent on your bank’s own page. Access is
      read-only: balances and transactions, never payments. Consent lasts up to 180 days, and you can revoke it at any time
      by removing the connection here or at your bank.
    </p>
    <p>
      Exchanges connect with read-only API keys you create. Wallets are public addresses, looked up on public blockchain
      services. Coin prices (CoinGecko) and exchange rates (the ECB, through Frankfurter) are fetched by currency and coin
      symbol only.
    </p>

    <template v-if="legal?.ai">
      <h2>AI categories</h2>
      <p>
        When no rule categorizes a transaction, this instance asks
        <a href="https://typesafe.ai" target="_blank" rel="noopener">TypeSafe</a>’s Jev model to suggest one. It sends the
        transaction’s description and payee, whether money went in or out, the amount rounded to two digits, the currency,
        the account type, and the household’s category names and rule keywords. Names of household members, IBANs, and
        long numbers (cards, accounts, references) are masked first. It never sends dates, balances, account names, or who
        you are. Suggestions are marked as such, and the household’s owner can turn this off in Settings.
      </p>
    </template>

    <h2>How it’s protected</h2>
    <p>
      Bank sessions and exchange keys are encrypted at rest with AES-GCM, using a key only the server holds. Passwords are
      stored as hashes. The only cookies are for signing in; there are no ads, trackers, or analytics.
    </p>

    <h2>Who sees what</h2>
    <p>
      Accounts shared with your household are visible to its members. A private account is visible only to its owner, in
      every list, total, chart, API response, and agent tool. On a shared account, its owner can mark a single transaction
      “Only me”: the rest of the household doesn’t see it anywhere, though the account’s balance still includes it. Agents
      and API keys you connect see what you see. Your data is never sold or shared with anyone else, apart from the
      services this page names. If this instance sends email (invitations, sign-in links, consent reminders),
      those messages go through its email provider.
    </p>

    <h2>Deleting data</h2>
    <p>
      Removing a connection ends its access and deletes its accounts and their history, unless you choose to keep them as
      manual accounts. Deleting an account deletes its transactions, balances, and holdings. Leaving a household takes your
      accounts with you. To delete your sign-in and everything in it, ask the operator.
    </p>

    <template v-if="legal?.contactEmail">
      <h2>Contact</h2>
      <p>
        Questions or requests about your data: <a :href="`mailto:${legal.contactEmail}`">{{ legal.contactEmail }}</a>.
      </p>
    </template>
  </LegalPage>
</template>
