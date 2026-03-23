<script lang="ts">
  import type { EditField } from "@/components/inputs/editableFieldTypes"
  import { Input } from "@/components/ui/input"
  import { Label } from "@/components/ui/label"
  import { Textarea } from "@/components/ui/textarea"

  type Props = {
    fields?: EditField[]
  }

  let { fields = [] }: Props = $props()

  function updateField(field: EditField, event: Event) {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement
    field.onInput(target.value)
  }
</script>

{#each fields as field (field.id)}
  <div class="space-y-2">
    <Label for={field.id}>{field.label}</Label>
    {#if field.kind === "textarea"}
      <Textarea id={field.id} value={field.value} oninput={(e) => updateField(field, e)} />
    {:else}
      <Input id={field.id} type="text" value={field.value} oninput={(e) => updateField(field, e)} />
    {/if}
  </div>
{/each}
