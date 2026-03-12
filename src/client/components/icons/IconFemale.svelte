<script lang="ts">
  export let size = 16
  export let strokeWidth = 1.8
  export let className = ""
</script>

<svg
  class={className}
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <circle cx="12" cy="9" r="5" />
  <line x1="12" y1="14" x2="12" y2="21" />
  <line x1="9" y1="18" x2="15" y2="18" />
</svg>
