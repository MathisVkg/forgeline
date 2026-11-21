<script>
  import { knownRecentStations, stationButtonLabel } from "../../lib/pickers.js";
  import { prefs } from "../../lib/stores/prefs.svelte.js";

  /**
   * The last used station as one chip; it stays visible (shown as selected)
   * when it is the current station. One tap selects.
   * @type {{ stations: import("../../lib/pickers.js").StationLike[] | undefined, value: string, onpick: (id: string) => void }}
   */
  let { stations, value, onpick } = $props();

  // Only the most recent station is shown (storage keeps up to 3).
  const recent = $derived(knownRecentStations(prefs.recentStationIds, stations).slice(0, 1));
</script>

{#if recent.length}
  <div class="recent" role="group" aria-label="Last station">
    <span class="recent-label" aria-hidden="true">Last</span>
    {#each recent as s (s.id)}
      <button type="button" class="chip" aria-pressed={value === s.id} title={s.name} onclick={() => onpick(s.id)}>
        {stationButtonLabel(s.short)}<span class="sr-only">{" · "}{s.name}</span>
      </button>
    {/each}
  </div>
{/if}

<style>
  .recent {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .recent-label {
    color: var(--color-muted);
    font-family: var(--font-mono);
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .chip {
    min-height: 36px;
    padding: 0 var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: 999px;
    background: var(--color-bg);
    color: var(--color-text);
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 13px;
    cursor: pointer;
  }

  @media (max-width: 959px) {
    .chip {
      min-height: var(--touch);
    }
  }

  .chip:hover {
    border-color: var(--color-accent);
  }

  .chip[aria-pressed="true"] {
    border-color: var(--color-accent);
    background: var(--color-accent);
    color: var(--color-on-accent);
  }
</style>
