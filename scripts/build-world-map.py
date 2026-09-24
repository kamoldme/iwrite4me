"""Build the local map asset from Natural Earth's public-domain 1:50m countries.
Usage: python3 scripts/build-world-map.py /path/to/ne_50m_admin_0_countries.geojson
Source: https://github.com/nvkelso/natural-earth-vector/tree/master/geojson
"""
import json, sys, math, html
from pathlib import Path

def simplify(points, tolerance=.09):
    if len(points) <= 4: return points
    start, end = points[0], points[-1]
    dx, dy = end[0]-start[0], end[1]-start[1]
    length = dx*dx + dy*dy
    best, index = 0, 0
    for i, p in enumerate(points[1:-1], 1):
        t = max(0, min(1, ((p[0]-start[0])*dx+(p[1]-start[1])*dy)/length)) if length else 0
        distance = (p[0]-start[0]-t*dx)**2+(p[1]-start[1]-t*dy)**2
        if distance > best: best, index = distance, i
    if best > tolerance*tolerance:
        return simplify(points[:index+1], tolerance)[:-1]+simplify(points[index:], tolerance)
    return [start, end]

def project(lon, lat):
    # Equal Earth projection: https://doi.org/10.1080/13658816.2018.1504949
    lat, lon = math.radians(lat), math.radians(lon)
    theta = math.asin(math.sqrt(3)/2*math.sin(lat))
    a1,a2,a3,a4=1.340264,-.081106,.000893,.003796
    x=2*math.sqrt(3)*lon*math.cos(theta)/(3*(9*a4*theta**8+7*a3*theta**6+3*a2*theta**2+a1))
    y=theta*(a4*theta**8+a3*theta**6+a2*theta**2+a1)
    return (480+x*176, 245-y*176)

features=json.loads(Path(sys.argv[1]).read_text())['features']
paths=[];countries={}
for f in features:
    p=f['properties'];code=p.get('ISO_A2_EH') or p.get('ISO_A2')
    if p.get('ADM0_A3')=='ATA':continue
    if code=='-99':code={'SOL':'SO','CYN':'CY','KOS':'XK'}.get(p.get('ADM0_A3'),'')
    name=p.get('NAME_EN') or p['NAME']
    polygons=f['geometry']['coordinates'] if f['geometry']['type']=='MultiPolygon' else [f['geometry']['coordinates']]
    rings=[]
    for polygon in polygons:
        for ring in polygon:
            reduced=simplify(ring)
            if len(reduced)<4:reduced=ring
            points=[project(*point[:2]) for point in reduced]
            rings.append('M'+'L'.join(f'{x:.1f},{y:.1f}' for x,y in points)+'Z')
    paths.append(f'<path data-country="{code}" data-name="{html.escape(name,quote=True)}" d="{"".join(rings)}"><title>{html.escape(name)}</title></path>')
    if code:countries[code]=name
svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 450" role="img" aria-labelledby="world-map-title"><title id="world-map-title">Countries with recent iWrite activity</title><g fill-rule="evenodd">'+''.join(paths)+'</g></svg>'
Path('public/media/world-countries.svg').write_text(svg)
Path('server/utils/map-countries.json').write_text(json.dumps(countries,ensure_ascii=False,sort_keys=True))
print(f'{len(paths)} boundaries, {len(countries)} country codes, {len(svg)} SVG bytes')
