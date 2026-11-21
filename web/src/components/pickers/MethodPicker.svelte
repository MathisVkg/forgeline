<script>
  import { methodRatingText } from "../../lib/pickers.js";

  /**
   * Single-select refining method picker with the UEX rating text
   * ("High yield · Low cost · Slow").
   * @type {{
   *   value: string,
   *   methods: import("../../lib/pickers.js").MethodLike[] | undefined,
   *   id: string,
   *   name: string,
   *   label?: string,
   *   error?: string | null,
   *   onblur?: () => void,
   * }}
   */
  let { value = $bindable(""), methods, id, name, label = "Method", error = null, onblur } = $props();

  const sorted = $derived([...(methods ?? [])].sort((a, b) => a.name.localeCompare(b.name)));
</script>

<fieldset
  class="picker"
  data-picker="method"
  aria-describedby={error ? `${id}-error` : undefined}
  onfocusout={(e) => {
    if (!e.currentTarget.contains(/** @type {Node | null} */ (e.relatedTarget))) onblur?.();
  }}
>
  <legend>{label}</legend>
  <div class="picker-options methods">
    {#each sorted as m, i (m.id)}
      <label class="opt">
        <input type="radio" {name} value={m.id} id={i === 0 ? id : undefined} bind:group={value} />
        <span class="opt-label">{m.name}</span>
        <span class="opt-sub">{methodRatingText(m.uex)}</span>
      </label>
    {/each}
  </div>
  {#if error}<p class="picker-error" id="{id}-error">{error}</p>{/if}
</fieldset>

<style>
  .methods {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 200px), 1fr));
  }

  .picker-error {
    margin: 0;
    color: #ff8b8e;
    font-size: 14px;
  }
</style>
