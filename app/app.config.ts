// Nuxt UI, shaped like shadcn/ui: the theme tokens live in assets/css/main.css; these are component defaults.
export default defineAppConfig({
  ui: {
    colors: {
      primary: "zinc",
      neutral: "zinc",
      success: "emerald",
      info: "sky",
      warning: "amber",
      error: "red",
    },
    icons: {
      loading: "i-lucide-loader-circle",
    },
    button: {
      slots: { base: "font-medium transition-[background-color,color,box-shadow,scale]" },
      defaultVariants: { size: "md" },
    },
    card: {
      slots: {
        root: "rounded-xl shadow-xs",
        header: "p-4 sm:px-5",
        body: "p-4 sm:p-5",
        footer: "p-4 sm:px-5",
      },
    },
    input: {
      // 16px on small screens so iOS doesn't zoom the page, 14px from `sm` up.
      slots: { base: "text-base sm:text-sm" },
    },
    badge: {
      slots: { base: "font-medium" },
    },
    table: {
      slots: {
        th: "text-xs font-medium text-muted py-2.5",
        td: "text-sm py-2.5",
      },
    },
    dashboardPanel: {
      slots: { body: "p-4 sm:p-6 gap-6" },
    },
    dashboardNavbar: {
      slots: { title: "text-sm font-semibold" },
    },
  },
})
