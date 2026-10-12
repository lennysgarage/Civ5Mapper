"""Optional read-only metadata enrichment from user-supplied game databases."""
import hashlib
import sqlite3
import zlib
from pathlib import Path


def enrich(world, database=None, localization=None):
    evidence = {}
    if database:
        path = Path(database).resolve()
        with sqlite3.connect(path.as_uri() + '?mode=ro', uri=True) as db:
            # Reject mismatching roster identities; do not silently assume that
            # an arbitrary cache represents this save's modded ruleset.
            for civ in world['civilizations']:
                row = db.execute('SELECT ID FROM Civilizations WHERE Type=?', (civ['key'],)).fetchone()
                if row is None or row[0] != civ['rulesetId']:
                    raise ValueError(f"ruleset civilization ID mismatch: {civ['key']}")
            terrains = dict(db.execute('SELECT ID, Type FROM Terrains'))
            terrain_water = dict(db.execute('SELECT ID, Water FROM Terrains'))
            routes = dict(db.execute('SELECT ID, Type FROM Routes')) if any(t.get('routeKnown') for t in world['tiles']) else {}
            features = {}
            for (key,) in db.execute('SELECT Type FROM Features'):
                h = f'{zlib.crc32(key.encode()) ^ 0xffffffff:08x}'
                if h in features and features[h] != key:
                    raise ValueError('feature hash collision in ruleset')
                features[h] = key
            for tile in world['tiles']:
                n = tile['terrainId']
                if n not in terrains or bool(terrain_water[n]) != (tile['landWater'] == 'water'):
                    raise ValueError(f'ruleset terrain mismatch at ({tile["x"]}, {tile["y"]})')
                tile['terrain'] = terrains[n]
                if tile.get('routeKnown') and tile.get('routeId') is not None:
                    if tile['routeId'] not in routes:
                        raise ValueError(f'ruleset route mismatch at ({tile["x"]}, {tile["y"]})')
                    tile['route'] = routes[tile['routeId']]
                h = tile['featureHash']
                if h and h in features:
                    tile['feature'] = features[h]
            for civ in world['civilizations']:
                if civ.get('minorKey'):
                    row = db.execute('SELECT Description FROM MinorCivilizations WHERE Type=?', (civ['minorKey'],)).fetchone()
                else:
                    row = db.execute('SELECT Description FROM Civilizations WHERE Type=?', (civ['key'],)).fetchone()
                if row:
                    civ['nameKey'] = row[0]
                if civ.get('colorKey'):
                    rgb = db.execute('SELECT c.Red,c.Green,c.Blue FROM PlayerColors p JOIN Colors c ON c.Type=p.PrimaryColor WHERE p.Type=?', (civ['colorKey'],)).fetchone()
                    if rgb:
                        if any(not 0 <= n <= 1 for n in rgb):
                            raise ValueError('invalid ruleset color component')
                        civ['color'] = '#' + ''.join(f'{round(n*255):02X}' for n in rgb)
            if world.get('units') is not None:
                unit_types = {}
                columns = {row[1] for row in db.execute('PRAGMA table_info(Units)')}
                combat_column = 'CombatClass' if 'CombatClass' in columns else 'NULL'
                class_column = 'Class' if 'Class' in columns else 'NULL'
                for key, name, domain, combat, ranged, nuclear, combat_class, unit_class in db.execute(f'SELECT Type,Description,Domain,Combat,RangedCombat,NukeDamageLevel,{combat_column},{class_column} FROM Units'):
                    h = f'{zlib.crc32(key.encode()) ^ 0xffffffff:08x}'
                    if h in unit_types:
                        raise ValueError('unit type hash collision in ruleset')
                    unit_types[h] = (key, name, domain, combat, ranged, nuclear, combat_class, unit_class)
                for unit in world['units']:
                    row = unit_types.get(unit['unitTypeHash'])
                    if row is None:
                        raise ValueError(f"ruleset unit hash mismatch: {unit['id']}")
                    key, name, domain, combat, ranged, nuclear, combat_class, unit_class = row
                    if not isinstance(domain,str) or not domain.startswith('DOMAIN_') or any(type(v) not in (int,float) for v in (combat,ranged,nuclear)):
                        raise ValueError('invalid ruleset military unit metadata')
                    if any(value is not None and not isinstance(value,str) for value in (combat_class,unit_class)):
                        raise ValueError('invalid ruleset unit class metadata')
                    unit.update(type=key, name=key, nameKey=name, domain=domain,
                                isMilitary=combat>0 or ranged>0 or nuclear>=0, classificationKnown=True,
                                combatClass=combat_class, unitClass=unit_class)
                world['extraction']['fields'].update(unitTypes='extracted', militaryClassification='extracted')
            world['extraction']['fields']['terrain'] = 'extracted'
            world['extraction']['fields']['features'] = ('extracted' if all('feature' in t for t in world['tiles']) else 'partial')
            if routes:
                world['extraction']['fields']['routes'] = 'extracted'
            world['extraction']['fields']['civilizationColors'] = ('extracted' if all(c.get('color') for c in world['civilizations']) else 'partial')
        evidence['databaseSha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
    if localization:
        path = Path(localization).resolve()
        with sqlite3.connect(path.as_uri() + '?mode=ro', uri=True) as db:
            for obj in world['civilizations'] + world['cities'] + (world.get('units') or []):
                key = obj.get('nameKey')
                if key:
                    rows = db.execute('SELECT Text FROM Language_en_US WHERE Tag=?', (key,)).fetchall()
                    values = {row[0] for row in rows if row[0]}
                    if len(values) == 1:
                        obj['name'] = values.pop()
                        obj['nameSource'] = 'localization-database'
        evidence['localizationSha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
    world['source']['ruleset'] = evidence
    return world
