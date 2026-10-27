<script setup lang="ts">
// A pasted credential, hidden until asked: a token, a secret, a private key. `multiline` keys (Coinbase's PEM) show as a
// textarea once revealed.
defineProps<{ multiline?: boolean; autofocus?: boolean }>()
const model = defineModel<string>({ required: true })
const reveal = ref(false)
</script>

<template>
  <div>
    <UTextarea
      v-if="multiline && reveal"
      v-model="model"
      :rows="4"
      autocomplete="off"
      spellcheck="false"
      class="w-full"
      :ui="{ base: 'font-mono text-xs' }"
    />
    <UInput
      v-else
      v-model="model"
      :type="reveal ? 'text' : 'password'"
      autocomplete="off"
      spellcheck="false"
      :autofocus="autofocus"
      class="w-full"
      :ui="{ base: 'font-mono', trailing: 'pe-1' }"
    >
      <template #trailing>
        <UTooltip :text="reveal ? $t('hide') : $t('show')">
          <UButton
            color="neutral"
            variant="link"
            size="sm"
            :icon="reveal ? 'i-lucide-eye-off' : 'i-lucide-eye'"
            :aria-label="reveal ? $t('hideSecret') : $t('showSecret')"
            :aria-pressed="reveal"
            @click="reveal = !reveal"
          />
        </UTooltip>
      </template>
    </UInput>
    <UButton v-if="multiline && reveal" color="neutral" variant="link" size="sm" class="mt-1 px-0" :label="$t('hidePrivateKey')" @click="reveal = false" />
  </div>
</template>
