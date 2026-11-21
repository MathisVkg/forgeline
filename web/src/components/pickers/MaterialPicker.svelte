<script>
  import { untrack } from "svelte";
  import { bonusLabel, bonusesAt, defaultMaterialKind, materialPickerGroups, selectedCountByKind } from "../../lib/pickers.js";

  /**
   * Compact multi-select material buttons (native checkboxes), one group at
   * a time behind an Ores / Salvage switch (Gems only if any). Selected
   * materials of the hidden group stay selected; the switch shows their count.
   * The parent renders one line per selected material.
   * @type {{
   *   selected: string[],
   *   ontoggle: (materialId: string) => void,
   *   materials: import("../../lib/pickers.js").MaterialLike[] | undefined,
   *   bonuses?: { stationId: string, materialId: string, pct: number }[],
   *   stationId?: string,
   *   max?: number,
   *   id: string,
   *   label?: string,
   *   defaultKind?: string | null,
   *   error?: string | null,
   * }}
   */
  let { selected, ontoggle, materials, bonuses = [], stationId = "", max = 20, id, label = "Materials", defaultKind = null, error = null } = $props();

  const groups = $derived(materialPickerGroups(materials));
  let kind = $state(untrack(() => defaultMaterialKind(defaultKind, materialPickerGroups(materials))));
  const shown = $derived(groups.find((g) => g.kind === kind) ?? groups[0]);
  const counts = $derived(selectedCountByKind(groups, selected));
  const atStation = $derived(bonusesAt(bonuses, stationId));
  const full = $derived(selected.length >= max);
</script>

<div class="picker materials" role="group" aria-labelledby="{id}-legend" data-picker="material" aria-describedby={error ? `${id}-error` : undefined}>
  <div class="head">
    <span class="legend" id="{id}-legend">{label}</span>
    {#if groups.length > 1}
      <div class="kinds" role="group" aria-label="Material group">
        {#each groups as g, i (g.kind)}
          <button type="button" id={i === 0 ? id : undefined} aria-pressed={shown?.kind === g.kind} onclick={() => (kind = g.kind)}>
            {g.label}{#if counts[g.kind] && shown?.kind !== g.kind}<span class="count">{" · "}{counts[g.kind]}</span
              ><span class="sr-only">{" selected"}</span>{/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>
  {#if error}<p class="picker-error" id="{id}-error">{error}</p>{/if}
  {#if shown}
    <div class="picker-options compact" role="group" aria-label={shown.label}>
      {#each shown.items as m (m.id)}
        {@const checked = selected.includes(m.id)}
        {@const bonus = bonusLabel(atStation.get(m.id) ?? 0)}
        <label class="opt compact">
          <input type="checkbox" value={m.id} {checked} disabled={!checked && full} onchange={() => ontoggle(m.id)} />
          <span class="opt-label">{m.name}</span>
          <!-- reserved slot: same width with or without a bonus, so nothing moves -->
          <span class="bonus-slot">
            {#if bonus}
              <span class="bonus-tag {bonus.tone}">{bonus.text}</span>
              <span class="sr-only">{bonus.tone === "bonus" ? "yield bonus" : "yield penalty"} at this station</span>
            {/if}
          </span>
        </label>
      {/each}
    </div>
  {/if}
  {#if full}<p class="muted note">Up to {max} materials per order.</p>{/if}
</div>

<style>
  /* 24 px above the Materials row (12 px panel gap + 12 px), 12 px to the buttons */
  .materials {
    gap: var(--space-3);
    margin-top: var(--space-3);
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .legend {
    color: var(--color-muted);
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 13px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .kinds {
    display: inline-flex;
    border: 1px solid var(--color-border);
    border-radius: 999px;
    overflow: hidden;
  }

  .kinds button {
    min-height: 32px;
    padding: 0 var(--space-3);
    border: 0;
    background: transparent;
    color: var(--color-text);
    font: inherit;
    font-size: 14px;
    cursor: pointer;
  }

  @media (max-width: 959px) {
    .kinds button {
      min-height: var(--touch);
    }
  }

  .kinds button + button {
    border-left: 1px solid var(--color-border);
  }

  .kinds button[aria-pressed="true"] {
    background: var(--color-accent);
    color: var(--color-on-accent);
  }

  .count {
    font-family: var(--font-mono);
    font-weight: 500;
  }

  .picker-error {
    margin: 0;
    color: #ff8b8e;
    font-size: 14px;
  }

  .note {
    margin: 0;
    font-size: 14px;
  }
</style>
