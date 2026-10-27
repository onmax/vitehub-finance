<script setup lang="ts">
import type { LegalInfo } from "#shared/api"

// What this instance keeps, where, who sees it, and how to delete it. Public: Enable Banking's app registration links
// here. The demo build (`FINANCE_DEMO=1`) has no accounts and keeps no one's data, and says only that.
definePageMeta({ layout: "auth", wide: true })
useHead({ get title() { return translate('privacy') } })
const demo = useDemoBuild()
const { data: legal } = useFetch<LegalInfo>("/api/legal", { key: "legal", default: () => ({ contactEmail: null, ai: null }) })
// Where AI category requests go: straight to TypeSafe, or through Vercel or Cloudflare (server/utils/ai-gateway.ts).
const AI_PRIVACY = { typesafe: "aiPrivacyTypesafe", vercel: "aiPrivacyVercel", cloudflare: "aiPrivacyCloudflare" } as const
</script>

<template>
  <LegalPage v-if="demo" :title="$t('privacy')" :updated="$t('october2026')">
    <p>{{ $t('demoPrivacyIntro') }}</p>
    <h2>{{ $t('whatItStores') }}</h2>
    <p>{{ $t('demoPrivacyNoAccounts') }}</p>
    <p>{{ $t('demoPrivacyShared') }}</p>
    <p>{{ $t('demoPrivacyLogs') }}</p>
  </LegalPage>
  <LegalPage v-else :title="$t('privacy')" :updated="$t('october2026')">
    <p> {{ $t('vitehubFinanceIsOpenSourceSoftwareThatAPersonOr') }} </p>

    <h2>{{ $t('whatItStores') }}</h2>
    <ul>
      <li>{{ $t('yourNameEmailAndSignInDetailsAHashedPassword') }}</li>
      <li>{{ $t('yourHouseholdAndItsMembers') }}</li>
      <li>{{ $t('theAccountsYouConnectOrAddBalancesTransactionsHoldingsAnd') }}</li>
      <li>{{ $t('howToReachEachConnectionABankSessionAnExchange') }}</li>
      <li>{{ $t('apiKeysYouCreateAndTheAgentsMcpClientsYou') }}</li>
      <li> {{ $t('logsForFindingAndFixingErrorsEachRequestSPage') }} </li>
    </ul>

    <h2>{{ $t('whereItLives') }}</h2>
    <p> {{ $t('inThisInstanceSOwnDatabaseCloudflareD1WhenIt') }} </p>

    <h2>{{ $t('bankData') }}</h2>
    <p> {{ $t('banksConnectThrough') }} <a href="https://enablebanking.com" target="_blank" rel="noopener">Enable Banking</a>{{ $t('aLicensedAccountInformationServiceProviderUnderPsd2YouGive') }} </p>
    <p> {{ $t('exchangesConnectWithReadOnlyApiKeysYouCreateInteractive') }} </p>

    <h2>{{ $t('aiCategories') }}</h2>
    <p> {{ $t('whenNoRuleCategorizesATransactionThisInstanceAsks') }} <a href="https://typesafe.ai" target="_blank" rel="noopener">TypeSafe</a>{{ $t('sJevModelToSuggestOneItSendsTheTransaction') }} </p>
    <p>{{ legal?.ai ? $t(AI_PRIVACY[legal.ai]) : $t('aiPrivacyNoKey') }}</p>

    <h2>{{ $t('howItSProtected') }}</h2>
    <p> {{ $t('bankSessionsExchangeKeysAndBrokerTokensAreEncryptedAt') }} </p>

    <h2>{{ $t('whoSeesWhat') }}</h2>
    <p> {{ $t('accountsSharedWithYourHouseholdAreVisibleToItsMembers') }} </p>

    <h2>{{ $t('deletingData') }}</h2>
    <p> {{ $t('removingAConnectionEndsItsAccessAndDeletesItsAccounts') }} </p>

    <template v-if="legal?.contactEmail">
      <h2>{{ $t('contact') }}</h2>
      <p> {{ $t('questionsOrRequestsAboutYourData') }} <a :href="`mailto:${legal.contactEmail}`">{{ legal.contactEmail }}</a>.
      </p>
    </template>
  </LegalPage>
</template>
