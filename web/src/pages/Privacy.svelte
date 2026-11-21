<section class="page" aria-labelledby="privacy-title">
  <a class="back" href="#/settings">← Settings</a>
  <header class="head">
    <p class="eyebrow">Privacy</p>
    <h1 id="privacy-title">Your data and privacy</h1>
  </header>

  <div class="panel">
    <h2>In your browser</h2>
    <p>
      Your orders and settings are stored only in this browser (IndexedDB). They never leave your device unless you export a
      backup yourself. Clearing your browser's site data, or <a href="#/settings">Clear all data</a> in Settings, deletes them.
    </p>

    <h2>On the server</h2>
    <p>
      The server keeps public game data only: stations, materials, refining methods and prices. A later version will let you
      share refinery quotes anonymously to improve the estimates; that will be opt-in and will contain no account, name, title,
      IP address or other personal data.
    </p>

    <h2>No tracking</h2>
    <ul>
      <li>No accounts and no sign-in.</li>
      <li>No cookies, no analytics, no ads, no tracking scripts.</li>
      <li>The app does not log IP addresses or requests.</li>
      <li>Fonts are served by this site; the page makes no requests to other sites.</li>
    </ul>

    <h2>Data sources</h2>
    <p>
      Game data and prices come from <a href="https://uexcorp.space" rel="noopener noreferrer" target="_blank">UEX</a> and are
      refreshed once a day by the server. Your browser never contacts UEX.
    </p>

    <h2>For people hosting Forgeline</h2>
    <p>
      The app itself stores no IP addresses and disables request logging. If you put a reverse proxy in front (Nginx, Traefik,
      Caddy…), turn off its access logs or mask client IPs, especially for <code>/api/quotes</code>.
    </p>
  </div>
</section>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-width: 900px;
  }

  .back {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    min-height: 32px;
    color: var(--color-accent);
    font-weight: 600;
    text-decoration: none;
  }

  .head .eyebrow {
    margin: 0;
  }

  .head h1 {
    margin: 0;
    font-size: 30px;
  }

  .panel {
    padding: var(--space-4) 20px var(--space-6);
    background: var(--color-panel);
    border: 1px solid var(--color-border);
    border-top: 3px solid var(--color-accent);
  }

  h2 {
    margin: var(--space-6) 0 var(--space-2);
    font-size: 22px;
  }

  h2:first-child {
    margin-top: 0;
  }

  p,
  ul {
    margin: 0;
    max-width: 70ch;
  }

  ul {
    padding-left: 1.2em;
  }

  li + li {
    margin-top: var(--space-1);
  }
</style>
