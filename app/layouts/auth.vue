<template>
  <main class="grid min-h-dvh place-items-center bg-muted px-4 py-12 pb-[max(3rem,env(safe-area-inset-bottom))]">
    <div class="w-full max-w-sm">
      <NuxtLink to="/" class="mb-8 flex justify-center rounded-md focus-visible:outline-2 focus-visible:outline-primary" aria-label="Joxi">
        <AppLogo />
      </NuxtLink>
      <slot />
    </div>
  </main>
</template>
