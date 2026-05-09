# Project Report — Consistent Hashing Load Balancer

**Internship Task 3 — Backend Load Balancer Simulation**

Repository: https://github.com/Soumya2508/Consistent_Hashing_Load_Balancer

---

## 1. Overview

The original task came with a load balancer that routes incoming requests by `Math.random()`. This works for spreading load but breaks the moment any client expects "the same request goes to the same server" — which is what consistent hashing fixes.

This project keeps the original random router as a baseline and adds a redesigned consistent-hashing router. Both run side by side from the same CLI so the difference can be demoed directly.

Key features in the consistent-hashing version:
- MD5 hash space (16-bit, 0–65535) shared by servers and IPs
- Virtual nodes with configurable weight per server
- Health flags that exclude unhealthy nodes from clockwise routing
- Per-IP fixed-window rate limiting (10 requests / 30 seconds)
- Live metrics — request distribution recomputed dynamically against the current ring

## 2. Architecture

```
.
├── index.js              REPL + command dispatcher
├── randomRouting.js      Naive random routing (baseline)
├── consistentHashing.js  Hash ring, virtual nodes, health, metrics, rate limit
├── utils.js              generateRandomIP and identifyNode (kept from the PDF)
├── package.json
├── README.md
└── PROJECT_REPORT.md     (this file)
```

No external dependencies. Only Node built-ins (`crypto`, `readline`).

## 3. Demo 1 — Random Routing

**Goal:** show that random routing is non-deterministic — the same IP can land on different servers on repeated calls.

### Steps

1. Generate 5 IPs with no servers (should fail).
2. Add 3 servers (`Node-A`, `Node-B`, `Node-C`).
3. Generate 8 random IPs (each routes randomly).
4. Send the same IP `192.168.1.1` 5 times in a row.
5. Inspect `show-random`.

### Transcript

```
> simulate-random 5
Incoming IP: 137.183.12.37 -> No servers available
Incoming IP: 167.51.151.245 -> No servers available
Incoming IP: 168.52.203.71 -> No servers available
Incoming IP: 62.129.26.94 -> No servers available
Incoming IP: 226.246.150.45 -> No servers available

> add-random Node-A
Added Node-A to random routing
> add-random Node-B
Added Node-B to random routing
> add-random Node-C
Added Node-C to random routing

> simulate-random 8
Incoming IP: 35.102.147.105 -> Routed to: Node-C
Incoming IP: 233.180.151.195 -> Routed to: Node-B
Incoming IP: 92.196.217.66 -> Routed to: Node-C
Incoming IP: 152.225.97.192 -> Routed to: Node-A
Incoming IP: 143.69.47.153 -> Routed to: Node-B
Incoming IP: 179.77.229.194 -> Routed to: Node-B
Incoming IP: 120.241.3.88 -> Routed to: Node-C
Incoming IP: 36.242.28.42 -> Routed to: Node-A

> show-random
===== RANDOM ROUTING SERVERS =====
Node-A, Node-B, Node-C

===== ROUTED REQUESTS =====
137.183.12.37, 167.51.151.245, 168.52.203.71, 62.129.26.94, 226.246.150.45,
35.102.147.105, 233.180.151.195, 92.196.217.66, 152.225.97.192, 143.69.47.153,
179.77.229.194, 120.241.3.88, 36.242.28.42

> test-random 192.168.1.1
Incoming IP: 192.168.1.1 -> Routed to: Node-C
> test-random 192.168.1.1
Incoming IP: 192.168.1.1 -> Routed to: Node-A
> test-random 192.168.1.1
Incoming IP: 192.168.1.1 -> Routed to: Node-B
> test-random 192.168.1.1
Incoming IP: 192.168.1.1 -> Routed to: Node-A
> test-random 192.168.1.1
Incoming IP: 192.168.1.1 -> Routed to: Node-B
```

### Observations

- **Non-deterministic:** 5 calls of `192.168.1.1` produced 5 routings: `Node-C, Node-A, Node-B, Node-A, Node-B`. Any cache or session attached to a server is useless because the next request for the same client could land on any other server.
- The "incoming requests" log dedupes IPs — `192.168.1.1` shows up once, even though it was tested 5 times.
- Even before any server existed, the 5 incoming IPs were still acknowledged with a `No servers available` message and stored in the request log, so the demo doesn't lose the history.

This is the bug the redesign is supposed to fix.

## 4. Demo 2 — Consistent Hashing

**Goal:** show deterministic routing, weighted distribution via virtual nodes, minimal disruption when topology changes, health-aware failover, and rate limiting.

### Steps

1. Generate 5 IPs with no servers.
2. Add `Node-A` (weight 2), `Node-B` (weight 3), `Node-C` (weight 2).
3. Show the ring (failed requests should now resolve to a server).
4. Generate 10 more random IPs.
5. Show metrics.
6. Send `192.168.1.1` five times — confirm it always lands on the same server.
7. Add `Node-D` (weight 2). Show metrics. Most IPs should still route to the same server they did before.
8. Mark `Node-A` unhealthy. Show metrics — its requests should fail over clockwise.
9. Mark `Node-A` healthy again.
10. Send `7.7.7.7` 12 times — first 10 should route, last 2 should be rate-limited.
11. Final metrics.

### Transcript (key segments)

**Step 3 — Ring view after adding 3 servers.** Notice the 5 previously-failed requests now show their actual clockwise destination, computed dynamically from the live ring:

```
> ring
===== CONSISTENT HASH RING =====
7159 -> [REQUEST] 253.11.62.105 -> Node-C
11790 -> [SERVER]  Node-C#1 [HEALTHY]
16545 -> [SERVER]  Node-B#2 [HEALTHY]
19460 -> [SERVER]  Node-A#0 [HEALTHY]
20930 -> [REQUEST] 253.148.161.133 -> Node-C
21258 -> [SERVER]  Node-C#0 [HEALTHY]
27642 -> [REQUEST] 249.35.136.86 -> Node-B
31884 -> [SERVER]  Node-B#1 [HEALTHY]
59842 -> [REQUEST] 82.165.73.216 -> Node-A
60129 -> [REQUEST] 138.174.125.115 -> Node-A
62060 -> [SERVER]  Node-A#1 [HEALTHY]
65445 -> [SERVER]  Node-B#0 [HEALTHY]
```

Each request entry sits at its own hash position on the ring. The clockwise next `[SERVER]` entry is its destination.

**Step 6 — Same IP, repeated 5 times:**

```
> test-consistent 192.168.1.1
Incoming IP: 192.168.1.1 -> Routed to: Node-B
> test-consistent 192.168.1.1
Incoming IP: 192.168.1.1 -> Routed to: Node-B
> test-consistent 192.168.1.1
Incoming IP: 192.168.1.1 -> Routed to: Node-B
> test-consistent 192.168.1.1
Incoming IP: 192.168.1.1 -> Routed to: Node-B
> test-consistent 192.168.1.1
Incoming IP: 192.168.1.1 -> Routed to: Node-B
```

Five attempts, one server. This is the deterministic property the random router lacked.

**Step 7 — Adding Node-D and observing minimal disruption:**

```
> metrics  (before adding Node-D)
Stored requests (15):
  82.165.73.216 -> Node-A
  138.174.125.115 -> Node-A
  253.148.161.133 -> Node-C
  249.35.136.86 -> Node-B          <-- watch this row
  253.11.62.105 -> Node-C
  169.22.230.222 -> Node-A
  225.132.33.175 -> Node-A
  162.120.152.162 -> Node-A
  92.226.226.164 -> Node-A
  81.240.90.235 -> Node-A          <-- and this one
  94.189.2.39 -> Node-B
  238.33.238.62 -> Node-A          <-- and this one
  110.53.225.70 -> Node-A
  58.96.177.222 -> Node-A
  66.133.9.169 -> Node-A
Current distribution:
  Node-A -> 11 (73.3%)
  Node-B -> 2  (13.3%)
  Node-C -> 2  (13.3%)

> add-consistent Node-D 2

> metrics  (after adding Node-D)
Stored requests (16):
  82.165.73.216 -> Node-A
  138.174.125.115 -> Node-A
  253.148.161.133 -> Node-C
  249.35.136.86 -> Node-D          <-- moved A -> D? No: was Node-B, now Node-D
  253.11.62.105 -> Node-C
  169.22.230.222 -> Node-A
  225.132.33.175 -> Node-A
  162.120.152.162 -> Node-A
  92.226.226.164 -> Node-A
  81.240.90.235 -> Node-D          <-- was Node-A, now Node-D
  94.189.2.39 -> Node-B
  238.33.238.62 -> Node-D          <-- was Node-A, now Node-D
  110.53.225.70 -> Node-A
  58.96.177.222 -> Node-A
  66.133.9.169 -> Node-A
  192.168.1.1 -> Node-D
Current distribution:
  Node-A -> 9 (56.3%)
  Node-B -> 1 (6.3%)
  Node-C -> 2 (12.5%)
  Node-D -> 4 (25.0%)
```

Of the 15 IPs that existed before adding Node-D, only 3 changed destination. The rest kept their original mapping. This is the headline property of consistent hashing — adding capacity doesn't reshuffle most requests.

**Step 8 — Marking Node-A unhealthy:**

```
> unhealthy Node-A
Node-A marked UNHEALTHY

> metrics
Servers:
  Node-A (weight 2, UNHEALTHY)
  Node-B (weight 3, HEALTHY)
  Node-C (weight 2, HEALTHY)
  Node-D (weight 2, HEALTHY)
Current distribution:
  Node-A -> 0 requests (0.0%)
  Node-B -> 9 requests (56.3%)
  Node-C -> 3 requests (18.8%)
  Node-D -> 4 requests (25.0%)
```

All 9 requests that were routing to Node-A now fail over to the next healthy server clockwise (mostly Node-B). When Node-A is marked healthy again, they revert.

**Step 10 — Rate limiting:**

```
> test-consistent 7.7.7.7 12
Incoming IP: 7.7.7.7 -> Routed to: Node-B
Incoming IP: 7.7.7.7 -> Routed to: Node-B
Incoming IP: 7.7.7.7 -> Routed to: Node-B
Incoming IP: 7.7.7.7 -> Routed to: Node-B
Incoming IP: 7.7.7.7 -> Routed to: Node-B
Incoming IP: 7.7.7.7 -> Routed to: Node-B
Incoming IP: 7.7.7.7 -> Routed to: Node-B
Incoming IP: 7.7.7.7 -> Routed to: Node-B
Incoming IP: 7.7.7.7 -> Routed to: Node-B
Incoming IP: 7.7.7.7 -> Routed to: Node-B
Rate limit exceeded for IP: 7.7.7.7
Rate limit exceeded for IP: 7.7.7.7
```

The 30-second window allows 10 requests per IP. The 11th and 12th attempts are dropped at the load balancer before reaching any server. The metrics view tracks them in `Blocked by rate limit: 2`.

### Observations

- **Deterministic:** same IP, same server, every single time.
- **Weighted distribution:** weight controls virtual node count. Node-B at weight 3 takes a larger share of the ring than Node-A at weight 2.
- **Minimal disruption on topology change:** adding Node-D moved 3 of 15 requests, not all 15.
- **Health failover:** marking Node-A unhealthy diverts only the requests in its arc, the rest are unaffected.
- **Rate limiting:** the 11th and 12th attempts of `7.7.7.7` get blocked while the first 10 succeed, in a single REPL line.
- **Distribution is approximate, not exact:** with only 16 stored IPs, distribution skews. With more virtual nodes per server (or more random IPs), the spread evens out — that's a property of the algorithm, not a bug.

## 5. Implementation Details

- **Hash space:** MD5 hex digest, first 4 chars, parsed as a 16-bit integer (range 0–65535). Small enough to print readably in the CLI; large enough that hash collisions on small simulations are rare.
- **Routing:** `findRouteForHash(ipHash)` does the clockwise walk. It is called both during live routing and at display time (when `ring` or `metrics` is shown). This is why adding/removing a server or toggling health updates the displayed routing for every stored IP — there's no cached destination to invalidate.
- **Virtual nodes:** stored as `{ virtualNode, actualNode, hashValue }`. Routing returns `actualNode`, virtual is internal.
- **Health flag:** lives on the server record; the routing loop skips entries whose `actualNode` is unhealthy and continues clockwise.
- **Rate limiting:** `{ count, firstRequestTime }` per IP. Window expiry uses `Date.now()` comparisons — no actual timers, no scheduling.
- **In-memory only:** all state is module-level `let` variables. No database, no external services. Per the task constraints.

## 6. How to Run

```
git clone https://github.com/Soumya2508/Consistent_Hashing_Load_Balancer.git
cd Consistent_Hashing_Load_Balancer
node index.js
```

Then type `help` at the `>` prompt to see all commands. The transcripts above can be replayed line by line.

## 7. What This Project Demonstrates

- Awareness of why naive random routing fails (non-determinism breaks caching, sessions, sharding).
- Grasp of consistent hashing as the standard fix, including virtual nodes for distribution and health checks for failover.
- Practical implementation skill — clean separation between the two routing systems, dynamic display refactor for the ring/metrics views, simple in-memory rate limiter.
- Comfort with iterative development — five incremental phases, each committed separately, testable end-to-end after every step.
