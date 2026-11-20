<script>
  import { onMount } from "svelte";
  import { APP_NAME } from "@forgeline/shared";
  import { router } from "./lib/router.svelte.js";
  import { init as initOrders } from "./lib/stores/orders.svelte.js";
  import Orders from "./pages/Orders.svelte";
  import Calculator from "./pages/Calculator.svelte";
  import NewOrder from "./pages/NewOrder.svelte";
  import Settings from "./pages/Settings.svelte";

  const pages = { orders: Orders, calculator: Calculator, new: NewOrder, settings: Settings };

  /** @type {{ route: import("./lib/router.svelte.js").Route, label: string }[]} */
  const links = [
    { route: "orders", label: "Orders" },
    { route: "calculator", label: "Calculator" },
    { route: "new", label: "+ New order" },
    { route: "settings", label: "Settings" },
  ];

  const Page = $derived(pages[router.route]);

  // Browser storage: open IndexedDB, purge old history, load orders.
  onMount(() => {
    initOrders();
  });
</script>

<div class="hazard" aria-hidden="true"></div>

<header class="header">
  <div class="inner">
    <a class="brand" href="#/orders" aria-label="{APP_NAME} home">
      <span class="mark" aria-hidden="true">F</span>
      <span class="wordmark">{APP_NAME.toUpperCase()}</span>
    </a>
    <nav aria-label="Main">
      <ul>
        {#each links as link (link.route)}
          <li>
            <a
              href="#/{link.route}"
              class:active={router.route === link.route}
              aria-current={router.route === link.route ? "page" : undefined}>{link.label}</a
            >
          </li>
        {/each}
      </ul>
    </nav>
  </div>
</header>

<main class="inner main">
  <Page />
</main>

<footer class="footer">
  <p class="inner">
    {APP_NAME} is an unofficial Star Citizen fan site, not affiliated with the Cloud Imperium group of companies.
    All content on this site not authored by its host or users are property of their respective owners. Game data
    and prices provided by <a href="https://uexcorp.space" rel="noopener noreferrer" target="_blank">UEX</a>.
    Privacy: no account, no personal data; your orders stay in your browser.
  </p>
</footer>

<style>
  :global(#app) {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .hazard {
    height: 6px;
    flex: none;
    background: repeating-linear-gradient(-45deg, var(--color-accent) 0 12px, var(--color-bg) 12px 24px);
  }

  .inner {
    width: 100%;
    max-width: var(--content-width);
    margin: 0 auto;
    padding: 0 var(--space-4);
  }

  .header {
    background: var(--color-panel);
    border-bottom: 1px solid var(--color-border);
  }

  .header .inner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3) var(--space-6);
    padding-top: var(--space-3);
    padding-bottom: var(--space-3);
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    min-height: var(--touch);
    color: var(--color-text);
    text-decoration: none;
  }

  .mark {
    display: inline-grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: 2px solid var(--color-accent);
    color: var(--color-accent);
    font-family: var(--font-heading);
    font-weight: 700;
    font-size: 22px;
    line-height: 1;
  }

  .wordmark {
    font-family: var(--font-heading);
    font-weight: 700;
    font-size: 26px;
    letter-spacing: 0.12em;
  }

  nav ul {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  nav a {
    display: inline-flex;
    align-items: center;
    min-height: var(--touch);
    padding: 0 var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    color: var(--color-text);
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 18px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    text-decoration: none;
  }

  nav a:hover {
    border-color: var(--color-accent);
  }

  nav a.active {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-on-accent);
  }

  .main {
    flex: 1;
    padding-top: var(--space-8);
    padding-bottom: var(--space-8);
  }

  .footer {
    border-top: 1px solid var(--color-border);
    background: var(--color-panel);
    color: var(--color-muted);
    font-size: 14px;
  }

  .footer p {
    margin: 0 auto;
    padding-top: var(--space-6);
    padding-bottom: var(--space-6);
  }

  @media (max-width: 480px) {
    nav a {
      padding: 0 var(--space-3);
      font-size: 16px;
    }
  }
</style>
