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
  aria-hidden="true"
>
  <circle cx="9" cy="7" r="3" />
  <path d="M2 20c0-3 2.7-5.5 7-5.5" />
  <circle cx="17" cy="9" r="2.5" />
  <path d="M14 20c0-2.5 1.8-4 4.5-4 2.7 0 4.5 1.5 4.5 4" />
</svg>
