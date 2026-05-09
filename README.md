# Consistent Hashing Load Balancer

Backend load balancer simulation in Node.js. The original assignment came with a random-routing implementation; this project keeps that as a baseline and adds a redesigned consistent-hashing version, so the two can be compared from the same CLI.

## Features

- Random routing (kept from the task PDF, used as the baseline)
- Consistent hashing using MD5 over a 16-bit ring
- Virtual nodes with weighted distribution
- Health checks - unhealthy nodes are skipped during clockwise traversal
- Metrics: per-server counts, percentages, total and blocked requests
- Per-IP rate limiting (fixed window, 10 requests / 30 seconds)
- Interactive CLI for live demos

## Run

```
git clone https://github.com/Soumya2508/Consistent_Hashing_Load_Balancer.git
cd Consistent_Hashing_Load_Balancer
node index.js
```

No `npm install` needed. Only Node built-ins are used (`crypto`, `readline`). Tested on Node 22.

## Project structure

```
.
├── index.js              REPL + command dispatcher
├── randomRouting.js      Random routing baseline
├── consistentHashing.js  Hash ring, virtual nodes, health, metrics, rate limit
├── utils.js              generateRandomIP + identifyNode (kept from the PDF)
├── package.json
└── README.md
```

## Commands

Random routing:

| Command | |
|---|---|
| `add-random <name>` | add a server |
| `remove-random <name>` | remove a server |
| `test-random <ip> [count]` | route an IP through the random load balancer |
| `show-random` | list servers and the unique IPs ever requested |

Consistent hashing:

| Command | |
|---|---|
| `add-consistent <name> [weight]` | add a server (weight defaults to 1) |
| `remove-consistent <name>` | remove a server |
| `test-consistent <ip> [count]` | route an IP through consistent hashing |
| `ring` | show the hash ring with routed requests overlaid |
| `metrics` | per-server counts, percentages, totals, blocked count |
| `unhealthy <name>` | mark a server unhealthy |
| `healthy <name>` | mark a server healthy |

Other: `help`, `exit`.

## Quick demo

```
> add-random Node-A
> add-random Node-B
> add-random Node-C
> test-random 192.168.1.1
> test-random 192.168.1.1            # same IP, possibly different server
> show-random

> add-consistent Node-A 1
> add-consistent Node-B 3
> add-consistent Node-C 2
> ring
> test-consistent 192.168.1.1
> test-consistent 192.168.1.1        # same server every time
> add-consistent Node-D 2
> test-consistent 192.168.1.1        # usually still the same server

> unhealthy Node-B
> ring                                # Node-B virtual nodes tagged UNHEALTHY
> test-consistent 192.168.1.1
> unhealthy Node-B                    # already unhealthy
> healthy Node-Z                      # server does not exist
> healthy Node-B

> test-consistent 10.0.0.1 12         # last 2 blocked by rate limit
> metrics
> exit
```

## Notes

- MD5 truncated to the first 4 hex chars gives a 16-bit hash space (0 - 65535). Smaller than the full 128-bit digest, but easier to read in the CLI.
- Servers and IPs share the same hash space. Routing walks the ring clockwise from the IP's hash to the first healthy server.
- Each server is added as `weight` virtual nodes (`Node-A#0`, `Node-A#1`, ...) so distribution stays roughly even and weights actually matter.
- Health checks just flip a boolean. The clockwise walk skips unhealthy nodes and lands on the next healthy one.
- Rate limiter stores `{ count, firstRequestTime }` per IP. Window expires by comparing `Date.now()` - no real timers.
- The ring view merges routed requests purely for visualization. The actual hash ring used for routing only ever contains server entries.
- All state is in-memory. No concurrency handling, per the task constraints.
