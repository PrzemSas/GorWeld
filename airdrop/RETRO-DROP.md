# GORWELD Retro Drop — for people who were here first

**Snapshot: 22 July 2026. Nothing to claim, nothing to sign up for. It is already decided.**

## The rule, in one sentence

> **Whatever share of GorWeldd supply you hold, you get that same share of GORWELD supply on Solana.**

That is the whole mechanism. No tiers, no points, no multipliers, no weighting curve, no application form. Your allocation is a number that follows from on-chain data and arithmetic — not from anyone's judgement about how deserving you are.

## Why retroactive

The snapshot is dated in the past. There was no announcement before it, and no way to qualify after it. Nobody could farm this, because there was nothing to farm — by the time you are reading this, eligibility is already frozen.

## How it was counted

**One wallet = one balance.** GorWeldd exists under the same mint on both CookieChain and Gorbagana. It is one mirrored deployment, not two separate tokens — of the 63 wallets present on both chains, 49 held balances identical to the unit. So balances are **not** added together. Each wallet is credited with the **larger of its two positions**: you count from Gorbagana or from Cookie, never from both.

Because both chains and Solana are SVM, your address is the same everywhere. Nothing to link, nothing to bridge, no wallet connection required.

**Supply basis** (UI units, 6 decimals; snapshot 2026-07-22, reproducible from the RPC call in *Verify it yourself* below):

| | GorWeldd | share |
|---|---:|---:|
| Total (larger of two chains, per wallet) | 1 011 041 101 400,691694 | 100% |
| Burned | −501 000 022 873,757726 | 49,55% |
| Excluded holder (see below) | −100 000 000 000 | 9,89% |
| **Denominator** | **410 041 078 526,933968** | |

Burned tokens and excluded holdings are removed from the denominator because they can never be claimed. Leaving them in would mean silently writing off most of the distribution.

Team wallets **and program-controlled accounts stay in the denominator** — those tokens exist as live positions — but **receive nothing**.

## What is excluded, and why

- **Burn address** — tokens are gone, they cannot receive anything.
- **Team wallets** — the project does not airdrop to itself.
- **One holder** whose position is subject to an unresolved dispute with the project.
- **Five program-controlled addresses** — liquidity pool vaults and a router account. All five are off-curve, meaning no private key exists for them. These are not people. Tokens sent there would sit under program control instead of reaching a holder.

The test is the ed25519 curve, and only that: off-curve means no private key, so no owner. What a wallet's own system account happens to be owned by does **not** disqualify anyone — a real holder whose account had been assigned to another program was excluded during an earlier pass and has been reinstated.

The method was validated before use: 77 of 78 real token accounts tested as off-curve, while 200 random byte strings split 50/50 — confirming the test discriminates rather than flagging everything.

## The result

| | |
|---|---:|
| Recipients | **55** |
| Total distributed | **15 079 241,815305 GORWELD** |
| Share of GORWELD supply | **1,5079%** |
| Paid out | **23 July 2026 — complete** |

**This is already done.** All 55 transfers were executed on 23 July 2026 and verified on-chain afterwards: every recipient's balance matches the planned amount to the unit. If you were eligible, the tokens are in your wallet right now — go and look.

Tokens went directly to your address on Solana. **There is no claim page, no signature request, and no site that will ever ask you to connect a wallet for this drop.** Anyone who asks you to do so is not us.

## Verify it yourself

You do not have to trust any of the above. Every input is public.

Pull the holder set from either chain:

```bash
curl -s -X POST https://rpc.cookiescan.io/ \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getProgramAccounts","params":[
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    {"encoding":"jsonParsed","filters":[
      {"dataSize":165},
      {"memcmp":{"offset":0,"bytes":"GCQ4NYEd2P8vRFDn9wadeE1KAPfckWpzJUUyzTqyimG7"}}]}]}'
```

Same call against `https://rpc.gorbagana.wtf/` for the other chain. Take the larger balance per owner, subtract burned and excluded holdings from the total, and divide.

Your allocation (integer math on raw amounts, 6 decimals — same as the payout script):

```
your_GORWELD_raw = your_GorWeldd_raw × 1_000_000_000_000_000 / 410_041_078_526_933_968
your_GORWELD     = your_GORWELD_raw / 1_000_000
```

In UI units that is the same share:

```
your_GORWELD ≈ your_GorWeldd / 410_041_078_526.933968 × 1_000_000_000
```

**Addresses:**
- GorWeldd mint (both chains): `GCQ4NYEd2P8vRFDn9wadeE1KAPfckWpzJUUyzTqyimG7`
- GORWELD mint (Solana): `A8cDgfn1tAQbsZfD8oZU5u2xZZqKtJTmq7m9E3PLNMqr`

## What this is not

This is not a promise about price, listings, or what GORWELD will be worth. It is a distribution of a fixed share of supply to addresses that already held the earlier token, executed on a rule anyone can recompute.

The remainder of the reward pool stays allocated to a later phase, funded by creator fees from trading — so that distribution continues to come from activity rather than from a one-off giveaway.

---

*From scrap to chain. Brick by brick.*
