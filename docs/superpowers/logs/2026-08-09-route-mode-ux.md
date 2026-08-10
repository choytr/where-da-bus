# Route mode on a device — the UX pass

Truman sent three screenshots on 2026-08-09, after Increment 8 was declared
device-verified, with: *"Overall the UX is not that great. See what you can do
to improve it but it's also fine if you conclude that the clutter is just a
consequence of the requested feature."*

**Transcribed because images do not survive a context compaction and text
does.** Everything below the heading of each shot is *observed*, not inferred.
Where something is a reading of the code rather than of the picture, it says so.

Originals: `~/wheredabus-screenshots/8-9-2026/`, outside this repo.

---

## IMG_4645 — route mode at route scale, first render

Route 2 selected, camera zoomed out far enough to hold most of the route —
Sand Island to Kāhala across the screen, Honolulu Watershed Forest Reserve
filling the top third.

**Observed:**

- **About forty stop pins, fused into an unbroken chain.** The blue tiles
  overlap each other continuously from Kalihi round to Kāhala. There is no gap
  between consecutive pins anywhere along the visible route.
- **The route line is not visible at any point.** Not "mostly covered" — the red
  line cannot be seen at all, because the chain of pins is continuous.
- **No bus dots at all.** Zero green markers on screen.
- **No labels at all**, on stops or buses.
- Sheet at peek: `Route 2` / `Toward KALIHI TRANSIT CENTER`, the flip and X
  controls, rows 1 and 2 of the stop list.

**Reading of the code, not of the picture:** the absent *stop* labels are
correct and deliberate — `MAX_SPAN_FOR_LABELS` in `features/map/labels.ts` is
`0.022°` and this camera is far wider, so rule 1 suppresses every stop name. The
absent *bus* dots are the bug Truman reported separately.

## IMG_4646 — the same route, same scale, after zooming in and back out

Camera is at a comparable span, panned slightly north.

**Observed:**

- **The bus dots are now present** — around seven green circles along the route.
- **Every bus is labelled, and the labels are unreadable.** Legible fragments:
  `874 · here now`, `883 · here now`, `881 · here now`, `167 · h…`,
  `877 · here now`, `888 · here`, `170 · here now`, `178 · h…w`,
  `875 · here now`, `171 · here now`, `886 · here now`, `884 · here now`.
  They overprint each other, and they overprint the stop pins.
- **More labels than visible dots.** The labels are 150 pt wide against dots
  22 pt across, so a cluster of buses that reads as two or three dots produces
  five or six overlapping strings.
- The stop pins are still a fused chain; the line is still invisible.

**This is the backlog's "bus labels are unreadable" item, and the mechanism is
now visible:** `labels.ts` culls stop names by collision, by a `MAX_LABELS` cap
of 6, and by `MAX_SPAN_FOR_LABELS`. Buses bypass all three — `BusMarker` always
draws its label. So at exactly the zoom where stop names are correctly
suppressed as hopeless, every bus label is drawn.

## IMG_4647 — the same route at street scale

Camera over Waikīkī / Kapahulu, roughly eight blocks across.

**Observed:**

- **The red route line is clearly visible** and easy to follow up Kapahulu Ave.
- **Stop pins are well spaced and individually readable**, six of them labelled:
  `KUHIO AVE + LILIU…`, `KUHIO AVE + PAOAKALANI AVE`, `KAPAHULU AVE + KUHIO
  AVE`, `KAPAHULU AV… CAMPBELL`, `…VE + WALINA ST`, `CAM… HE…`.
- **Three bus dots**, labelled `875 · here now` and `171 · here now`.
- **One collision:** `875 · here now` overprints the `KUHIO AVE + LILIU…` stop
  label. Bus labels do not participate in the stop labeller's collision map, so
  this is expected rather than surprising.
- The compass is drawn where Increment 7 placed it.

**This zoom is fine.** It is the view the increment was designed against and it
works.

---

## What the three shots say together

**The clutter is a function of zoom, not of the feature.** At street scale
(4647) route mode is legible and useful. At route scale (4645, 4646) it is
furniture: forty 34-pt tiles cannot be drawn along a 20 km line without fusing,
whatever colour anything is.

That reframes two of the three deferred backlog items. *Stop pins cover the
route line* and *bus labels are unreadable* are not two independent defects —
they are the same defect, which is that route mode draws the street-scale view
at every scale. Both were observed at wide zoom and neither reproduces at 4647's
zoom.

**The other consequence:** at route scale the rider's question is "where are the
buses on this route", and the buses are the one thing that is either missing
(4645) or drowned (4646). The stops — which are what the pins spend the whole
screen on — are the question they are asking at street scale, not this one.
