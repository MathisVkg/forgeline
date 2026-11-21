<script>
  import { stationPickerGroups } from "../../lib/pickers.js";

  /**
   * Single-select station picker: native radios styled as buttons, grouped
   * by system. Arrow keys move the selection; Tab leaves the group.
   * @type {{
   *   value: string,
   *   stations: import("../../lib/pickers.js").StationLike[] | undefined,
   *   id: string,
   *   name: string,
   *   label?: string,
   *   error?: string | null,
   *   onblur?: () => void,
   * }}
   */
  let { value = $bindable(""), stations, id, name, label = "Station", error = null, onblur } = $props();

  const groups = $derived(stationPickerGroups(stations));
  const firstId = $derived(groups[0]?.stations[0]?.id);
</script>

<fieldset
  class="picker"
  data-picker="station"
  aria-describedby={error ? `${id}-error` : undefined}
  onfocusout={(e) => {
    if (!e.currentTarget.contains(/** @type {Node | null} */ (e.relatedTarget))) onblur?.();
  }}
>
  <legend>{label}</legend>
  {#each groups as group (group.system)}
    <div>
      <p class="picker-group-title" id="{id}-{group.system}">{group.system}</p>
      <div class="picker-options" role="presentation">
        {#each group.stations as s (s.id)}
          <label class="opt" title={s.name}>
            <input
              type="radio"
              {name}
              value={s.id}
              id={s.id === firstId ? id : undefined}
              bind:group={value}
            />
            <span class="opt-label">{s.label}</span>
            {#if s.sub}<span class="opt-sub">{s.sub}</span>{/if}
          </label>
        {/each}
      </div>
    </div>
  {/each}
  {#if error}<p class="picker-error" id="{id}-error">{error}</p>{/if}
</fieldset>

<style>
  .picker-error {
    margin: 0;
    color: #ff8b8e;
    font-size: 14px;
  }
</style>
