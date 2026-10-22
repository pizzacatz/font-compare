"""Read metrics and the mapped character list from the TTFs in fonts/ into metrics.json."""
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'pokemon-custom-emerald-font', 'pylib'))
from fontTools.ttLib import TTFont
HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = {'vector': 'EmeraldPixelVector-Regular.ttf', 'soft': 'EmeraldPixelSoft-Regular.ttf', 'round': 'EmeraldRounded-Regular.ttf', 'game': 'EmeraldRoundedGame-Regular.ttf'}
out = {}
for k, fn in FONTS.items():
    t = TTFont(os.path.join(HERE, 'fonts', fn))
    cmap = t.getBestCmap(); os2 = t['OS/2']; hhea = t['hhea']; hmtx = t['hmtx']
    name = t['name']
    adv = {cp: hmtx[g][0] for cp, g in cmap.items()}
    out[k] = {
        'family': name.getDebugName(1), 'version': name.getDebugName(5),
        'upm': t['head'].unitsPerEm, 'xHeight': os2.sxHeight, 'capHeight': os2.sCapHeight,
        'ascender': hhea.ascent, 'descender': hhea.descent, 'lineGap': hhea.lineGap,
        'winAscent': os2.usWinAscent, 'winDescent': os2.usWinDescent,
        'glyphs': len(t.getGlyphOrder()), 'mapped': len(cmap),
        'advance_space': adv.get(0x20), 'advance_H': adv.get(ord('H')), 'advance_i': adv.get(ord('i')),
        'chars': sorted(cp for cp in cmap if cp >= 0x20),
        'adv': {str(cp): a for cp, a in adv.items()},
    }
json.dump(out, open(os.path.join(HERE, 'metrics.json'), 'w'), indent=1)
print({k: (v['glyphs'], v['mapped']) for k, v in out.items()})
