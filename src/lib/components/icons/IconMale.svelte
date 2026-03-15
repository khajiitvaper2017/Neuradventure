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
  <circle cx="10" cy="14" r="5" />
  <line x1="19" y1="5" x2="13.6" y2="10.4" />
  <polyline points="16 5 19 5 19 8" />
</svg>
