<script setup lang="ts">
// The terms of using this instance. Public, linked from sign-in, sign-up, and settings. The demo build
// (`FINANCE_DEMO=1`) is made-up data to try the app with, so its terms are short.
definePageMeta({ layout: "auth", wide: true })
useHead({ get title() { return translate('terms') } })
const demo = useDemoBuild()
</script>

<template>
  <LegalPage v-if="demo" :title="$t('terms')" :updated="$t('october2026')">
    <p>{{ $t('demoTermsIntro') }}</p>
    <h2>{{ $t('providedAsIs') }}</h2>
    <p>{{ $t('demoTermsAsIs') }}</p>
    <h2>{{ $t('notFinancialAdvice') }}</h2>
    <p> {{ $t('forecastsBudgetsInsightsAndAnythingAnAgentTellsYouFrom') }} </p>
    <h2>{{ $t('demoTermsUseHeading') }}</h2>
    <p>{{ $t('demoTermsUse') }}</p>
  </LegalPage>
  <LegalPage v-else :title="$t('terms')" :updated="$t('october2026')">
    <p>{{ $t('vitehubFinanceIsOpenSourceSoftwareAPersonOrHousehold') }}</p>

    <h2>{{ $t('whoItSFor') }}</h2>
    <p>{{ $t('personalNonCommercialUseByTheOperatorSHouseholdAnd') }}</p>

    <h2>{{ $t('providedAsIs') }}</h2>
    <p> {{ $t('thereIsNoWarrantySyncsCanFailArriveLateOr') }} </p>

    <h2>{{ $t('notFinancialAdvice') }}</h2>
    <p> {{ $t('forecastsBudgetsInsightsAndAnythingAnAgentTellsYouFrom') }} </p>

    <h2>{{ $t('theDemo') }}</h2>
    <p> {{ $t('thePublicDemoSHouseholdPeopleBanksAndTransactionsAre') }} </p>

    <h2>{{ $t('yourAccount') }}</h2>
    <p>{{ $t('termsDeleteAccount') }}</p>

    <h2>{{ $t('changes') }}</h2>
    <p>{{ $t('theOperatorMayChangeTheseTermsOrStopRunningThis') }}</p>
  </LegalPage>
</template>
