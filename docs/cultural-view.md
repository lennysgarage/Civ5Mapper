# Tourism influence view

The culture view selects a source major empire and shades other major empires' **land territories** by its recorded accumulated tourism influence divided by each target's lifetime culture. City-states, the source, unowned land and verified inactive players are neutral. Owned water retains the existing water palette.

```sh
civmapper render-save game.Civ5Save --mode culture --perspective 0 -o influence.svg
civmapper render-save game.Civ5Save --mode culture --perspective 0 -o influence.png
civmapper render world.json --mode culture --perspective 0 -o influence.html
```

The browser's **Influence from** selector defaults to the lowest eligible major player ID. It remains independent of the highlight selector and clicking a target. Target details show accumulated tourism, target lifetime culture, integer percentage, contact availability and the game level if enough verified metadata exists. Switching views, changing layers, restoring the viewer state, and downloading the current SVG/PNG preserve the selected source.

The palette is fixed at 0–200%, with stronger influence darker. Values above 200% keep their actual percentage but use the endpoint color. A verified zero uses the light endpoint. Missing totals are hatched, distinct from zero. A zero lifetime denominator follows the game's percentage of zero; it does not represent missing data.

This view does not show city culture production, ownership pressure, city-state diplomatic influence, ideology pressure or a tourism rate. Production and per-turn tourism calculations require additional verified fields and are not reconstructed from cumulative values.

## Save decoding and limits

The optional decoder supports the repository's existing empirical `bnw-six-yield` and `observed-seven-yield` player layouts. These names identify tested binary shapes, not every save using six or seven yields. Both sampled layouts store player culture in hundredths; the culture object's current influence and prior lifetime culture use whole units. The normalized lifetime denominator follows the whole-culture getter (integer division by 100). There is no fallback that interprets the same bytes as arbitrary vanilla whole units.

The decoder requires the existing validated player identity and capital-prefix evidence. It searches only within that player's bounded interval before cities, and accepts exactly one complete version-6 culture record. It validates archaeology coordinates, the 22-major influence count and interleaved current/prior arrays, flags, opinion fields, counted UTF-8 strings, and great-work references. It then validates the following optional notifications record, including version and owning player, all 100 ring slots, and the complete following treasury record. Empty notification slots can contain uninitialized recipient data; only populated slots' recipients are treated as player references. Ambiguous, truncated, unsupported or inconsistent records preserve unknown data and keep other views available.

Read-only real-save probes used privately copied files, with no game saves or DLL source added to this repository:

| Layout | Save samples | Result |
| --- | --- | --- |
| Seven-yield | Multiplayer post-turn saves 0, 50, 100, 132 | All six active major records accepted in each sample; validated zero and nonzero influence |
| Six-yield | Baseline turn 150; Catherine turn 47; Alexander turn 28 | Unique full records for 6, 12 and 6 active majors respectively; hundredths storage also confirmed |

At turn 132 the normalized lifetime culture of players 0–5 was 17907, 11229, 5440, 4619, 5676 and 8813. Source 0's recorded influence against targets 1–5 was 1532, 1652, 1893, 2255 and 2182. These are independently saved pair totals, not estimates from territory or replay events. Validation checks binary boundaries and source-defined semantics; an in-game screenshot comparison was not performed.

Primary serialization/semantic references (retrieved for research, not bundled):

- [Lekmod CvPlayer.cpp](https://raw.githubusercontent.com/EnormousApplePie/Lekmod/main/LEKMOD_DLL/CvGameCoreDLL_Expansion2/CvPlayer.cpp): `CvPlayer::Read` culture fields and the `AUI_PLAYER_FIX_JONS_CULTURE_IS_T100` whole-culture getter.
- [Lekmod CvCultureClasses.cpp](https://raw.githubusercontent.com/EnormousApplePie/Lekmod/main/LEKMOD_DLL/CvGameCoreDLL_Expansion2/CvCultureClasses.cpp): version-6 culture serialization, `GetInfluenceOn`, and `GetInfluenceLevel`.
- [Lekmod CvNotifications.cpp](https://raw.githubusercontent.com/EnormousApplePie/Lekmod/main/LEKMOD_DLL/CvGameCoreDLL_Expansion2/CvNotifications.cpp) and [CvTreasury.cpp](https://raw.githubusercontent.com/EnormousApplePie/Lekmod/main/LEKMOD_DLL/CvGameCoreDLL_Expansion2/CvTreasury.cpp): neighboring records used to validate the culture boundary.

## Optional normalized JSON

Schema `0.1` worlds may carry `culture: { turn, players, thresholds? }`. Each player has `playerId`, `alive`, nullable whole-unit `lifetimeCulture`, optional `storedCulture`, `accumulatedInfluence` keyed by target player ID, optional nullable `contact` values, and optional extraction evidence. Null or absent pair totals remain unknown. Totals are nonnegative SDK signed 32-bit integers (at most 2147483647), keeping derived integer percentages exact. All player references must point to major civilizations. Culture must belong to the world’s current turn.

The matching ruleset database can supply the five ordered `CULTURE_LEVEL_EXOTIC`, `FAMILIAR`, `POPULAR`, `INFLUENTIAL` and `DOMINANT` defines. Their provenance includes the database SHA-256. Exact levels additionally require verified source/target team contact. The current binary decoder **does not extract contact**, so real-save details report contact unknown and omit exact level claims even when thresholds are available. Numeric recorded influence ratios remain usable. Supplied normalized snapshots can carry verified contact for level calculation.

Extraction statuses independently report `tourismInfluence`, `cultureLifetime`, `cultureContact` and `cultureThresholds`. A culture view needs at least one usable source-to-target pair. CLI culture rendering requires `--perspective`; invalid, inactive or unavailable sources fail with an availability error. Other modes remain usable when optional culture data is unavailable.

Replay events do not contain these directed snapshots. Replay preparation drops culture inherited from a current base save and marks its extraction fields unavailable. Current totals are never shown on historical frames.
