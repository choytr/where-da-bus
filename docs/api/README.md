# TheBus Web API — verified reference

Everything here was read out of the vendor PDFs sitting next to this file
(`Web_Services_API.pdf` and the six per-endpoint sheets) on 2026-07-31. Where
this document and those PDFs disagree, the PDFs win — but read the
[Reading the PDFs](#reading-the-pdfs) section first, because they do not open
the way you expect.

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
| Base host | `http://api.thebus.org` |
| Method | HTTP GET, read-only |
| Auth | `key=<AppID>` query parameter |
| Rate limit | **250,000 requests/day** per AppID, by default |
| Inactivity | AppIDs are **deleted after 6 months** of no use |
| More quota | email `api@thebus.org` |

250k/day is ~2.9 req/s sustained. A 60-second arrivals poll costs 1,440
requests/day per active stop — the limit is not a design constraint at
Increment 2's scale.

### The base URL is `http://`, and that is a real problem

No HTTPS endpoint is documented anywhere in the PDFs. iOS App Transport
Security blocks cleartext HTTP by default, so **a plain `fetch` to
`http://api.thebus.org` will fail on device** even though it works in Node.

This is unresolved and must be settled before the client is written. In
preference order:

1. Try `https://api.thebus.org` — if TLS is quietly supported, nothing else is
   needed. Test this first; it costs one request.
2. If not, an `NSExceptionDomains` entry for `api.thebus.org` in `app.json`
   (`ios.infoPlist`) scoped to that one host. Never `NSAllowsArbitraryLoads`.
3. The JSON proxy that the design doc already keeps as a deferred option, which
   would terminate TLS itself.

Option 2 is a native-config change, so it rides the slow CI loop — not the
Expo Go loop. Budget for that.

## Freshness — why arrival times need an age

Quoting the Limitations page directly: the system polls the Transitmaster
system every minute, and each bus reports its position every minute, therefore
**information can be up to two minutes late**. If a bus does not radio its
position in, "information can be much later."

Two minutes of built-in lag on top of an unknown poll age is the whole reason
the design insists arrivals render as *data with an age* rather than as a bare
time. A displayed "3 min" can legitimately be five minutes old.

## Endpoints

Each has an XML form and a JSON form. **Use the JSON form.** This resolves the
design doc's open question: JSON is genuinely available, and no XML parser is
required.

### Arrivals

```
http://api.thebus.org/arrivalsJSON/?key=<AppID>&stop=<stop_ID>
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
| `arrivals[].estimated` | `1` = real GPS estimate, `0` = schedule only |
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

### Vehicle

```
http://api.thebus.org/vehicleJSON/?key=<AppID>&num=<vehicle_num>
```

Returns `timestamp` and a `vehicle` **array** with `number`, `trip`, `driver`,
`latitude`, `longitude`, `adherence`, `last_message`, `route_short_name`,
`headsign`.

`adherence` is schedule adherence in minutes: **positive means early, negative
means late.** That sign convention is the opposite of most people's intuition
and is stated explicitly in the docs.

> **`driver` is an employee number.** The vendor doc confirms it verbatim:
> "vehicle:driver — Employee number of driver". It must never be displayed,
> logged, or persisted. It identifies a specific working person.

### Route

```
http://api.thebus.org/routeJSON/?key=<AppID>&route=<route_num>
http://api.thebus.org/routeJSON/?key=<AppID>&headsign=<string>
```

Returns `routeName`, `routeID` (the id used in the GTFS feed), and a `route`
array of `{routeNum, shapeID, firstStop, headsign}`. `firstStop` is prose, not
an id — e.g. `"KALIHI TRANSIT CENTER (Stop: 4523)"`.

The `headsign=` form is a text search, which makes this the one endpoint that
answers a question the bundled GTFS asset cannot.

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
   error and not a real vehicle number. Never render it.
5. **`latitude`/`longitude` are `"0"` when there is no GPS fix** — not null,
   not absent. `"0","0"` is the Gulf of Guinea, so a naive map pin lands off
   the coast of Africa. Gate position rendering on `estimated === "1"`.
6. **`estimated: "0"` means the time is schedule-only.** This is exactly the
   distinction the design doc requires the arrival board to make visible: a
   scheduled time is a guess, a real one is a measurement.
7. **`errorMessage` is optional in every schema.** Its presence is the error
   signal; HTTP status is not documented as carrying one.
8. **Timestamps are US-format with AM/PM and no timezone.** They are Hawaii
   local (HST, UTC−10, no DST). `Date.parse` on `"12/20/2022 11:29:59 AM"`
   will interpret it in the *device's* timezone, which is wrong for anyone not
   in Hawaii. Parse the components explicitly.

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

## Still open

- **Is the GTFS-RT feed openly accessible, and what message types does it
  carry?** Not mentioned anywhere in these PDFs. Unchanged from the design doc.
- **Does `https://api.thebus.org` work?** See the ATS section above. One
  request settles it.
- **What does an error response actually look like?** Only the field name
  `errorMessage` is documented — no example, no HTTP status contract.
- **What happens at a stop with no upcoming buses?** Empty `arrivals` array
  versus absent key versus an `errorMessage` is undocumented, and the app has
  to tell "no buses coming" apart from "request failed."
