<script setup lang="ts">
// The terms of using this instance. Public, linked from sign-in, sign-up, and settings.
definePageMeta({ layout: "auth", wide: true })
useHead({ title: "Terms" })
const demo = useDemo()
</script>

<template>
  <LegalPage title="Terms" updated="October 2026">
    <p>
      ViteHub Finance is open-source software. A person or household runs this copy for themselves, and these terms call
      them the operator. By using it, you agree to the following.
    </p>

    <h2>Who it’s for</h2>
    <p>
      Personal, non-commercial use by the operator’s household and the people they invite. Connect only accounts you’re
      entitled to see, and keep your sign-in to yourself.
    </p>

    <h2>Provided as is</h2>
    <p>
      There is no warranty. Syncs can fail, arrive late, or miss a transaction, and figures can be wrong. Your bank’s
      own statements are the record. To the extent the law allows, neither the operator nor the project’s authors are liable
      for losses from using it.
    </p>

    <h2>Not financial advice</h2>
    <p>
      Forecasts, budgets, insights, and anything an agent tells you from this data are estimates to help you think, not
      financial, tax, or legal advice.
    </p>

    <h2>The demo</h2>
    <p>
      The public demo’s household, people, banks, and transactions are fictional. Anyone can open it, so anything you change
      there is visible to other visitors until it resets every night.
      <template v-if="demo">Don’t enter real data.</template>
    </p>

    <h2>Changes</h2>
    <p>The operator may change these terms, or stop running this instance, at any time.</p>
  </LegalPage>
</template>
