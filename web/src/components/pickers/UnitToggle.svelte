<script>
  import { prefs, setQuantityUnit } from "../../lib/stores/prefs.svelte.js";

  /**
   * cSCU / SCU toggle shared by the calculator and the order form (one
   * setting). `onchange` runs before the setting changes, with the old and
   * new unit, so the caller can convert typed text.
   * @type {{ onchange?: (from: "cscu" | "scu", to: "cscu" | "scu") => void }}
   */
  let { onchange } = $props();

  /** @param {"cscu" | "scu"} unit */
  function pick(unit) {
    if (unit === prefs.quantityUnit) return;
    onchange?.(prefs.quantityUnit, unit);
    setQuantityUnit(unit);
  }
</script>

<div class="unit-toggle" role="group" aria-label="Quantity unit">
  <button type="button" aria-pressed={prefs.quantityUnit === "cscu"} onclick={() => pick("cscu")}>cSCU (as on terminal)</button>
  <button type="button" aria-pressed={prefs.quantityUnit === "scu"} onclick={() => pick("scu")}>SCU</button>
</div>
