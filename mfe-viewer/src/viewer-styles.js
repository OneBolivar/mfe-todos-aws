import { css } from 'lit';

export const viewerStyles = css`
  :host {
    display: block;
    min-inline-size: 0;
    container-type: inline-size;
    color-scheme: dark;
    color: #f4f1fb;
    font: inherit;
    line-height: 1.45;
    --viewer-surface: #12101a;
    --viewer-line: #353047;
    --viewer-muted: #afa7bf;
    --viewer-accent: #c7b4ff;
    --viewer-teal: #8ce5d1;
    --viewer-amber: #f2d28e;
  }

  *, *::before, *::after { box-sizing: border-box; }
  h3, h4, p, dl, dd, ul, ol { margin: 0; }
  h3 { font-size: 1rem; font-weight: 650; }
  h4 { font-size: .875rem; font-weight: 650; }

  button, input {
    max-inline-size: 100%;
    font: inherit;
    color: inherit;
  }

  button { cursor: pointer; }
  button:disabled { cursor: default; opacity: .6; }
  :is(button, input):focus-visible { outline: 2px solid var(--viewer-accent); outline-offset: 2px; }

  .list-heading, .history-heading, .detail-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: .5rem .75rem;
  }

  .list-heading { margin-block-end: .75rem; }
  .list-heading h3 { font-size: 1.2rem; letter-spacing: -.02em; }

  .refresh, .subtle {
    min-block-size: 2.25rem;
    padding: .375rem .65rem;
    border: 1px solid #4a3a6a;
    border-radius: .45rem;
    background: #231b35;
    color: #e8ddff;
    font-size: .75rem;
    font-weight: 600;
  }

  .refresh:not(:disabled):hover, .subtle:hover { background: #312348; }
  .refresh span { margin-inline-end: .2rem; color: var(--viewer-accent); font-size: 1rem; line-height: 1; }
  .subtle { border-color: var(--viewer-line); background: transparent; color: var(--viewer-accent); }

  .metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: .5rem;
    margin-block-end: 1rem;
  }

  .metric {
    min-inline-size: 0;
    padding: .6rem clamp(.35rem, 2.2cqi, .8rem);
    border: 1px solid var(--viewer-line);
    border-radius: .45rem;
    background: #191525;
  }

  .metric dt { color: var(--viewer-muted); font-size: .6875rem; overflow-wrap: anywhere; }
  .metric dd { margin-block-start: .1rem; font-size: 1.4rem; font-weight: 650; line-height: 1.2; font-variant-numeric: tabular-nums; }
  .metric.open dd { color: var(--viewer-amber); }
  .metric.done dd { color: var(--viewer-teal); }

  .workspace { display: grid; gap: .875rem; align-items: start; }
  .list-section, .detail { min-inline-size: 0; }
  .list-tools { display: grid; gap: .65rem; }

  input[type='search'] {
    inline-size: 100%;
    min-block-size: 2.5rem;
    padding: .4rem .7rem;
    border: 1px solid var(--viewer-line);
    border-radius: .45rem;
    background: var(--viewer-surface);
    font-size: 1rem;
  }

  input::placeholder { color: var(--viewer-muted); opacity: 1; }

  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: .25rem;
    padding: .2rem;
    border: 1px solid var(--viewer-line);
    border-radius: .45rem;
    background: var(--viewer-surface);
  }

  .filters button {
    flex: 1 1 auto;
    min-block-size: 2rem;
    padding: .3rem .45rem;
    border: 1px solid transparent;
    border-radius: .32rem;
    background: transparent;
    color: var(--viewer-muted);
    font-size: .75rem;
  }

  .filters button:hover { color: #f4f1fb; background: #211a32; }
  .filters button[aria-pressed='true'] { border-color: #594382; background: #2c2042; color: #f1e9ff; }

  .results { margin-block: .6rem .35rem; color: var(--viewer-muted); font-size: .75rem; }
  .tasks {
    display: grid;
    gap: .4rem;
    max-block-size: 17.25rem;
    padding: .2rem .3rem .32rem;
    overflow: auto;
    scrollbar-color: #5c4f76 transparent;
    scrollbar-width: thin;
    list-style: none;
  }

  .tasks li { min-inline-size: 0; }

  .task {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: .4rem .75rem;
    inline-size: 100%;
    min-block-size: 2.95rem;
    padding: .5rem .65rem;
    border: 1px solid var(--viewer-line);
    border-radius: .45rem;
    background: #191624;
    text-align: start;
  }

  .task-title { font-size: .8125rem; font-weight: 550; overflow-wrap: anywhere; }
  .task:hover { border-color: #6a538d; background: #201a30; }
  .task[aria-pressed='true'] { border-color: #9272d0; background: #281d3b; box-shadow: inset .18rem 0 #a78bfa; }

  .chip {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: .3rem;
    padding: .18rem .38rem;
    border: 1px solid currentColor;
    border-radius: .3rem;
    font-size: .6875rem;
    font-weight: 600;
  }

  .chip.pending { color: var(--viewer-amber); background: #292219; border-color: #635036; }
  .chip.completed { color: var(--viewer-teal); background: #172622; border-color: #305e52; }
  .dot { inline-size: .375rem; block-size: .375rem; border-radius: 50%; background: currentColor; }

  .detail { padding: .9rem; border: 1px solid var(--viewer-line); border-radius: .55rem; background: var(--viewer-surface); }
  .detail > h3 { margin-block-end: .75rem; color: var(--viewer-teal); }
  .detail-title h4 { font-size: 1rem; overflow-wrap: anywhere; }

  .metadata { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .65rem .75rem; margin-block-start: .85rem; }
  .metadata .id { grid-column: 1 / -1; }
  .metadata dt { margin-block-end: .1rem; color: var(--viewer-muted); font-size: .6875rem; }
  .metadata dd { font-size: .75rem; overflow-wrap: anywhere; }
  code { font-family: 'SFMono-Regular', Consolas, monospace; }

  .history { margin-block-start: .85rem; padding-block-start: .75rem; border-block-start: 1px solid var(--viewer-line); }
  .history-heading { margin-block-end: .55rem; }
  .timeline { padding: 0 0 0 .75rem; margin: .4rem 0 0 .2rem; border-inline-start: 1px solid #395955; list-style: none; }
  .timeline li { position: relative; display: grid; gap: .13rem; font-size: .75rem; overflow-wrap: anywhere; }
  .timeline li + li { margin-block-start: .65rem; }
  .timeline li::before {
    position: absolute;
    inset-block-start: .38rem;
    inset-inline-start: -.95rem;
    inline-size: .35rem;
    block-size: .35rem;
    border-radius: 50%;
    background: var(--viewer-teal);
    content: '';
  }
  .timeline time { color: var(--viewer-muted); font-size: .6875rem; }

  .notice { color: var(--viewer-muted); font-size: .8125rem; }
  .list-section .notice, .problem { margin-block-start: .65rem; }
  .empty { padding: .85rem; border: 1px dashed var(--viewer-line); border-radius: .45rem; background: var(--viewer-surface); }
  .loading { display: flex; align-items: center; gap: .5rem; }
  .history .loading { margin-block-start: .5rem; }
  .spinner {
    inline-size: .825rem;
    block-size: .825rem;
    flex: 0 0 auto;
    border: 2px solid #534270;
    border-block-start-color: var(--viewer-accent);
    border-radius: 50%;
    animation: spin .8s linear infinite;
  }

  .problem { display: flex; align-items: center; flex-wrap: wrap; justify-content: space-between; gap: .5rem; padding: .65rem; border: 1px solid #704255; border-radius: .45rem; background: #291a25; color: #ffbbc8; font-size: .75rem; }
  .problem p { margin-block-start: .2rem; overflow-wrap: anywhere; }

  .sr-only { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

  @container (min-width: 38rem) {
    .workspace { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  }

  @container (max-width: 17rem) {
    .task { align-items: flex-start; flex-direction: column; }
    .metric dt { font-size: .65rem; }
    .metadata { grid-template-columns: minmax(0, 1fr); }
  }

  @keyframes spin { to { transform: rotate(1turn); } }
  @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
`;
