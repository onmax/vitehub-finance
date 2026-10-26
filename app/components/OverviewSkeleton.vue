<template>
  <div class="grid gap-x-8 gap-y-10 lg:grid-cols-3" aria-busy="true" aria-label="Loading the overview">
    <div class="border-t border-default pt-4 lg:col-span-2">
      <USkeleton class="h-4 w-24" />
      <USkeleton class="mt-3 h-8 w-48" />
      <USkeleton class="mt-2 h-4 w-40" />
      <USkeleton class="mt-6 h-48 w-full" />
    </div>
    <div class="flex flex-col gap-5 border-t border-default pt-4">
      <USkeleton class="h-4 w-28" />
      <USkeleton v-for="index in 2" :key="index" class="h-14 w-full" />
      <USkeleton class="h-8 w-full" />
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
