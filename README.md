# GORWELD — Dumpster Forge

**Live:** [gorweld.com](https://gorweld.com) · [gorweld.fun](https://gorweld.fun)

Polish SVM builder stack by [@PrzemSas](https://x.com/PrzemSas) — welder by trade, builder by night. One-man ecosystem across **Gorbagana** and **Cookie Chain** (Solana-compatible VMs).

> *Proof, not prompts.*

## What ships here

| App | Path | Description |
|-----|------|-------------|
| **Main site** | `/` | Ecosystem hub — tokens, NFTs, dual-chain overview |
| **Arc Welder** | `/arc` | Browser welding simulator (MIG/TIG/MMA), ISO 6947 positions, ISO 5817 inspection |
| **ArcQuote** | `/arcquote` | Live welding job pricing calculator — scrapes 5 Polish suppliers weekly |
| **Scrap Scavenger** | `/demo` | Playable web prototype — idle scrapyard tycoon |
| **Burn Relics** | `/relics` | Genesis NFT collection gallery (10 pieces) |

## Stack

- Static HTML/CSS/JS — GitHub Pages → custom domain
- **ArcQuote automation:** `arcquote/update-prices.mjs` (Node 18+) + GitHub Actions cron (Mondays 05:00 UTC)
- **Arc tooling:** `arc/welder_calc.py` — heat input (kJ/mm) calculator for MMA/MIG/TIG
- **Game target:** Godot 4.6 (private repo `scrap-scavenger`)

## Chains & ecosystem

- **Gorbagana** — origin chain, NFT mints, burn mechanics
- **Cookie Chain (SVM)** — DeFi (CookieSwap), bridge to Solana mainnet
- Listed in official [Cookie Chain apps registry](https://github.com/cookiechain/apps) (PR #2, merged 2026-06-30)

## Key links

- X (builder): [@PrzemSas](https://x.com/PrzemSas)
- X (brand): [@GorWeld](https://x.com/GorWeld)
- Cookie Chain explorer: [cookiescan.io](https://cookiescan.io)
- Gorbagana explorer: [explorer.gorbagana.wtf](https://explorer.gorbagana.wtf)

## Local development

```bash
# ArcQuote price scraper (requires Node 18+)
node arcquote/update-prices.mjs

# Welding heat-input calculator
python3 arc/welder_calc.py
```

## Author

**PrzemSas / GORWELD™ Dumpster Forge** — Poland

Built from scrap. Welded on-chain.