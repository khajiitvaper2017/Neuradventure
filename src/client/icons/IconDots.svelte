<script lang="ts">
  export let size = 16
  export let strokeWidth = 2
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
  aria-hidden="true"
>
  <circle cx="12" cy="5" r="1.2" />
  <circle cx="12" cy="12" r="1.2" />
  <circle cx="12" cy="19" r="1.2" />
</svg>
