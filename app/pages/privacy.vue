<script setup lang="ts">
import type { LegalInfo } from "#shared/api"

// What this instance keeps, where, and who sees it. Public: Enable Banking's app registration links here.
definePageMeta({ layout: "auth", wide: true })
useHead({ title: "Privacy" })
const demo = useDemo()
const { data: legal } = useFetch<LegalInfo>("/api/legal", { key: "legal", default: () => ({ contactEmail: null }) })
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

    <h2>How it’s protected</h2>
    <p>
      Bank sessions and exchange keys are encrypted at rest with AES-GCM, using a key only the server holds. Passwords are
      stored as hashes. The only cookies are for signing in; there are no ads, trackers, or analytics.
    </p>

    <h2>Who sees what</h2>
    <p>
      Accounts shared with your household are visible to its members. A private account is visible only to its owner, in
      every list, total, chart, API response, and agent tool. Agents and API keys you connect see what you see. Your data is
      never sold or shared with anyone else. If this instance sends email (invitations, sign-in links, consent reminders),
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
