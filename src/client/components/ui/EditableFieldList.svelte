<script lang="ts">
  import { autoresize } from "../../utils/actions/autoresize.js"
  import type { EditField } from "./editableFieldTypes.js"

  export let fields: EditField[] = []

  function updateField(field: EditField, event: Event) {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement
    field.onInput(target.value)
  }
</script>

{#each fields as field}
  <div class="field">
    <label for={field.id}>{field.label}</label>
    {#if field.kind === "textarea"}
      <textarea id={field.id} value={field.value} oninput={(e) => updateField(field, e)} use:autoresize={field.value}
      ></textarea>
    {:else}
      <input id={field.id} type="text" value={field.value} oninput={(e) => updateField(field, e)} />
    {/if}
  </div>
{/each}
