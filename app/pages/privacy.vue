<script setup lang="ts">
import type { LegalInfo } from "#shared/api"

// What this instance keeps, where, and who sees it. Public: Enable Banking's app registration links here.
definePageMeta({ layout: "auth", wide: true })
useHead({ get title() { return translate('privacy') } })
const demo = useDemo()
const { data: legal } = useFetch<LegalInfo>("/api/legal", { key: "legal", default: () => ({ contactEmail: null, ai: false }) })
</script>

<template>
  <LegalPage :title="$t('privacy')" :updated="$t('october2026')">
    <p> {{ $t('vitehubFinanceIsOpenSourceSoftwareThatAPersonOr') }} </p>
    <p v-if="demo"> {{ $t('thisIsThePublicDemoItsHouseholdPeopleBanksAnd') }} </p>

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

    <template v-if="legal?.ai">
      <h2>{{ $t('aiCategories') }}</h2>
      <p> {{ $t('whenNoRuleCategorizesATransactionThisInstanceAsks') }} <a href="https://typesafe.ai" target="_blank" rel="noopener">TypeSafe</a>{{ $t('sJevModelToSuggestOneItSendsTheTransaction') }} </p>
    </template>

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
