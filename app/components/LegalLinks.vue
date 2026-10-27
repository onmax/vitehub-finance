<!-- Privacy and Terms, as quiet links under the sign-in and sign-up cards and in settings. -->
<template>
  <nav class="flex items-center justify-center gap-4 text-xs text-muted" :aria-label="$t('legal')">
    <ULink to="/privacy" class="underline-offset-4 hover:text-highlighted hover:underline">{{ $t('privacy') }}</ULink>
    <ULink to="/terms" class="underline-offset-4 hover:text-highlighted hover:underline">{{ $t('terms') }}</ULink>
  </nav>
</template>
