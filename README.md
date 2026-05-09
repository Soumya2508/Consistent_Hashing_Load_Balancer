# Consistent Hashing Load Balancer

A backend-only Node.js simulation of a load balancer that contrasts naive random routing with consistent hashing. Built as Task 3 for the Infollion Software Developer Intern assignment.

The project keeps the original starter code from the task PDF (`generateRandomIP`, `identifyNode`) and ships *both* a baseline random router and a redesigned consistent-hashing router, so the difference can be demoed live in the terminal.

## Setup

```
git clone https://github.com/Soumya2508/Consistent_Hashing_Load_Balancer.git
cd Consistent_Hashing_Load_Balancer
node index.js
```

No `npm install` needed - only Node built-ins (`crypto`, `readline`) are used.

Tested on Node 22, but should run on any Node 14+.

## Project structure

```
.
├── index.js              REPL entry point + command dispatcher
├── randomRouting.js      Naive random routing (baseline)
├── consistentHashing.js  Hash ring, virtual nodes, health, metrics, rate limiting
├── utils.js              generateRandomIP and identifyNode (kept from the PDF)
├── package.json
└── README.md
```

## REPL commands

After running `node index.js`:

### Random routing
| Command | What it does |
|---|---|
| `add-random <name>` | add a server |
| `remove-random <name>` | remove a server |
| `test-random <ip> [count]` | route an IP through the random load balancer |
| `show-random` | show servers and the unique set of IPs ever requested |

### Consistent hashing
| Command | What it does |
|---|---|
| `add-consistent <name> [weight]` | add a server with the given weight (defaults to 1) |
| `remove-consistent <name>` | remove a server |
| `test-consistent <ip> [count]` | route an IP through consistent hashing |
| `ring` | show the hash ring with routed requests overlaid by hash position |
| `metrics` | per-server counts and percentages plus total/blocked request counts |
| `unhealthy <name>` | mark a server unhealthy (its virtual nodes are skipped) |
| `healthy <name>` | mark a server healthy again |

### Misc
| Command | What it does |
|---|---|
| `help` | print the command list |
| `exit` | quit |

## Demo flow

A full session that shows every feature:

```
node index.js

> add-random Node-A
> add-random Node-B
> add-random Node-C
> test-random 192.168.1.1
> test-random 192.168.1.1
> test-random 192.168.1.1
> show-random                          # same IP, different servers each time

> add-consistent Node-A 1
> add-consistent Node-B 3
> add-consistent Node-C 2
> ring                                 # virtual nodes spread on the ring
> test-consistent 192.168.1.1
> test-consistent 192.168.1.1          # same server every time
> test-consistent 10.0.0.1
> test-consistent 8.8.8.8

> add-consistent Node-D 2
> test-consistent 192.168.1.1          # likely still the same server

> unhealthy Node-B
> ring                                 # Node-B virtual nodes tagged UNHEALTHY
> test-consistent 192.168.1.1          # if Node-B was the target, fails over

> unhealthy Node-B                     # already unhealthy
> healthy Node-Z                       # server does not exist
> healthy Node-B

> test-consistent 192.168.1.1 12       # 10 routed, then BLOCKED
> metrics                              # see per-server distribution + blocked count

> exit
```

## Concepts

### Why random routing fails
The PDF starter code picks a server with `Math.floor(Math.random() * nodes.length)`. Calling it with the same IP twice gives different servers, so any cache or session attached to a server is useless. `test-random 192.168.1.1` invoked three times will print three potentially different routings - that is the bug we are fixing.

### Why modulo hashing fails
A naive fix is `nodes[hash(ip) % nodes.length]`. It is deterministic for a fixed node count, but adding or removing a single node changes the modulus and remaps almost every IP - cache hit rates collapse to near zero on any cluster change.

### Why consistent hashing works
Both servers and IPs are hashed onto the same circular space (here, the 16-bit space `0..65535` produced by `parseInt(md5(key).slice(0, 4), 16)`). Each request walks clockwise from its hash position to the first server on the ring. Adding a server only steals the slice immediately counterclockwise of itself - everyone else keeps their mapping. Removing a server only spills its slice to the next clockwise server.

### Why virtual nodes
With three real servers, the ring has only three points. If they happen to clump, one server gets a huge slice and the others starve. Each physical server is replicated as N virtual nodes (`Node-A#0`, `Node-A#1`, ...) on the ring; with more points the slices average out. Weight is implemented as the virtual node count - a server with weight 3 takes roughly 3x the load of a weight-1 server.

### Why health checks
A dead server should not receive traffic. Marking a server unhealthy keeps its entries on the ring (so we don't pay the rebuild cost) but the routing function skips them on its clockwise walk and lands on the next healthy node instead. Same IP → same fallback server, deterministically.

### Why rate limiting
Even with perfect routing, one client can hammer your servers. A simple fixed-window counter per IP (10 requests per 30 seconds here) drops excess requests at the load balancer before they hit any backend. Implemented in-memory with `Date.now()` comparisons - no real timers, just timestamps.

### Why ring rebuilding
Adding or removing a physical server changes which virtual nodes belong on the ring. The implementation rehashes all current servers and re-sorts the ring after every add/remove. For a small simulation this is cheap; a production system would maintain the sorted structure incrementally with a balanced tree.

## Implementation notes

- MD5 hashing with `substring(0, 4)` gives a 16-bit space - large enough for clean visualization, small enough for hash values to fit in three or four printed digits.
- Routing logic walks the ring strictly via `for ... of hashRing` loops; the request overlay shown by `ring` is built into a separate temporary list at print time, so the routing data structure is never polluted with request entries.
- All state is module-level `let` variables - no classes, no factories. Per the assignment constraints: in-memory only, no concurrency.
