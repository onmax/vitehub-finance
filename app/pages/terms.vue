<script setup lang="ts">
// The terms of using this instance. Public, linked from sign-in, sign-up, and settings. A public instance
// (`FINANCE_DEMO=1`) is a hosted demo anyone signs up to, so it promises less and says so.
definePageMeta({ layout: "auth", wide: true })
useHead({ get title() { return translate('terms') } })
const publicInstance = usePublicInstance()
</script>

<template>
  <LegalPage :title="$t('terms')" :updated="$t('october2026')">
    <p>{{ publicInstance ? $t('termsPublicIntro') : $t('vitehubFinanceIsOpenSourceSoftwareAPersonOrHousehold') }}</p>

    <h2>{{ $t('whoItSFor') }}</h2>
    <p>{{ publicInstance ? $t('termsPublicWho') : $t('personalNonCommercialUseByTheOperatorSHouseholdAnd') }}</p>

    <h2>{{ $t('providedAsIs') }}</h2>
    <p> {{ $t('thereIsNoWarrantySyncsCanFailArriveLateOr') }} </p>
    <p v-if="publicInstance">{{ $t('termsPublicNoGuarantees') }}</p>

    <h2>{{ $t('notFinancialAdvice') }}</h2>
    <p> {{ $t('forecastsBudgetsInsightsAndAnythingAnAgentTellsYouFrom') }} </p>

    <h2>{{ $t('theDemo') }}</h2>
    <p> {{ $t('thePublicDemoSHouseholdPeopleBanksAndTransactionsAre') }} <template v-if="publicInstance">{{ $t('donTEnterRealData') }}</template>
    </p>

    <h2>{{ $t('yourAccount') }}</h2>
    <p>{{ $t('termsDeleteAccount') }}</p>

    <h2>{{ $t('changes') }}</h2>
    <p>{{ $t('theOperatorMayChangeTheseTermsOrStopRunningThis') }}</p>
  </LegalPage>
</template>
