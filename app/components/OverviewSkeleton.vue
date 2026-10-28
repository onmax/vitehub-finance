<template>
  <div class="grid gap-x-8 gap-y-10 lg:grid-cols-3" aria-busy="true" :aria-label="$t('loadingTheOverview')">
    <div class="grid gap-3 min-[360px]:grid-cols-2 sm:gap-4 lg:col-span-3 xl:grid-cols-4">
      <div v-for="index in 4" :key="index" class="rounded-xl border border-default p-4 sm:p-5">
        <USkeleton class="h-4 w-24" />
        <USkeleton class="mt-2 h-3 w-28" />
        <USkeleton class="mt-3 h-9 w-32 max-w-full" />
        <USkeleton class="mt-2 h-4 w-full" />
        <USkeleton class="mt-4 h-10 w-full sm:mt-6 sm:h-12" />
      </div>
    </div>
    <div class="border-t border-default pt-4 lg:col-span-3">
      <USkeleton class="h-4 w-32" />
      <USkeleton class="mt-6 h-48 w-full" />
    </div>
    <div v-for="index in 3" :key="`card-${index}`" class="flex flex-col gap-3 border-t border-default pt-4">
      <USkeleton class="h-4 w-32" />
      <div v-for="row in 4" :key="row" class="flex items-center gap-3">
        <USkeleton class="size-8 rounded-md" />
        <USkeleton class="h-4 flex-1" />
        <USkeleton class="h-4 w-16" />
      </div>
    </div>
  </div>
</template>
