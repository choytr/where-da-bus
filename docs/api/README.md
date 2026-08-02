# TheBus Web API — verified reference

Everything here was read out of the vendor PDFs sitting next to this file
(`Web_Services_API.pdf` and the six per-endpoint sheets) on 2026-07-31, then
**checked against the live API on 2026-08-01**. Where this document and those
PDFs disagree, read carefully: claims marked as verified live win over the
PDFs, because the PDFs were last revised in 2016 and are wrong in at least two
places that matter. For anything not marked verified, the PDFs win — and read
the [Reading the PDFs](#reading-the-pdfs) section first, because they do not
open the way you expect.

The two places the PDFs are outright wrong: **`vehicleJSON` does not exist**,
and **`estimated` has a third value the sheets never mention**, which is 96% of
real traffic. Both are detailed below.

Vendor doc version 1.11, last revised 2016-02-05. The JSON sheets are newer than
the base document and carry examples captured in December 2022.

## Reading the PDFs

`Read` cannot render these: the tool shells out to `pdftoppm`, and
`poppler-utils` is not installed in this environment (installing it needs a
sudo password nobody has here).

`scripts/pdf-text.mjs` extracts the text instead, with no dependencies:

```bash
node scripts/pdf-text.mjs docs/api/arrivalsJSON.pdf
```

The three `*JSON.pdf` sheets embed subset fonts with `Identity-H` encoding, so
their text lives in hex-encoded glyph ids rather than literal strings. A naive
extractor returns **zero bytes** from them and looks exactly like a scanned
image. It is not one — the script resolves each font's `/ToUnicode` CMap and
decodes properly. Do not conclude these files are unreadable.

## Access

| Fact | Value |
|---|---|
| Base host | **`https://api.thebus.org`** — the vendor documents `http://`, but TLS works; see below |
| Method | HTTP GET, read-only |
| Auth | `key=<AppID>` query parameter |
| Rate limit | **250,000 requests/day** per AppID, by default |
| Inactivity | AppIDs are **deleted after 6 months** of no use |
| More quota | email `api@thebus.org` |

250k/day is ~2.9 req/s sustained. A 60-second arrivals poll costs 1,440
requests/day per active stop — the limit is not a design constraint at
Increment 2's scale.

**The quota is per AppID, not per device**, so it is shared across every
install: roughly 170 stops being polled at once anywhere in the world would
exhaust it. That is comfortably beyond personal sideloading, which is the only
use this project is licensed for, but it is not headroom that scales. The PDF
also says OTS throttles "by tracking the AppID **and the ip address of
clients**", so a single misbehaving device can be cut off on its own.

### HTTPS works — settled 2026-08-01

The PDFs document only `http://`, and iOS App Transport Security blocks
cleartext, which would have forced a native-config change through the slow CI
loop. **It does not: `https://api.thebus.org` serves every endpoint the
cleartext host does.** Verified live on 2026-08-01 against `arrivalsJSON`,
`routeJSON` and `vehicle`.

| Fact | Value |
|---|---|
| Certificate | `CN = *.thebus.org`, issued by Go Daddy Secure CA G2 |
| Chain | verifies against the system trust store (`ssl_verify_result=0`) |
| Valid | 2025-09-23 → **2026-10-25** |
| Protocol | HTTP/1.1, no redirect from `https` to `http` |

**Use `https://` for every request.** No `NSExceptionDomains` entry is needed,
no `NSAllowsArbitraryLoads`, and no proxy. That removes the one item in
Increment 2 that would have required a native config change.

> **This is a wildcard cert with a fixed expiry, on a host whose vendor does
> not document TLS at all.** If it lapses un-renewed, HTTPS breaks on device
> with no code change on our side, and the fallbacks above come back — an
> `NSExceptionDomains` entry scoped to `api.thebus.org`, never
> `NSAllowsArbitraryLoads`. Worth re-checking around October 2026.

Cleartext measures faster (p50 ~90 ms vs ~1.8 s for a cold TLS handshake), but
the handshake is amortised across a session's polls and connections are kept
alive; measured over 63 sequential HTTPS requests, p50 was 92 ms and p90 was
149 ms. Latency is not a reason to prefer `http://`.

### The transport fails on its own

One request in ~63 hit a 30-second client timeout during sampling, with no
pattern and no error body — it simply never answered. The client needs an
explicit request timeout and a retry, not because the app is chatty but because
this host drops requests at a rate a rider will notice on a 60-second poll.

## Freshness — why arrival times need an age

Quoting the Limitations page directly: the system polls the Transitmaster
system every minute, and each bus reports its position every minute, therefore
**information can be up to two minutes late**. If a bus does not radio its
position in, "information can be much later."

Two minutes of built-in lag on top of an unknown poll age is the whole reason
the design insists arrivals render as *data with an age* rather than as a bare
time. A displayed "3 min" can legitimately be five minutes old.

## Endpoints

Each is documented as having an XML form and a JSON form. **Two of the three
actually do.** Verified live on 2026-08-01:

| Path | Status | Content-Type |
|---|---|---|
| `/arrivalsJSON/` | 200 | `application/json` |
| `/arrivals/` | 200 | `text/xml` |
| `/routeJSON/` | 200 | `application/json` |
| `/route/` | 200 | `text/xml` |
| **`/vehicleJSON/`** | **404** | **`text/html`** |
| `/vehicle/` | 200 | `text/xml` |

**`vehicleJSON` does not exist**, despite having its own vendor sheet. It 404s
with an IIS HTML error page for every form tried: with and without the trailing
slash, with the parameters in either order, with a valid vehicle number, with a
zero-padded one, and with none. The other two JSON endpoints answer normally
with the same key in the same session, so this is the endpoint, not the request.

The consequence is narrow, because **Increment 2's arrival board does not need
the vehicle endpoint at all** — `arrivalsJSON` already carries route, headsign,
direction, predicted time, and the bus's own position. `adherence` is the only
field unique to the vehicle endpoint, and reaching it means parsing XML. Do not
add an XML parser for it without deciding the field earns one. **A map does earn
one** — see the fleet-wide finding in the Vehicle section below, which is the
only route to positions for buses not approaching a chosen stop.

### Arrivals

```
https://api.thebus.org/arrivalsJSON/?key=<AppID>&stop=<stop_ID>
```

`stop_ID` is the stop number — the same value as `stops.stop_code` in the
bundled GTFS asset.

| Field | Meaning |
|---|---|
| `errorMessage` | Present only on error |
| `stop` | Stop number |
| `timestamp` | Server time, `M/D/YYYY h:mm:ss AM` |
| `arrivals[]` | Array of arrivals (see note on the name below) |
| `arrivals[].id` | Unique id |
| `arrivals[].trip` | Trip id, keys into the GTFS feed |
| `arrivals[].route` | Route number |
| `arrivals[].headsign` | Overhead sign text |
| `arrivals[].vehicle` | Vehicle number |
| `arrivals[].direction` | e.g. `Westbound` |
| `arrivals[].stopTime` | Time only, `h:mm AM` |
| `arrivals[].date` | Date only, `M/D/YYYY` |
| `arrivals[].estimated` | `1` = real GPS estimate. Also emits `2`, undocumented — see below |
| `arrivals[].latitude` / `.longitude` | Bus position |
| `arrivals[].shape` | Shape id, keys into `shapes.txt` |
| `arrivals[].canceled` | `0` active, `1` canceled, `-1` was canceled, now not |

Verbatim example from the sheet:

```json
{
  "stop":"45","timestamp":"12/20/2022 11:29:59 AM",
  "arrivals":
  [
    {"id":"1583780421",
    "trip":"4422635",
    "route":"54",
    "headsign":"LOWER PEARL CITY",
    "direction":"Westbound",
    "vehicle":"???",
    "estimated":"0",
    "stopTime":"11:32 AM",
    "date":"12/20/2022",
    "longitude":"0",
    "latitude":"0",
    "shape":"540232",
    "canceled":"0"}
  ]
}
```

#### `estimated` has a third value, and it is the common one

The vendor documents `0` and `1`. Live sampling of **1,269 arrivals across 60
random stops** on 2026-08-01 at ~22:00 HST found:

| `estimated` | count | vehicle known | position non-zero |
|---|---|---|---|
| `"0"` | 3 | 0 | 0 |
| `"1"` | 41 | 41 | 41 |
| `"2"` | **1,225** | 0 | 0 |

`"2"` is undocumented and is **96% of all arrivals**. Its records are
indistinguishable from `"0"`'s: `vehicle` is `"???"`, and `latitude` and
`longitude` are both `"0"`. Whatever distinguishes `0` from `2` is not visible
in the payload, and three samples is too few to guess from.

**The rule the app uses: an arrival is real-time if and only if
`estimated === "1"`.** Everything else is schedule-only. This is deliberately a
whitelist rather than `!== "0"`, which would have rendered 1,225 schedule
guesses as live GPS estimates. It also makes the correct behaviour independent
of ever learning what `2` means.

The 22:00 HST sampling window inflates the schedule-only share — few buses are
running. The *value space* is what matters here, and a daytime sample would not
remove `"2"` from it.

### Vehicle — XML only

```
https://api.thebus.org/vehicle/?key=<AppID>&num=<vehicle_num>
```

**There is no working JSON form** — see the endpoint table above. The XML is
flat and shallow:

> **Omit `num` and it returns the entire fleet.** Verified live 2026-08-02:
> `https://api.thebus.org/vehicle/?key=<AppID>` with **no parameters** answers
> with 1,184 `<vehicle>` elements, 333 KB of XML — 29 KB gzipped — in one
> request. `route=` does *not* filter: `?route=1` returns the identical 1,184.
> Any unrecognised parameter behaves the same way. Only `num=` narrows it, and
> an unknown `num` gives `<errorMessage>Could not find vehicle "…"`.
>
> **This overturns the advice below about not adding an XML parser.** That
> advice assumed the endpoint only did one-bus-at-a-time lookups, which would
> have made it useless for a map. It doesn't. This is the *only* way to get
> fleet-wide positions — `arrivalsJSON` gives positions only for buses
> approaching one specific stop.
>
> **Most of the fleet response is stale, and it is dangerous.** Of the 1,184
> vehicles, **46** had a `last_message` within 15 minutes. The rest had a median
> `last_message` age of roughly **four years**. But 1,144 of them carry real,
> plausible Oahu coordinates — so unlike the `"0","0"` sentinel, which lands
> visibly in the Gulf of Guinea, these plot as buses sitting on real streets.
> A consumer that does not filter on `last_message` freshness renders about
> 1,138 ghost buses that have not moved since 2022.
>
> `route_short_name` is **not** a usable filter: it is the literal string
> `"null"` for 1,143 of them, including at least one live vehicle.
>
> The 46 live vehicles at 01:07 HST Sunday corroborates the 41 `estimated="1"`
> arrivals sampled independently at 22:00 the night before. **The rush-hour
> count is still unmeasured** and is what decides whether a live-vehicle map is
> worth building; it needs a 17:00 UTC or later window.

```xml
<vehicles>
<timestamp>8/1/2026 10:07:17 PM</timestamp>
<vehicle><number>252</number><trip>5333993</trip><driver>48170</driver>
<latitude>21.30397</latitude><longitude>-157.8496</longitude>
<adherence>4</adherence><last_message>8/1/2026 10:07:02 PM</last_message>
<route_short_name>1</route_short_name>
<headsign>KAHAUIKI KALIHI TRANSIT CNTR SKYLINE STN</headsign></vehicle>
</vehicles>
```

`adherence` is schedule adherence, **positive means early, negative means
late** — a sign convention that is the opposite of most people's intuition and
is the part the vendor does state explicitly.

**The unit is minutes.** The vendor never says so; this is settled empirically.
Thirty vehicles sampled live on 2026-08-01 gave:

```
-19 -19 -13 -8 -7 -6 -5 -5 -4 -4 -3 -3 -3 -2 -2 0 0 0 0 0 0 0 0 0 0 0 1 3 4 4
```

Every value is an integer, the range is −19…+4, and a third of them are exactly
`0`. Seconds is not a credible reading of that: it would mean the entire fleet
was running within twenty *seconds* of schedule, with ten buses to the second.
Minutes, rounded, fits it exactly. The remaining uncertainty is whether an
unusually late bus can exceed ±60 — none was observed, so a client must not
assume the value is bounded.

> **`driver` is an employee number, and it is really in there.** The vendor doc
> confirms it verbatim — "vehicle:driver — Employee number of driver" — and the
> live XML above carries `<driver>48170</driver>`. It must never be displayed,
> logged, or persisted. It identifies a specific working person. Anything that
> parses this endpoint must drop the field at the parse boundary, not merely
> decline to render it.

### Route

```
https://api.thebus.org/routeJSON/?key=<AppID>&route=<route_num>
https://api.thebus.org/routeJSON/?key=<AppID>&headsign=<string>
```

Returns `routeName`, `routeID` (the id used in the GTFS feed), and a `route`
array of `{routeNum, shapeID, firstStop, headsign}`. `firstStop` is prose, not
an id — e.g. `"KALIHI TRANSIT CENTER (Stop: 4523)"`.

The `headsign=` form is a text search, which makes this the one endpoint that
answers a question the bundled GTFS asset cannot.

## Errors and empty results — settled 2026-08-01

The vendor documents the field name `errorMessage` and nothing else: no
example, no status contract, and no statement of what a stop with no upcoming
buses returns. The app has to tell "no buses coming" apart from "request
failed", so this was probed directly.

**Errors come back as HTTP 200 with a JSON body.** The status line carries no
signal whatsoever for an application-level error:

| Request | Status | Body |
|---|---|---|
| bad / empty / absent `key` | **200** | `{"errorMessage": "Invalid or unspecified API key"}` |
| `stop` absent | **200** | `{"errorMessage": "Invalid or unspecified stop ID"}` |
| `stop=abc` (non-numeric) | **200** | `{"errorMessage": "Unspecified API error"}` |
| `stop=9999999` (no such stop) | 200 | `{"stop":"9999999","timestamp":"…","arrivals": []}` |
| `stop=0`, `stop=-1` | 200 | `{"stop":"0","timestamp":"…","arrivals": []}` |
| real stop, no buses due | 200 | `{"stop":"…","timestamp":"…","arrivals": []}` |

So, concretely:

1. **Never branch on `res.ok` or the status code for API errors.** A 200 is the
   error case. Parse the body and check for `errorMessage` first, always.
2. **An empty board is `arrivals: []` with `stop` and `timestamp` present.**
   That is unambiguously distinct from the error shape, which has *no* `stop`
   and *no* `timestamp`. This is the discrimination the design requires, and it
   is clean.
3. **A missing `arrivals` key never occurred.** Success always carried the key.
   Treat its absence as an error, as the vendor sheet's singular/plural
   confusion already advised.
4. **An unknown stop is indistinguishable from a quiet one.** Both return an
   empty array. The app cannot say "no such stop", and does not need to: stop
   codes come from the bundled GTFS asset, so they exist by construction.
5. **The error body is serialised differently from the success body** — a space
   after the colon, and a trailing `\r\n`. It is a different code path on their
   side. Do not rely on the framing; parse it.

**Not every failure is JSON.** A 404 (`/vehicleJSON/`, or any unknown path)
returns a 1,245-byte IIS **HTML** error page with `Content-Type: text/html`.
Calling `res.json()` unconditionally throws a `SyntaxError` on it. Check the
status and the content type before parsing, and treat a non-JSON response as a
transport failure rather than letting the parse error surface as a crash.

## Response quirks that will bite

These come from comparing the vendor's field tables against the vendor's own
examples. The examples are the more trustworthy of the two.

1. **Every value is a string.** `"estimated":"0"`, `"canceled":"0"`,
   `"latitude":"21.33265"`. There are no JSON numbers or booleans anywhere.
   Parse deliberately; never trust a truthiness check on `"0"`, which is
   truthy in JavaScript.
2. **The arrivals array is `arrivals`, not `arrival`.** The field table calls
   it `arrival` (singular); the example emits `"arrivals"`. Handle the plural,
   and treat a missing key as an error rather than as an empty board.
3. **`date` is lowercase in the example, `Date` in the table.** Follow the
   example.
4. **`"vehicle":"???"`** is a literal sentinel for an unknown bus, not an
   error and not a real vehicle number. Never render it. **Confirmed live:**
   1,228 of 1,269 sampled arrivals carried it, and it co-occurs exactly with
   `estimated !== "1"`.
5. **`latitude`/`longitude` are `"0"` when there is no GPS fix** — not null,
   not absent. `"0","0"` is the Gulf of Guinea, so a naive map pin lands off
   the coast of Africa. Gate position rendering on `estimated === "1"`.
   **Confirmed live:** every one of the 41 `estimated === "1"` arrivals had a
   real position and a real vehicle number; all 1,228 others had `"0"`/`"0"`
   and `"???"`. The correlation was perfect in both directions.
6. **Schedule-only is `estimated !== "1"`, not `estimated === "0"`.** See the
   `estimated` section above — the undocumented `"2"` is 96% of all arrivals,
   so testing against `"0"` mislabels almost everything as live. This is the
   distinction the design doc requires the arrival board to make visible: a
   scheduled time is a guess, a real one is a measurement.
7. **`errorMessage` is the only error signal.** HTTP status does not carry one
   — errors arrive as 200. See the errors section above.
8. **Timestamps are US-format with AM/PM and no timezone.** They are Hawaii
   local (HST, UTC−10, no DST). `Date.parse` on `"12/20/2022 11:29:59 AM"`
   will interpret it in the *device's* timezone, which is wrong for anyone not
   in Hawaii. Parse the components explicitly.
9. **`timestamp` has seconds; `stopTime` does not.** `"8/1/2026 10:08:53 PM"`
   against `"10:12 PM"`. One parser must accept the seconds as optional — a
   `h:mm AM` regex left unanchored will happily match `08:53 PM` *inside* the
   full timestamp and silently return a time 94 minutes off. That is not
   hypothetical; it happened while writing this section, and it looked exactly
   like the API returning bad data.
10. **Arrivals are capped at 25, pre-sorted, and never in the past.** Two busy
    stops both returned exactly 25 — a server-side cap, not a coincidence of
    demand. They arrived already sorted ascending by time, with zero arrivals
    earlier than the response's own `timestamp`, covering a ~2.5-hour horizon.
    A client may rely on the ordering for display but must not assume the cap
    means the list is complete.
11. **The window crosses midnight, which is why `date` exists.** Both sampled
    stops returned arrivals spanning `8/1/2026` and `8/2/2026`. Computing
    "minutes until" from `stopTime` alone is correct for most of the day and
    wrong by 24 hours late at night. Always combine `date` with `stopTime`.
12. **Every container the tables call an "object" is an array in the examples.**
    The tables read `arrival — Bus arrival information object`, `vehicle —
    Vehicle Information object`, `route — Route Information Object`; all three
    examples emit arrays. This is the third and widest of the table/example
    disagreements, alongside 2 and 3.

> **Which of these are quotes and which are readings.** Items 1, 2, 3 and 12
> are things the PDFs say, or direct comparisons between two things they say.
> Items 4, 5, 6, 7, 9, 10 and 11 were **verified against the live API on
> 2026-08-01** — they began as inferences and are now measurements, with the
> sample sizes stated inline. Item 8's timezone half remains an inference: the
> vendor never names a timezone, and Hawaii is the only sensible reading.

## Legal — now verified

The Terms of Use page resolves the design doc's open question about wording.
The required legend, **verbatim, including the missing full stop after "Inc"**:

```
Route and arrival data provided by permission of Oahu Transit Services, Inc
```

The Terms say this must be "prominently displayed" — the reason the
attribution sits in the list header rather than a footer.

**On the marks.** The Terms permit using the marks `OTS` and `HEA`, but only if
each is asterisked and accompanied by "\* OTS and HEA are registered trademarks
of Oahu Transit Services, Inc. All rights reserved." This project avoids those
marks in UI copy entirely, which sidesteps the requirement rather than
complying with it. That is a deliberate simplification — if a mark ever enters
the UI, the asterisk legend becomes mandatory.

The data is provided "AS IS" and "AS AVAILABLE" with no warranty, and the
license is **revocable**.

## Settled on 2026-08-01

The four API questions that blocked Increment 2 were probed live against
`https://api.thebus.org` — roughly 200 requests against a 250,000/day quota.

| Question | Answer |
|---|---|
| Does `https://` work? | **Yes**, valid cert, every endpoint. No ATS exception needed. |
| What does an error look like? | **HTTP 200** plus `{"errorMessage": "…"}`, with no `stop` and no `timestamp`. |
| What does an empty stop look like? | `arrivals: []` with `stop` and `timestamp` present — cleanly distinct from an error. |
| What unit is `adherence`? | **Minutes.** 30 live values, all integers, range −19…+4. |

Two things the probe found that nobody had thought to ask:

- **`estimated` emits an undocumented `"2"`**, and it is 96% of all arrivals.
  Testing for schedule-only with `=== "0"` would mislabel almost every arrival
  as live GPS. Use `=== "1"` for real-time and treat everything else as
  scheduled.
- **`vehicleJSON` does not exist** — it 404s with an HTML page. The vehicle
  endpoint is XML-only, which is the one place a parser would be needed.
  Increment 2 does not need it.

The raw probe scripts were throwaway; everything they established is written
down above, with sample sizes. Re-run them only if a claim here looks wrong.

## Still open

- **Is the GTFS-RT feed openly accessible, and what message types does it
  carry?** Not mentioned anywhere in these PDFs. Unchanged from the design doc.
- **What distinguishes `estimated` `"0"` from `"2"`?** Both mean schedule-only
  as far as the payload shows. Three samples of `"0"` against 1,225 of `"2"`,
  with no field differing between them. It does not block anything — the
  `=== "1"` rule is correct either way — so this is curiosity, not a blocker.
- **Can `adherence` exceed ±60 minutes?** No sample did, but nothing bounds it.
  A client must not assume it fits an hour.
- **Does the `*.thebus.org` certificate get renewed?** It expires 2026-10-25.
  If it lapses, HTTPS breaks on device with no change on our side.
