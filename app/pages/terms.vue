<script setup lang="ts">
// The terms of using this instance. Public, linked from sign-in, sign-up, and settings.
definePageMeta({ layout: "auth", wide: true })
useHead({ get title() { return translate('terms') } })
const demo = useDemo()
</script>

<template>
  <LegalPage :title="$t('terms')" :updated="$t('october2026')">
    <p> {{ $t('vitehubFinanceIsOpenSourceSoftwareAPersonOrHousehold') }} </p>

    <h2>{{ $t('whoItSFor') }}</h2>
    <p> {{ $t('personalNonCommercialUseByTheOperatorSHouseholdAnd') }} </p>

    <h2>{{ $t('providedAsIs') }}</h2>
    <p> {{ $t('thereIsNoWarrantySyncsCanFailArriveLateOr') }} </p>

    <h2>{{ $t('notFinancialAdvice') }}</h2>
    <p> {{ $t('forecastsBudgetsInsightsAndAnythingAnAgentTellsYouFrom') }} </p>

    <h2>{{ $t('theDemo') }}</h2>
    <p> {{ $t('thePublicDemoSHouseholdPeopleBanksAndTransactionsAre') }} <template v-if="demo">{{ $t('donTEnterRealData') }}</template>
    </p>

    <h2>{{ $t('changes') }}</h2>
    <p>{{ $t('theOperatorMayChangeTheseTermsOrStopRunningThis') }}</p>
  </LegalPage>
</template>
