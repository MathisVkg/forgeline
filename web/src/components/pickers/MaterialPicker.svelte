<script>
  import { bonusLabel, bonusesAt, materialPickerGroups } from "../../lib/pickers.js";

  /**
   * Multi-select material picker: toggle buttons (native checkboxes) grouped
   * Ores / Gems / Salvage, a search filter, and the selected station's bonus
   * on each button. The parent renders one line per selected material.
   * @type {{
   *   selected: string[],
   *   ontoggle: (materialId: string) => void,
   *   materials: import("../../lib/pickers.js").MaterialLike[] | undefined,
   *   bonuses?: { stationId: string, materialId: string, pct: number }[],
   *   stationId?: string,
   *   max?: number,
   *   id: string,
   *   label?: string,
   *   error?: string | null,
   * }}
   */
  let { selected, ontoggle, materials, bonuses = [], stationId = "", max = 20, id, label = "Materials", error = null } = $props();

  let query = $state("");
  const groups = $derived(materialPickerGroups(materials, query));
  const atStation = $derived(bonusesAt(bonuses, stationId));
  const full = $derived(selected.length >= max);

  /** @param {KeyboardEvent} e */
  function onSearchKey(e) {
    if (e.key === "Escape" && query) {
      e.preventDefault();
      query = "";
    }
  }
</script>

<fieldset class="picker" data-picker="material" aria-describedby={error ? `${id}-error` : undefined}>
  <legend>{label}</legend>
  <div class="search">
    <label class="sr-only" for={id}>Filter materials</label>
    <input
      {id}
      type="search"
      placeholder="Filter materials"
      autocomplete="off"
      bind:value={query}
      onkeydown={onSearchKey}
      aria-invalid={error ? "true" : undefined}
    />
  </div>
  {#if error}<p class="picker-error" id="{id}-error">{error}</p>{/if}
  {#each groups as group (group.kind)}
    <div>
      <p class="picker-group-title">{group.label}</p>
      <div class="picker-options">
        {#each group.items as m (m.id)}
          {@const checked = selected.includes(m.id)}
          {@const bonus = bonusLabel(atStation.get(m.id) ?? 0)}
          <label class="opt">
            <input type="checkbox" value={m.id} {checked} disabled={!checked && full} onchange={() => ontoggle(m.id)} />
            <span class="opt-row">
              <span class="opt-label">{m.name}</span>
              {#if bonus}
                <span class="bonus-tag {bonus.tone}">{bonus.text}</span>
                <span class="sr-only">{bonus.tone === "bonus" ? "yield bonus" : "yield penalty"} at this station</span>
              {/if}
            </span>
          </label>
        {/each}
      </div>
    </div>
  {:else}
    <p class="muted empty">No material matches “{query}”.</p>
  {/each}
  {#if full}<p class="muted note">Up to {max} materials per order.</p>{/if}
</fieldset>

<style>
  .search input {
    width: 100%;
    max-width: 360px;
    min-height: var(--touch);
    padding: 0 var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-bg);
    color: var(--color-text);
    font: inherit;
  }

  .search input[aria-invalid="true"] {
    border-color: #e5484d;
  }

  .picker-error {
    margin: 0;
    color: #ff8b8e;
    font-size: 14px;
  }

  .empty,
  .note {
    margin: 0;
    font-size: 14px;
  }
</style>
