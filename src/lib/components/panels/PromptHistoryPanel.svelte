<script lang="ts">
  import IconTrash from "@/components/icons/IconTrash.svelte"

  const noop = (_value: string) => {
    // no-op
  }

  export let items: string[] = []
  export let label = "Recent prompts"
  export let limit = 6
  export let onUse: (value: string) => void = noop
  export let onDelete: (value: string) => void = noop
</script>

{#if items.length > 0}
  <div class="shared-prompt-history">
    <div class="shared-prompt-history__label">{label}</div>
    <div class="shared-prompt-history__list">
      {#each items.slice(0, limit) as item (item)}
        <div class="shared-prompt-history__item">
          <button class="shared-prompt-history__use" onclick={() => onUse(item)} title={item}>
            {item}
          </button>
          <button
            class="shared-prompt-history__delete"
            type="button"
            onclick={() => onDelete(item)}
            aria-label="Delete prompt"
            title="Delete prompt"
          >
            <IconTrash size={12} strokeWidth={2} className="prompt-history-trash" />
          </button>
        </div>
      {/each}
    </div>
  </div>
{/if}
